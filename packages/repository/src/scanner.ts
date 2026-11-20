import fs from 'node:fs';
import path from 'node:path';
import type { Diagnostic, SourceFile } from '@falcon/domain';
import { isPathWithinRoot, normalizeRelativePath, validateRepositoryRoot } from './validator.js';
import { isSupportedSourceFile, detectLanguage } from './language.js';
import { computeContentHash } from './hasher.js';
import { createRepositoryFilter } from './filter.js';
import type { RepositoryInventory, ScanOptions } from './types.js';

export const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB

/**
 * Scans a repository directory tree, discovering supported TS/JS source files,
 * filtering excluded files, computing content hashes, and recording diagnostics.
 */
export async function scanRepository(options: ScanOptions): Promise<RepositoryInventory> {
  const {
    rootPath: rawRootPath,
    snapshotId = 'snapshot-draft',
    include,
    exclude,
    respectGitignore = true,
    maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
  } = options;

  const validation = validateRepositoryRoot(rawRootPath);
  if (!validation.ok) {
    return {
      rootPath: rawRootPath,
      isGitRepo: false,
      files: [],
      excludedPaths: [],
      diagnostics: [validation.error.diagnostic],
      totalFilesScanned: 0,
    };
  }

  const { rootPath, isGitRepo } = validation.value;
  const filter = createRepositoryFilter({
    rootPath,
    respectGitignore,
    exclude,
  });

  const discoveredFiles: SourceFile[] = [];
  const excludedPaths: string[] = [];
  const diagnostics: Diagnostic[] = [];
  const visitedRealPaths = new Set<string>();

  let totalFilesScanned = 0;

  async function walkDirectory(currentDir: string, currentRelative: string): Promise<void> {
    let entries: fs.Dirent[];
    try {
      entries = await fs.promises.readdir(currentDir, { withFileTypes: true });
    } catch (error) {
      diagnostics.push({
        id: `diag-dir-${diagnostics.length + 1}`,
        code: 'DIAG_DIR_READ_ERROR',
        severity: 'error',
        message: `Failed to read directory: ${error instanceof Error ? error.message : String(error)}`,
        filePath: currentRelative || '.',
      });
      return;
    }

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      const relativeEntry = currentRelative ? `${currentRelative}/${entry.name}` : entry.name;
      const normalizedRelative = normalizeRelativePath(relativeEntry);

      let isDirectory = entry.isDirectory();
      const isSymbolicLink = entry.isSymbolicLink();

      if (isSymbolicLink) {
        let realPath: string;
        try {
          realPath = await fs.promises.realpath(fullPath);
        } catch {
          diagnostics.push({
            id: `diag-symlink-broken-${diagnostics.length + 1}`,
            code: 'DIAG_SYMLINK_BROKEN',
            severity: 'warning',
            message: `Broken symlink detected: "${normalizedRelative}"`,
            filePath: normalizedRelative,
          });
          continue;
        }

        // Verify symlink does not escape root
        if (!isPathWithinRoot(rootPath, realPath)) {
          diagnostics.push({
            id: `diag-symlink-escape-${diagnostics.length + 1}`,
            code: 'DIAG_SYMLINK_ESCAPE',
            severity: 'warning',
            message: `Symlink escapes repository root: "${normalizedRelative}" -> "${realPath}"`,
            filePath: normalizedRelative,
          });
          continue;
        }

        // Cycle detection for directories
        if (visitedRealPaths.has(realPath)) {
          diagnostics.push({
            id: `diag-symlink-cycle-${diagnostics.length + 1}`,
            code: 'DIAG_SYMLINK_CYCLE',
            severity: 'warning',
            message: `Circular symlink detected: "${normalizedRelative}"`,
            filePath: normalizedRelative,
          });
          continue;
        }

        try {
          const stat = await fs.promises.stat(fullPath);
          isDirectory = stat.isDirectory();
        } catch {
          continue;
        }
      }

      if (isDirectory) {
        if (filter.shouldExclude(normalizedRelative, true)) {
          excludedPaths.push(normalizedRelative);
          continue;
        }

        try {
          const realDirPath = await fs.promises.realpath(fullPath);
          if (visitedRealPaths.has(realDirPath)) {
            continue;
          }
          visitedRealPaths.add(realDirPath);
        } catch {
          // ignore realpath error on directory
        }

        await walkDirectory(fullPath, normalizedRelative);
        continue;
      }

      // It is a file
      totalFilesScanned++;

      if (filter.shouldExclude(normalizedRelative, false)) {
        excludedPaths.push(normalizedRelative);
        continue;
      }

      if (!isSupportedSourceFile(normalizedRelative)) {
        continue;
      }

      // Check custom include filter if specified
      if (include && include.length > 0) {
        const matchesInclude = include.some((pattern) => {
          if (pattern.startsWith('*.')) {
            return normalizedRelative.endsWith(pattern.slice(1));
          }
          return normalizedRelative.includes(pattern);
        });
        if (!matchesInclude) {
          continue;
        }
      }

      let fileStat: fs.Stats;
      try {
        fileStat = await fs.promises.stat(fullPath);
      } catch (error) {
        diagnostics.push({
          id: `diag-file-stat-${diagnostics.length + 1}`,
          code: 'DIAG_FILE_STAT_ERROR',
          severity: 'error',
          message: `Could not read file metadata: ${error instanceof Error ? error.message : String(error)}`,
          filePath: normalizedRelative,
        });
        continue;
      }

      if (fileStat.size > maxFileSizeBytes) {
        diagnostics.push({
          id: `diag-file-oversized-${diagnostics.length + 1}`,
          code: 'DIAG_FILE_OVERSIZED',
          severity: 'warning',
          message: `File size ${fileStat.size} bytes exceeds limit of ${maxFileSizeBytes} bytes`,
          filePath: normalizedRelative,
        });
        continue;
      }

      let content: Buffer;
      try {
        content = await fs.promises.readFile(fullPath);
      } catch (error) {
        diagnostics.push({
          id: `diag-file-read-${diagnostics.length + 1}`,
          code: 'DIAG_FILE_READ_ERROR',
          severity: 'error',
          message: `Could not read file content: ${error instanceof Error ? error.message : String(error)}`,
          filePath: normalizedRelative,
        });
        continue;
      }

      const contentHash = computeContentHash(content);
      const language = detectLanguage(normalizedRelative) ?? 'typescript';

      discoveredFiles.push({
        id: `${normalizedRelative}#${contentHash.slice(0, 12)}`,
        snapshotId,
        relativePath: normalizedRelative,
        contentHash,
        language,
        parseStatus: 'parsed',
        isExcluded: false,
      });
    }
  }

  try {
    visitedRealPaths.add(await fs.promises.realpath(rootPath));
  } catch {
    visitedRealPaths.add(rootPath);
  }

  await walkDirectory(rootPath, '');

  // Sort files deterministically by relative path
  discoveredFiles.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  excludedPaths.sort((a, b) => a.localeCompare(b));

  return {
    rootPath,
    isGitRepo,
    files: discoveredFiles,
    excludedPaths,
    diagnostics,
    totalFilesScanned,
  };
}
