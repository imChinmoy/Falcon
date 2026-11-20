import { describe, it, expect } from 'vitest';
import {
  createSymbolId,
  createEdgeId,
  ok,
  err,
  isOk,
  isErr,
  mapResult,
  unwrapResult,
  type CodeSymbol,
  type DependencyEdge,
  type ImpactFinding,
} from './index.js';

describe('@falcon/domain', () => {
  describe('Symbol ID generation', () => {
    it('creates a deterministic symbol ID', () => {
      const id = createSymbolId('src/pricing.ts', 'calculatePrice', 'function', 15);
      expect(id).toBe('src/pricing.ts#calculatePrice:function@15');
    });

    it('normalizes backslashes in file paths', () => {
      const id = createSymbolId('src\\components\\Button.tsx', 'Button', 'function', 10);
      expect(id).toBe('src/components/Button.tsx#Button:function@10');
    });
  });

  describe('Edge ID generation', () => {
    it('creates an edge ID representing source, target, and type', () => {
      const id = createEdgeId(
        'src/checkout.ts#checkout:function@10',
        'src/pricing.ts#calculatePrice:function@15',
        'CALLS',
      );
      expect(id).toBe(
        'src/checkout.ts#checkout:function@10->src/pricing.ts#calculatePrice:function@15[CALLS]',
      );
    });
  });

  describe('Result utilities', () => {
    it('handles ok result correctly', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
      expect(unwrapResult(result)).toBe(42);
    });

    it('handles err result correctly', () => {
      const failure = new Error('failed');
      const result = err(failure);
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
      expect(() => unwrapResult(result)).toThrow('failed');
    });

    it('maps over ok result', () => {
      const result = ok(10);
      const mapped = mapResult(result, (x) => x * 2);
      expect(unwrapResult(mapped)).toBe(20);
    });

    it('leaves err result untouched when mapping', () => {
      const result = err('failure');
      const mapped = mapResult(result, (x: number) => x * 2);
      expect(isErr(mapped)).toBe(true);
    });
  });

  describe('Type contracts shape check', () => {
    it('satisfies CodeSymbol interface', () => {
      const symbol: CodeSymbol = {
        id: 'src/calc.ts#add:function@5',
        snapshotId: 'snap-1',
        fileId: 'file-1',
        filePath: 'src/calc.ts',
        name: 'add',
        qualifiedName: 'add',
        kind: 'function',
        location: {
          filePath: 'src/calc.ts',
          startLine: 5,
          startColumn: 1,
          endLine: 7,
          endColumn: 2,
        },
        exported: true,
      };
      expect(symbol.name).toBe('add');
      expect(symbol.exported).toBe(true);
    });

    it('satisfies DependencyEdge interface', () => {
      const edge: DependencyEdge = {
        id: 'edge-1',
        snapshotId: 'snap-1',
        sourceSymbolId: 'sym-1',
        targetSymbolId: 'sym-2',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: {
          file: 'src/calc.ts',
          line: 6,
        },
      };
      expect(edge.confidence).toBe('confirmed');
    });

    it('satisfies ImpactFinding interface', () => {
      const finding: ImpactFinding = {
        id: 'find-1',
        analysisRunId: 'run-1',
        changedSymbolId: 'sym-2',
        affectedSymbolId: 'sym-1',
        impactKind: 'direct',
        confidence: 'confirmed',
        path: ['sym-1', 'sym-2'],
        reason: 'Compiler-resolved call expression',
      };
      expect(finding.impactKind).toBe('direct');
    });
  });
});
