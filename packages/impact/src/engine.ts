import type { ConfidenceLevel, DependencyEdge, ImpactFinding } from '@falcon/domain';
import type { DependencyGraph, GraphNode } from '@falcon/graph';
import { confidenceRank, maxConfidence, minConfidence } from './confidence.js';
import type {
  AffectedFile,
  ImpactAnalysisOptions,
  ImpactReport,
  ImpactStatistics,
} from './types.js';

interface TraversalQueueItem {
  readonly nodeId: string;
  readonly distance: number;
  readonly parent?: TraversalQueueItem | undefined;
  readonly edge?: DependencyEdge | undefined;
  readonly changedRootId: string;
  readonly confidence: ConfidenceLevel;
}

function reconstructPath(item: TraversalQueueItem): string[] {
  const path: string[] = [];
  let curr: TraversalQueueItem | undefined = item;
  while (curr) {
    path.push(curr.nodeId);
    curr = curr.parent;
  }
  return path.reverse();
}

/**
 * Analyzes the impact of changed symbols and files on a dependency graph.
 *
 * Traversal uses BFS along reverse adjacency (`incoming` edges), discovering the
 * shortest impact path from changed entities to each affected dependent node.
 */
export function analyzeImpact(options: ImpactAnalysisOptions): ImpactReport {
  const startTime = Date.now();
  const {
    graph,
    changedSymbolIds = [],
    changedFilePaths = [],
    maxDepth = Infinity,
    maxResults = Infinity,
    analysisRunId = `run-${Date.now()}`,
  } = options;

  // Step 1: Identify all changed root node IDs
  const changedRootsSet = new Set<string>();
  const recordedChangedSymbols = new Set<string>();
  const recordedChangedFiles = new Set<string>();

  for (const symId of changedSymbolIds) {
    changedRootsSet.add(symId);
    recordedChangedSymbols.add(symId);
    const node = graph.getNode(symId);
    if (node) {
      recordedChangedFiles.add(node.filePath);
    }
  }

  for (const filePath of changedFilePaths) {
    const normalizedPath = filePath.replace(/\\/g, '/');
    recordedChangedFiles.add(normalizedPath);

    // If there is an explicit file node in the graph, include it
    if (graph.hasNode(normalizedPath)) {
      changedRootsSet.add(normalizedPath);
    }

    // Include all symbol nodes in that file
    const fileSymbols = graph.findNodesByFile(normalizedPath);
    for (const symNode of fileSymbols) {
      changedRootsSet.add(symNode.id);
      recordedChangedSymbols.add(symNode.id);
    }
  }

  // Step 2: Initialize BFS Queue with O(1) queue indexing
  const queue: TraversalQueueItem[] = [];
  let queueHead = 0;

  // bestVisited maps affectedNodeId -> { distance, confidenceRank }
  const bestVisited = new Map<
    string,
    {
      distance: number;
      confidenceRank: number;
    }
  >();

  for (const rootId of changedRootsSet) {
    // Root nodes are visited at distance 0 so they are not treated as affected by themselves
    bestVisited.set(rootId, {
      distance: 0,
      confidenceRank: confidenceRank('confirmed'),
    });

    queue.push({
      nodeId: rootId,
      distance: 0,
      changedRootId: rootId,
      confidence: 'confirmed',
    });
  }

  const findings: ImpactFinding[] = [];
  let truncated = false;
  let truncationReason: string | undefined;
  let maxDepthReached = 0;

  // Step 3: BFS Traversal over reverse dependencies using indexed queue pointer
  while (queueHead < queue.length) {
    const current = queue[queueHead++];
    if (!current) continue;

    // Periodic queue compaction to release dereferenced memory during massive graph traversals
    if (queueHead > 10000 && queueHead > queue.length / 2) {
      queue.splice(0, queueHead);
      queueHead = 0;
    }

    // If this is an affected dependent (distance > 0)
    if (current.distance > 0) {
      if (findings.length >= maxResults) {
        truncated = true;
        truncationReason = `Maximum result limit (${maxResults}) reached.`;
        break;
      }

      if (current.distance > maxDepthReached) {
        maxDepthReached = current.distance;
      }

      const findingId = `impact-${analysisRunId}-${current.changedRootId}->${current.nodeId}`;
      const impactKind = current.distance === 1 ? 'direct' : 'transitive';
      const path = reconstructPath(current);
      const reason = buildImpactReason(current, graph, impactKind, current.edge, path);

      const finding: ImpactFinding = {
        id: findingId,
        analysisRunId,
        changedSymbolId: current.changedRootId,
        affectedSymbolId: current.nodeId,
        impactKind,
        confidence: current.confidence,
        path,
        reason,
        ...(current.edge?.evidence
          ? {
              evidence: {
                file: current.edge.evidence.file,
                line: current.edge.evidence.line,
                ...(current.edge.evidence.column !== undefined
                  ? { column: current.edge.evidence.column }
                  : {}),
              },
            }
          : {}),
      };

      findings.push(finding);
    }

    // Check depth limit before exploring further reverse dependencies
    if (current.distance >= maxDepth) {
      continue;
    }

    // Discover reverse dependencies (incoming edges)
    const incomingEdges = graph.getIncomingEdges(current.nodeId);
    for (const edge of incomingEdges) {
      const dependentId = edge.sourceSymbolId;
      const nextDistance = current.distance + 1;
      const nextConfidence = minConfidence(current.confidence, edge.confidence);
      const nextRank = confidenceRank(nextConfidence);

      const existing = bestVisited.get(dependentId);
      if (existing) {
        // If already visited at shorter distance, skip
        if (existing.distance < nextDistance) {
          continue;
        }
        // If reached at same distance but existing has better or equal confidence, skip
        if (existing.distance === nextDistance && existing.confidenceRank >= nextRank) {
          continue;
        }
      }

      const nextItem: TraversalQueueItem = {
        nodeId: dependentId,
        distance: nextDistance,
        parent: current,
        edge,
        changedRootId: current.changedRootId,
        confidence: nextConfidence,
      };

      bestVisited.set(dependentId, {
        distance: nextDistance,
        confidenceRank: nextRank,
      });

      queue.push(nextItem);
    }
  }

  // Step 4: Categorize findings
  const directlyAffectedSymbols = findings.filter((f) => f.impactKind === 'direct');
  const transitivelyAffectedSymbols = findings.filter((f) => f.impactKind === 'transitive');

  // Step 5: Aggregate affected files
  const { directlyAffectedFiles, transitivelyAffectedFiles } = getAffectedFiles(findings, graph);

  // Step 6: Statistics
  const uniqueAffectedSymbols = new Set(findings.map((f) => f.affectedSymbolId));
  const uniqueAffectedFiles = new Set([
    ...directlyAffectedFiles.map((f) => f.filePath),
    ...transitivelyAffectedFiles.map((f) => f.filePath),
  ]);

  const statistics: ImpactStatistics = {
    totalAffectedSymbols: uniqueAffectedSymbols.size,
    directAffectedSymbolsCount: directlyAffectedSymbols.length,
    transitiveAffectedSymbolsCount: transitivelyAffectedSymbols.length,
    totalAffectedFiles: uniqueAffectedFiles.size,
    directAffectedFilesCount: directlyAffectedFiles.length,
    transitiveAffectedFilesCount: transitivelyAffectedFiles.length,
    maxDepthReached,
    executionTimeMs: Date.now() - startTime,
  };

  return {
    analysisRunId,
    changedSymbols: Array.from(recordedChangedSymbols),
    changedFiles: Array.from(recordedChangedFiles),
    directlyAffectedSymbols,
    transitivelyAffectedSymbols,
    directlyAffectedFiles,
    transitivelyAffectedFiles,
    findings,
    truncated,
    truncationReason,
    statistics,
  };
}

