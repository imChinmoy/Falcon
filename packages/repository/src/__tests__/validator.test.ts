import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { validateRepositoryRoot, isPathWithinRoot, normalizeRelativePath } from '../validator.js';
import { isOk, isErr } from '@falcon/domain';

describe('validator', () => {
  let tempDir: string;
  let testFile: string;

  beforeAll(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'falcon-val-test-'));
    testFile = path.join(tempDir, 'sample.txt');
    fs.writeFileSync(testFile, 'hello');
  });

  afterAll(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  describe('validateRepositoryRoot', () => {
    it('succeeds for an existing directory', () => {
      const result = validateRepositoryRoot(tempDir);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.rootPath).toBe(fs.realpathSync(tempDir));
        expect(result.value.isGitRepo).toBe(false);
      }
    });

    it('detects git repository when .git exists', () => {
      const gitDir = path.join(tempDir, '.git');
      fs.mkdirSync(gitDir);
      const result = validateRepositoryRoot(tempDir);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.isGitRepo).toBe(true);
      }
      fs.rmSync(gitDir, { recursive: true });
    });

    it('fails when directory does not exist', () => {
      const nonExistent = path.join(tempDir, 'does-not-exist');
      const result = validateRepositoryRoot(nonExistent);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('DIAG_ROOT_NOT_FOUND');
      }
    });

    it('fails when path points to a file instead of a directory', () => {
      const result = validateRepositoryRoot(testFile);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('DIAG_ROOT_NOT_DIRECTORY');
      }
    });
  });

  describe('isPathWithinRoot', () => {
    it('returns true for paths inside root', () => {
      expect(isPathWithinRoot(tempDir, path.join(tempDir, 'src', 'index.ts'))).toBe(true);
      expect(isPathWithinRoot(tempDir, tempDir)).toBe(true);
    });

    it('returns false for paths escaping root', () => {
      expect(isPathWithinRoot(tempDir, path.join(tempDir, '..', 'other'))).toBe(false);
      expect(isPathWithinRoot(tempDir, '/etc/passwd')).toBe(false);
    });
  });

  describe('normalizeRelativePath', () => {
    it('converts backslashes to forward slashes', () => {
      expect(normalizeRelativePath('src\\models\\user.ts')).toBe('src/models/user.ts');
      expect(normalizeRelativePath('nested\\sub\\file.tsx')).toBe('nested/sub/file.tsx');
    });

    it('leaves forward slashes unchanged', () => {
      expect(normalizeRelativePath('src/models/user.ts')).toBe('src/models/user.ts');
    });
  });
});
