import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { scanRepository } from '../scanner.js';
import { computeContentHash } from '../hasher.js';

describe('scanner', () => {
  let fixtureDir: string;

  beforeAll(() => {
    fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-repo-scan-fixture-'));

    // Create a realistic sample repository structure:
    // root/
    //   .git/
    //   .gitignore
    //   package.json
    //   README.md
    //   node_modules/
    //     dep/index.js
    //   dist/
    //     index.js
    //   src/
    //     index.ts
    //     components/
    //       Button.tsx
    //     utils/
    //       calc.ts
    //       helper.js
    //   oversized.ts (6MB)
    //   ignored-by-git.ts

    fs.mkdirSync(path.join(fixtureDir, '.git'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'node_modules', 'dep'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'dist'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'src', 'components'), { recursive: true });
    fs.mkdirSync(path.join(fixtureDir, 'src', 'utils'), { recursive: true });

    fs.writeFileSync(
      path.join(fixtureDir, '.gitignore'),
      'ignored-by-git.ts\nnode_modules/\ndist/\n',
    );
    fs.writeFileSync(path.join(fixtureDir, 'package.json'), '{"name":"fixture"}');
    fs.writeFileSync(path.join(fixtureDir, 'README.md'), '# Fixture');

    fs.writeFileSync(
      path.join(fixtureDir, 'node_modules', 'dep', 'index.js'),
      'module.exports = {};',
    );
    fs.writeFileSync(path.join(fixtureDir, 'dist', 'index.js'), 'console.log("compiled");');

    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'index.ts'),
      'export * from "./components/Button.js";\n',
    );
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'components', 'Button.tsx'),
      'export const Button = () => null;\n',
    );
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'utils', 'calc.ts'),
      'export function add(a: number, b: number) { return a + b; }\n',
    );
    fs.writeFileSync(
      path.join(fixtureDir, 'src', 'utils', 'helper.js'),
      'export function help() { return true; }\n',
    );
    fs.writeFileSync(path.join(fixtureDir, 'ignored-by-git.ts'), 'export const secret = 123;\n');

    // Create an oversized file (> 100 KB for this test)
    const largeContent = Buffer.alloc(150 * 1024, 'a');
    fs.writeFileSync(path.join(fixtureDir, 'oversized.ts'), largeContent);
  });

  afterAll(() => {
    fs.rmSync(fixtureDir, { recursive: true, force: true });
  });

  it('scans and discovers valid source files with content hashes and metadata', async () => {
    const inventory = await scanRepository({
      rootPath: fixtureDir,
      snapshotId: 'test-snapshot',
      maxFileSizeBytes: 100 * 1024, // 100 KB limit for test
    });

    expect(inventory.isGitRepo).toBe(true);
    expect(inventory.files.length).toBe(4);

    const relativePaths = inventory.files.map((f) => f.relativePath);
    expect(relativePaths).toEqual([
      'src/components/Button.tsx',
      'src/index.ts',
      'src/utils/calc.ts',
      'src/utils/helper.js',
    ]);

    // Check Button.tsx properties
    const buttonFile = inventory.files.find((f) => f.relativePath === 'src/components/Button.tsx');
    expect(buttonFile).toBeDefined();
    expect(buttonFile?.language).toBe('tsx');
    expect(buttonFile?.snapshotId).toBe('test-snapshot');
    expect(buttonFile?.contentHash).toBe(computeContentHash('export const Button = () => null;\n'));
    expect(buttonFile?.parseStatus).toBe('parsed');

    // Check helper.js language
    const helperFile = inventory.files.find((f) => f.relativePath === 'src/utils/helper.js');
    expect(helperFile?.language).toBe('javascript');

    // Check excluded paths contains gitignored and default excluded paths
    expect(inventory.excludedPaths).toContain('dist');
    expect(inventory.excludedPaths).toContain('ignored-by-git.ts');
    expect(inventory.excludedPaths).toContain('node_modules');

    // Check oversized diagnostic was recorded
    const oversizedDiag = inventory.diagnostics.find((d) => d.code === 'DIAG_FILE_OVERSIZED');
    expect(oversizedDiag).toBeDefined();
    expect(oversizedDiag?.filePath).toBe('oversized.ts');
  });

  it('handles non-existent root path gracefully with diagnostic', async () => {
    const inventory = await scanRepository({
      rootPath: path.join(fixtureDir, 'non-existent-subpath'),
    });

    expect(inventory.files).toHaveLength(0);
    expect(inventory.diagnostics.length).toBeGreaterThan(0);
    expect(inventory.diagnostics[0]?.code).toBe('DIAG_ROOT_NOT_FOUND');
  });

  it('filters with custom include option', async () => {
    const inventory = await scanRepository({
      rootPath: fixtureDir,
      include: ['*.tsx'],
    });

    expect(inventory.files.map((f) => f.relativePath)).toEqual(['src/components/Button.tsx']);
  });

  it('filters with custom exclude option', async () => {
    const inventory = await scanRepository({
      rootPath: fixtureDir,
      exclude: ['src/utils/**'],
      maxFileSizeBytes: 1000 * 1024,
    });

    const paths = inventory.files.map((f) => f.relativePath);
    expect(paths).toContain('src/components/Button.tsx');
    expect(paths).toContain('src/index.ts');
    expect(paths).not.toContain('src/utils/calc.ts');
  });

  it('detects symlink escaping root and records diagnostic', async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-outside-'));
    fs.writeFileSync(path.join(outsideDir, 'secret.ts'), 'export const outside = true;');

    const symlinkPath = path.join(fixtureDir, 'src', 'escape-link.ts');
    try {
      fs.symlinkSync(path.join(outsideDir, 'secret.ts'), symlinkPath);
    } catch {
      // Symlink creation might require privileges on some systems
      return;
    }

    try {
      const inventory = await scanRepository({
        rootPath: fixtureDir,
      });

      const escapeDiag = inventory.diagnostics.find((d) => d.code === 'DIAG_SYMLINK_ESCAPE');
      expect(escapeDiag).toBeDefined();
      expect(escapeDiag?.filePath).toBe('src/escape-link.ts');
    } finally {
      fs.rmSync(symlinkPath, { force: true });
      fs.rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
