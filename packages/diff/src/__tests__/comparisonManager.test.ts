import { describe, expect, it } from 'vitest';
import { compareRevisions } from '../comparisonManager.js';
import { createVirtualGitAdapter } from '../gitAdapter.js';

describe('Version Controller Comparison Manager', () => {
  it('performs end-to-end revision diff between virtual commits and parses ASTs', async () => {
    const gitAdapter = createVirtualGitAdapter({
      commits: {
        'v1.0.0': {
          sha: 'commit-sha-v1',
          files: {
            'src/service.ts': `
export function processOrder(orderId: string): boolean {
  return true;
}
export function cancelOrder(orderId: string): void {}
`,
          },
        },
        'v2.0.0': {
          sha: 'commit-sha-v2',
          files: {
            'src/service.ts': `
export function processOrder(orderId: string, priority: boolean = false): boolean {
  return true;
}
export function refundOrder(orderId: string, amount: number): void {}
`,
            'src/config.ts': `
export const DEFAULT_TIMEOUT = 5000;
`,
          },
        },
      },
    });

    const res = await compareRevisions({
      repoRoot: '/fake/root',
      baseRef: 'v1.0.0',
      targetRef: 'v2.0.0',
      gitAdapter,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;

    const diff = res.value;

    expect(diff.comparison.baseCommitSha).toBe('commit-sha-v1');
    expect(diff.comparison.targetCommitSha).toBe('commit-sha-v2');
    expect(diff.changedFiles).toHaveLength(2);

    // Modified file: src/service.ts
    const modFile = diff.changedFiles.find((f) => f.path === 'src/service.ts');
    expect(modFile?.status).toBe('modified');

    // Added file: src/config.ts
    const addFile = diff.changedFiles.find((f) => f.path === 'src/config.ts');
    expect(addFile?.status).toBe('added');

    // Symbols classification:
    // processOrder should be modified with signatureChanged = true
    const modSym = diff.modifiedSymbols.find((s) => s.name === 'processOrder');
    expect(modSym).toBeDefined();
    expect(modSym?.signatureChanged).toBe(true);

    // cancelOrder should be deleted
    const delSym = diff.deletedSymbols.find((s) => s.name === 'cancelOrder');
    expect(delSym).toBeDefined();

    // refundOrder and DEFAULT_TIMEOUT should be added
    const addRefund = diff.addedSymbols.find((s) => s.name === 'refundOrder');
    expect(addRefund).toBeDefined();

    const addConfig = diff.addedSymbols.find((s) => s.name === 'DEFAULT_TIMEOUT');
    expect(addConfig).toBeDefined();
  });
});
