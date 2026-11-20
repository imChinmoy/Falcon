export interface SourceLocation {
  readonly filePath: string;
  readonly startLine: number;
  readonly startColumn: number;
  readonly endLine: number;
  readonly endColumn: number;
}

export type SymbolKind =
  | 'function'
  | 'method'
  | 'class'
  | 'interface'
  | 'typeAlias'
  | 'enum'
  | 'variable'
  | 'import'
  | 'export';

export interface CodeSymbol {
  readonly id: string;
  readonly snapshotId: string;
  readonly fileId: string;
  readonly filePath: string;
  readonly name: string;
  readonly qualifiedName: string;
  readonly kind: SymbolKind;
  readonly location: SourceLocation;
  readonly exported: boolean;
  readonly signatureFingerprint?: string;
  readonly parentSymbolId?: string;
}
