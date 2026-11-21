import fs from 'node:fs';
import path from 'node:path';
import { ExitCodes } from '../constants.js';
import type { CliCommandResult } from './analyze.js';

export function runInspectSymbolCommand(
  selector: string | undefined,
  format?: 'text' | 'json',
  outputFile?: string,
): CliCommandResult {
  if (!selector) {
    return {
      exitCode: ExitCodes.INVALID_ARGUMENTS,
      stdout: '',
      stderr: 'Error: Symbol selector is required (e.g. "src/pricing.ts#calculatePrice").',
    };
  }

  let stdoutOutput = '';

  if (format === 'json') {
    stdoutOutput = JSON.stringify(
      {
        selector,
        status: 'ready',
        dependencies: [],
        dependents: [],
      },
      null,
      2,
    );
  } else {
    stdoutOutput = `Symbol Selector: ${selector}\nDependencies: 0\nDependents: 0`;
  }

  if (outputFile) {
    try {
      const outputPath = path.resolve(outputFile);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, stdoutOutput, 'utf-8');
    } catch (err) {
      return {
        exitCode: ExitCodes.REPOSITORY_ERROR,
        stdout: stdoutOutput,
        stderr: `Failed to write output to "${outputFile}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    exitCode: ExitCodes.SUCCESS,
    stdout: stdoutOutput,
    stderr: '',
  };
}
