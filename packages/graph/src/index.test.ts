import { describe, it, expect, beforeEach } from 'vitest';
import type { CodeSymbol, DependencyEdge, SourceFile } from '@falcon/domain';
import {
  PKG_NAME,
  createDependencyGraph,
  createSymbolNode,
  createFileNode,
  createNode,
  buildGraphFromSnapshot,
} from './index.js';

describe('@falcon/graph', () => {
  it('exports package name', () => {
    expect(PKG_NAME).toBe('@falcon/graph');
  });

  describe('Node and Edge Management', () => {
    let graph = createDependencyGraph();

    beforeEach(() => {
      graph = createDependencyGraph();
    });

    it('creates symbol and file nodes properly', () => {
      const symbol: CodeSymbol = {
        id: 'src/user.ts#getUser:function@10',
        snapshotId: 'snap-1',
        fileId: 'file-1',
        filePath: 'src/user.ts',
        name: 'getUser',
        qualifiedName: 'getUser',
        kind: 'function',
        location: {
          filePath: 'src/user.ts',
          startLine: 10,
          startColumn: 1,
          endLine: 20,
          endColumn: 2,
        },
        exported: true,
      };

      const symNode = createSymbolNode(symbol);
      expect(symNode.id).toBe('src/user.ts#getUser:function@10');
      expect(symNode.kind).toBe('symbol');
      expect(symNode.name).toBe('getUser');
      expect(symNode.filePath).toBe('src/user.ts');
      expect(symNode.symbol).toEqual(symbol);

      const file: SourceFile = {
        id: 'file-1',
        snapshotId: 'snap-1',
        relativePath: 'src/user.ts',
        contentHash: 'hash123',
        language: 'typescript',
        parseStatus: 'parsed',
        isExcluded: false,
      };

      const fNode = createFileNode('src/user.ts', file);
      expect(fNode.id).toBe('file-1');
      expect(fNode.kind).toBe('file');
      expect(fNode.name).toBe('user.ts');
      expect(fNode.file).toEqual(file);

      const genericNode = createNode({
        id: 'node-x',
        kind: 'symbol',
        name: 'Custom',
        filePath: 'src/custom.ts',
      });
      expect(genericNode.id).toBe('node-x');
    });

    it('adds and retrieves nodes', () => {
      const nodeA = createNode({ id: 'A', kind: 'symbol', name: 'A', filePath: 'src/a.ts' });
      const nodeB = createNode({ id: 'B', kind: 'symbol', name: 'B', filePath: 'src/b.ts' });

      graph.addNode(nodeA);
      graph.addNode(nodeB);

      expect(graph.nodeCount).toBe(2);
      expect(graph.hasNode('A')).toBe(true);
      expect(graph.hasNode('C')).toBe(false);
      expect(graph.getNode('A')).toEqual(nodeA);
      expect(graph.getNodes()).toHaveLength(2);
    });

    it('adds edges and auto-creates placeholder nodes if missing', () => {
      const edge: DependencyEdge = {
        id: 'A->B[CALLS]',
        snapshotId: 'snap-1',
        sourceSymbolId: 'A',
        targetSymbolId: 'B',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/a.ts', line: 15 },
      };

      graph.addEdge(edge);

      expect(graph.edgeCount).toBe(1);
      expect(graph.hasEdge('A->B[CALLS]')).toBe(true);
      expect(graph.hasEdgeBetween('A', 'B')).toBe(true);
      expect(graph.hasEdgeBetween('A', 'B', 'CALLS')).toBe(true);
      expect(graph.hasEdgeBetween('A', 'B', 'IMPORTS_MODULE')).toBe(false);
      expect(graph.hasEdgeBetween('B', 'A')).toBe(false);
      expect(graph.hasNode('A')).toBe(true);
      expect(graph.hasNode('B')).toBe(true);
      expect(graph.getEdge('A->B[CALLS]')).toEqual(edge);
    });

    it('removes nodes and cascades edge deletion', () => {
      const edge1: DependencyEdge = {
        id: 'e1',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'B',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 1 },
      };
      const edge2: DependencyEdge = {
        id: 'e2',
        snapshotId: 's',
        sourceSymbolId: 'B',
        targetSymbolId: 'C',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'b.ts', line: 1 },
      };

      graph.addEdge(edge1);
      graph.addEdge(edge2);
      expect(graph.nodeCount).toBe(3);
      expect(graph.edgeCount).toBe(2);

      expect(graph.removeNode('B')).toBe(true);
      expect(graph.nodeCount).toBe(2);
      expect(graph.edgeCount).toBe(0);
      expect(graph.hasEdge('e1')).toBe(false);
      expect(graph.hasEdge('e2')).toBe(false);
      expect(graph.getDirectDependencies('A')).toEqual([]);
      expect(graph.getDirectDependents('C')).toEqual([]);
    });

    it('removes edges correctly', () => {
      const edge: DependencyEdge = {
        id: 'e1',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'B',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 1 },
      };
      graph.addEdge(edge);
      expect(graph.edgeCount).toBe(1);
      expect(graph.removeEdge('e1')).toBe(true);
      expect(graph.edgeCount).toBe(0);
      expect(graph.removeEdge('e1')).toBe(false);
    });

    it('indexes and finds nodes by file', () => {
      const nodeA1 = createNode({ id: 'A1', kind: 'symbol', name: 'A1', filePath: 'src/a.ts' });
      const nodeA2 = createNode({ id: 'A2', kind: 'symbol', name: 'A2', filePath: 'src/a.ts' });
      const nodeB = createNode({ id: 'B', kind: 'symbol', name: 'B', filePath: 'src/b.ts' });

      graph.addNode(nodeA1);
      graph.addNode(nodeA2);
      graph.addNode(nodeB);

      const nodesInA = graph.findNodesByFile('src/a.ts');
      expect(nodesInA).toHaveLength(2);
      expect(nodesInA.map((n) => n.id)).toEqual(expect.arrayContaining(['A1', 'A2']));
      expect(graph.findNodesByFile('src/nonexistent.ts')).toEqual([]);
    });
  });

  describe('Adjacency and Traversal', () => {
    let graph = createDependencyGraph();

    beforeEach(() => {
      // Graph structure:
      // A depends on B (A -> B)
      // B depends on C (B -> C)
      // D depends on B (D -> B)
      // C depends on E (C -> E)
      graph = createDependencyGraph();

      const edges: DependencyEdge[] = [
        {
          id: 'A->B',
          snapshotId: 's',
          sourceSymbolId: 'A',
          targetSymbolId: 'B',
          type: 'CALLS',
          resolutionStatus: 'resolved',
          confidence: 'confirmed',
          evidence: { file: 'a.ts', line: 1 },
        },
        {
          id: 'B->C',
          snapshotId: 's',
          sourceSymbolId: 'B',
          targetSymbolId: 'C',
          type: 'REFERENCES',
          resolutionStatus: 'resolved',
          confidence: 'confirmed',
          evidence: { file: 'b.ts', line: 1 },
        },
        {
          id: 'D->B',
          snapshotId: 's',
          sourceSymbolId: 'D',
          targetSymbolId: 'B',
          type: 'CALLS',
          resolutionStatus: 'resolved',
          confidence: 'inferred',
          evidence: { file: 'd.ts', line: 1 },
        },
        {
          id: 'C->E',
          snapshotId: 's',
          sourceSymbolId: 'C',
          targetSymbolId: 'E',
          type: 'IMPORTS_SYMBOL',
          resolutionStatus: 'resolved',
          confidence: 'confirmed',
          evidence: { file: 'c.ts', line: 1 },
        },
      ];

      for (const edge of edges) {
        graph.addEdge(edge);
      }
    });

    it('queries direct dependencies (outgoing)', () => {
      const depsOfA = graph.getDirectDependencies('A');
      expect(depsOfA.map((n) => n.id)).toEqual(['B']);

      const depsOfB = graph.getDirectDependencies('B');
      expect(depsOfB.map((n) => n.id)).toEqual(['C']);

      const depsOfE = graph.getDirectDependencies('E');
      expect(depsOfE).toEqual([]);
    });

    it('queries direct dependents (incoming / reverse)', () => {
      // Who depends on B? A and D
      const dependentsOfB = graph.getDirectDependents('B');
      expect(dependentsOfB.map((n) => n.id).sort()).toEqual(['A', 'D']);

      // Who depends on C? B
      const dependentsOfC = graph.getDirectDependents('C');
      expect(dependentsOfC.map((n) => n.id)).toEqual(['B']);

      // Who depends on A? Nobody
      const dependentsOfA = graph.getDirectDependents('A');
      expect(dependentsOfA).toEqual([]);
    });

    it('queries transitive dependencies with depth limit', () => {
      // A -> B -> C -> E
      const allDepsOfA = graph.getTransitiveDependencies('A');
      expect(allDepsOfA.map((n) => n.id)).toEqual(['B', 'C', 'E']);

      const depth1Deps = graph.getTransitiveDependencies('A', { maxDepth: 1 });
      expect(depth1Deps.map((n) => n.id)).toEqual(['B']);

      const depth2Deps = graph.getTransitiveDependencies('A', { maxDepth: 2 });
      expect(depth2Deps.map((n) => n.id)).toEqual(['B', 'C']);
    });

    it('queries transitive dependents (reverse reachability)', () => {
      // Who transitively depends on E?
      // C depends on E (1 hop)
      // B depends on C (2 hops)
      // A and D depend on B (3 hops)
      const dependentsOfE = graph.getTransitiveDependents('E');
      const ids = dependentsOfE.map((n) => n.id);
      expect(ids).toContain('C');
      expect(ids).toContain('B');
      expect(ids).toContain('A');
      expect(ids).toContain('D');
    });

    it('filters edges and nodes during traversal', () => {
      const callsOnly = graph.getTransitiveDependents('B', {
        filterEdge: (edge) => edge.type === 'CALLS',
      });
      // A and D depend on B via CALLS
      expect(callsOnly.map((n) => n.id).sort()).toEqual(['A', 'D']);
    });

    it('exports adjacency list', () => {
      const adj = graph.toAdjacencyList();
      expect(adj.outgoing['A']).toEqual(['B']);
      expect(adj.incoming['B']?.slice().sort()).toEqual(['A', 'D']);
    });
  });

  describe('Cycle Detection and Topological Sort', () => {
    it('detects no cycles in DAG and produces topological order', () => {
      const graph = createDependencyGraph();
      // Order: A -> B -> C
      // In evaluation order, C has 0 dependencies, B depends on C, A depends on B.
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

      expect(graph.hasCycle()).toBe(false);
      expect(graph.findCycles()).toEqual([]);

      const topo = graph.topologicalSort();
      expect(topo).not.toBeNull();
      // C must come before B, B must come before A
      expect(topo!.indexOf('C')).toBeLessThan(topo!.indexOf('B'));
      expect(topo!.indexOf('B')).toBeLessThan(topo!.indexOf('A'));
    });

    it('detects simple 2-node cycle', () => {
      const graph = createDependencyGraph();
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
        id: 'B->A',
        snapshotId: 's',
        sourceSymbolId: 'B',
        targetSymbolId: 'A',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'b.ts', line: 1 },
      });

      expect(graph.hasCycle()).toBe(true);
      const cycles = graph.findCycles();
      expect(cycles.length).toBeGreaterThanOrEqual(1);
      expect(cycles[0]).toEqual(['A', 'B', 'A']);
      expect(graph.topologicalSort()).toBeNull();
    });

    it('detects 3-node cycle and handles circular traversal gracefully', () => {
      const graph = createDependencyGraph();
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

      expect(graph.hasCycle()).toBe(true);
      const cycles = graph.findCycles();
      expect(cycles[0]).toEqual(['A', 'B', 'C', 'A']);

      // Traversal does not loop indefinitely
      const dependents = graph.getTransitiveDependents('C');
      expect(dependents.map((n) => n.id).sort()).toEqual(['A', 'B']);
    });
  });

  describe('Path Finding', () => {
    let graph = createDependencyGraph();

    beforeEach(() => {
      graph = createDependencyGraph();
      // Paths:
      // A -> B -> C -> D
      // A -> E -> D
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
      graph.addEdge({
        id: 'A->E',
        snapshotId: 's',
        sourceSymbolId: 'A',
        targetSymbolId: 'E',
        type: 'CALLS',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'a.ts', line: 2 },
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
    });

    it('finds forward shortest path', () => {
      const shortest = graph.findShortestPath('A', 'D', 'forward');
      // Shortest is A -> E -> D (2 hops) vs A -> B -> C -> D (3 hops)
      expect(shortest).toEqual(['A', 'E', 'D']);
    });

    it('finds reverse shortest path (impact path)', () => {
      // In reverse direction: who depends on D?
      // D is depended on by E, which is depended on by A
      const shortestReverse = graph.findShortestPath('D', 'A', 'reverse');
      expect(shortestReverse).toEqual(['D', 'E', 'A']);
    });

    it('finds edge path', () => {
      const edges = graph.findEdgePath('A', 'D', 'forward');
      expect(edges).toHaveLength(2);
      expect(edges![0]!.id).toBe('A->E');
      expect(edges![1]!.id).toBe('E->D');
    });

    it('finds all paths between two nodes', () => {
      const allPaths = graph.findAllPaths('A', 'D');
      expect(allPaths).toHaveLength(2);
      expect(allPaths).toContainEqual(['A', 'E', 'D']);
      expect(allPaths).toContainEqual(['A', 'B', 'C', 'D']);
    });

    it('returns null when no path exists', () => {
      expect(graph.findShortestPath('D', 'A', 'forward')).toBeNull();
      expect(graph.findEdgePath('D', 'A', 'forward')).toBeNull();
    });
  });

  describe('Graph Cloning, Subgraphs, and Snapshot Builder', () => {
    it('clones a dependency graph accurately', () => {
      const graph = createDependencyGraph();
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

      const clone = graph.clone();
      expect(clone.nodeCount).toBe(2);
      expect(clone.edgeCount).toBe(1);

      // Mutating clone does not mutate original
      clone.removeNode('A');
      expect(clone.nodeCount).toBe(1);
      expect(graph.nodeCount).toBe(2);
    });

    it('extracts subgraph correctly', () => {
      const graph = createDependencyGraph();
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

      const sub = graph.subgraph(['A', 'B']);
      expect(sub.nodeCount).toBe(2);
      expect(sub.hasNode('C')).toBe(false);
      expect(sub.hasEdge('A->B')).toBe(true);
      expect(sub.hasEdge('B->C')).toBe(false);
    });

    it('builds graph from snapshot models', () => {
      const symbols: CodeSymbol[] = [
        {
          id: 'sym-1',
          snapshotId: 's1',
          fileId: 'f1',
          filePath: 'src/main.ts',
          name: 'main',
          qualifiedName: 'main',
          kind: 'function',
          location: {
            filePath: 'src/main.ts',
            startLine: 1,
            startColumn: 1,
            endLine: 5,
            endColumn: 1,
          },
          exported: true,
        },
      ];

      const files: SourceFile[] = [
        {
          id: 'f1',
          snapshotId: 's1',
          relativePath: 'src/main.ts',
          contentHash: 'hash',
          language: 'typescript',
          parseStatus: 'parsed',
          isExcluded: false,
        },
      ];

      const edges: DependencyEdge[] = [
        {
          id: 'sym-1->ext',
          snapshotId: 's1',
          sourceSymbolId: 'sym-1',
          targetSymbolId: 'ext',
          type: 'IMPORTS_SYMBOL',
          resolutionStatus: 'resolved',
          confidence: 'confirmed',
          evidence: { file: 'src/main.ts', line: 1 },
        },
      ];

      const graph = buildGraphFromSnapshot(symbols, edges, files);
      expect(graph.hasNode('sym-1')).toBe(true);
      expect(graph.hasNode('f1')).toBe(true);
      expect(graph.hasNode('ext')).toBe(true);
      expect(graph.hasEdge('sym-1->ext')).toBe(true);
    });
  });
});
