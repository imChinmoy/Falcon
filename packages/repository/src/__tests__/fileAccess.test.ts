import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  readSourceFile,
  writeSourceFile,
  editSourceFile,
  getSourceFileInfo,
  deleteSourceFile,
} from '../fileAccess.js';

describe('Repository file access and modification', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falcon-fileaccess-test-'));
    // Create dummy .git directory
    await fs.promises.mkdir(path.join(tempDir, '.git'));
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  describe('writeSourceFile', () => {
    it('creates a new file and subdirectories safely', async () => {
      const result = await writeSourceFile({
        rootPath: tempDir,
        relativePath: 'src/utils/math.ts',
        content: 'export const add = (a: number, b: number) => a + b;\n',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.relativePath).toBe('src/utils/math.ts');
      expect(result.value.isNew).toBe(true);
      expect(result.value.language).toBe('typescript');
      expect(result.value.contentHash).toBeDefined();
      expect(result.value.sizeBytes).toBeGreaterThan(0);

      // Verify file exists on disk
      const diskContent = await fs.promises.readFile(result.value.fullPath, 'utf-8');
      expect(diskContent).toBe('export const add = (a: number, b: number) => a + b;\n');
    });

    it('rejects path traversal attempting to escape root', async () => {
      const result = await writeSourceFile({
        rootPath: tempDir,
        relativePath: '../escape.ts',
        content: 'malicious',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('DIAG_PATH_TRAVERSAL');
    });
  });

  describe('readSourceFile', () => {
    it('reads an existing source file and computes hash and language', async () => {
      const filePath = path.join(tempDir, 'index.ts');
      await fs.promises.writeFile(filePath, 'console.log("hello");');

      const result = await readSourceFile({
        rootPath: tempDir,
        relativePath: 'index.ts',
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(result.value.relativePath).toBe('index.ts');
      expect(result.value.content).toBe('console.log("hello");');
      expect(result.value.language).toBe('typescript');
      expect(result.value.sizeBytes).toBe(21);
    });

    it('returns error if file does not exist', async () => {
      const result = await readSourceFile({
        rootPath: tempDir,
        relativePath: 'non-existent.ts',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('DIAG_FILE_NOT_FOUND');
    });

    it('rejects traversal on read', async () => {
      const result = await readSourceFile({
        rootPath: tempDir,
        relativePath: '../../etc/passwd',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('DIAG_PATH_TRAVERSAL');
    });

    it('enforces max file size limit', async () => {
      const bigFile = path.join(tempDir, 'big.ts');
      await fs.promises.writeFile(bigFile, Buffer.alloc(1000, 'x'));

      const result = await readSourceFile({
        rootPath: tempDir,
        relativePath: 'big.ts',
        maxFileSizeBytes: 500,
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe('DIAG_FILE_OVERSIZED');
    });
  });

  describe('editSourceFile', () => {
    it('replaces target text and updates hash', async () => {
      await writeSourceFile({
        rootPath: tempDir,
        relativePath: 'service.ts',
        content: 'const port = 3000;\nexport const start = () => port;\n',
      });

      const editResult = await editSourceFile({
        rootPath: tempDir,
        relativePath: 'service.ts',
        find: '3000',
        replace: '8080',
      });

      expect(editResult.ok).toBe(true);
      if (!editResult.ok) return;

      expect(editResult.value.replacementsCount).toBe(1);
      expect(editResult.value.previousHash).not.toBe(editResult.value.contentHash);

      // Verify on disk
      const readResult = await readSourceFile({
        rootPath: tempDir,
        relativePath: 'service.ts',
      });
      expect(readResult.ok).toBe(true);
      if (!readResult.ok) return;
      expect(readResult.value.content).toContain('const port = 8080;');
    });

    it('returns DIAG_TARGET_NOT_FOUND when target does not exist', async () => {
      await writeSourceFile({
        rootPath: tempDir,
        relativePath: 'service.ts',
        content: 'const port = 3000;\n',
      });

      const editResult = await editSourceFile({
        rootPath: tempDir,
        relativePath: 'service.ts',
        find: 'nonExistentToken',
        replace: 'something',
      });

      expect(editResult.ok).toBe(false);
      if (editResult.ok) return;
      expect(editResult.error.code).toBe('DIAG_TARGET_NOT_FOUND');
    });
  });

  describe('getSourceFileInfo & deleteSourceFile', () => {
    it('gets metadata for existing and non-existing files', async () => {
      await writeSourceFile({
        rootPath: tempDir,
        relativePath: 'component.tsx',
        content: 'export const Button = () => <button />;',
      });

      const existingInfo = await getSourceFileInfo(tempDir, 'component.tsx');
      expect(existingInfo.ok).toBe(true);
      if (!existingInfo.ok) return;
      expect(existingInfo.value.exists).toBe(true);
      expect(existingInfo.value.language).toBe('tsx');
      expect(existingInfo.value.isDirectory).toBe(false);

      const nonExistingInfo = await getSourceFileInfo(tempDir, 'ghost.ts');
      expect(nonExistingInfo.ok).toBe(true);
      if (!nonExistingInfo.ok) return;
      expect(nonExistingInfo.value.exists).toBe(false);
    });

    it('deletes an existing file safely', async () => {
      await writeSourceFile({
        rootPath: tempDir,
        relativePath: 'toDelete.ts',
        content: 'const dead = true;',
      });

      const deleteRes = await deleteSourceFile(tempDir, 'toDelete.ts');
      expect(deleteRes.ok).toBe(true);

      const check = await getSourceFileInfo(tempDir, 'toDelete.ts');
      expect(check.ok).toBe(true);
      if (!check.ok) return;
      expect(check.value.exists).toBe(false);
    });
  });
});
