import type { CodeSymbol } from '@falcon/domain';
import { createSymbolId } from '@falcon/domain';
import type { AstDeclarationNode } from '@falcon/parser';
import type { MatchedSymbol, SymbolMatchStatus } from './types.js';

/**
 * Computes lexical name similarity between two identifier names (0.0 to 1.0).
 */
export function computeNameSimilarity(a: string, b: string): number {
  const normA = a.toLowerCase();
  const normB = b.toLowerCase();
  if (normA === normB) return 1.0;
  if (normA.includes(normB) || normB.includes(normA)) return 0.75;

  const wordsA = a
    .split(/(?=[A-Z])|[_\-.]/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
  const wordsB = b
    .split(/(?=[A-Z])|[_\-.]/)
    .map((w) => w.toLowerCase())
    .filter(Boolean);
  const setA = new Set(wordsA);
  const common = wordsB.filter((w) => setA.has(w));

  if (common.length > 0) {
    return common.length / Math.max(wordsA.length, wordsB.length);
  }
  return 0;
}

/**
 * Converts an AST declaration node into a domain CodeSymbol.
 */
export function declarationToCodeSymbol(
  decl: AstDeclarationNode,
  snapshotId: string = 'snapshot-current',
): CodeSymbol {
  const qualifiedName = decl.parentName ? `${decl.parentName}.${decl.name}` : decl.name;
  const id = createSymbolId(
    decl.location.filePath,
    qualifiedName,
    decl.kind,
    decl.location.startLine,
  );

  return {
    id,
    snapshotId,
    fileId: decl.location.filePath,
    filePath: decl.location.filePath,
    name: decl.name,
    qualifiedName,
    kind: decl.kind,
    location: decl.location,
    exported: decl.exported,
    ...(decl.signatureFingerprint ? { signatureFingerprint: decl.signatureFingerprint } : {}),
  };
}

export interface MatchSymbolsOptions {
  readonly oldSymbols: readonly CodeSymbol[];
  readonly newSymbols: readonly CodeSymbol[];
  readonly filePath?: string | undefined;
}

/**
 * Matches symbols across two revisions (old vs new) using a layered strategy.
 *
 * Layer 1: Exact match by (filePath + qualifiedName + kind).
 * Layer 2: Signature match for renamed symbols within the same file.
 * Identifies added, deleted, modified (signature changed or implementation changed), and ambiguous matches.
 */
export function matchSymbols(options: MatchSymbolsOptions): readonly MatchedSymbol[] {
  const { oldSymbols, newSymbols } = options;

  const matchedResults: MatchedSymbol[] = [];
  const matchedOldIds = new Set<string>();
  const matchedNewIds = new Set<string>();

  // Map old symbols by qualifiedName:kind
  const oldByQualifiedKind = new Map<string, CodeSymbol[]>();
  for (const oldSym of oldSymbols) {
    const key = `${oldSym.filePath}::${oldSym.qualifiedName}::${oldSym.kind}`;
    const list = oldByQualifiedKind.get(key) ?? [];
    list.push(oldSym);
    oldByQualifiedKind.set(key, list);
  }

  // Layer 1: Exact matching by (filePath + qualifiedName + kind)
  for (const newSym of newSymbols) {
    const key = `${newSym.filePath}::${newSym.qualifiedName}::${newSym.kind}`;
    const candidates = oldByQualifiedKind.get(key);

    if (candidates && candidates.length === 1) {
      const oldSym = candidates[0]!;
      matchedOldIds.add(oldSym.id);
      matchedNewIds.add(newSym.id);

      const signatureChanged =
        Boolean(oldSym.signatureFingerprint) &&
        Boolean(newSym.signatureFingerprint) &&
        oldSym.signatureFingerprint !== newSym.signatureFingerprint;

      const locationChanged =
        oldSym.location.startLine !== newSym.location.startLine ||
        oldSym.location.endLine !== newSym.location.endLine;

      const exportChanged = oldSym.exported !== newSym.exported;

      let status: SymbolMatchStatus = 'unchanged';
      let reason = 'Exact match; signature and location unchanged';

      if (signatureChanged) {
        status = 'modified';
        reason = `Signature changed: '${oldSym.signatureFingerprint}' -> '${newSym.signatureFingerprint}'`;
      } else if (exportChanged) {
        status = 'modified';
        reason = `Export visibility changed: ${oldSym.exported} -> ${newSym.exported}`;
      } else if (locationChanged) {
        status = 'modified';
        reason = 'Implementation or line position changed';
      }

      matchedResults.push({
        symbolId: newSym.id,
        name: newSym.name,
        qualifiedName: newSym.qualifiedName,
        kind: newSym.kind,
        filePath: newSym.filePath,
        status,
        oldSymbol: oldSym,
        newSymbol: newSym,
        signatureChanged,
        confidence: 'confirmed',
        reason,
      });
    } else if (candidates && candidates.length > 1) {
      // Multiple candidates with exact same qualified name and kind in same file -> ambiguous
      for (const oldSym of candidates) {
        matchedOldIds.add(oldSym.id);
      }
      matchedNewIds.add(newSym.id);

      matchedResults.push({
        symbolId: newSym.id,
        name: newSym.name,
        qualifiedName: newSym.qualifiedName,
        kind: newSym.kind,
        filePath: newSym.filePath,
        status: 'ambiguous',
        newSymbol: newSym,
        signatureChanged: true,
        confidence: 'unresolved',
        reason: `Ambiguous match: multiple declarations for '${newSym.qualifiedName}' in '${newSym.filePath}'`,
      });
    }
  }

  // Layer 2: For unmatched new symbols, check for potential renames (same file, same kind & signature + name similarity)
  // Index remaining old symbols by (filePath + kind + signatureFingerprint) for O(1) candidate lookup
  const remainingOldSymbols = oldSymbols.filter((s) => !matchedOldIds.has(s.id));
  const remainingNewSymbols = newSymbols.filter((s) => !matchedNewIds.has(s.id));

  const oldByFileKindSignature = new Map<string, CodeSymbol[]>();
  for (const oldSym of remainingOldSymbols) {
    if (oldSym.signatureFingerprint) {
      const key = `${oldSym.filePath}::${oldSym.kind}::${oldSym.signatureFingerprint}`;
      const list = oldByFileKindSignature.get(key) ?? [];
      list.push(oldSym);
      oldByFileKindSignature.set(key, list);
    }
  }

  for (const newSym of remainingNewSymbols) {
    if (newSym.signatureFingerprint) {
      const key = `${newSym.filePath}::${newSym.kind}::${newSym.signatureFingerprint}`;
      const candidates = oldByFileKindSignature.get(key);

      if (candidates && candidates.length > 0) {
        const renameCandidates = candidates.filter(
          (oldSym) =>
            !matchedOldIds.has(oldSym.id) && computeNameSimilarity(oldSym.name, newSym.name) >= 0.4,
        );

        if (renameCandidates.length === 1) {
          const oldSym = renameCandidates[0]!;
          matchedOldIds.add(oldSym.id);
          matchedNewIds.add(newSym.id);

          matchedResults.push({
            symbolId: newSym.id,
            name: newSym.name,
            qualifiedName: newSym.qualifiedName,
            kind: newSym.kind,
            filePath: newSym.filePath,
            status: 'renamed',
            oldSymbol: oldSym,
            newSymbol: newSym,
            signatureChanged: false,
            confidence: 'inferred',
            reason: `Likely renamed from '${oldSym.qualifiedName}' (identical signature fingerprint)`,
          });
          continue;
        }
      }
    }

    // No match -> Added symbol
    matchedNewIds.add(newSym.id);
    matchedResults.push({
      symbolId: newSym.id,
      name: newSym.name,
      qualifiedName: newSym.qualifiedName,
      kind: newSym.kind,
      filePath: newSym.filePath,
      status: 'added',
      newSymbol: newSym,
      signatureChanged: true,
      confidence: 'confirmed',
      reason: 'Symbol added in target revision',
    });
  }

  // Layer 3: Any old symbols still unmatched -> Deleted symbols
  for (const oldSym of oldSymbols) {
    if (!matchedOldIds.has(oldSym.id)) {
      matchedResults.push({
        symbolId: oldSym.id,
        name: oldSym.name,
        qualifiedName: oldSym.qualifiedName,
        kind: oldSym.kind,
        filePath: oldSym.filePath,
        status: 'deleted',
        oldSymbol: oldSym,
        signatureChanged: true,
        confidence: 'confirmed',
        reason: 'Symbol deleted from base revision',
      });
    }
  }

  return matchedResults;
}
