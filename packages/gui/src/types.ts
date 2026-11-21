import type { RepositoryInventory } from '@falcon/repository';
import type { ImpactReport } from '@falcon/impact';

export interface GitHubIngestOptions {
  readonly url: string;
  readonly branch?: string | undefined;
  readonly depth?: number | undefined;
}

export interface IngestedRepositoryInfo {
  readonly id: string;
  readonly name: string;
  readonly source: 'github' | 'local';
  readonly url?: string | undefined;
  readonly rootPath: string;
  readonly isGitRepo: boolean;
  readonly branch?: string | undefined;
  readonly commitSha?: string | undefined;
  readonly ingestedAt: string;
  readonly inventory: RepositoryInventory;
  readonly totalNodes: number;
  readonly totalEdges: number;
}

export interface GuiServerOptions {
  readonly port?: number | undefined;
  readonly host?: string | undefined;
  readonly initialRepoPath?: string | undefined;
}

export interface SerializableGraphNode {
  readonly id: string;
  readonly label: string;
  readonly kind: 'file' | 'symbol';
  readonly filePath?: string | undefined;
}

export interface SerializableGraphEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly type: string;
  readonly confidence: string;
}

export interface GraphSnapshotData {
  readonly nodes: readonly SerializableGraphNode[];
  readonly edges: readonly SerializableGraphEdge[];
  readonly hasCycle: boolean;
  readonly cyclesCount: number;
}

export interface GuiState {
  currentRepo: IngestedRepositoryInfo | null;
  graphData: GraphSnapshotData | null;
  lastImpactReport: ImpactReport | null;
}
