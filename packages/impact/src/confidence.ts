import type { ConfidenceLevel } from '@falcon/domain';

export const CONFIDENCE_RANKS: Readonly<Record<ConfidenceLevel, number>> = {
  unknown: 1,
  unresolved: 2,
  heuristic: 2.5,
  inferred: 3,
  confirmed: 4,
};

/**
 * Returns numeric rank for confidence level (higher = stronger evidence).
 */
export function confidenceRank(level: ConfidenceLevel): number {
  return CONFIDENCE_RANKS[level] ?? 1;
}

/**
 * Compares two confidence levels.
 * Returns > 0 if a > b, < 0 if a < b, 0 if equal.
 */
export function compareConfidence(a: ConfidenceLevel, b: ConfidenceLevel): number {
  return confidenceRank(a) - confidenceRank(b);
}

/**
 * Returns the weaker of two confidence levels (weakest link in path).
 */
export function minConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return confidenceRank(a) <= confidenceRank(b) ? a : b;
}

/**
 * Returns the stronger of two confidence levels.
 */
export function maxConfidence(a: ConfidenceLevel, b: ConfidenceLevel): ConfidenceLevel {
  return confidenceRank(a) >= confidenceRank(b) ? a : b;
}

/**
 * Aggregates confidence along a dependency path.
 * In a path A -> B -> C, the path confidence is constrained by its weakest link.
 */
export function aggregatePathConfidence(confidences: readonly ConfidenceLevel[]): ConfidenceLevel {
  if (confidences.length === 0) {
    return 'confirmed';
  }
  let lowest: ConfidenceLevel = 'confirmed';
  for (const c of confidences) {
    lowest = minConfidence(lowest, c);
  }
  return lowest;
}
