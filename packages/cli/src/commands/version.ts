import { VERSION, PKG_NAME, ExitCodes } from '../constants.js';
import type { CliCommandResult } from './analyze.js';

export function runVersionCommand(format?: 'text' | 'json'): CliCommandResult {
  if (format === 'json') {
    return {
      exitCode: ExitCodes.SUCCESS,
      stdout: JSON.stringify(
        {
          cli: PKG_NAME,
          version: VERSION,
          engine: 'falcon-analyzer',
          node: process.version,
        },
        null,
        2,
      ),
      stderr: '',
    };
  }

  return {
    exitCode: ExitCodes.SUCCESS,
    stdout: `${PKG_NAME} v${VERSION} (Node ${process.version})`,
    stderr: '',
  };
}
