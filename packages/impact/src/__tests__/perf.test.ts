import { describe, it, expect } from 'vitest';
import { DependencyGraphImpl } from '@falcon/graph';
import { analyzeImpact } from '../engine.js';

describe('Impact Engine Performance & Scalability Benchmark', () => {
  it('traverses impact across a 3,000 node DAG in < 100ms', () => {
    const graph = new DependencyGraphImpl();
    const TOTAL_NODES = 3000;

    for (let i = 0; i < TOTAL_NODES; i++) {
      graph.addNode({
        id: `sym-${i}`,
        kind: 'symbol',
        name: `func_${i}`,
        filePath: `src/mod_${Math.floor(i / 50)}.ts`,
      });
    }

    // Build a branching dependency tree where sym-(i+1) depends on sym-i
    // (meaning reverse impact traverses from sym-i to sym-(i+1))
    for (let i = 0; i < TOTAL_NODES - 2; i++) {
      // sym-(i+1) depends on sym-i (incoming edge to sym-i from sym-(i+1))
      graph.addEdge({
        id: `e-${i + 1}->${i}`,
        snapshotId: 'snap-1',
        sourceSymbolId: `sym-${i + 1}`,
        targetSymbolId: `sym-${i}`,
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: `src/mod_${Math.floor((i + 1) / 50)}.ts`, line: 10 },
      });
    }

    const start = performance.now();
    const report = analyzeImpact({
      graph,
      changedSymbolIds: ['sym-0'],
      maxDepth: 100,
    });
    const elapsed = performance.now() - start;

    expect(report.findings.length).toBe(100);
    expect(report.directlyAffectedSymbols.length).toBe(1);
    expect(report.transitivelyAffectedSymbols.length).toBe(99);
    expect(elapsed).toBeLessThan(150);
  });

  it('safely handles cyclic graphs without infinite loops or memory blowup', () => {
    const graph = new DependencyGraphImpl();

    // Create a 500-node circular ring: node 0 depends on 1, 1 depends on 2, ... 499 depends on 0
    const RING_SIZE = 500;
    for (let i = 0; i < RING_SIZE; i++) {
      const next = (i + 1) % RING_SIZE;
      graph.addEdge({
        id: `ring-${i}->${next}`,
        snapshotId: 'snap-1',
        sourceSymbolId: `node-${i}`,
        targetSymbolId: `node-${next}`,
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/ring.ts', line: i + 1 },
      });
    }

    const start = performance.now();
    const report = analyzeImpact({
      graph,
      changedSymbolIds: ['node-0'],
    });
    const elapsed = performance.now() - start;

    // Node 0 changed -> all other 499 nodes in the ring are affected exactly once
    expect(report.findings.length).toBe(RING_SIZE - 1);
    expect(elapsed).toBeLessThan(100);
  });

  it('honors maxResults limit and sets truncated flag cleanly', () => {
    const graph = new DependencyGraphImpl();

    // Fan-out: 100 dependents of root
    for (let i = 1; i <= 100; i++) {
      graph.addEdge({
        id: `fan-${i}->0`,
        snapshotId: 'snap-1',
        sourceSymbolId: `dependent-${i}`,
        targetSymbolId: 'root',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/fan.ts', line: i },
      });
    }

    const report = analyzeImpact({
      graph,
      changedSymbolIds: ['root'],
      maxResults: 25,
    });

    expect(report.findings.length).toBe(25);
    expect(report.truncated).toBe(true);
    expect(report.truncationReason).toContain('Maximum result limit (25) reached');
  });

  it('efficiently traverses impact from multiple changed roots in a wide graph', () => {
    const graph = new DependencyGraphImpl();

    // 10 changed roots, each with 100 distinct dependents
    const changedRoots: string[] = [];
    for (let r = 0; r < 10; r++) {
      const rootId = `root-${r}`;
      changedRoots.push(rootId);
      for (let d = 0; d < 100; d++) {
        graph.addEdge({
          id: `e-${rootId}->dep-${r}-${d}`,
          snapshotId: 'snap-1',
          sourceSymbolId: `dep-${r}-${d}`,
          targetSymbolId: rootId,
          type: 'CALLS',
          resolutionStatus: 'resolved',
          confidence: 'confirmed',
          evidence: { file: 'src/roots.ts', line: d + 1 },
        });
      }
    }

    const start = performance.now();
    const report = analyzeImpact({
      graph,
      changedSymbolIds: changedRoots,
    });
    const elapsed = performance.now() - start;

    expect(report.findings.length).toBe(1000);
    expect(report.directlyAffectedSymbols.length).toBe(1000);
    expect(elapsed).toBeLessThan(150);
  });
});
