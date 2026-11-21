import type { DependencyEdge, EdgeType } from '@falcon/domain';
import { createEdgeId } from '@falcon/domain';
import type {
  AdjacencyList,
  DependencyGraph,
  GraphNode,
  PathOptions,
  TraversalOptions,
} from './types.js';

/**
 * In-memory directed dependency graph implementation.
 *
 * Convention:
 * An edge A -> B represents that A depends on B.
 * - `outgoing[A]` contains edges to nodes A depends on (A's dependencies).
 * - `incoming[B]` contains edges from nodes that depend on B (B's dependents).
 */
export class DependencyGraphImpl implements DependencyGraph {
  private readonly nodesMap = new Map<string, GraphNode>();
  private readonly edgesMap = new Map<string, DependencyEdge>();
  private readonly outgoingMap = new Map<string, DependencyEdge[]>();
  private readonly incomingMap = new Map<string, DependencyEdge[]>();
  private readonly fileToNodesMap = new Map<string, Set<string>>();

  // Performance caches
  private cachedHasCycle: boolean | undefined = undefined;
  private cachedCycles: readonly (readonly string[])[] | undefined = undefined;
  private readonly shortestPathCache = new Map<string, readonly string[] | null>();
  private static readonly MAX_PATH_CACHE_SIZE = 5000;

  get nodeCount(): number {
    return this.nodesMap.size;
  }

  get edgeCount(): number {
    return this.edgesMap.size;
  }

  get outgoing(): ReadonlyMap<string, readonly DependencyEdge[]> {
    return this.outgoingMap;
  }

  get incoming(): ReadonlyMap<string, readonly DependencyEdge[]> {
    return this.incomingMap;
  }

  private invalidateCaches(): void {
    this.cachedHasCycle = undefined;
    this.cachedCycles = undefined;
    this.shortestPathCache.clear();
  }

  addNode(node: GraphNode): void {
    this.invalidateCaches();
    this.nodesMap.set(node.id, node);
    if (!this.outgoingMap.has(node.id)) {
      this.outgoingMap.set(node.id, []);
    }
    if (!this.incomingMap.has(node.id)) {
      this.incomingMap.set(node.id, []);
    }

    const normalizedFile = node.filePath.replace(/\\/g, '/');
    let set = this.fileToNodesMap.get(normalizedFile);
    if (!set) {
      set = new Set<string>();
      this.fileToNodesMap.set(normalizedFile, set);
    }
    set.add(node.id);
  }

  hasNode(nodeId: string): boolean {
    return this.nodesMap.has(nodeId);
  }

  getNode(nodeId: string): GraphNode | undefined {
    return this.nodesMap.get(nodeId);
  }

  getNodes(): readonly GraphNode[] {
    return Array.from(this.nodesMap.values());
  }

  removeNode(nodeId: string): boolean {
    const node = this.nodesMap.get(nodeId);
    if (!node) {
      return false;
    }

    this.invalidateCaches();

    // Remove outgoing edges
    const outgoing = this.outgoingMap.get(nodeId) ?? [];
    for (const edge of [...outgoing]) {
      this.removeEdge(edge.id);
    }

    // Remove incoming edges
    const incoming = this.incomingMap.get(nodeId) ?? [];
    for (const edge of [...incoming]) {
      this.removeEdge(edge.id);
    }

    this.outgoingMap.delete(nodeId);
    this.incomingMap.delete(nodeId);
    this.nodesMap.delete(nodeId);

    const normalizedFile = node.filePath.replace(/\\/g, '/');
    const set = this.fileToNodesMap.get(normalizedFile);
    if (set) {
      set.delete(nodeId);
      if (set.size === 0) {
        this.fileToNodesMap.delete(normalizedFile);
      }
    }

    return true;
  }

