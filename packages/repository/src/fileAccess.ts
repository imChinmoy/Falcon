import fs from 'node:fs';
import path from 'node:path';
import { ok, err, type Result } from '@falcon/domain';
import type { FileLanguage } from '@falcon/domain';
import {
  isPathWithinRoot,
  normalizeRelativePath,
  validateRepositoryRoot,
  RepositoryValidationError,
} from './validator.js';
import { detectLanguage } from './language.js';
import { computeContentHash } from './hasher.js';
import { DEFAULT_MAX_FILE_SIZE_BYTES } from './scanner.js';
import type {
  ReadSourceFileOptions,
  ReadSourceFileResult,
  WriteSourceFileOptions,
  WriteSourceFileResult,
  EditSourceFileOptions,
  EditSourceFileResult,
  SourceFileInfoResult,
} from './types.js';

function safeNormalizePath(rawPath: string): Result<string, RepositoryValidationError> {
  if (!rawPath || typeof rawPath !== 'string') {
    return err(
      new RepositoryValidationError(
        'DIAG_INVALID_PATH',
        'Path must be a non-empty string',
        String(rawPath),
      ),
    );
  }
  if (rawPath.includes('\0')) {
    return err(
      new RepositoryValidationError(
        'DIAG_PATH_TRAVERSAL',
        'Access denied: path contains forbidden null bytes',
        rawPath,
      ),
    );
  }
  try {
    const normalized = normalizeRelativePath(rawPath);
    return ok(normalized);
  } catch (error) {
    if (error instanceof RepositoryValidationError) {
      return err(error);
    }
    return err(
      new RepositoryValidationError(
        'DIAG_PATH_TRAVERSAL',
        `Access denied: invalid path "${rawPath}"`,
        rawPath,
      ),
    );
  }
}

/**
 * Safely reads a source file from within a repository root.
 * Enforces traversal defense, symlink escape checks, and max size limits.
 */
export async function readSourceFile(
  options: ReadSourceFileOptions,
): Promise<Result<ReadSourceFileResult, RepositoryValidationError>> {
  const {
    rootPath: rawRoot,
    relativePath: rawRelative,
    maxFileSizeBytes = DEFAULT_MAX_FILE_SIZE_BYTES,
  } = options;

  const pathNormResult = safeNormalizePath(rawRelative);
  if (!pathNormResult.ok) {
    return err(pathNormResult.error);
  }
  const normalizedRelative = pathNormResult.value;

  const rootValidation = validateRepositoryRoot(rawRoot);
  if (!rootValidation.ok) {
    return err(rootValidation.error);
  }
  const rootPath = rootValidation.value.rootPath;
  const targetFullPath = path.resolve(rootPath, normalizedRelative);

  if (!isPathWithinRoot(rootPath, targetFullPath)) {
    return err(
      new RepositoryValidationError(
        'DIAG_PATH_TRAVERSAL',
        `Access denied: path "${rawRelative}" escapes repository root`,
        normalizedRelative,
      ),
    );
  }

  if (!fs.existsSync(targetFullPath)) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_NOT_FOUND',
        `File not found: "${normalizedRelative}"`,
        normalizedRelative,
      ),
    );
  }

  let realPath: string;
  try {
    realPath = await fs.promises.realpath(targetFullPath);
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_STAT_ERROR',
        `Failed to resolve path "${normalizedRelative}": ${error instanceof Error ? error.message : String(error)}`,
        normalizedRelative,
      ),
    );
  }

  if (!isPathWithinRoot(rootPath, realPath)) {
    return err(
      new RepositoryValidationError(
        'DIAG_SYMLINK_ESCAPE',
        `Symlink escapes repository root: "${normalizedRelative}" -> "${realPath}"`,
        normalizedRelative,
      ),
    );
  }

  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(targetFullPath);
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_STAT_ERROR',
        `Failed to stat file "${normalizedRelative}": ${error instanceof Error ? error.message : String(error)}`,
        normalizedRelative,
      ),
    );
  }

  if (stats.isDirectory()) {
    return err(
      new RepositoryValidationError(
        'DIAG_IS_DIRECTORY',
        `Target path is a directory, not a file: "${normalizedRelative}"`,
        normalizedRelative,
      ),
    );
  }

  if (stats.size > maxFileSizeBytes) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_OVERSIZED',
        `File size (${stats.size} bytes) exceeds limit of ${maxFileSizeBytes} bytes`,
        normalizedRelative,
      ),
    );
  }

  let buffer: Buffer;
  try {
    buffer = await fs.promises.readFile(targetFullPath);
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_READ_ERROR',
        `Failed to read file "${normalizedRelative}": ${error instanceof Error ? error.message : String(error)}`,
        normalizedRelative,
      ),
    );
  }

  const content = buffer.toString('utf-8');
  const contentHash = computeContentHash(buffer);
  const language: FileLanguage = detectLanguage(normalizedRelative) ?? 'typescript';

  return ok({
    relativePath: normalizedRelative,
    fullPath: targetFullPath,
    content,
    contentHash,
    language,
    sizeBytes: stats.size,
  });
}