/**
 * Returns directly affected (1-hop) findings for the given changed IDs.
 */
export function getDirectlyAffected(
  graph: DependencyGraph,
  changedIds: readonly string[],
): readonly ImpactFinding[] {
  const report = analyzeImpact({
    graph,
    changedSymbolIds: changedIds,
    maxDepth: 1,
  });
  return report.directlyAffectedSymbols;
}

/**
 * Returns transitively affected (n-hop) findings for the given changed IDs.
 */
export function getTransitivelyAffected(
  graph: DependencyGraph,
  changedIds: readonly string[],
  options?: { maxDepth?: number; maxResults?: number },
): readonly ImpactFinding[] {
  const report = analyzeImpact({
    graph,
    changedSymbolIds: changedIds,
    maxDepth: options?.maxDepth,
    maxResults: options?.maxResults,
  });
  return report.transitivelyAffectedSymbols;
}

/**
 * Calculates the shortest reverse impact path from a changed node to an affected node.
 */
export function calculateImpactPath(
  graph: DependencyGraph,
  changedNodeId: string,
  affectedNodeId: string,
): readonly string[] | null {
  return graph.findShortestPath(changedNodeId, affectedNodeId, 'reverse');
}

/**
 * Groups findings into directly and transitively affected files.
 */
export function getAffectedFiles(
  findings: readonly ImpactFinding[],
  graph: DependencyGraph,
): {
  readonly directlyAffectedFiles: readonly AffectedFile[];
  readonly transitivelyAffectedFiles: readonly AffectedFile[];
} {
  const fileMap = new Map<
    string,
    {
      symbols: Set<string>;
      minDistance: number;
      bestConfidence: ConfidenceLevel;
      bestPath: readonly string[];
    }
  >();

  for (const finding of findings) {
    const node = graph.getNode(finding.affectedSymbolId);
    const filePath = node?.filePath ?? extractFilePath(finding.affectedSymbolId);

    let entry = fileMap.get(filePath);
    if (!entry) {
      entry = {
        symbols: new Set<string>(),
        minDistance: finding.path.length - 1,
        bestConfidence: finding.confidence,
        bestPath: finding.path,
      };
      fileMap.set(filePath, entry);
    }

    entry.symbols.add(finding.affectedSymbolId);
    const distance = finding.path.length - 1;

    if (distance < entry.minDistance) {
      entry.minDistance = distance;
      entry.bestConfidence = finding.confidence;
      entry.bestPath = finding.path;
    } else if (distance === entry.minDistance) {
      entry.bestConfidence = maxConfidence(entry.bestConfidence, finding.confidence);
    }
  }

  const directlyAffectedFiles: AffectedFile[] = [];
  const transitivelyAffectedFiles: AffectedFile[] = [];

  for (const [filePath, entry] of fileMap.entries()) {
    const impactKind = entry.minDistance === 1 ? 'direct' : 'transitive';
    const affectedFile: AffectedFile = {
      filePath,
      impactKind,
      confidence: entry.bestConfidence,
      distance: entry.minDistance,
      affectedSymbols: Array.from(entry.symbols),
      path: entry.bestPath,
    };

    if (impactKind === 'direct') {
      directlyAffectedFiles.push(affectedFile);
    } else {
      transitivelyAffectedFiles.push(affectedFile);
    }
  }

  return {
    directlyAffectedFiles,
    transitivelyAffectedFiles,
  };
}

