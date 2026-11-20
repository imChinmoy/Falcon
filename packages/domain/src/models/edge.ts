export type EdgeType =
  'IMPORTS_MODULE' | 'IMPORTS_SYMBOL' | 'CALLS' | 'REFERENCES' | 'EXTENDS' | 'IMPLEMENTS' | 'TESTS';

export type ConfidenceLevel = 'confirmed' | 'inferred' | 'unresolved' | 'unknown';

export type ResolutionStatus = 'resolved' | 'unresolved' | 'ambiguous' | 'unsupported';

export interface EdgeEvidence {
  readonly file: string;
  readonly line: number;
  readonly column?: number;
  readonly snippet?: string;
}

export interface DependencyEdge {
  readonly id: string;
  readonly snapshotId: string;
  readonly sourceSymbolId: string;
  readonly targetSymbolId: string;
  readonly type: EdgeType;
  readonly resolutionStatus: ResolutionStatus;
  readonly confidence: ConfidenceLevel;
  readonly evidence: EdgeEvidence;
  readonly notes?: string;
}
