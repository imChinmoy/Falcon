import type {
  ConfidenceLevel,
  DependencyEdge,
  ImpactFinding,
  ImpactKind,
  RiskFactor,
} from '@falcon/domain';
import type { DependencyGraph } from '@falcon/graph';

export interface AffectedFile {
  readonly filePath: string;
  readonly impactKind: ImpactKind;
  readonly confidence: ConfidenceLevel;
  readonly distance: number;
  readonly affectedSymbols: readonly string[];
  readonly path: readonly string[];
}

export interface ImpactStatistics {
  readonly totalAffectedSymbols: number;
  readonly directAffectedSymbolsCount: number;
  readonly transitiveAffectedSymbolsCount: number;
  readonly totalAffectedFiles: number;
  readonly directAffectedFilesCount: number;
  readonly transitiveAffectedFilesCount: number;
  readonly maxDepthReached: number;
  readonly executionTimeMs: number;
}

export interface ImpactAnalysisOptions {
  readonly graph: DependencyGraph;
  readonly changedSymbolIds?: readonly string[] | undefined;
  readonly changedFilePaths?: readonly string[] | undefined;
  readonly maxDepth?: number | undefined;
  readonly maxResults?: number | undefined;
  readonly analysisRunId?: string | undefined;
  readonly includeIndirectFiles?: boolean | undefined;
}

export interface ImpactReport {
  readonly analysisRunId: string;
  readonly changedSymbols: readonly string[];
  readonly changedFiles: readonly string[];
  readonly directlyAffectedSymbols: readonly ImpactFinding[];
  readonly transitivelyAffectedSymbols: readonly ImpactFinding[];
  readonly directlyAffectedFiles: readonly AffectedFile[];
  readonly transitivelyAffectedFiles: readonly AffectedFile[];
  readonly findings: readonly ImpactFinding[];
  readonly truncated: boolean;
  readonly truncationReason?: string | undefined;
  readonly statistics: ImpactStatistics;
}

export type { ConfidenceLevel, DependencyEdge, ImpactFinding, ImpactKind, RiskFactor };
