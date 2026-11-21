import fs from 'node:fs';
import path from 'node:path';
import { scanRepository } from '@falcon/repository';
import { ExitCodes, type ExitCode, VERSION } from '../constants.js';

export interface AnalyzeCliOptions {
  readonly targetPath: string;
  readonly format?: 'text' | 'json' | undefined;
  readonly outputFile?: string | undefined;
  readonly include?: string[] | undefined;
  readonly exclude?: string[] | undefined;
  readonly snapshotId?: string | undefined;
}

export interface CliCommandResult {
  readonly exitCode: ExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

export async function runAnalyzeCommand(options: AnalyzeCliOptions): Promise<CliCommandResult> {
  const rootPath = path.resolve(options.targetPath || '.');
  const format = options.format ?? 'text';

  const inventory = await scanRepository({
    rootPath,
    ...(options.include ? { include: options.include } : {}),
    ...(options.exclude ? { exclude: options.exclude } : {}),
    ...(options.snapshotId ? { snapshotId: options.snapshotId } : {}),
  });

  // Check for root validation failure in diagnostics
  const hasRootError = inventory.diagnostics.some(
    (d) =>
      d.code === 'DIAG_ROOT_NOT_FOUND' ||
      d.code === 'DIAG_ROOT_NOT_DIRECTORY' ||
      d.code === 'DIAG_ROOT_UNREADABLE',
  );

  if (hasRootError) {
    const errorMsg = inventory.diagnostics.map((d) => `Error [${d.code}]: ${d.message}`).join('\n');
    return {
      exitCode: ExitCodes.REPOSITORY_ERROR,
      stdout: '',
      stderr: errorMsg,
    };
  }

  // Count languages
  const languageCounts: Record<string, number> = {};
  for (const file of inventory.files) {
    languageCounts[file.language] = (languageCounts[file.language] ?? 0) + 1;
  }

  let stdoutOutput = '';

  if (format === 'json') {
    const envelope = {
      schemaVersion: '1',
      analyzerVersion: VERSION,
      repository: {
        rootPath: inventory.rootPath,
        isGitRepo: inventory.isGitRepo,
      },
      summary: {
        totalFilesScanned: inventory.totalFilesScanned,
        sourceFilesDiscovered: inventory.files.length,
        excludedPathsCount: inventory.excludedPaths.length,
        languageBreakdown: languageCounts,
      },
      files: inventory.files,
      excludedPaths: inventory.excludedPaths,
      diagnostics: inventory.diagnostics,
    };
    stdoutOutput = JSON.stringify(envelope, null, 2);
  } else {
    // Text output
    const lines: string[] = [
      `FALCON Analysis Summary: ${inventory.rootPath}`,
      `Git Repository: ${inventory.isGitRepo ? 'Yes' : 'No'}`,
      `Files Scanned: ${inventory.totalFilesScanned}`,
      `Eligible Source Files: ${inventory.files.length}`,
      `Excluded Paths: ${inventory.excludedPaths.length}`,
      `Diagnostics: ${inventory.diagnostics.length}`,
      '',
      'Language Distribution:',
      ...Object.entries(languageCounts).map(([lang, count]) => `  - ${lang}: ${count}`),
      '',
      `Source Files (${inventory.files.length}):`,
      ...inventory.files
        .slice(0, 30)
        .map((f) => `  ${f.relativePath} (${f.language}) [${f.contentHash.slice(0, 10)}]`),
      ...(inventory.files.length > 30
        ? [`  ... and ${inventory.files.length - 30} more files`]
        : []),
    ];

    if (inventory.diagnostics.length > 0) {
      lines.push('', 'Diagnostics:');
      for (const diag of inventory.diagnostics) {
        lines.push(`  [${diag.severity.toUpperCase()}] ${diag.code}: ${diag.message}`);
      }
    }

    stdoutOutput = lines.join('\n');
  }

  if (options.outputFile) {
    try {
      const outputPath = path.resolve(options.outputFile);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, stdoutOutput, 'utf-8');
    } catch (err) {
      return {
        exitCode: ExitCodes.REPOSITORY_ERROR,
        stdout: stdoutOutput,
        stderr: `Failed to write output to file "${options.outputFile}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  const hasFatal = inventory.diagnostics.some((d) => d.severity === 'error');
  const exitCode = hasFatal ? ExitCodes.FATAL_DIAGNOSTICS : ExitCodes.SUCCESS;

  return {
    exitCode,
    stdout: stdoutOutput,
    stderr: '',
  };
}