/**
 * Safely writes or overwrites a source file within the repository root.
 * Creates parent directories if needed, keeping everything safely within root.
 */
export async function writeSourceFile(
  options: WriteSourceFileOptions,
): Promise<Result<WriteSourceFileResult, RepositoryValidationError>> {
  const { rootPath: rawRoot, relativePath: rawRelative, content } = options;

  const pathNormResult = safeNormalizePath(rawRelative);
  if (!pathNormResult.ok) {
    return err(pathNormResult.error);
  }
  const normalizedRelative = pathNormResult.value;

  const rootValidation = validateRepositoryRoot(rawRoot);
  if (!rootValidation.ok) {
    return err(rootValidation.error);
  }
  const rootPath = rootValidation.value.rootPath;
  const targetFullPath = path.resolve(rootPath, normalizedRelative);

  if (!isPathWithinRoot(rootPath, targetFullPath)) {
    return err(
      new RepositoryValidationError(
        'DIAG_PATH_TRAVERSAL',
        `Access denied: path "${rawRelative}" escapes repository root`,
        normalizedRelative,
      ),
    );
  }

  const parentDir = path.dirname(targetFullPath);
  if (!isPathWithinRoot(rootPath, parentDir)) {
    return err(
      new RepositoryValidationError(
        'DIAG_PATH_TRAVERSAL',
        `Access denied: parent directory escapes repository root`,
        normalizedRelative,
      ),
    );
  }

  try {
    await fs.promises.mkdir(parentDir, { recursive: true });
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_DIR_CREATE_ERROR',
        `Failed to create directory for "${normalizedRelative}": ${error instanceof Error ? error.message : String(error)}`,
        normalizedRelative,
      ),
    );
  }

  const isNew = !fs.existsSync(targetFullPath);
  const buffer = typeof content === 'string' ? Buffer.from(content, 'utf-8') : content;

  try {
    await fs.promises.writeFile(targetFullPath, buffer);
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_WRITE_ERROR',
        `Failed to write to file "${normalizedRelative}": ${error instanceof Error ? error.message : String(error)}`,
        normalizedRelative,
      ),
    );
  }

  const contentHash = computeContentHash(buffer);
  const language: FileLanguage = detectLanguage(normalizedRelative) ?? 'typescript';

  return ok({
    relativePath: normalizedRelative,
    fullPath: targetFullPath,
    contentHash,
    language,
    sizeBytes: buffer.length,
    isNew,
  });
}

/**
 * Safely edits an existing source file by searching and replacing content.
 */
export async function editSourceFile(
  options: EditSourceFileOptions,
): Promise<Result<EditSourceFileResult, RepositoryValidationError>> {
  const { rootPath, relativePath, find, replace } = options;

  const readResult = await readSourceFile({ rootPath, relativePath });
  if (!readResult.ok) {
    return err(readResult.error);
  }

  const currentContent = readResult.value.content;
  const previousHash = readResult.value.contentHash;

  let newContent: string;
  let replacementsCount = 0;

  if (typeof find === 'string') {
    if (!currentContent.includes(find)) {
      return err(
        new RepositoryValidationError(
          'DIAG_TARGET_NOT_FOUND',
          `Target text to replace was not found in "${relativePath}"`,
          relativePath,
        ),
      );
    }
    const parts = currentContent.split(find);
    replacementsCount = parts.length - 1;
    newContent = parts.join(replace);
  } else {
    // RegExp search
    const matches = currentContent.match(find);
    if (!matches || matches.length === 0) {
      return err(
        new RepositoryValidationError(
          'DIAG_TARGET_NOT_FOUND',
          `Pattern was not found in "${relativePath}"`,
          relativePath,
        ),
      );
    }
    replacementsCount = matches.length;
    newContent = currentContent.replace(find, replace);
  }

  const writeResult = await writeSourceFile({
    rootPath,
    relativePath,
    content: newContent,
  });

  if (!writeResult.ok) {
    return err(writeResult.error);
  }

  return ok({
    relativePath: readResult.value.relativePath,
    previousHash,
    contentHash: writeResult.value.contentHash,
    replacementsCount,
    sizeBytes: writeResult.value.sizeBytes,
  });
}

