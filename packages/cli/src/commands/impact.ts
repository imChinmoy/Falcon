import fs from 'node:fs';
import path from 'node:path';
import { ExitCodes } from '../constants.js';
import type { CliCommandResult } from './analyze.js';

export interface ImpactCliOptions {
  readonly base?: string | undefined;
  readonly target?: string | undefined;
  readonly repo?: string | undefined;
  readonly format?: 'text' | 'json' | undefined;
  readonly outputFile?: string | undefined;
  readonly maxDepth?: number | undefined;
  readonly maxResults?: number | undefined;
}

export function runImpactCommand(options: ImpactCliOptions): CliCommandResult {
  if (!options.base || !options.target) {
    return {
      exitCode: ExitCodes.INVALID_ARGUMENTS,
      stdout: '',
      stderr:
        'Error: Both --base <git-ref> and --target <git-ref> are required for "falcon impact".',
    };
  }

  let stdoutOutput = '';

  // Initial scaffold envelope conforming to CLI_SPEC.md
  if (options.format === 'json') {
    stdoutOutput = JSON.stringify(
      {
        schemaVersion: '1',
        analyzerVersion: '0.1.0',
        repository: {
          baseRevision: options.base,
          targetRevision: options.target,
        },
        summary: {
          changedSymbols: 0,
          directDependents: 0,
          transitiveDependents: 0,
        },
        findings: [],
        diagnostics: [],
      },
      null,
      2,
    );
  } else {
    stdoutOutput = `FALCON Impact Analysis\nBase: ${options.base}\nTarget: ${options.target}\nChanged symbols: 0\nImpact findings: 0`;
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
        stderr: `Failed to write impact output to "${options.outputFile}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    exitCode: ExitCodes.SUCCESS,
    stdout: stdoutOutput,
    stderr: '',
  };
}
