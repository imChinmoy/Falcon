import path from 'node:path';
import {
  readSourceFile,
  writeSourceFile,
  editSourceFile,
  getSourceFileInfo,
  deleteSourceFile,
  scanRepository,
} from '@falcon/repository';
import { ExitCodes } from '../constants.js';
import type { CliCommandResult } from './analyze.js';

export interface FileCliOptions {
  readonly action: 'read' | 'write' | 'edit' | 'info' | 'list' | 'delete';
  readonly filePath?: string | undefined;
  readonly repoRoot?: string | undefined;
  readonly content?: string | undefined;
  readonly find?: string | undefined;
  readonly replace?: string | undefined;
  readonly format?: 'text' | 'json' | undefined;
}

export async function runFileCommand(options: FileCliOptions): Promise<CliCommandResult> {
  const rootPath = path.resolve(options.repoRoot || '.');
  const format = options.format ?? 'text';
  const { action, filePath } = options;

  if (action !== 'list' && !filePath) {
    return {
      exitCode: ExitCodes.INVALID_ARGUMENTS,
      stdout: '',
      stderr: `Error: File path is required for action "file ${action}".`,
    };
  }

  switch (action) {
    case 'read': {
      const result = await readSourceFile({
        rootPath,
        relativePath: filePath!,
      });

      if (!result.ok) {
        return {
          exitCode: ExitCodes.REPOSITORY_ERROR,
          stdout: '',
          stderr: `Error [${result.error.code}]: ${result.error.message}`,
        };
      }

      const val = result.value;
      if (format === 'json') {
        return {
          exitCode: ExitCodes.SUCCESS,
          stdout: JSON.stringify(val, null, 2),
          stderr: '',
        };
      }
      return {
        exitCode: ExitCodes.SUCCESS,
        stdout: val.content,
        stderr: '',
      };
    }

    case 'write': {
      if (options.content === undefined) {
        return {
          exitCode: ExitCodes.INVALID_ARGUMENTS,
          stdout: '',
          stderr: 'Error: --content option or argument is required for file write.',
        };
      }

      const result = await writeSourceFile({
        rootPath,
        relativePath: filePath!,
        content: options.content,
      });

      if (!result.ok) {
        return {
          exitCode: ExitCodes.REPOSITORY_ERROR,
          stdout: '',
          stderr: `Error [${result.error.code}]: ${result.error.message}`,
        };
      }

      const val = result.value;
      if (format === 'json') {
        return {
          exitCode: ExitCodes.SUCCESS,
          stdout: JSON.stringify(val, null, 2),
          stderr: '',
        };
      }

      return {
        exitCode: ExitCodes.SUCCESS,
        stdout: `Successfully ${val.isNew ? 'created' : 'updated'} ${val.relativePath} (${val.sizeBytes} bytes, hash: ${val.contentHash.slice(0, 12)})`,
        stderr: '',
      };
    }

    case 'edit': {
      if (options.find === undefined || options.replace === undefined) {
        return {
          exitCode: ExitCodes.INVALID_ARGUMENTS,
          stdout: '',
          stderr: 'Error: Both --find and --replace options are required for file edit.',
        };
      }

      const result = await editSourceFile({
        rootPath,
        relativePath: filePath!,
        find: options.find,
        replace: options.replace,
      });

      if (!result.ok) {
        return {
          exitCode: ExitCodes.REPOSITORY_ERROR,
          stdout: '',
          stderr: `Error [${result.error.code}]: ${result.error.message}`,
        };
      }

      const val = result.value;
      if (format === 'json') {
        return {
          exitCode: ExitCodes.SUCCESS,
          stdout: JSON.stringify(val, null, 2),
          stderr: '',
        };
      }

      return {
        exitCode: ExitCodes.SUCCESS,
        stdout: `Successfully edited ${val.relativePath}: replaced ${val.replacementsCount} occurrence(s). New hash: ${val.contentHash.slice(0, 12)}`,
        stderr: '',
      };
    }

    case 'info': {
      const result = await getSourceFileInfo(rootPath, filePath!);
      if (!result.ok) {
        return {
          exitCode: ExitCodes.REPOSITORY_ERROR,
          stdout: '',
          stderr: `Error [${result.error.code}]: ${result.error.message}`,
        };
      }

      const val = result.value;
      if (format === 'json') {
        return {
          exitCode: ExitCodes.SUCCESS,
          stdout: JSON.stringify(val, null, 2),
          stderr: '',
        };
      }

      const lines = [
        `File: ${val.relativePath}`,
        `Exists: ${val.exists ? 'Yes' : 'No'}`,
        `Directory: ${val.isDirectory ? 'Yes' : 'No'}`,
        `Size: ${val.sizeBytes} bytes`,
        `Language: ${val.language ?? 'unknown'}`,
        `Content Hash: ${val.contentHash ?? 'none'}`,
      ];

      return {
        exitCode: ExitCodes.SUCCESS,
        stdout: lines.join('\n'),
        stderr: '',
      };
    }

    case 'list': {
      const inventory = await scanRepository({ rootPath });
      if (format === 'json') {
        return {
          exitCode: ExitCodes.SUCCESS,
          stdout: JSON.stringify(inventory.files, null, 2),
          stderr: '',
        };
      }

      const lines = inventory.files.map((f) => `${f.relativePath} (${f.language})`);
      return {
        exitCode: ExitCodes.SUCCESS,
        stdout: lines.join('\n'),
        stderr: '',
      };
    }

    case 'delete': {
      const result = await deleteSourceFile(rootPath, filePath!);
      if (!result.ok) {
        return {
          exitCode: ExitCodes.REPOSITORY_ERROR,
          stdout: '',
          stderr: `Error [${result.error.code}]: ${result.error.message}`,
        };
      }

      if (format === 'json') {
        return {
          exitCode: ExitCodes.SUCCESS,
          stdout: JSON.stringify({ deleted: result.value.relativePath }, null, 2),
          stderr: '',
        };
      }

      return {
        exitCode: ExitCodes.SUCCESS,
        stdout: `Deleted ${result.value.relativePath}`,
        stderr: '',
      };
    }

    default:
      return {
        exitCode: ExitCodes.INVALID_ARGUMENTS,
        stdout: '',
        stderr: `Unknown file action: "${action}"`,
      };
  }
}
