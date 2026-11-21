import ts from 'typescript';
import type { SymbolKind } from '@falcon/domain';
import { getNodeLocation, isNodeExported, computeSignatureFingerprint } from './astUtils.js';
import { extractSyntaxDiagnostics, hasSyntaxErrors } from './diagnostics.js';
import type {
  AstDeclarationNode,
  AstImportNode,
  AstExportNode,
  AstCallNode,
  AstVisitor,
  ParsedAstInventory,
  ParseSourceFileOptions,
} from './types.js';

/**
 * Traverses an AST tree using an iterative stack, avoiding call stack overflow
 * on deeply nested AST structures.
 */
export function traverseAst(rootNode: ts.Node, visitor: AstVisitor): void {
  const stack: Array<{ node: ts.Node; depth: number }> = [{ node: rootNode, depth: 0 }];

  while (stack.length > 0) {
    const item = stack.pop()!;
    if (visitor.onNode) {
      const continueDescend = visitor.onNode(item.node, item.depth);
      if (continueDescend === false) {
        continue;
      }
    }

    const children: ts.Node[] = [];
    ts.forEachChild(item.node, (child) => {
      children.push(child);
    });

    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i]!, depth: item.depth + 1 });
    }
  }
}

/**
 * Extracts all top-level and member declarations, imports, exports, and call expressions
 * from a TypeScript SourceFile using iterative AST traversal to prevent stack overflows.
 */
