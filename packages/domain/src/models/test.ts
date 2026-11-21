import type { ConfidenceLevel } from './edge.js';
import type { Diagnostic } from './diagnostic.js';

export type EvidenceLevel =
  'direct_import' | 'transitive_dependency' | 'naming_convention' | 'coverage';

export type TestConfidenceLevel = 'confirmed' | 'inferred' | 'heuristic';

export interface TestMapping {
  readonly id: string;
  readonly snapshotId?: string | undefined;
  readonly testFilePath: string;
  readonly testSymbolId?: string | undefined;
  readonly testSymbolName?: string | undefined;
  readonly sourceFilePath: string;
  readonly sourceSymbolId?: string | undefined;
  readonly sourceSymbolName?: string | undefined;
  readonly evidenceLevel: EvidenceLevel;
  readonly confidence: ConfidenceLevel;
  readonly line?: number | undefined;
  readonly column?: number | undefined;
  readonly notes?: string | undefined;
}

export interface CoverageGap {
  readonly filePath: string;
  readonly symbolId?: string | undefined;
  readonly symbolName?: string | undefined;
  readonly unexecutedLines?: readonly number[] | undefined;
  readonly reason: string;
}

export interface TestRecommendation {
  readonly testFile: string;
  readonly testSymbols?: readonly string[] | undefined;
  readonly targetChangedFile: string;
  readonly targetSymbol?: string | undefined;
  readonly evidenceLevel: EvidenceLevel;
  readonly confidence: ConfidenceLevel;
  readonly distance: number;
  readonly reason: string;
  readonly priority?: 'high' | 'medium' | 'low' | undefined;
}

export interface TestRecommendationStatistics {
  readonly totalRecommendations: number;
  readonly directTestCount: number;
  readonly transitiveTestCount: number;
  readonly namingHeuristicCount: number;
  readonly coverageDerivedCount: number;
  readonly missingMappingsCount: number;
  readonly executionTimeMs: number;
}

export interface TestRecommendationReport {
  readonly analysisRunId: string;
  readonly recommendedTests: readonly TestRecommendation[];
  readonly totalTestsEvaluated: number;
  readonly coverageGaps: readonly CoverageGap[];
  readonly missingMappings: readonly string[];
  readonly statistics: TestRecommendationStatistics;
  readonly diagnostics?: readonly Diagnostic[] | undefined;
}
