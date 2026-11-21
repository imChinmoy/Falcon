import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runCli } from './cli.js';
import { ExitCodes, VERSION } from './constants.js';

describe('Falcon CLI', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falcon-cli-test-'));
    // Make it a git repo
    await fs.promises.mkdir(path.join(tempDir, '.git'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('version and help', () => {
    it('returns version text', async () => {
      const res = await runCli(['version']);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(res.stdout).toContain(`falcon v${VERSION}`);
    });

    it('returns version json', async () => {
      const res = await runCli(['version', '--format', 'json']);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.version).toBe(VERSION);
      expect(parsed.cli).toBe('falcon');
    });

    it('returns help output', async () => {
      const res = await runCli(['help']);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(res.stdout).toContain('FALCON CLI');
      expect(res.stdout).toContain('Usage:');
    });

    it('rejects unknown commands with INVALID_ARGUMENTS (code 2)', async () => {
      const res = await runCli(['unknown-command']);
      expect(res.exitCode).toBe(ExitCodes.INVALID_ARGUMENTS);
      expect(res.stderr).toContain('Unknown command');
    });
  });

  describe('file commands (read, write, edit, info, delete)', () => {
    it('writes a file via "file write"', async () => {
      const res = await runCli([
        'file',
        'write',
        'src/hello.ts',
        '--content',
        'export const hello = "world";',
        '--repo',
        tempDir,
      ]);

      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(res.stdout).toContain('Successfully created src/hello.ts');

      const onDisk = await fs.promises.readFile(path.join(tempDir, 'src/hello.ts'), 'utf-8');
      expect(onDisk).toBe('export const hello = "world";');
    });

    it('reads a file via "file read" and direct alias "read"', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src/app.ts'), 'console.log("running");');

      // Via file read
      const res1 = await runCli(['file', 'read', 'src/app.ts', '--repo', tempDir]);
      expect(res1.exitCode).toBe(ExitCodes.SUCCESS);
      expect(res1.stdout).toBe('console.log("running");');

      // Via direct alias "read"
      const res2 = await runCli(['read', 'src/app.ts', '--repo', tempDir]);
      expect(res2.exitCode).toBe(ExitCodes.SUCCESS);
      expect(res2.stdout).toBe('console.log("running");');

      // Via JSON format
      const resJson = await runCli(['read', 'src/app.ts', '--repo', tempDir, '--format', 'json']);
      expect(resJson.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(resJson.stdout);
      expect(parsed.relativePath).toBe('src/app.ts');
      expect(parsed.language).toBe('typescript');
      expect(parsed.content).toBe('console.log("running");');
    });

    it('edits a file via "file edit" and direct alias "edit"', async () => {
      await fs.promises.writeFile(
        path.join(tempDir, 'config.ts'),
        'export const config = { port: 3000 };\n',
      );

      const res = await runCli([
        'edit',
        'config.ts',
        '--find',
        '3000',
        '--replace',
        '8080',
        '--repo',
        tempDir,
      ]);

      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(res.stdout).toContain('Successfully edited config.ts');

      const onDisk = await fs.promises.readFile(path.join(tempDir, 'config.ts'), 'utf-8');
      expect(onDisk).toContain('port: 8080');
    });

    it('inspects file info via "file info"', async () => {
      await fs.promises.writeFile(path.join(tempDir, 'test.js'), 'function test() {}');

      const res = await runCli(['file', 'info', 'test.js', '--repo', tempDir, '--format', 'json']);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.exists).toBe(true);
      expect(parsed.language).toBe('javascript');
      expect(parsed.contentHash).toBeDefined();
    });

    it('rejects path traversal attempting to escape repo root with code 3', async () => {
      const res = await runCli(['read', '../../secret.txt', '--repo', tempDir]);
      expect(res.exitCode).toBe(ExitCodes.REPOSITORY_ERROR);
      expect(res.stderr).toContain('DIAG_PATH_TRAVERSAL');
    });

    it('returns REPOSITORY_ERROR when reading non-existent file', async () => {
      const res = await runCli(['read', 'not-here.ts', '--repo', tempDir]);
      expect(res.exitCode).toBe(ExitCodes.REPOSITORY_ERROR);
      expect(res.stderr).toContain('DIAG_FILE_NOT_FOUND');
    });
  });

  describe('analyze command', () => {
    it('analyzes repository and outputs text summary', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src/index.ts'), 'export const a = 1;');
      await fs.promises.writeFile(path.join(tempDir, 'src/utils.ts'), 'export const b = 2;');

      const res = await runCli(['analyze', tempDir]);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(res.stdout).toContain('FALCON Analysis Summary');
      expect(res.stdout).toContain('Eligible Source Files: 2');
      expect(res.stdout).toContain('src/index.ts');
    });

    it('analyzes repository and outputs json envelope', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src/main.ts'), 'console.log("hi");');

      const res = await runCli(['analyze', tempDir, '--format', 'json']);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.schemaVersion).toBe('1');
      expect(parsed.summary.sourceFilesDiscovered).toBe(1);
      expect(parsed.files[0].relativePath).toBe('src/main.ts');
    });

    it('returns REPOSITORY_ERROR if analyze path does not exist', async () => {
      const res = await runCli(['analyze', path.join(tempDir, 'does-not-exist')]);
      expect(res.exitCode).toBe(ExitCodes.REPOSITORY_ERROR);
      expect(res.stderr).toContain('DIAG_ROOT_NOT_FOUND');
    });

    it('writes analyze output to file via --output', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src/main.ts'), 'export const a = 1;');
      const outFile = path.join(tempDir, 'report.json');

      const res = await runCli(['analyze', tempDir, '--format', 'json', '--output', outFile]);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(fs.existsSync(outFile)).toBe(true);

      const content = JSON.parse(await fs.promises.readFile(outFile, 'utf-8'));
      expect(content.schemaVersion).toBe('1');
      expect(content.summary.sourceFilesDiscovered).toBe(1);
    });
  });

  describe('impact command', () => {
    it('requires --base and --target, returning INVALID_ARGUMENTS (code 2) if missing', async () => {
      const res = await runCli(['impact']);
      expect(res.exitCode).toBe(ExitCodes.INVALID_ARGUMENTS);
      expect(res.stderr).toContain('Both --base <git-ref> and --target <git-ref> are required');
    });

    it('generates impact JSON envelope conforming to CLI_SPEC.md', async () => {
      const res = await runCli([
        'impact',
        '--base',
        'main',
        '--target',
        'feature/auth',
        '--format',
        'json',
      ]);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.schemaVersion).toBe('1');
      expect(parsed.repository.baseRevision).toBe('main');
      expect(parsed.repository.targetRevision).toBe('feature/auth');
      expect(parsed.summary).toBeDefined();
      expect(Array.isArray(parsed.findings)).toBe(true);
      expect(Array.isArray(parsed.diagnostics)).toBe(true);
    });

    it('writes impact output to file via --output', async () => {
      const outFile = path.join(tempDir, 'impact.json');
      const res = await runCli([
        'impact',
        '--base',
        'v1.0.0',
        '--target',
        'v1.1.0',
        '--format',
        'json',
        '--output',
        outFile,
      ]);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(fs.existsSync(outFile)).toBe(true);
      const parsed = JSON.parse(await fs.promises.readFile(outFile, 'utf-8'));
      expect(parsed.repository.baseRevision).toBe('v1.0.0');
    });
  });

  describe('inspect-symbol command', () => {
    it('requires selector, returning INVALID_ARGUMENTS (code 2) if missing', async () => {
      const res = await runCli(['inspect-symbol']);
      expect(res.exitCode).toBe(ExitCodes.INVALID_ARGUMENTS);
      expect(res.stderr).toContain('Symbol selector is required');
    });

    it('inspects symbol and returns formatted json output', async () => {
      const res = await runCli([
        'inspect-symbol',
        'src/pricing.ts#calculatePrice',
        '--format',
        'json',
      ]);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.selector).toBe('src/pricing.ts#calculatePrice');
      expect(parsed.status).toBe('ready');
    });

    it('writes inspect-symbol output to file via --output', async () => {
      const outFile = path.join(tempDir, 'symbol.json');
      const res = await runCli([
        'inspect-symbol',
        'src/user.ts#getUser',
        '--format',
        'json',
        '--output',
        outFile,
      ]);
      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      expect(fs.existsSync(outFile)).toBe(true);
      const parsed = JSON.parse(await fs.promises.readFile(outFile, 'utf-8'));
      expect(parsed.selector).toBe('src/user.ts#getUser');
    });
  });

  describe('file list command', () => {
    it('lists repository source files in text and json formats', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src/a.ts'), 'export const a = 1;');
      await fs.promises.writeFile(path.join(tempDir, 'src/b.ts'), 'export const b = 2;');

      const textRes = await runCli(['file', 'list', '--repo', tempDir]);
      expect(textRes.exitCode).toBe(ExitCodes.SUCCESS);
      expect(textRes.stdout).toContain('src/a.ts');
      expect(textRes.stdout).toContain('src/b.ts');

      const jsonRes = await runCli(['file', 'list', '--repo', tempDir, '--format', 'json']);
      expect(jsonRes.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(jsonRes.stdout);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
    });
  });

  describe('test-recommend and impact with test recommendations', () => {
    it('runs test-recommend in text and json format', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src/__tests__'), { recursive: true });
      await fs.promises.writeFile(
        path.join(tempDir, 'src/auth.ts'),
        'export function login() { return true; }\n',
      );
      await fs.promises.writeFile(
        path.join(tempDir, 'src/__tests__/auth.test.ts'),
        'import { login } from "../auth.js";\nexport function testLogin() { return login(); }\n',
      );

      // Text format
      const textRes = await runCli(['test-recommend', '--repo', tempDir, 'src/auth.ts']);
      expect(textRes.exitCode).toBe(ExitCodes.SUCCESS);
      expect(textRes.stdout).toContain('FALCON Test Recommendations');
      expect(textRes.stdout).toContain('RECOMMENDED TESTS:');
      expect(textRes.stdout).toContain('auth.test.ts');

      // JSON format
      const jsonRes = await runCli([
        'test-recommend',
        '--repo',
        tempDir,
        'src/auth.ts',
        '--format',
        'json',
      ]);
      expect(jsonRes.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(jsonRes.stdout);
      expect(parsed.report).toBeDefined();
      expect(parsed.report.recommendedTests.length).toBeGreaterThan(0);
      expect(parsed.report.recommendedTests[0].testFile).toContain('auth.test.ts');
    });

    it('runs impact command with --recommend-tests flag', async () => {
      await fs.promises.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src/math.ts'), 'export const sum = 1;');

      const res = await runCli([
        'impact',
        '--base',
        'HEAD~1',
        '--target',
        'HEAD',
        '--repo',
        tempDir,
        '--recommend-tests',
        '--format',
        'json',
      ]);

      expect(res.exitCode).toBe(ExitCodes.SUCCESS);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.summary).toBeDefined();
    });
  });
});
