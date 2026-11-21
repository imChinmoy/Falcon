import ts from 'typescript';
import crypto from 'node:crypto';
import type { SourceLocation } from '@falcon/domain';

/**
 * Computes 1-indexed line and column SourceLocation for an AST node.
 */
export function getNodeLocation(
  sourceFile: ts.SourceFile,
  node: ts.Node,
  normalizedFilePath?: string,
): SourceLocation {
  const startPos = node.getStart(sourceFile);
  const endPos = node.getEnd();

  const start = sourceFile.getLineAndCharacterOfPosition(startPos);
  const end = sourceFile.getLineAndCharacterOfPosition(endPos);

  return {
    filePath: normalizedFilePath ?? sourceFile.fileName.replace(/\\/g, '/'),
    startLine: start.line + 1,
    startColumn: start.character + 1,
    endLine: end.line + 1,
    endColumn: end.character + 1,
  };
}

/**
 * Checks if a node has the 'export' modifier or is part of an export statement.
 */
export function isNodeExported(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    if (modifiers) {
      return modifiers.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
    }
  }

  // Also check if parent is an export assignment or export default
  const parent = node.parent;
  if (parent) {
    if (ts.isExportAssignment(parent) || ts.isExportDeclaration(parent)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if a node has the 'default' modifier.
 */
export function isNodeDefaultExport(node: ts.Node): boolean {
  if (ts.canHaveModifiers(node)) {
    const modifiers = ts.getModifiers(node);
    if (modifiers) {
      return modifiers.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword);
    }
  }
  return false;
}

/**
 * Computes a deterministic signature fingerprint of a declaration's public surface
 * (e.g. name, type parameters, parameters, return type) without being sensitive to
 * whitespace or internal method bodies.
 */
export function computeSignatureFingerprint(node: ts.Node, sourceFile: ts.SourceFile): string {
  let headerText = '';

  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node)) {
    const name = node.name ? node.name.getText(sourceFile) : 'anonymous';
    const params = node.parameters.map((p) => p.getText(sourceFile)).join(', ');
    const retType = node.type ? node.type.getText(sourceFile) : 'inferred';
    headerText = `${name}(${params}): ${retType}`;
  } else if (ts.isClassDeclaration(node)) {
    const name = node.name ? node.name.getText(sourceFile) : 'anonymous';
    const heritage = node.heritageClauses
      ? node.heritageClauses.map((h) => h.getText(sourceFile)).join(' ')
      : '';
    headerText = `class ${name} ${heritage}`;
  } else if (ts.isInterfaceDeclaration(node)) {
    const name = node.name.getText(sourceFile);
    const heritage = node.heritageClauses
      ? node.heritageClauses.map((h) => h.getText(sourceFile)).join(' ')
      : '';
    headerText = `interface ${name} ${heritage}`;
  } else if (ts.isTypeAliasDeclaration(node)) {
    headerText = `type ${node.name.getText(sourceFile)} = ${node.type.getText(sourceFile)}`;
  } else if (ts.isVariableDeclaration(node)) {
    const type = node.type ? node.type.getText(sourceFile) : 'inferred';
    headerText = `var ${node.name.getText(sourceFile)}: ${type}`;
  } else if (ts.isEnumDeclaration(node)) {
    const members = node.members.map((m) => m.name.getText(sourceFile)).join(', ');
    headerText = `enum ${node.name.getText(sourceFile)} { ${members} }`;
  } else {
    headerText = node.getText(sourceFile);
  }

  // Normalize whitespace
  const normalized = headerText.replace(/\s+/g, ' ').trim();
  return crypto.createHash('sha256').update(normalized, 'utf-8').digest('hex').slice(0, 16);
}
