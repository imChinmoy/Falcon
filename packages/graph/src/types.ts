import type {
  CodeSymbol,
  ConfidenceLevel,
  DependencyEdge,
  EdgeEvidence,
  EdgeType,
  ResolutionStatus,
  SourceFile,
} from '@falcon/domain';

export type GraphNodeKind = 'symbol' | 'file';

export interface GraphNode {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly name: string;
  readonly filePath: string;
  readonly symbol?: CodeSymbol | undefined;
  readonly file?: SourceFile | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

export interface TraversalOptions {
  readonly maxDepth?: number | undefined;
  readonly filterEdge?: ((edge: DependencyEdge) => boolean) | undefined;
  readonly filterNode?: ((node: GraphNode) => boolean) | undefined;
}

export interface PathOptions {
  readonly maxDepth?: number | undefined;
  readonly maxPaths?: number | undefined;
  readonly direction?: 'forward' | 'reverse' | undefined;
}

export interface AdjacencyList {
  readonly nodes: readonly string[];
  readonly outgoing: Readonly<Record<string, readonly string[]>>;
  readonly incoming: Readonly<Record<string, readonly string[]>>;
}

export interface DependencyGraph {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly outgoing: ReadonlyMap<string, readonly DependencyEdge[]>;
  readonly incoming: ReadonlyMap<string, readonly DependencyEdge[]>;

  addNode(node: GraphNode): void;
  hasNode(nodeId: string): boolean;
  getNode(nodeId: string): GraphNode | undefined;
  getNodes(): readonly GraphNode[];
  removeNode(nodeId: string): boolean;

  addEdge(edge: DependencyEdge): void;
  hasEdge(edgeId: string): boolean;
  hasEdgeBetween(sourceId: string, targetId: string, edgeType?: EdgeType): boolean;
  getEdge(edgeId: string): DependencyEdge | undefined;
  getEdges(): readonly DependencyEdge[];
  removeEdge(edgeId: string): boolean;

  getOutgoingEdges(nodeId: string): readonly DependencyEdge[];
  getIncomingEdges(nodeId: string): readonly DependencyEdge[];

  getDirectDependencies(nodeId: string): readonly GraphNode[];
  getDirectDependents(nodeId: string): readonly GraphNode[];

  getTransitiveDependencies(nodeId: string, options?: TraversalOptions): readonly GraphNode[];
  getTransitiveDependents(nodeId: string, options?: TraversalOptions): readonly GraphNode[];

  findNodesByFile(filePath: string): readonly GraphNode[];

  hasCycle(): boolean;
  findCycles(): readonly (readonly string[])[];
  topologicalSort(): readonly string[] | null;

  findShortestPath(
    fromNodeId: string,
    toNodeId: string,
    direction?: 'forward' | 'reverse',
  ): readonly string[] | null;

  findEdgePath(
    fromNodeId: string,
    toNodeId: string,
    direction?: 'forward' | 'reverse',
  ): readonly DependencyEdge[] | null;

  findAllPaths(
    fromNodeId: string,
    toNodeId: string,
    options?: PathOptions,
  ): readonly (readonly string[])[];

  clone(): DependencyGraph;
  subgraph(nodeIds: Iterable<string>): DependencyGraph;
  toAdjacencyList(): AdjacencyList;
}

export type {
  CodeSymbol,
  ConfidenceLevel,
  DependencyEdge,
  EdgeEvidence,
  EdgeType,
  ResolutionStatus,
  SourceFile,
};
