import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createRepositoryFilter } from '../filter.js';

describe('filter', () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-filter-test-'));
    fs.writeFileSync(
      path.join(tempDir, '.gitignore'),
      '# test ignore\ncustom-ignored/\n*.secret.ts\n',
    );
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('excludes default directories', () => {
    const filter = createRepositoryFilter({ rootPath: tempDir });
    expect(filter.shouldExclude('node_modules', true)).toBe(true);
    expect(filter.shouldExclude('node_modules/express/index.js', false)).toBe(true);
    expect(filter.shouldExclude('.git', true)).toBe(true);
    expect(filter.shouldExclude('dist', true)).toBe(true);
    expect(filter.shouldExclude('dist/bundle.js', false)).toBe(true);
    expect(filter.shouldExclude('coverage', true)).toBe(true);
  });

  it('excludes default patterns such as .d.ts and lockfiles', () => {
    const filter = createRepositoryFilter({ rootPath: tempDir });
    expect(filter.shouldExclude('types/index.d.ts', false)).toBe(true);
    expect(filter.shouldExclude('types/index.d.mts', false)).toBe(true);
    expect(filter.shouldExclude('error.log', false)).toBe(true);
    expect(filter.shouldExclude('pnpm-lock.yaml', false)).toBe(true);
  });

  it('reads and respects .gitignore rules', () => {
    const filter = createRepositoryFilter({ rootPath: tempDir, respectGitignore: true });
    expect(filter.shouldExclude('custom-ignored', true)).toBe(true);
    expect(filter.shouldExclude('custom-ignored/file.ts', false)).toBe(true);
    expect(filter.shouldExclude('credentials.secret.ts', false)).toBe(true);
    expect(filter.shouldExclude('src/main.ts', false)).toBe(false);
  });

  it('supports custom exclude patterns', () => {
    const filter = createRepositoryFilter({
      rootPath: tempDir,
      exclude: ['**/*.fixture.ts', 'legacy/'],
    });
    expect(filter.shouldExclude('src/test.fixture.ts', false)).toBe(true);
    expect(filter.shouldExclude('legacy/old.js', false)).toBe(true);
    expect(filter.shouldExclude('src/valid.ts', false)).toBe(false);
  });
});
