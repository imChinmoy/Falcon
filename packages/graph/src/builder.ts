import type { CodeSymbol, DependencyEdge, SourceFile } from '@falcon/domain';
import { DependencyGraphImpl } from './graph.js';
import { createFileNode, createSymbolNode } from './node.js';
import type { DependencyGraph } from './types.js';

/**
 * Creates an empty DependencyGraph.
 */
export function createDependencyGraph(): DependencyGraph {
  return new DependencyGraphImpl();
}

/**
 * Builds a DependencyGraph from extracted snapshot symbols, dependency edges, and source files.
 */
export function buildGraphFromSnapshot(
  symbols: readonly CodeSymbol[],
  edges: readonly DependencyEdge[],
  files?: readonly SourceFile[],
): DependencyGraph {
  const graph = createDependencyGraph();

  if (files) {
    for (const file of files) {
      graph.addNode(createFileNode(file.relativePath, file));
    }
  }

  for (const symbol of symbols) {
    graph.addNode(createSymbolNode(symbol));
  }

  for (const edge of edges) {
    graph.addEdge(edge);
  }

  return graph;
}
