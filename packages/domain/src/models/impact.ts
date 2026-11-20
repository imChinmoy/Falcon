import type { ConfidenceLevel } from './edge.js';

export type ImpactKind = 'direct' | 'transitive';

export interface RiskFactor {
  readonly name: string;
  readonly factorType: string;
  readonly score: number;
  readonly rationale: string;
}

export interface ImpactFinding {
  readonly id: string;
  readonly analysisRunId: string;
  readonly changedSymbolId: string;
  readonly affectedSymbolId: string;
  readonly impactKind: ImpactKind;
  readonly confidence: ConfidenceLevel;
  readonly path: readonly string[];
  readonly reason: string;
  readonly evidence?: {
    readonly file: string;
    readonly line: number;
    readonly column?: number;
  };
  readonly riskFactors?: readonly RiskFactor[];
}