  addEdge(edge: DependencyEdge): void {
    this.invalidateCaches();

    const resolvedEdge: DependencyEdge = edge.id
      ? edge
      : {
          ...edge,
          id: createEdgeId(edge.sourceSymbolId, edge.targetSymbolId, edge.type),
        };

    // Ensure placeholder nodes exist if not explicitly added
    this.ensureNodeExists(resolvedEdge.sourceSymbolId);
    this.ensureNodeExists(resolvedEdge.targetSymbolId);

    // If edge with this ID already exists, update it
    if (this.edgesMap.has(resolvedEdge.id)) {
      this.removeEdge(resolvedEdge.id);
    }

    this.edgesMap.set(resolvedEdge.id, resolvedEdge);

    const outgoing = this.outgoingMap.get(resolvedEdge.sourceSymbolId);
    if (outgoing) {
      outgoing.push(resolvedEdge);
    } else {
      this.outgoingMap.set(resolvedEdge.sourceSymbolId, [resolvedEdge]);
    }

    const incoming = this.incomingMap.get(resolvedEdge.targetSymbolId);
    if (incoming) {
      incoming.push(resolvedEdge);
    } else {
      this.incomingMap.set(resolvedEdge.targetSymbolId, [resolvedEdge]);
    }
  }

  hasEdge(edgeId: string): boolean {
    return this.edgesMap.has(edgeId);
  }

  hasEdgeBetween(sourceId: string, targetId: string, edgeType?: EdgeType): boolean {
    const outgoing = this.outgoingMap.get(sourceId);
    if (!outgoing) {
      return false;
    }
    return outgoing.some(
      (e) => e.targetSymbolId === targetId && (edgeType === undefined || e.type === edgeType),
    );
  }

  getEdge(edgeId: string): DependencyEdge | undefined {
    return this.edgesMap.get(edgeId);
  }

  getEdges(): readonly DependencyEdge[] {
    return Array.from(this.edgesMap.values());
  }

  removeEdge(edgeId: string): boolean {
    const edge = this.edgesMap.get(edgeId);
    if (!edge) {
      return false;
    }

    this.invalidateCaches();
    this.edgesMap.delete(edgeId);

    const outgoing = this.outgoingMap.get(edge.sourceSymbolId);
    if (outgoing) {
      const idx = outgoing.findIndex((e) => e.id === edgeId);
      if (idx !== -1) {
        outgoing.splice(idx, 1);
      }
    }

    const incoming = this.incomingMap.get(edge.targetSymbolId);
    if (incoming) {
      const idx = incoming.findIndex((e) => e.id === edgeId);
      if (idx !== -1) {
        incoming.splice(idx, 1);
      }
    }

    return true;
  }

  getOutgoingEdges(nodeId: string): readonly DependencyEdge[] {
    return this.outgoingMap.get(nodeId) ?? [];
  }

  getIncomingEdges(nodeId: string): readonly DependencyEdge[] {
    return this.incomingMap.get(nodeId) ?? [];
  }

  getDirectDependencies(nodeId: string): readonly GraphNode[] {
    const outgoing = this.getOutgoingEdges(nodeId);
    const result: GraphNode[] = [];
    const seen = new Set<string>();

    for (const edge of outgoing) {
      if (!seen.has(edge.targetSymbolId)) {
        seen.add(edge.targetSymbolId);
        const node = this.getNode(edge.targetSymbolId);
        if (node) {
          result.push(node);
        }
      }
    }
    return result;
  }

  getDirectDependents(nodeId: string): readonly GraphNode[] {
    const incoming = this.getIncomingEdges(nodeId);
    const result: GraphNode[] = [];
    const seen = new Set<string>();

    for (const edge of incoming) {
      if (!seen.has(edge.sourceSymbolId)) {
        seen.add(edge.sourceSymbolId);
        const node = this.getNode(edge.sourceSymbolId);
        if (node) {
          result.push(node);
        }
      }
    }
    return result;
  }

  getTransitiveDependencies(nodeId: string, options?: TraversalOptions): readonly GraphNode[] {
    return this.traverse(nodeId, 'outgoing', options);
  }

  getTransitiveDependents(nodeId: string, options?: TraversalOptions): readonly GraphNode[] {
    return this.traverse(nodeId, 'incoming', options);
  }

  findNodesByFile(filePath: string): readonly GraphNode[] {
    const normalizedFile = filePath.replace(/\\/g, '/');
    const nodeIds = this.fileToNodesMap.get(normalizedFile);
    if (!nodeIds) {
      return [];
    }
    const result: GraphNode[] = [];
    for (const id of nodeIds) {
      const node = this.nodesMap.get(id);
      if (node) {
        result.push(node);
      }
    }
    return result;
  }