export function extractFromSourceFile(
  sourceFile: ts.SourceFile,
): Omit<ParsedAstInventory, 'diagnostics' | 'hasSyntaxErrors'> {
  const normalizedFilePath = sourceFile.fileName.replace(/\\/g, '/');
  const declarations: AstDeclarationNode[] = [];
  const imports: AstImportNode[] = [];
  const exports: AstExportNode[] = [];
  const callExpressions: AstCallNode[] = [];

  function recordDeclaration(
    name: string,
    kind: SymbolKind,
    node: ts.Node,
    exported = false,
    parentName?: string,
  ): void {
    declarations.push({
      name,
      kind,
      location: getNodeLocation(sourceFile, node, normalizedFilePath),
      exported: exported || isNodeExported(node),
      signatureFingerprint: computeSignatureFingerprint(node, sourceFile),
      node,
      ...(parentName ? { parentName } : {}),
    });
  }

  const stack: ts.Node[] = [sourceFile];

  while (stack.length > 0) {
    const node = stack.pop()!;

    try {
      // 1. Function Declarations
      if (ts.isFunctionDeclaration(node)) {
        const name = node.name ? node.name.getText(sourceFile) : 'anonymous';
        recordDeclaration(name, 'function', node);
      }

      // 2. Class Declarations and their members
      else if (ts.isClassDeclaration(node)) {
        const className = node.name ? node.name.getText(sourceFile) : 'anonymous';
        recordDeclaration(className, 'class', node);

        // Inspect class members
        for (const member of node.members) {
          if (ts.isMethodDeclaration(member)) {
            const methodName = member.name ? member.name.getText(sourceFile) : 'anonymous';
            recordDeclaration(methodName, 'method', member, false, className);
          }
        }
      }

      // 3. Interface Declarations
      else if (ts.isInterfaceDeclaration(node)) {
        const name = node.name.getText(sourceFile);
        recordDeclaration(name, 'interface', node);
      }

      // 4. Type Alias Declarations
      else if (ts.isTypeAliasDeclaration(node)) {
        const name = node.name.getText(sourceFile);
        recordDeclaration(name, 'typeAlias', node);
      }

      // 5. Enum Declarations
      else if (ts.isEnumDeclaration(node)) {
        const name = node.name.getText(sourceFile);
        recordDeclaration(name, 'enum', node);
      }

      // 6. Variable Statements (const, let, var, arrow functions)
      else if (ts.isVariableStatement(node)) {
        const isExported = isNodeExported(node);
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            const varName = decl.name.getText(sourceFile);
            const isFunctionLike =
              decl.initializer &&
              (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer));
            const kind: SymbolKind = isFunctionLike ? 'function' : 'variable';
            recordDeclaration(varName, kind, decl, isExported);
          }
        }
      }

      // 7. Import Declarations
      else if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = ts.isStringLiteral(node.moduleSpecifier)
          ? node.moduleSpecifier.text
          : node.moduleSpecifier.getText(sourceFile);

        let defaultImport: string | undefined;
        const namedImports: string[] = [];
        let namespaceImport: string | undefined;
        const isTypeOnly = node.importClause?.isTypeOnly ?? false;

        if (node.importClause) {
          if (node.importClause.name) {
            defaultImport = node.importClause.name.getText(sourceFile);
          }

          const namedBindings = node.importClause.namedBindings;
          if (namedBindings) {
            if (ts.isNamespaceImport(namedBindings)) {
              namespaceImport = namedBindings.name.getText(sourceFile);
            } else if (ts.isNamedImports(namedBindings)) {
              for (const el of namedBindings.elements) {
                namedImports.push(el.name.getText(sourceFile));
              }
            }
          }
        }

        imports.push({
          moduleSpecifier,
          location: getNodeLocation(sourceFile, node, normalizedFilePath),
          ...(defaultImport ? { defaultImport } : {}),
          namedImports,
          ...(namespaceImport ? { namespaceImport } : {}),
          isTypeOnly,
          node,
        });
      }

      // 8. Export Declarations
      else if (ts.isExportDeclaration(node)) {
        const moduleSpecifier =
          node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)
            ? node.moduleSpecifier.text
            : undefined;
        const exportedNames: string[] = [];
        const isTypeOnly = node.isTypeOnly ?? false;

        if (node.exportClause && ts.isNamedExports(node.exportClause)) {
          for (const el of node.exportClause.elements) {
            exportedNames.push(el.name.getText(sourceFile));
          }
        }

        exports.push({
          location: getNodeLocation(sourceFile, node, normalizedFilePath),
          exportedNames,
          ...(moduleSpecifier ? { moduleSpecifier } : {}),
          isDefault: false,
          isTypeOnly,
          node,
        });
      }

      // 9. Export Default Assignment
      else if (ts.isExportAssignment(node)) {
        const isDefault = !node.isExportEquals;
        const name = node.expression.getText(sourceFile);
        exports.push({
          location: getNodeLocation(sourceFile, node, normalizedFilePath),
          exportedNames: [name],
          isDefault,
          isTypeOnly: false,
          node,
        });
      }

      // 10. Call Expressions (relationship candidates)
      else if (ts.isCallExpression(node)) {
        const exprText = node.expression.getText(sourceFile);
        callExpressions.push({
          expressionText: exprText,
          location: getNodeLocation(sourceFile, node, normalizedFilePath),
          argumentCount: node.arguments.length,
          node,
        });
      }
    } catch {
      // Gracefully degrade on any unexpected AST node anomaly
    }

    // Collect children in reverse order to preserve preorder traversal
    const children: ts.Node[] = [];
    ts.forEachChild(node, (child) => {
      children.push(child);
    });
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push(children[i]!);
    }
  }

  return {
    filePath: normalizedFilePath,
    sourceFile,
    declarations,
    imports,
    exports,
    callExpressions,
  };
}

/**
 * Parses source text, runs AST visitors to extract declarations, imports, exports, and call candidates,
 * and extracts all syntax diagnostics.
 */
export function parseAndExtractAst(options: ParseSourceFileOptions): ParsedAstInventory {
  const { filePath, sourceText, languageVersion = ts.ScriptTarget.Latest } = options;

  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    languageVersion,
    true, // setParentNodes
  );

  const diagnostics = extractSyntaxDiagnostics(sourceFile);
  const extracted = extractFromSourceFile(sourceFile);

  return {
    ...extracted,
    diagnostics,
    hasSyntaxErrors: hasSyntaxErrors(diagnostics),
  };
}
