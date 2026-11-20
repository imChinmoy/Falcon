export type SnapshotStatus = 'pending' | 'completed' | 'failed';

export interface AnalysisSnapshot {
  readonly id: string;
  readonly repositoryId: string;
  readonly commitSha: string;
  readonly analyzerVersion: string;
  readonly configHash: string;
  readonly createdAt: string;
  readonly status: SnapshotStatus;
}

export interface AnalysisRun {
  readonly id: string;
  readonly repositoryId: string;
  readonly baseSnapshotId: string;
  readonly targetSnapshotId: string;
  readonly status: SnapshotStatus;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly analyzerVersion: string;
  readonly configHash: string;
}
