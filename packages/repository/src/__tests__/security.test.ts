import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  isPathWithinRoot,
  normalizeRelativePath,
  readSourceFile,
  writeSourceFile,
  getSourceFileInfo,
  deleteSourceFile,
} from '../index.js';

describe('Security Hardening & Bounds Verification', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falcon-sec-repo-'));
    await fs.promises.writeFile(path.join(tempRoot, 'safe.ts'), 'export const safe = true;');
    await fs.promises.mkdir(path.join(tempRoot, 'subdir'), { recursive: true });
    await fs.promises.writeFile(
      path.join(tempRoot, 'subdir', 'nested.ts'),
      'export const nested = 1;',
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempRoot, { recursive: true, force: true });
  });

  describe('isPathWithinRoot & Path Traversal Defenses', () => {
    it('allows legitimate relative and absolute paths within root', () => {
      expect(isPathWithinRoot(tempRoot, 'safe.ts')).toBe(true);
      expect(isPathWithinRoot(tempRoot, 'subdir/nested.ts')).toBe(true);
      expect(isPathWithinRoot(tempRoot, path.join(tempRoot, 'safe.ts'))).toBe(true);
      expect(isPathWithinRoot(tempRoot, path.join(tempRoot, 'subdir', 'nested.ts'))).toBe(true);
    });

    it('rejects standard directory traversal', () => {
      expect(isPathWithinRoot(tempRoot, '../outside.txt')).toBe(false);
      expect(isPathWithinRoot(tempRoot, '../../etc/passwd')).toBe(false);
      expect(isPathWithinRoot(tempRoot, 'subdir/../../outside.txt')).toBe(false);
    });

    it('rejects null byte injection attacks', () => {
      expect(isPathWithinRoot(tempRoot, 'safe.ts\0.outside.txt')).toBe(false);
      expect(isPathWithinRoot(tempRoot, 'safe.ts\0/../../etc/passwd')).toBe(false);
      expect(isPathWithinRoot(tempRoot + '\0', 'safe.ts')).toBe(false);
    });

    it('rejects URL-encoded traversal sequences (%2e%2e%2f)', () => {
      expect(isPathWithinRoot(tempRoot, '%2e%2e%2foutside.txt')).toBe(false);
      expect(isPathWithinRoot(tempRoot, '%2e%2e/%2e%2e/etc/passwd')).toBe(false);
      expect(isPathWithinRoot(tempRoot, 'subdir/%2e%2e/%2e%2e/outside.txt')).toBe(false);
    });

    it('rejects double-URL-encoded traversal sequences (%252e%252e%252f)', () => {
      expect(isPathWithinRoot(tempRoot, '%252e%252e%252foutside.txt')).toBe(false);
      expect(isPathWithinRoot(tempRoot, '%252e%252e%252f%252e%252e%252fetc/passwd')).toBe(false);
    });

    it('rejects backslash-based traversal on POSIX systems', () => {
      expect(isPathWithinRoot(tempRoot, '..\\outside.txt')).toBe(false);
      expect(isPathWithinRoot(tempRoot, 'subdir\\..\\..\\outside.txt')).toBe(false);
      expect(isPathWithinRoot(tempRoot, '..\\..\\etc\\passwd')).toBe(false);
    });

    it('rejects sibling directory prefix collision bypass attacks', () => {
      // e.g. root is /tmp/falcon-sec-repo-1234
      // attacker targets /tmp/falcon-sec-repo-1234-malicious
      const siblingPath = `${tempRoot}-malicious/file.ts`;
      expect(isPathWithinRoot(tempRoot, siblingPath)).toBe(false);
    });
  });

  describe('normalizeRelativePath security validation', () => {
    it('normalizes backslashes to forward slashes', () => {
      expect(normalizeRelativePath('foo\\bar\\baz.ts')).toBe('foo/bar/baz.ts');
    });

    it('decodes URL components safely', () => {
      expect(normalizeRelativePath('foo%20bar/file.ts')).toBe('foo bar/file.ts');
    });

    it('throws RepositoryValidationError when null byte is passed', () => {
      expect(() => normalizeRelativePath('foo\0bar.ts')).toThrow();
    });

    it('throws RepositoryValidationError when null byte is URL-encoded (%00)', () => {
      expect(() => normalizeRelativePath('foo%00bar.ts')).toThrow();
    });
  });

  describe('fileAccess operations traversal boundary enforcement', () => {
    it('readSourceFile rejects traversal and null-byte injection', async () => {
      const traversal = await readSourceFile({
        rootPath: tempRoot,
        relativePath: '../../etc/passwd',
      });
      expect(traversal.ok).toBe(false);
      if (!traversal.ok) {
        expect(traversal.error.code).toBe('DIAG_PATH_TRAVERSAL');
      }

      const encoded = await readSourceFile({
        rootPath: tempRoot,
        relativePath: '%2e%2e%2f%2e%2e%2fetc/passwd',
      });
      expect(encoded.ok).toBe(false);
      if (!encoded.ok) {
        expect(encoded.error.code).toBe('DIAG_PATH_TRAVERSAL');
      }

      const nullByte = await readSourceFile({
        rootPath: tempRoot,
        relativePath: 'safe.ts\0../../etc/passwd',
      });
      expect(nullByte.ok).toBe(false);
      if (!nullByte.ok) {
        expect(nullByte.error.code).toBe('DIAG_PATH_TRAVERSAL');
      }
    });

    it('writeSourceFile rejects path traversal beyond repository root', async () => {
      const result = await writeSourceFile({
        rootPath: tempRoot,
        relativePath: '../../pwned.txt',
        content: 'exploit',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('DIAG_PATH_TRAVERSAL');
      }
    });

    it('getSourceFileInfo rejects traversal and null-byte inputs', async () => {
      const info = await getSourceFileInfo(tempRoot, '../outside.txt');
      expect(info.ok).toBe(false);
      if (!info.ok) {
        expect(info.error.code).toBe('DIAG_PATH_TRAVERSAL');
      }
    });

    it('deleteSourceFile rejects traversal attempts', async () => {
      const del = await deleteSourceFile(tempRoot, '../outside.txt');
      expect(del.ok).toBe(false);
      if (!del.ok) {
        expect(del.error.code).toBe('DIAG_PATH_TRAVERSAL');
      }
    });
  });
});