  hasCycle(): boolean {
    if (this.cachedHasCycle !== undefined) {
      return this.cachedHasCycle;
    }
    const cycles = this.findCycles();
    const has = cycles.length > 0;
    this.cachedHasCycle = has;
    return has;
  }

  findCycles(): readonly (readonly string[])[] {
    if (this.cachedCycles !== undefined) {
      return this.cachedCycles;
    }

    // 0: unvisited, 1: visiting, 2: visited
    const visited = new Map<string, number>();
    const cycles: string[][] = [];
    const pathStack: string[] = [];
    const pathIndexMap = new Map<string, number>();

    // Iterative DFS to prevent call stack overflow on deep graphs
    for (const rootId of this.nodesMap.keys()) {
      if ((visited.get(rootId) ?? 0) !== 0) {
        continue;
      }

      // Stack frame: { nodeId, edgeIndex, edges }
      const edges0 = this.outgoingMap.get(rootId) ?? [];
      const stack: Array<{ nodeId: string; edgeIndex: number; edges: readonly DependencyEdge[] }> =
        [{ nodeId: rootId, edgeIndex: 0, edges: edges0 }];
      visited.set(rootId, 1);
      pathStack.push(rootId);
      pathIndexMap.set(rootId, pathStack.length - 1);

      while (stack.length > 0) {
        const top = stack[stack.length - 1]!;
        if (top.edgeIndex < top.edges.length) {
          const edge = top.edges[top.edgeIndex++]!;
          const neighbor = edge.targetSymbolId;
          const neighborState = visited.get(neighbor) ?? 0;

          if (neighborState === 1) {
            // Cycle detected!
            const startIndex = pathIndexMap.get(neighbor);
            if (startIndex !== undefined && startIndex < pathStack.length) {
              const cyclePath = pathStack.slice(startIndex).concat(neighbor);
              cycles.push(cyclePath);
            }
          } else if (neighborState === 0) {
            visited.set(neighbor, 1);
            pathStack.push(neighbor);
            pathIndexMap.set(neighbor, pathStack.length - 1);
            const nextEdges = this.outgoingMap.get(neighbor) ?? [];
            stack.push({ nodeId: neighbor, edgeIndex: 0, edges: nextEdges });
          }
        } else {
          // Finished exploring all outgoing edges for top.nodeId
          stack.pop();
          visited.set(top.nodeId, 2);
          pathStack.pop();
          pathIndexMap.delete(top.nodeId);
        }
      }
    }

    const uniqueCycles = this.deduplicateCycles(cycles);
    this.cachedCycles = uniqueCycles;
    this.cachedHasCycle = uniqueCycles.length > 0;
    return uniqueCycles;
  }

  topologicalSort(): readonly string[] | null {
    // Kahn's algorithm over dependencies
    // Nodes with 0 outgoing dependencies can be evaluated first
    const inDegree = new Map<string, number>();
    for (const nodeId of this.nodesMap.keys()) {
      inDegree.set(nodeId, 0);
    }

    for (const edge of this.edgesMap.values()) {
      if (this.nodesMap.has(edge.sourceSymbolId) && this.nodesMap.has(edge.targetSymbolId)) {
        inDegree.set(edge.sourceSymbolId, (inDegree.get(edge.sourceSymbolId) ?? 0) + 1);
      }
    }

    const queue: string[] = [];
    for (const [nodeId, degree] of inDegree.entries()) {
      if (degree === 0) {
        queue.push(nodeId);
      }
    }

    const sorted: string[] = [];
    let queueHead = 0;
    while (queueHead < queue.length) {
      const current = queue[queueHead++];
      if (!current) continue;
      sorted.push(current);

      // Decrement in-degree for nodes that depend on current (incoming edges)
      const incoming = this.incomingMap.get(current) ?? [];
      for (const edge of incoming) {
        const dependent = edge.sourceSymbolId;
        if (inDegree.has(dependent)) {
          const newDegree = (inDegree.get(dependent) ?? 0) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) {
            queue.push(dependent);
          }
        }
      }
    }

    if (sorted.length !== this.nodesMap.size) {
      return null; // Cycle detected
    }