function extractFilePath(nodeId: string): string {
  const hashIdx = nodeId.indexOf('#');
  if (hashIdx !== -1) {
    return nodeId.slice(0, hashIdx);
  }
  return nodeId;
}

function getNodeDisplayName(nodeId: string, node: GraphNode | undefined): string {
  if (node?.name) {
    return node.name;
  }
  const hashIdx = nodeId.indexOf('#');
  if (hashIdx !== -1) {
    return nodeId.slice(hashIdx + 1);
  }
  return nodeId;
}

function buildImpactReason(
  item: TraversalQueueItem,
  graph: DependencyGraph,
  impactKind: 'direct' | 'transitive',
  lastEdge: DependencyEdge | undefined,
  path: readonly string[],
): string {
  const affectedNode = graph.getNode(item.nodeId);
  const rootNode = graph.getNode(item.changedRootId);
  const affectedName = getNodeDisplayName(item.nodeId, affectedNode);
  const rootName = getNodeDisplayName(item.changedRootId, rootNode);

  if (impactKind === 'direct') {
    const edgeType = lastEdge?.type ?? 'dependency';
    return `Directly affected: ${affectedName} depends on changed ${rootName} via ${edgeType}`;
  }

  return `Transitively affected (${item.distance} hops): ${affectedName} depends on changed ${rootName} via path [${path.join(' -> ')}]`;
}
