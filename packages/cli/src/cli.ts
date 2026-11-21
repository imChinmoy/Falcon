import { parseArgs } from 'node:util';
import { ExitCodes, HELP_TEXT, type ExitCode } from './constants.js';
import { runAnalyzeCommand } from './commands/analyze.js';
import { runFileCommand } from './commands/file.js';
import { runVersionCommand } from './commands/version.js';
import { runImpactCommand } from './commands/impact.js';
import { runInspectSymbolCommand } from './commands/inspectSymbol.js';
import { runTestRecommendCommand } from './commands/testRecommend.js';

export interface CliRunOutput {
  readonly exitCode: ExitCode;
  readonly stdout: string;
  readonly stderr: string;
}

export async function runCli(argv: string[]): Promise<CliRunOutput> {
  if (argv.length === 0) {
    return {
      exitCode: ExitCodes.SUCCESS,
      stdout: HELP_TEXT,
      stderr: '',
    };
  }

  // Quick check for top-level help or version flags
  if (argv.includes('--help') || argv.includes('-h') || argv[0] === 'help') {
    return {
      exitCode: ExitCodes.SUCCESS,
      stdout: HELP_TEXT,
      stderr: '',
    };
  }

  if (argv.includes('--version') || argv.includes('-v') || argv[0] === 'version') {
    const isJson = argv.includes('--format') && argv[argv.indexOf('--format') + 1] === 'json';
    return runVersionCommand(isJson ? 'json' : 'text');
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      options: {
        repo: { type: 'string' },
        format: { type: 'string' },
        output: { type: 'string' },
        content: { type: 'string' },
        find: { type: 'string' },
        replace: { type: 'string' },
        include: { type: 'string', multiple: true },
        exclude: { type: 'string', multiple: true },
        base: { type: 'string' },
        target: { type: 'string' },
        files: { type: 'string', multiple: true },
        coverage: { type: 'string' },
        'recommend-tests': { type: 'boolean' },
        'max-tests': { type: 'string' },
        'max-depth': { type: 'string' },
        'max-results': { type: 'string' },
        'snapshot-id': { type: 'string' },
        port: { type: 'string' },
        help: { type: 'boolean', short: 'h' },
        version: { type: 'boolean', short: 'v' },
      },
      allowPositionals: true,
      strict: false,
    });
  } catch (error) {
    return {
      exitCode: ExitCodes.INVALID_ARGUMENTS,
      stdout: '',
      stderr: `Argument parsing error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }

  const { values, positionals } = parsed;
  const primaryCommand = positionals[0];
  const format = values.format === 'json' ? 'json' : 'text';

  switch (primaryCommand) {
    case 'analyze': {
      const targetPath = positionals[1] ?? (values.repo as string) ?? '.';
      return runAnalyzeCommand({
        targetPath,
        format,
        outputFile: values.output as string | undefined,
        include: values.include as string[] | undefined,
        exclude: values.exclude as string[] | undefined,
        snapshotId: values['snapshot-id'] as string | undefined,
      });
    }

    case 'file': {
      const subAction = positionals[1] as
        'read' | 'write' | 'edit' | 'info' | 'list' | 'delete' | undefined;
      if (!subAction) {
        return {
          exitCode: ExitCodes.INVALID_ARGUMENTS,
          stdout: '',
          stderr:
            'Error: Subcommand for "file" is required (read, write, edit, info, list, delete).',
        };
      }

      const filePath = positionals[2];
      // For write action, content can be in --content or positionals[3]
      const content =
        (values.content as string | undefined) ??
        (subAction === 'write' ? positionals[3] : undefined);

      return runFileCommand({
        action: subAction,
        filePath,
        repoRoot: (values.repo as string) ?? '.',
        content,
        find: values.find as string | undefined,
        replace: values.replace as string | undefined,
        format,
      });
    }

    // Direct convenience aliases
    case 'read': {
      const filePath = positionals[1];
      return runFileCommand({
        action: 'read',
        filePath,
        repoRoot: (values.repo as string) ?? '.',
        format,
      });
    }

    case 'write': {
      const filePath = positionals[1];
      const content = (values.content as string | undefined) ?? positionals[2];
      return runFileCommand({
        action: 'write',
        filePath,
        repoRoot: (values.repo as string) ?? '.',
        content,
        format,
      });
    }

    case 'edit': {
      const filePath = positionals[1];
      return runFileCommand({
        action: 'edit',
        filePath,
        repoRoot: (values.repo as string) ?? '.',
        find: values.find as string | undefined,
        replace: values.replace as string | undefined,
        format,
      });
    }

    case 'info': {
      const filePath = positionals[1];
      return runFileCommand({
        action: 'info',
        filePath,
        repoRoot: (values.repo as string) ?? '.',
        format,
      });
    }

    case 'list': {
      return runFileCommand({
        action: 'list',
        repoRoot: (values.repo as string) ?? positionals[1] ?? '.',
        format,
      });
    }

    case 'inspect-symbol': {
      const selector = positionals[1];
      return runInspectSymbolCommand(selector, format, values.output as string | undefined);
    }

    case 'impact': {
      const maxDepth = values['max-depth']
        ? parseInt(values['max-depth'] as string, 10)
        : undefined;
      const maxResults = values['max-results']
        ? parseInt(values['max-results'] as string, 10)
        : undefined;

      return runImpactCommand({
        base: values.base as string | undefined,
        target: values.target as string | undefined,
        repo: values.repo as string | undefined,
        format,
        outputFile: values.output as string | undefined,
        maxDepth,
        maxResults,
        recommendTests: values['recommend-tests'] as boolean | undefined,
      });
    }

    case 'test-recommend': {
      const maxTests = values['max-tests']
        ? parseInt(values['max-tests'] as string, 10)
        : undefined;

      // Extract files from positionals (after command) or --files
      let filesList: string[] | undefined = values.files as string[] | undefined;
      if (!filesList && positionals.length > 1) {
        filesList = positionals.slice(1);
      }

      return runTestRecommendCommand({
        repo: values.repo as string | undefined,
        base: values.base as string | undefined,
        target: values.target as string | undefined,
        files: filesList,
        coverage: values.coverage as string | undefined,
        format,
        outputFile: values.output as string | undefined,
        maxTests,
      });
    }

    case 'gui':
    case 'dashboard': {
      const port = values.port ? parseInt(values.port as string, 10) : 4200;
      const repoPath = (values.repo as string) ?? positionals[1] ?? '.';
      return {
        exitCode: ExitCodes.SUCCESS,
        stdout: `🦅 FALCON Apple Dark Theme GUI:\n  Start: pnpm --filter @falcon/gui start -- --port ${port} --repo "${repoPath}"\n  Or:    node packages/gui/dist/bin.js --port ${port} --repo "${repoPath}"`,
        stderr: '',
      };
    }

    default:
      return {
        exitCode: ExitCodes.INVALID_ARGUMENTS,
        stdout: '',
        stderr: `Unknown command "${primaryCommand}". Run "falcon help" to see available commands.`,
      };
  }
}
