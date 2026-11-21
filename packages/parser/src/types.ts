import type ts from 'typescript';
import type { Diagnostic, SourceLocation, SymbolKind } from '@falcon/domain';

export interface CompilerProgramOptions {
  readonly rootNames?: readonly string[] | undefined;
  readonly options?: ts.CompilerOptions | undefined;
  readonly host?: ts.CompilerHost | undefined;
}

export interface ParseSourceFileOptions {
  readonly filePath: string;
  readonly sourceText: string;
  readonly languageVersion?: ts.ScriptTarget | undefined;
}

export interface AstDeclarationNode {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly location: SourceLocation;
  readonly exported: boolean;
  readonly signatureFingerprint: string;
  readonly node: ts.Node;
  readonly parentName?: string | undefined;
}

export interface AstImportNode {
  readonly moduleSpecifier: string;
  readonly location: SourceLocation;
  readonly defaultImport?: string | undefined;
  readonly namedImports: readonly string[];
  readonly namespaceImport?: string | undefined;
  readonly isTypeOnly: boolean;
  readonly node: ts.ImportDeclaration;
}

export interface AstExportNode {
  readonly location: SourceLocation;
  readonly exportedNames: readonly string[];
  readonly moduleSpecifier?: string | undefined;
  readonly isDefault: boolean;
  readonly isTypeOnly: boolean;
  readonly node: ts.Node;
}

export interface AstCallNode {
  readonly expressionText: string;
  readonly location: SourceLocation;
  readonly argumentCount: number;
  readonly node: ts.CallExpression;
}

export interface ParsedAstInventory {
  readonly filePath: string;
  readonly sourceFile: ts.SourceFile;
  readonly diagnostics: readonly Diagnostic[];
  readonly hasSyntaxErrors: boolean;
  readonly declarations: readonly AstDeclarationNode[];
  readonly imports: readonly AstImportNode[];
  readonly exports: readonly AstExportNode[];
  readonly callExpressions: readonly AstCallNode[];
}

export type NodeVisitorCallback = (node: ts.Node, depth: number) => boolean | void;

export interface AstVisitor {
  readonly onNode?: NodeVisitorCallback | undefined;
  readonly onDeclaration?: ((decl: AstDeclarationNode) => void) | undefined;
  readonly onImport?: ((imp: AstImportNode) => void) | undefined;
  readonly onExport?: ((exp: AstExportNode) => void) | undefined;
  readonly onCall?: ((call: AstCallNode) => void) | undefined;
}
