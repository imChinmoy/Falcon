import type { CodeSymbol, ConfidenceLevel, Diagnostic, SymbolKind } from '@falcon/domain';

export type FileChangeStatus =
  'added' | 'modified' | 'deleted' | 'renamed' | 'copied' | 'unmodified';

export interface ChangedFileEntry {
  readonly path: string;
  readonly status: FileChangeStatus;
  readonly oldPath?: string | undefined;
  readonly similarity?: number | undefined;
}

export interface GitRevisionComparison {
  readonly baseRef: string;
  readonly targetRef: string;
  readonly baseCommitSha: string;
  readonly targetCommitSha: string;
  readonly files: readonly ChangedFileEntry[];
}

export type SymbolMatchStatus =
  'added' | 'deleted' | 'modified' | 'unchanged' | 'renamed' | 'ambiguous';

export interface MatchedSymbol {
  readonly symbolId: string;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: SymbolKind;
  readonly filePath: string;
  readonly status: SymbolMatchStatus;
  readonly oldSymbol?: CodeSymbol | undefined;
  readonly newSymbol?: CodeSymbol | undefined;
  readonly signatureChanged: boolean;
  readonly confidence: ConfidenceLevel;
  readonly reason: string;
}

export interface RevisionDiffResult {
  readonly comparison: GitRevisionComparison;
  readonly changedFiles: readonly ChangedFileEntry[];
  readonly matchedSymbols: readonly MatchedSymbol[];
  readonly addedSymbols: readonly MatchedSymbol[];
  readonly deletedSymbols: readonly MatchedSymbol[];
  readonly modifiedSymbols: readonly MatchedSymbol[];
  readonly ambiguousSymbols: readonly MatchedSymbol[];
  readonly diagnostics: readonly Diagnostic[];
}

export interface GitAdapterOptions {
  readonly repoRoot: string;
  readonly timeoutMs?: number | undefined;
  readonly maxBuffer?: number | undefined;
}

export interface GitError {
  readonly error: string;
  readonly exitCode?: number | undefined;
}

export interface GitAdapter {
  resolveRef(ref: string): Promise<Result<string, GitError>>;
  diffNameStatus(
    baseRef: string,
    targetRef: string,
  ): Promise<Result<readonly ChangedFileEntry[], GitError>>;
  showFile(ref: string, relativePath: string): Promise<Result<string, GitError>>;
  getCurrentBranch(): Promise<Result<string, GitError>>;
  getHeadSha(): Promise<Result<string, GitError>>;
  isGitRepository(): Promise<boolean>;
}

export interface CompareRevisionsOptions {
  readonly repoRoot: string;
  readonly baseRef: string;
  readonly targetRef: string;
  readonly gitAdapter?: GitAdapter | undefined;
  readonly includePatterns?: readonly string[] | undefined;
  readonly excludePatterns?: readonly string[] | undefined;
}

import type { Result } from '@falcon/domain';
