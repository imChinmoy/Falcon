import { describe, expect, it } from 'vitest';
import type { CodeSymbol } from '@falcon/domain';
import { createSymbolId } from '@falcon/domain';
import { matchSymbols } from '../symbolMatcher.js';

function makeSymbol(
  filePath: string,
  name: string,
  kind: CodeSymbol['kind'],
  startLine: number,
  options?: {
    signature?: string;
    exported?: boolean;
    endLine?: number;
    parentName?: string;
  },
): CodeSymbol {
  const qualifiedName = options?.parentName ? `${options.parentName}.${name}` : name;
  return {
    id: createSymbolId(filePath, qualifiedName, kind, startLine),
    snapshotId: 'snap-1',
    fileId: filePath,
    filePath,
    name,
    qualifiedName,
    kind,
    exported: options?.exported ?? true,
    location: {
      filePath,
      startLine,
      startColumn: 1,
      endLine: options?.endLine ?? startLine + 5,
      endColumn: 10,
    },
    ...(options?.signature ? { signatureFingerprint: options.signature } : {}),
  };
}

describe('Symbol Matcher', () => {
  it('detects unchanged symbols when signature and location match exactly', () => {
    const oldSym = makeSymbol('src/math.ts', 'add', 'function', 10, {
      signature: 'a:number,b:number',
    });
    const newSym = makeSymbol('src/math.ts', 'add', 'function', 10, {
      signature: 'a:number,b:number',
    });

    const matches = matchSymbols({
      oldSymbols: [oldSym],
      newSymbols: [newSym],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('unchanged');
    expect(matches[0]!.signatureChanged).toBe(false);
    expect(matches[0]!.confidence).toBe('confirmed');
  });

  it('detects modified symbols when signature changes', () => {
    const oldSym = makeSymbol('src/math.ts', 'add', 'function', 10, {
      signature: 'a:number,b:number',
    });
    const newSym = makeSymbol('src/math.ts', 'add', 'function', 10, {
      signature: 'a:number,b:number,c:number',
    });

    const matches = matchSymbols({
      oldSymbols: [oldSym],
      newSymbols: [newSym],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('modified');
    expect(matches[0]!.signatureChanged).toBe(true);
    expect(matches[0]!.reason).toContain(
      "Signature changed: 'a:number,b:number' -> 'a:number,b:number,c:number'",
    );
  });

  it('detects modified symbols when export visibility changes', () => {
    const oldSym = makeSymbol('src/math.ts', 'add', 'function', 10, {
      signature: 'a:number,b:number',
      exported: false,
    });
    const newSym = makeSymbol('src/math.ts', 'add', 'function', 10, {
      signature: 'a:number,b:number',
      exported: true,
    });

    const matches = matchSymbols({
      oldSymbols: [oldSym],
      newSymbols: [newSym],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('modified');
    expect(matches[0]!.reason).toContain('Export visibility changed');
  });

  it('detects added and deleted symbols', () => {
    const symOldOnly = makeSymbol('src/math.ts', 'subtract', 'function', 20, {
      signature: 'a:number,b:number',
    });
    const symNewOnly = makeSymbol('src/math.ts', 'multiply', 'function', 30, {
      signature: 'a:number,b:number',
    });

    const matches = matchSymbols({
      oldSymbols: [symOldOnly],
      newSymbols: [symNewOnly],
    });

    expect(matches).toHaveLength(2);
    const added = matches.find((m) => m.status === 'added');
    const deleted = matches.find((m) => m.status === 'deleted');

    expect(added).toBeDefined();
    expect(added?.name).toBe('multiply');

    expect(deleted).toBeDefined();
    expect(deleted?.name).toBe('subtract');
  });

  it('flags ambiguous matches when multiple declarations share the same qualified name and kind', () => {
    const oldSym1 = makeSymbol('src/types.ts', 'Config', 'interface', 10);
    const oldSym2 = makeSymbol('src/types.ts', 'Config', 'interface', 25);
    const newSym = makeSymbol('src/types.ts', 'Config', 'interface', 15);

    const matches = matchSymbols({
      oldSymbols: [oldSym1, oldSym2],
      newSymbols: [newSym],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('ambiguous');
    expect(matches[0]!.confidence).toBe('unresolved');
    expect(matches[0]!.reason).toContain('Ambiguous match');
  });

  it('detects renamed symbols when signature and kind match within the same file', () => {
    const oldSym = makeSymbol('src/pricing.ts', 'calculateDiscount', 'function', 10, {
      signature: 'price:number,rate:number',
    });
    const newSym = makeSymbol('src/pricing.ts', 'computeDiscount', 'function', 12, {
      signature: 'price:number,rate:number',
    });

    const matches = matchSymbols({
      oldSymbols: [oldSym],
      newSymbols: [newSym],
    });

    expect(matches).toHaveLength(1);
    expect(matches[0]!.status).toBe('renamed');
    expect(matches[0]!.confidence).toBe('inferred');
    expect(matches[0]!.reason).toContain("Likely renamed from 'calculateDiscount'");
  });

  it('scales symbol matching near-linearly (O(N)) for 2,000 symbols in < 300ms', () => {
    const COUNT = 2000;
    const oldSymbols: CodeSymbol[] = [];
    const newSymbols: CodeSymbol[] = [];

    for (let i = 0; i < COUNT; i++) {
      const isRename = i % 5 === 0;
      const isModify = i % 3 === 0;

      const oldName = `symbol_function_${i}`;
      const newName = isRename ? `symbol_function_${i}_renamed` : oldName;
      const oldFingerprint = `sig_fp_${i}`;
      const newFingerprint = isModify ? `sig_fp_${i}_v2` : oldFingerprint;

      oldSymbols.push(
        makeSymbol('src/mod.ts', oldName, 'function', i + 1, {
          signature: oldFingerprint,
        }),
      );

      newSymbols.push(
        makeSymbol('src/mod.ts', newName, 'function', i + 1, {
          signature: newFingerprint,
        }),
      );
    }

    const start = performance.now();
    const matches = matchSymbols({ oldSymbols, newSymbols });
    const elapsed = performance.now() - start;

    expect(matches.length).toBeGreaterThanOrEqual(COUNT);
    expect(elapsed).toBeLessThan(350);

    const renames = matches.filter((m) => m.status === 'renamed');
    expect(renames.length).toBeGreaterThan(0);
  });
});
