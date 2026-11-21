import type { CodeSymbol, Diagnostic, Result } from '@falcon/domain';
import { err, ok } from '@falcon/domain';
import { parseAndExtractAst } from '@falcon/parser';
import { isSupportedSourceFile } from '@falcon/repository';
import { createGitAdapter } from './gitAdapter.js';
import { declarationToCodeSymbol, matchSymbols } from './symbolMatcher.js';
import type {
  CompareRevisionsOptions,
  GitError,
  GitRevisionComparison,
  MatchedSymbol,
  RevisionDiffResult,
} from './types.js';

/**
 * Compares two Git revisions, parses old and new source files, matches symbols,
 * and classifies changes into added, deleted, modified, and ambiguous symbols.
 */
export async function compareRevisions(
  options: CompareRevisionsOptions,
): Promise<Result<RevisionDiffResult, GitError>> {
  const { repoRoot, baseRef, targetRef } = options;
  const git = options.gitAdapter ?? createGitAdapter({ repoRoot });

  // 1. Resolve base and target commit SHAs
  const baseShaRes = await git.resolveRef(baseRef);
  if (!baseShaRes.ok) {
    return err(baseShaRes.error);
  }
  const baseCommitSha = baseShaRes.value;

  const targetShaRes = await git.resolveRef(targetRef);
  if (!targetShaRes.ok) {
    return err(targetShaRes.error);
  }
  const targetCommitSha = targetShaRes.value;

  // 2. Obtain changed files using name-status
  const diffRes = await git.diffNameStatus(baseRef, targetRef);
  if (!diffRes.ok) {
    return err(diffRes.error);
  }

  // 3. Filter to supported source files
  const changedFiles = diffRes.value.filter((file) => {
    const isSupported =
      isSupportedSourceFile(file.path) || (file.oldPath && isSupportedSourceFile(file.oldPath));
    return isSupported;
  });

  const comparison: GitRevisionComparison = {
    baseRef,
    targetRef,
    baseCommitSha,
    targetCommitSha,
    files: changedFiles,
  };

  const allMatchedSymbols: MatchedSymbol[] = [];
  const allDiagnostics: Diagnostic[] = [];

  // 4. For each changed file, parse old and new versions and match symbols
  for (const file of changedFiles) {
    const oldSymbols: CodeSymbol[] = [];
    const newSymbols: CodeSymbol[] = [];

    // Load old version if file was modified, deleted, or renamed
    if (file.status === 'modified' || file.status === 'deleted' || file.status === 'renamed') {
      const oldFilePath = file.oldPath ?? file.path;
      const oldShowRes = await git.showFile(baseRef, oldFilePath);
      if (oldShowRes.ok) {
        const parsedOld = parseAndExtractAst({
          filePath: oldFilePath,
          sourceText: oldShowRes.value,
        });
        allDiagnostics.push(...parsedOld.diagnostics);
        for (const decl of parsedOld.declarations) {
          oldSymbols.push(declarationToCodeSymbol(decl, baseCommitSha));
        }
      }
    }

    // Load new version if file was modified, added, or renamed
    if (file.status === 'modified' || file.status === 'added' || file.status === 'renamed') {
      const newShowRes = await git.showFile(targetRef, file.path);
      if (newShowRes.ok) {
        const parsedNew = parseAndExtractAst({
          filePath: file.path,
          sourceText: newShowRes.value,
        });
        allDiagnostics.push(...parsedNew.diagnostics);
        for (const decl of parsedNew.declarations) {
          newSymbols.push(declarationToCodeSymbol(decl, targetCommitSha));
        }
      }
    }

    // Match symbols for this file
    const fileMatches = matchSymbols({
      oldSymbols,
      newSymbols,
      filePath: file.path,
    });

    allMatchedSymbols.push(...fileMatches);
  }

  const addedSymbols = allMatchedSymbols.filter((s) => s.status === 'added');
  const deletedSymbols = allMatchedSymbols.filter((s) => s.status === 'deleted');
  const modifiedSymbols = allMatchedSymbols.filter((s) => s.status === 'modified');
  const ambiguousSymbols = allMatchedSymbols.filter((s) => s.status === 'ambiguous');

  return ok({
    comparison,
    changedFiles,
    matchedSymbols: allMatchedSymbols,
    addedSymbols,
    deletedSymbols,
    modifiedSymbols,
    ambiguousSymbols,
    diagnostics: allDiagnostics,
  });
}