/**
 * Safely inspects metadata for any path within the repository root.
 */
export async function getSourceFileInfo(
  rootPath: string,
  relativePath: string,
): Promise<Result<SourceFileInfoResult, RepositoryValidationError>> {
  const pathNormResult = safeNormalizePath(relativePath);
  if (!pathNormResult.ok) {
    return err(pathNormResult.error);
  }
  const normalizedRelative = pathNormResult.value;

  const rootValidation = validateRepositoryRoot(rootPath);
  if (!rootValidation.ok) {
    return err(rootValidation.error);
  }
  const resolvedRoot = rootValidation.value.rootPath;
  const targetFullPath = path.resolve(resolvedRoot, normalizedRelative);

  if (!isPathWithinRoot(resolvedRoot, targetFullPath)) {
    return err(
      new RepositoryValidationError(
        'DIAG_PATH_TRAVERSAL',
        `Access denied: path escapes repository root`,
        normalizedRelative,
      ),
    );
  }

  if (!fs.existsSync(targetFullPath)) {
    return ok({
      relativePath: normalizedRelative,
      fullPath: targetFullPath,
      exists: false,
      isDirectory: false,
      sizeBytes: 0,
    });
  }

  let stats: fs.Stats;
  try {
    stats = await fs.promises.stat(targetFullPath);
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_STAT_ERROR',
        `Failed to stat path "${normalizedRelative}": ${error instanceof Error ? error.message : String(error)}`,
        normalizedRelative,
      ),
    );
  }

  const isDirectory = stats.isDirectory();
  let contentHash: string | undefined;
  let language: FileLanguage | undefined;

  if (!isDirectory && stats.isFile()) {
    try {
      const buffer = await fs.promises.readFile(targetFullPath);
      contentHash = computeContentHash(buffer);
      language = detectLanguage(normalizedRelative) ?? undefined;
    } catch {
      // Content hash remains undefined if unreadable
    }
  }

  return ok({
    relativePath: normalizedRelative,
    fullPath: targetFullPath,
    exists: true,
    isDirectory,
    sizeBytes: stats.size,
    ...(contentHash !== undefined ? { contentHash } : {}),
    ...(language !== undefined ? { language } : {}),
  });
}

/**
 * Safely deletes a file from within the repository root.
 */
export async function deleteSourceFile(
  rootPath: string,
  relativePath: string,
): Promise<Result<{ relativePath: string }, RepositoryValidationError>> {
  const pathNormResult = safeNormalizePath(relativePath);
  if (!pathNormResult.ok) {
    return err(pathNormResult.error);
  }
  const normalizedRelative = pathNormResult.value;

  const rootValidation = validateRepositoryRoot(rootPath);
  if (!rootValidation.ok) {
    return err(rootValidation.error);
  }
  const resolvedRoot = rootValidation.value.rootPath;
  const targetFullPath = path.resolve(resolvedRoot, normalizedRelative);

  if (!isPathWithinRoot(resolvedRoot, targetFullPath)) {
    return err(
      new RepositoryValidationError(
        'DIAG_PATH_TRAVERSAL',
        `Access denied: path escapes repository root`,
        normalizedRelative,
      ),
    );
  }

  if (!fs.existsSync(targetFullPath)) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_NOT_FOUND',
        `File not found: "${normalizedRelative}"`,
        normalizedRelative,
      ),
    );
  }

  try {
    await fs.promises.unlink(targetFullPath);
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_FILE_DELETE_ERROR',
        `Failed to delete file "${normalizedRelative}": ${error instanceof Error ? error.message : String(error)}`,
        normalizedRelative,
      ),
    );
  }

  return ok({ relativePath: normalizedRelative });
}
