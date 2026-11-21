import { describe, it, expect, beforeEach } from 'vitest';
import type { DependencyEdge } from '@falcon/domain';
import { createDependencyGraph, createNode } from '@falcon/graph';
import {
  PKG_NAME,
  analyzeImpact,
  getDirectlyAffected,
  getTransitivelyAffected,
  calculateImpactPath,
  aggregatePathConfidence,
  compareConfidence,
  minConfidence,
  maxConfidence,
} from './index.js';

describe('@falcon/impact', () => {
  it('exports package name', () => {
    expect(PKG_NAME).toBe('@falcon/impact');
  });

  describe('Confidence Propagation Utilities', () => {
    it('compares confidence levels correctly', () => {
      expect(compareConfidence('confirmed', 'inferred')).toBeGreaterThan(0);
      expect(compareConfidence('inferred', 'unresolved')).toBeGreaterThan(0);
      expect(compareConfidence('unresolved', 'unknown')).toBeGreaterThan(0);
      expect(compareConfidence('confirmed', 'confirmed')).toBe(0);
    });

    it('returns min and max confidence correctly', () => {
      expect(minConfidence('confirmed', 'inferred')).toBe('inferred');
      expect(minConfidence('inferred', 'unknown')).toBe('unknown');
      expect(maxConfidence('confirmed', 'inferred')).toBe('confirmed');
      expect(maxConfidence('unresolved', 'unknown')).toBe('unresolved');
    });

    it('aggregates path confidence using weakest-link principle', () => {
      expect(aggregatePathConfidence(['confirmed', 'confirmed'])).toBe('confirmed');
      expect(aggregatePathConfidence(['confirmed', 'inferred', 'confirmed'])).toBe('inferred');
      expect(aggregatePathConfidence(['confirmed', 'unresolved'])).toBe('unresolved');
      expect(aggregatePathConfidence(['confirmed', 'unknown'])).toBe('unknown');
      expect(aggregatePathConfidence([])).toBe('confirmed');
    });
  });

  describe('Impact Engine - Core Scenarios', () => {
    let graph = createDependencyGraph();

    beforeEach(() => {
      graph = createDependencyGraph();
    });

    it('identifies directly affected symbols (1-hop reverse dependency)', () => {
      // Setup: consumer calls service (consumer -> service)
      const serviceNode = createNode({
        id: 'src/service.ts#fetchData:function@5',
        kind: 'symbol',
        name: 'fetchData',
        filePath: 'src/service.ts',
      });
      const consumerNode = createNode({
        id: 'src/consumer.ts#render:function@10',
        kind: 'symbol',
        name: 'render',
        filePath: 'src/consumer.ts',
      });

      graph.addNode(serviceNode);
      graph.addNode(consumerNode);

      const edge: DependencyEdge = {
        id: 'consumer->service',
        snapshotId: 's1',
        sourceSymbolId: consumerNode.id,
        targetSymbolId: serviceNode.id,
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/consumer.ts', line: 12 },
      };
      graph.addEdge(edge);

      // Analyze impact when fetchData changes
      const report = analyzeImpact({
        graph,
        changedSymbolIds: [serviceNode.id],
      });

      expect(report.changedSymbols).toEqual([serviceNode.id]);
      expect(report.directlyAffectedSymbols).toHaveLength(1);
      expect(report.transitivelyAffectedSymbols).toHaveLength(0);

      const directFinding = report.directlyAffectedSymbols[0]!;
      expect(directFinding.changedSymbolId).toBe(serviceNode.id);
      expect(directFinding.affectedSymbolId).toBe(consumerNode.id);
      expect(directFinding.impactKind).toBe('direct');
      expect(directFinding.confidence).toBe('confirmed');
      expect(directFinding.path).toEqual([serviceNode.id, consumerNode.id]);
      expect(directFinding.evidence).toEqual({ file: 'src/consumer.ts', line: 12 });
      expect(directFinding.reason).toContain(
        'Directly affected: render depends on changed fetchData via CALLS',
      );

      // Directly affected helper
      const directHelper = getDirectlyAffected(graph, [serviceNode.id]);
      expect(directHelper).toHaveLength(1);
      expect(directHelper[0]!.affectedSymbolId).toBe(consumerNode.id);
    });

    it('identifies transitively affected symbols across n-hop dependency chain', () => {
      // Chain: A depends on B, B depends on C, C depends on D
      // A -> B -> C -> D
      // When D changes:
      // Direct (1-hop): C
      // Transitive (2-hops): B
      // Transitive (3-hops): A
      const nodeA = createNode({ id: 'A', kind: 'symbol', name: 'A', filePath: 'src/a.ts' });
      const nodeB = createNode({ id: 'B', kind: 'symbol', name: 'B', filePath: 'src/b.ts' });
      const nodeC = createNode({ id: 'C', kind: 'symbol', name: 'C', filePath: 'src/c.ts' });
      const nodeD = createNode({ id: 'D', kind: 'symbol', name: 'D', filePath: 'src/d.ts' });

      graph.addNode(nodeA);
      graph.addNode(nodeB);
      graph.addNode(nodeC);
      graph.addNode(nodeD);

      graph.addEdge({
        id: 'A->B',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'B',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/a.ts', line: 1 },
      });
      graph.addEdge({
        id: 'B->C',
        snapshotId: 's',
        sourceSymbolId: 'B',
        targetSymbolId: 'C',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/b.ts', line: 1 },
      });
      graph.addEdge({
        id: 'C->D',
        snapshotId: 's',
        sourceSymbolId: 'C',
        targetSymbolId: 'D',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/c.ts', line: 1 },
      });

      const report = analyzeImpact({
        graph,
        changedSymbolIds: ['D'],
      });

      expect(report.directlyAffectedSymbols).toHaveLength(1);
      expect(report.directlyAffectedSymbols[0]!.affectedSymbolId).toBe('C');

      expect(report.transitivelyAffectedSymbols).toHaveLength(2);
      const transitiveIds = report.transitivelyAffectedSymbols.map((f) => f.affectedSymbolId);
      expect(transitiveIds).toEqual(['B', 'A']);

      const bFinding = report.transitivelyAffectedSymbols.find((f) => f.affectedSymbolId === 'B')!;
      expect(bFinding.path).toEqual(['D', 'C', 'B']);
      expect(bFinding.reason).toContain('Transitively affected (2 hops)');

      const aFinding = report.transitivelyAffectedSymbols.find((f) => f.affectedSymbolId === 'A')!;
      expect(aFinding.path).toEqual(['D', 'C', 'B', 'A']);
      expect(aFinding.reason).toContain('Transitively affected (3 hops)');

      // Transitive helper
      const transHelper = getTransitivelyAffected(graph, ['D']);
      expect(transHelper.map((f) => f.affectedSymbolId)).toEqual(['B', 'A']);
    });

    it('calculates the shortest impact path', () => {
      // D changed. Reachable via:
      // Path 1 (2 hops): D <- C <- A
      // Path 2 (3 hops): D <- E <- F <- A
      graph.addEdge({
        id: 'A->C',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'C',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 1 },
      });
      graph.addEdge({
        id: 'C->D',
        snapshotId: 's',
        sourceSymbolId: 'C',
        targetSymbolId: 'D',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'c.ts', line: 1 },
      });
      graph.addEdge({
        id: 'A->F',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'F',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 2 },
      });
      graph.addEdge({
        id: 'F->E',
        snapshotId: 's',
        sourceSymbolId: 'F',
        targetSymbolId: 'E',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'f.ts', line: 1 },
      });
      graph.addEdge({
        id: 'E->D',
        snapshotId: 's',
        sourceSymbolId: 'E',
        targetSymbolId: 'D',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'e.ts', line: 1 },
      });

      const path = calculateImpactPath(graph, 'D', 'A');
      expect(path).toEqual(['D', 'C', 'A']);
    });

    it('propagates and degrades confidence along impact paths', () => {
      // Chain: A -> B -> C -> D
      // Edge C -> D: confirmed
      // Edge B -> C: inferred
      // Edge A -> B: confirmed
      graph.addEdge({
        id: 'C->D',
        snapshotId: 's',
        sourceSymbolId: 'C',
        targetSymbolId: 'D',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'c.ts', line: 1 },
      });
      graph.addEdge({
        id: 'B->C',
        snapshotId: 's',
        sourceSymbolId: 'B',
        targetSymbolId: 'C',
        type: 'REFERENCES',
        resolutionStatus: 'resolved',
        confidence: 'inferred',
        evidence: { file: 'b.ts', line: 1 },
      });
      graph.addEdge({
        id: 'A->B',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'B',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 1 },
      });

      const report = analyzeImpact({
        graph,
        changedSymbolIds: ['D'],
      });

      const findingC = report.findings.find((f) => f.affectedSymbolId === 'C')!;
      expect(findingC.confidence).toBe('confirmed');

      const findingB = report.findings.find((f) => f.affectedSymbolId === 'B')!;
      expect(findingB.confidence).toBe('inferred'); // Degraded by B->C

      const findingA = report.findings.find((f) => f.affectedSymbolId === 'A')!;
      expect(findingA.confidence).toBe('inferred'); // Remains inferred due to weakest link
    });

    it('respects depth limit (maxDepth)', () => {
      // Chain: A -> B -> C -> D
      graph.addEdge({
        id: 'A->B',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'B',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 1 },
      });
      graph.addEdge({
        id: 'B->C',
        snapshotId: 's',
        sourceSymbolId: 'B',
        targetSymbolId: 'C',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'b.ts', line: 1 },
      });
      graph.addEdge({
        id: 'C->D',
        snapshotId: 's',
        sourceSymbolId: 'C',
        targetSymbolId: 'D',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'c.ts', line: 1 },
      });

      // maxDepth = 1: only direct dependents (C)
      const depth1Report = analyzeImpact({
        graph,
        changedSymbolIds: ['D'],
        maxDepth: 1,
      });
      expect(depth1Report.directlyAffectedSymbols.map((f) => f.affectedSymbolId)).toEqual(['C']);
      expect(depth1Report.transitivelyAffectedSymbols).toEqual([]);

      // maxDepth = 2: C (1-hop) and B (2-hops)
      const depth2Report = analyzeImpact({
        graph,
        changedSymbolIds: ['D'],
        maxDepth: 2,
      });
      expect(depth2Report.directlyAffectedSymbols.map((f) => f.affectedSymbolId)).toEqual(['C']);
      expect(depth2Report.transitivelyAffectedSymbols.map((f) => f.affectedSymbolId)).toEqual([
        'B',
      ]);
    });

    it('respects result limit (maxResults) and marks report as truncated', () => {
      // Fan-out: 5 nodes all depend on D
      for (let i = 1; i <= 5; i++) {
        graph.addEdge({
          id: `Node${i}->D`,
          snapshotId: 's',
          sourceSymbolId: `Node${i}`,
          targetSymbolId: 'D',
          type: 'CALLS',
          resolutionStatus: 'resolved',
          confidence: 'confirmed',
          evidence: { file: `node${i}.ts`, line: 1 },
        });
      }

      const report = analyzeImpact({
        graph,
        changedSymbolIds: ['D'],
        maxResults: 3,
      });

      expect(report.findings).toHaveLength(3);
      expect(report.truncated).toBe(true);
      expect(report.truncationReason).toContain('Maximum result limit (3) reached');
    });

    it('handles circular dependencies cleanly without infinite loops', () => {
      // Circular: A -> B -> C -> A
      // When C changes:
      // Dependents: B depends on C (1 hop)
      // A depends on B (2 hops)
      // C is NOT marked as affected by itself!
      graph.addEdge({
        id: 'A->B',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'B',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 1 },
      });
      graph.addEdge({
        id: 'B->C',
        snapshotId: 's',
        sourceSymbolId: 'B',
        targetSymbolId: 'C',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'b.ts', line: 1 },
      });
      graph.addEdge({
        id: 'C->A',
        snapshotId: 's',
        sourceSymbolId: 'C',
        targetSymbolId: 'A',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'c.ts', line: 1 },
      });

      const report = analyzeImpact({
        graph,
        changedSymbolIds: ['C'],
      });

      expect(report.directlyAffectedSymbols.map((f) => f.affectedSymbolId)).toEqual(['B']);
      expect(report.transitivelyAffectedSymbols.map((f) => f.affectedSymbolId)).toEqual(['A']);
      // C must not be in findings
      expect(report.findings.some((f) => f.affectedSymbolId === 'C')).toBe(false);
      expect(report.truncated).toBe(false);
    });

    it('aggregates file-level impact properly', () => {
      // File 1: src/models/user.ts with User symbol
      // File 2: src/services/auth.ts with login and register symbols (both depend on User)
      // File 3: src/controllers/auth.ts with handleLogin (depends on login)
      const userSym = createNode({
        id: 'src/models/user.ts#User:class@1',
        kind: 'symbol',
        name: 'User',
        filePath: 'src/models/user.ts',
      });
      const loginSym = createNode({
        id: 'src/services/auth.ts#login:function@10',
        kind: 'symbol',
        name: 'login',
        filePath: 'src/services/auth.ts',
      });
      const registerSym = createNode({
        id: 'src/services/auth.ts#register:function@30',
        kind: 'symbol',
        name: 'register',
        filePath: 'src/services/auth.ts',
      });
      const controllerSym = createNode({
        id: 'src/controllers/auth.ts#handleLogin:function@5',
        kind: 'symbol',
        name: 'handleLogin',
        filePath: 'src/controllers/auth.ts',
      });

      graph.addNode(userSym);
      graph.addNode(loginSym);
      graph.addNode(registerSym);
      graph.addNode(controllerSym);

      graph.addEdge({
        id: 'login->user',
        snapshotId: 's',
        sourceSymbolId: loginSym.id,
        targetSymbolId: userSym.id,
        type: 'REFERENCES',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/services/auth.ts', line: 12 },
      });
      graph.addEdge({
        id: 'register->user',
        snapshotId: 's',
        sourceSymbolId: registerSym.id,
        targetSymbolId: userSym.id,
        type: 'REFERENCES',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/services/auth.ts', line: 32 },
      });
      graph.addEdge({
        id: 'controller->login',
        snapshotId: 's',
        sourceSymbolId: controllerSym.id,
        targetSymbolId: loginSym.id,
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/controllers/auth.ts', line: 8 },
      });

      const report = analyzeImpact({
        graph,
        changedSymbolIds: [userSym.id],
      });

      // Directly affected file: src/services/auth.ts (distance = 1)
      expect(report.directlyAffectedFiles).toHaveLength(1);
      const authFile = report.directlyAffectedFiles[0]!;
      expect(authFile.filePath).toBe('src/services/auth.ts');
      expect(authFile.impactKind).toBe('direct');
      expect(authFile.distance).toBe(1);
      expect(authFile.affectedSymbols).toHaveLength(2);
      expect(authFile.affectedSymbols).toContain(loginSym.id);
      expect(authFile.affectedSymbols).toContain(registerSym.id);

      // Transitively affected file: src/controllers/auth.ts (distance = 2)
      expect(report.transitivelyAffectedFiles).toHaveLength(1);
      const ctrlFile = report.transitivelyAffectedFiles[0]!;
      expect(ctrlFile.filePath).toBe('src/controllers/auth.ts');
      expect(ctrlFile.impactKind).toBe('transitive');
      expect(ctrlFile.distance).toBe(2);
      expect(ctrlFile.affectedSymbols).toEqual([controllerSym.id]);

      // Statistics check
      expect(report.statistics.totalAffectedSymbols).toBe(3);
      expect(report.statistics.directAffectedSymbolsCount).toBe(2);
      expect(report.statistics.transitiveAffectedSymbolsCount).toBe(1);
      expect(report.statistics.totalAffectedFiles).toBe(2);
      expect(report.statistics.directAffectedFilesCount).toBe(1);
      expect(report.statistics.transitiveAffectedFilesCount).toBe(1);
      expect(report.statistics.maxDepthReached).toBe(2);
    });

    it('identifies impact when changedFilePaths is supplied', () => {
      // Changed file: src/service.ts containing symA and symB
      // Another file src/consumer.ts depends on symA
      const symA = createNode({
        id: 'src/service.ts#symA:function@1',
        kind: 'symbol',
        name: 'symA',
        filePath: 'src/service.ts',
      });
      const symB = createNode({
        id: 'src/service.ts#symB:function@10',
        kind: 'symbol',
        name: 'symB',
        filePath: 'src/service.ts',
      });
      const consumerSym = createNode({
        id: 'src/consumer.ts#useSymA:function@5',
        kind: 'symbol',
        name: 'useSymA',
        filePath: 'src/consumer.ts',
      });

      graph.addNode(symA);
      graph.addNode(symB);
      graph.addNode(consumerSym);

      graph.addEdge({
        id: 'consumer->symA',
        snapshotId: 's',
        sourceSymbolId: consumerSym.id,
        targetSymbolId: symA.id,
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/consumer.ts', line: 7 },
      });

      const report = analyzeImpact({
        graph,
        changedFilePaths: ['src/service.ts'],
      });

      expect(report.changedFiles).toContain('src/service.ts');
      expect(report.changedSymbols).toContain(symA.id);
      expect(report.changedSymbols).toContain(symB.id);
      expect(report.directlyAffectedSymbols).toHaveLength(1);
      expect(report.directlyAffectedSymbols[0]!.affectedSymbolId).toBe(consumerSym.id);
      expect(report.directlyAffectedFiles[0]!.filePath).toBe('src/consumer.ts');
    });
  });
});
