export type FileLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx';

export type ParseStatus = 'parsed' | 'failed' | 'skipped';

export interface SourceFile {
  readonly id: string;
  readonly snapshotId: string;
  readonly relativePath: string;
  readonly contentHash: string;
  readonly language: FileLanguage;
  readonly parseStatus: ParseStatus;
  readonly isExcluded: boolean;
}
