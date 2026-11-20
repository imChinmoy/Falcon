import type { SymbolKind } from '../models/symbol.js';

/**
 * Generate a deterministic ID for a code symbol within an analysis snapshot.
 * Format: {filePath}#{qualifiedName}:{kind}@{startLine}
 */
export function createSymbolId(
  filePath: string,
  qualifiedName: string,
  kind: SymbolKind,
  startLine: number,
): string {
  const normalizedPath = filePath.replace(/\\/g, '/');
  return `${normalizedPath}#${qualifiedName}:${kind}@${startLine}`;
}

/**
 * Generate a deterministic ID for a dependency edge.
 */
export function createEdgeId(
  sourceSymbolId: string,
  targetSymbolId: string,
  edgeType: string,
): string {
  return `${sourceSymbolId}->${targetSymbolId}[${edgeType}]`;
}