    return sorted;
  }

  findShortestPath(
    fromNodeId: string,
    toNodeId: string,
    direction: 'forward' | 'reverse' = 'forward',
  ): readonly string[] | null {
    if (fromNodeId === toNodeId) {
      return [fromNodeId];
    }
    if (!this.nodesMap.has(fromNodeId) || !this.nodesMap.has(toNodeId)) {
      return null;
    }

    const cacheKey = `${fromNodeId}->${toNodeId}:${direction}`;
    if (this.shortestPathCache.has(cacheKey)) {
      return this.shortestPathCache.get(cacheKey)!;
    }

    const visited = new Set<string>([fromNodeId]);
    const queue: Array<{ id: string; path: string[] }> = [{ id: fromNodeId, path: [fromNodeId] }];
    let queueHead = 0;
    let foundPath: readonly string[] | null = null;

    while (queueHead < queue.length) {
      const item = queue[queueHead++];
      if (!item) continue;

      const edges =
        direction === 'forward'
          ? (this.outgoingMap.get(item.id) ?? [])
          : (this.incomingMap.get(item.id) ?? []);

      let reached = false;
      for (const edge of edges) {
        const nextId = direction === 'forward' ? edge.targetSymbolId : edge.sourceSymbolId;
        if (nextId === toNodeId) {
          foundPath = [...item.path, nextId];
          reached = true;
          break;
        }
        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, path: [...item.path, nextId] });
        }
      }
      if (reached) {
        break;
      }
    }

    // Cache the result with bounded capacity
    if (this.shortestPathCache.size >= DependencyGraphImpl.MAX_PATH_CACHE_SIZE) {
      this.shortestPathCache.clear();
    }
    this.shortestPathCache.set(cacheKey, foundPath);

    return foundPath;
  }

  findEdgePath(
    fromNodeId: string,
    toNodeId: string,
    direction: 'forward' | 'reverse' = 'forward',
  ): readonly DependencyEdge[] | null {
    if (fromNodeId === toNodeId) {
      return [];
    }
    if (!this.nodesMap.has(fromNodeId) || !this.nodesMap.has(toNodeId)) {
      return null;
    }

    const visited = new Set<string>([fromNodeId]);
    const queue: Array<{ id: string; edges: DependencyEdge[] }> = [{ id: fromNodeId, edges: [] }];
    let queueHead = 0;

    while (queueHead < queue.length) {
      const item = queue[queueHead++];
      if (!item) continue;

      const edges =
        direction === 'forward'
          ? (this.outgoingMap.get(item.id) ?? [])
          : (this.incomingMap.get(item.id) ?? []);

      for (const edge of edges) {
        const nextId = direction === 'forward' ? edge.targetSymbolId : edge.sourceSymbolId;
        const nextEdges = [...item.edges, edge];

        if (nextId === toNodeId) {
          return nextEdges;
        }

        if (!visited.has(nextId)) {
          visited.add(nextId);
          queue.push({ id: nextId, edges: nextEdges });
        }
      }
    }

    return null;
  }

  findAllPaths(
    fromNodeId: string,
    toNodeId: string,
    options?: PathOptions,
  ): readonly (readonly string[])[] {
    if (!this.nodesMap.has(fromNodeId) || !this.nodesMap.has(toNodeId)) {
      return [];
    }

    const maxDepth = options?.maxDepth ?? 50;
    const maxPaths = options?.maxPaths ?? 100;
    const direction = options?.direction ?? 'forward';

    const results: string[][] = [];
    const currentPath: string[] = [fromNodeId];
    const visitedOnPath = new Set<string>([fromNodeId]);

    const dfs = (currentId: string, depth: number): void => {
      if (results.length >= maxPaths || depth > maxDepth) {
        return;
      }

      if (currentId === toNodeId && depth > 0) {
        results.push([...currentPath]);
        return;
      }

      const edges =
        direction === 'forward'
          ? (this.outgoingMap.get(currentId) ?? [])
          : (this.incomingMap.get(currentId) ?? []);

      for (const edge of edges) {
        const nextId = direction === 'forward' ? edge.targetSymbolId : edge.sourceSymbolId;
        if (!visitedOnPath.has(nextId)) {
          visitedOnPath.add(nextId);
          currentPath.push(nextId);

          dfs(nextId, depth + 1);

          currentPath.pop();
          visitedOnPath.delete(nextId);
        }
      }
    };

    dfs(fromNodeId, 0);
    return results;
  }

  clone(): DependencyGraph {
    const copy = new DependencyGraphImpl();
    for (const node of this.nodesMap.values()) {
      copy.addNode(node);
    }
    for (const edge of this.edgesMap.values()) {
      copy.addEdge(edge);
    }
    return copy;
  }

  subgraph(nodeIds: Iterable<string>): DependencyGraph {
    const targetSet = new Set(nodeIds);
    const sub = new DependencyGraphImpl();

    for (const id of targetSet) {
      const node = this.nodesMap.get(id);
      if (node) {
        sub.addNode(node);
      }
    }

    for (const edge of this.edgesMap.values()) {
      if (targetSet.has(edge.sourceSymbolId) && targetSet.has(edge.targetSymbolId)) {
        sub.addEdge(edge);
      }
    }

    return sub;
  }

  toAdjacencyList(): AdjacencyList {
    const nodes = Array.from(this.nodesMap.keys());
    const outgoing: Record<string, string[]> = {};
    const incoming: Record<string, string[]> = {};

    for (const id of nodes) {
      outgoing[id] = (this.outgoingMap.get(id) ?? []).map((e) => e.targetSymbolId);
      incoming[id] = (this.incomingMap.get(id) ?? []).map((e) => e.sourceSymbolId);
    }

    return {
      nodes,
      outgoing,
      incoming,
    };
  }

  private traverse(
    startNodeId: string,
    direction: 'outgoing' | 'incoming',
    options?: TraversalOptions,
  ): readonly GraphNode[] {
    const maxDepth = options?.maxDepth ?? Infinity;
    const filterEdge = options?.filterEdge;
    const filterNode = options?.filterNode;

    const visited = new Set<string>([startNodeId]);
    const queue: Array<{ id: string; depth: number }> = [{ id: startNodeId, depth: 0 }];
    let queueHead = 0;
    const result: GraphNode[] = [];

    while (queueHead < queue.length) {
      const item = queue[queueHead++];
      if (!item) continue;
      const { id, depth } = item;

      if (depth >= maxDepth) {
        continue;
      }

      const edges =
        direction === 'outgoing'
          ? (this.outgoingMap.get(id) ?? [])
          : (this.incomingMap.get(id) ?? []);

      for (const edge of edges) {
        if (filterEdge && !filterEdge(edge)) {
          continue;
        }

        const nextId = direction === 'outgoing' ? edge.targetSymbolId : edge.sourceSymbolId;

        if (!visited.has(nextId)) {
          visited.add(nextId);
          const nextNode = this.nodesMap.get(nextId);
          if (nextNode) {
            if (!filterNode || filterNode(nextNode)) {
              result.push(nextNode);
            }
          }
          queue.push({ id: nextId, depth: depth + 1 });
        }
      }
    }

    return result;
  }

  private ensureNodeExists(nodeId: string): void {
    if (!this.nodesMap.has(nodeId)) {
      const parts = nodeId.split('#');
      const filePath = parts[0] ?? nodeId;
      const name = parts[1] ?? nodeId;
      this.addNode({
        id: nodeId,
        kind: 'symbol',
        name,
        filePath,
      });
    }
  }

  private deduplicateCycles(cycles: string[][]): string[][] {
    const seen = new Set<string>();
    const unique: string[][] = [];

    for (const cycle of cycles) {
      // Cycle is [A, B, C, A]. Nodes are cycle.slice(0, -1).
      const nodes = cycle.slice(0, -1);
      if (nodes.length === 0) continue;

      // Find the lexicographically smallest node
      let minIdx = 0;
      for (let i = 1; i < nodes.length; i++) {
        if ((nodes[i] ?? '') < (nodes[minIdx] ?? '')) {
          minIdx = i;
        }
      }

      // Canonical cyclic rotation
      const canonical = [...nodes.slice(minIdx), ...nodes.slice(0, minIdx)];
      canonical.push(canonical[0] ?? '');
      const key = canonical.join('->');

      if (!seen.has(key)) {
        seen.add(key);
        unique.push(canonical);
      }
    }

    return unique;
  }
}
