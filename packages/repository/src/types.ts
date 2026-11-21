import type { Diagnostic, SourceFile, FileLanguage } from '@falcon/domain';

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

export interface ReadSourceFileOptions {
  readonly rootPath: string;
  readonly relativePath: string;
  readonly maxFileSizeBytes?: number;
}

export interface ReadSourceFileResult {
  readonly relativePath: string;
  readonly fullPath: string;
  readonly content: string;
  readonly contentHash: string;
  readonly language: FileLanguage;
  readonly sizeBytes: number;
}

export interface WriteSourceFileOptions {
  readonly rootPath: string;
  readonly relativePath: string;
  readonly content: string | Buffer;
}

export interface WriteSourceFileResult {
  readonly relativePath: string;
  readonly fullPath: string;
  readonly contentHash: string;
  readonly language: FileLanguage;
  readonly sizeBytes: number;
  readonly isNew: boolean;
}

export interface EditSourceFileOptions {
  readonly rootPath: string;
  readonly relativePath: string;
  readonly find: string | RegExp;
  readonly replace: string;
}

export interface EditSourceFileResult {
  readonly relativePath: string;
  readonly previousHash: string;
  readonly contentHash: string;
  readonly replacementsCount: number;
  readonly sizeBytes: number;
}

export interface SourceFileInfoResult {
  readonly relativePath: string;
  readonly fullPath: string;
  readonly exists: boolean;
  readonly isDirectory: boolean;
  readonly sizeBytes: number;
  readonly contentHash?: string;
  readonly language?: FileLanguage;
}
