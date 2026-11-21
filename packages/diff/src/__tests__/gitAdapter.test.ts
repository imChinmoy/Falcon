import { describe, expect, it } from 'vitest';
import {
  createVirtualGitAdapter,
  parseNameStatusOutput,
  validateGitRef,
  validateGitPath,
} from '../gitAdapter.js';

describe('Git Adapter', () => {
  describe('Security & Argument Injection Defenses', () => {
    it('validates Git revision refs against option injection', () => {
      const evilRef1 = validateGitRef('--output=/tmp/pwn');
      expect(evilRef1.ok).toBe(false);

      const evilRef2 = validateGitRef('-o');
      expect(evilRef2.ok).toBe(false);

      const evilRef3 = validateGitRef('main\0injection');
      expect(evilRef3.ok).toBe(false);

      const validRef = validateGitRef('main');
      expect(validRef.ok).toBe(true);
    });

    it('validates Git file paths against option injection and null bytes', () => {
      const evilPath1 = validateGitPath('--output=/tmp/pwn');
      expect(evilPath1.ok).toBe(false);

      const evilPath2 = validateGitPath('src/main.ts\0.txt');
      expect(evilPath2.ok).toBe(false);

      const validPath = validateGitPath('src/main.ts');
      expect(validPath.ok).toBe(true);
    });

    it('VirtualGitAdapter blocks ref option injection', async () => {
      const git = createVirtualGitAdapter({ commits: {} });
      const res = await git.resolveRef('--upload-pack=pwn');
      expect(res.ok).toBe(false);
    });
  });
  describe('parseNameStatusOutput', () => {
    it('parses added, modified, and deleted status lines', () => {
      const raw = `
M\tsrc/index.ts
A\tsrc/newFile.ts
D\tsrc/oldFile.ts
`;
      const entries = parseNameStatusOutput(raw);
      expect(entries).toHaveLength(3);
      expect(entries[0]).toEqual({ path: 'src/index.ts', status: 'modified' });
      expect(entries[1]).toEqual({ path: 'src/newFile.ts', status: 'added' });
      expect(entries[2]).toEqual({ path: 'src/oldFile.ts', status: 'deleted' });
    });

    it('parses renamed and copied status lines with similarity percentages', () => {
      const raw = `
R100\tsrc/oldName.ts\tsrc/newName.ts
C095\tsrc/original.ts\tsrc/clone.ts
`;
      const entries = parseNameStatusOutput(raw);
      expect(entries).toHaveLength(2);
      expect(entries[0]).toEqual({
        path: 'src/newName.ts',
        oldPath: 'src/oldName.ts',
        status: 'renamed',
        similarity: 100,
      });
      expect(entries[1]).toEqual({
        path: 'src/clone.ts',
        oldPath: 'src/original.ts',
        status: 'copied',
        similarity: 95,
      });
    });

    it('handles Windows backslashes by normalizing to POSIX slashes', () => {
      const raw = 'M\tsrc\\nested\\file.ts\n';
      const entries = parseNameStatusOutput(raw);
      expect(entries).toEqual([{ path: 'src/nested/file.ts', status: 'modified' }]);
    });
  });

  describe('VirtualGitAdapter', () => {
    const git = createVirtualGitAdapter({
      commits: {
        'v1.0.0': {
          sha: 'commit-sha-1',
          files: {
            'src/calculator.ts':
              'export function add(a: number, b: number): number { return a + b; }',
            'src/old.ts': 'export const legacy = true;',
          },
        },
        'v1.1.0': {
          sha: 'commit-sha-2',
          files: {
            'src/calculator.ts':
              'export function add(a: number, b: number, c: number = 0): number { return a + b + c; }',
            'src/newFeature.ts':
              'export function multiply(a: number, b: number): number { return a * b; }',
          },
        },
      },
      headSha: 'commit-sha-2',
      currentBranch: 'main',
    });

    it('resolves ref by tag, sha, or HEAD', async () => {
      const res1 = await git.resolveRef('v1.0.0');
      expect(res1.ok).toBe(true);
      if (res1.ok) expect(res1.value).toBe('commit-sha-1');

      const res2 = await git.resolveRef('HEAD');
      expect(res2.ok).toBe(true);
      if (res2.ok) expect(res2.value).toBe('commit-sha-2');

      const resErr = await git.resolveRef('v9.9.9');
      expect(resErr.ok).toBe(false);
    });

    it('calculates name status differences between commit pairs', async () => {
      const diffRes = await git.diffNameStatus('v1.0.0', 'v1.1.0');
      expect(diffRes.ok).toBe(true);
      if (!diffRes.ok) return;

      const entries = diffRes.value;
      expect(entries).toHaveLength(3);

      const mod = entries.find((e) => e.path === 'src/calculator.ts');
      const del = entries.find((e) => e.path === 'src/old.ts');
      const add = entries.find((e) => e.path === 'src/newFeature.ts');

      expect(mod?.status).toBe('modified');
      expect(del?.status).toBe('deleted');
      expect(add?.status).toBe('added');
    });

    it('retrieves file contents from a specific revision without checking out code', async () => {
      const oldRes = await git.showFile('v1.0.0', 'src/calculator.ts');
      expect(oldRes.ok).toBe(true);
      if (oldRes.ok) {
        expect(oldRes.value).toContain('add(a: number, b: number)');
      }

      const newRes = await git.showFile('v1.1.0', 'src/calculator.ts');
      expect(newRes.ok).toBe(true);
      if (newRes.ok) {
        expect(newRes.value).toContain('add(a: number, b: number, c: number = 0)');
      }

      const missingRes = await git.showFile('v1.0.0', 'src/newFeature.ts');
      expect(missingRes.ok).toBe(false);
    });
  });
});
