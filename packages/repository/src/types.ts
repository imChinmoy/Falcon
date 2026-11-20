import type { Diagnostic, SourceFile } from '@falcon/domain';

export interface ScanOptions {
  /**
   * Root path of the repository to scan. Can be relative or absolute.
   */
  readonly rootPath: string;

  /**
   * Optional snapshot ID to assign to discovered SourceFiles.
   * Defaults to 'snapshot-draft'.
   */
  readonly snapshotId?: string;

  /**
   * Custom include glob patterns.
   */
  readonly include?: readonly string[];

  /**
   * Custom exclude glob patterns.
   */
  readonly exclude?: readonly string[];

  /**
   * Whether to read and respect .gitignore rules.
   * Default: true.
   */
  readonly respectGitignore?: boolean;

  /**
   * Maximum allowed file size in bytes before flagging as oversized.
   * Default: 5MB (5 * 1024 * 1024).
   */
  readonly maxFileSizeBytes?: number;
}

export interface RepositoryInventory {
  readonly rootPath: string;
  readonly isGitRepo: boolean;
  readonly files: readonly SourceFile[];
  readonly excludedPaths: readonly string[];
  readonly diagnostics: readonly Diagnostic[];
  readonly totalFilesScanned: number;
}

export interface RootValidationResult {
  readonly rootPath: string;
  readonly isGitRepo: boolean;
}
