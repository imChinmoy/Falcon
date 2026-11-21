import { describe, it, expect } from 'vitest';
import { parseAndExtractAst, traverseAst } from '../visitor.js';

describe('AST Visitors & Entity Extraction', () => {
  it('extracts function declarations and computes 1-indexed locations', () => {
    const code = `
export function add(a: number, b: number): number {
  return a + b;
}

const multiply = (x: number, y: number): number => x * y;
`;
    const res = parseAndExtractAst({
      filePath: 'src/math.ts',
      sourceText: code,
    });

    expect(res.hasSyntaxErrors).toBe(false);
    expect(res.declarations.length).toBe(2);

    const addFunc = res.declarations.find((d) => d.name === 'add');
    expect(addFunc).toBeDefined();
    if (!addFunc) return;

    expect(addFunc.kind).toBe('function');
    expect(addFunc.exported).toBe(true);
    expect(addFunc.location.startLine).toBe(2);
    expect(addFunc.location.startColumn).toBe(1);
    expect(addFunc.signatureFingerprint).toBeDefined();

    const multFunc = res.declarations.find((d) => d.name === 'multiply');
    expect(multFunc).toBeDefined();
    if (!multFunc) return;
    expect(multFunc.kind).toBe('function');
    expect(multFunc.exported).toBe(false);
  });

  it('extracts class declarations and their method members with parent linking', () => {
    const code = `
export class OrderService {
  private taxRate: number = 0.1;

  public calculateTotal(price: number): number {
    return price * (1 + this.taxRate);
  }
}
`;
    const res = parseAndExtractAst({
      filePath: 'src/service.ts',
      sourceText: code,
    });

    const cls = res.declarations.find((d) => d.name === 'OrderService');
    expect(cls).toBeDefined();
    if (!cls) return;
    expect(cls.kind).toBe('class');
    expect(cls.exported).toBe(true);

    const method = res.declarations.find((d) => d.name === 'calculateTotal');
    expect(method).toBeDefined();
    if (!method) return;
    expect(method.kind).toBe('method');
    expect(method.parentName).toBe('OrderService');
  });

  it('extracts interfaces and type aliases', () => {
    const code = `
export interface User {
  id: string;
  name: string;
}

export type UserId = string;
`;
    const res = parseAndExtractAst({
      filePath: 'src/types.ts',
      sourceText: code,
    });

    const iface = res.declarations.find((d) => d.name === 'User');
    expect(iface).toBeDefined();
    if (!iface) return;
    expect(iface.kind).toBe('interface');
    expect(iface.exported).toBe(true);

    const typeAlias = res.declarations.find((d) => d.name === 'UserId');
    expect(typeAlias).toBeDefined();
    if (!typeAlias) return;
    expect(typeAlias.kind).toBe('typeAlias');
    expect(typeAlias.exported).toBe(true);
  });

  it('extracts enums and variable statements', () => {
    const code = `
export enum Status {
  Active = 'ACTIVE',
  Inactive = 'INACTIVE'
}

const DEFAULT_TIMEOUT = 5000;
`;
    const res = parseAndExtractAst({
      filePath: 'src/constants.ts',
      sourceText: code,
    });

    const enumDecl = res.declarations.find((d) => d.name === 'Status');
    expect(enumDecl).toBeDefined();
    if (!enumDecl) return;
    expect(enumDecl.kind).toBe('enum');

    const varDecl = res.declarations.find((d) => d.name === 'DEFAULT_TIMEOUT');
    expect(varDecl).toBeDefined();
    if (!varDecl) return;
    expect(varDecl.kind).toBe('variable');
  });

  it('extracts default, named, and namespace imports', () => {
    const code = `
import React, { useState, useEffect as useFx } from 'react';
import * as path from 'node:path';
import type { Config } from './config.js';
`;
    const res = parseAndExtractAst({
      filePath: 'src/app.tsx',
      sourceText: code,
    });

    expect(res.imports.length).toBe(3);

    const reactImp = res.imports.find((i) => i.moduleSpecifier === 'react');
    expect(reactImp).toBeDefined();
    if (!reactImp) return;
    expect(reactImp.defaultImport).toBe('React');
    expect(reactImp.namedImports).toEqual(['useState', 'useFx']);
    expect(reactImp.isTypeOnly).toBe(false);

    const pathImp = res.imports.find((i) => i.moduleSpecifier === 'node:path');
    expect(pathImp).toBeDefined();
    if (!pathImp) return;
    expect(pathImp.namespaceImport).toBe('path');

    const configImp = res.imports.find((i) => i.moduleSpecifier === './config.js');
    expect(configImp).toBeDefined();
    if (!configImp) return;
    expect(configImp.isTypeOnly).toBe(true);
  });

  it('extracts export statements and re-exports', () => {
    const code = `
const a = 1;
const b = 2;
export { a, b };
export { c } from './other.js';
export default a;
`;
    const res = parseAndExtractAst({
      filePath: 'src/index.ts',
      sourceText: code,
    });

    expect(res.exports.length).toBe(3);
    const namedExp = res.exports.find((e) => e.exportedNames.includes('a') && !e.isDefault);
    expect(namedExp).toBeDefined();

    const reExp = res.exports.find((e) => e.moduleSpecifier === './other.js');
    expect(reExp).toBeDefined();

    const defExp = res.exports.find((e) => e.isDefault);
    expect(defExp).toBeDefined();
  });

  it('extracts call expressions as relationship candidates', () => {
    const code = `
const result = calculate(1, 2);
console.log(result);
`;
    const res = parseAndExtractAst({
      filePath: 'src/runner.ts',
      sourceText: code,
    });

    expect(res.callExpressions.length).toBe(2);
    expect(res.callExpressions[0]?.expressionText).toBe('calculate');
    expect(res.callExpressions[0]?.argumentCount).toBe(2);
    expect(res.callExpressions[1]?.expressionText).toBe('console.log');
    expect(res.callExpressions[1]?.argumentCount).toBe(1);
  });

  it('allows generic AST tree traversal with traverseAst', () => {
    const code = `const answer = 42;`;
    const res = parseAndExtractAst({
      filePath: 'src/answer.ts',
      sourceText: code,
    });

    let visitedCount = 0;
    traverseAst(res.sourceFile, {
      onNode: () => {
        visitedCount++;
      },
    });

    expect(visitedCount).toBeGreaterThan(3);
  });

  it('traverses deeply nested ASTs without call stack overflow', () => {
    // Generate deeply nested binary expressions: ((((1 + 1) + 1) ...
    const NEST_DEPTH = 200;
    let expr = '1';
    for (let i = 0; i < NEST_DEPTH; i++) {
      expr = `(${expr} + 1)`;
    }
    const code = `export const deeplyNested = ${expr}; export function extra() {}`;

    const res = parseAndExtractAst({
      filePath: 'src/deep.ts',
      sourceText: code,
    });

    expect(res.declarations.length).toBe(2);
    expect(res.declarations.some((d) => d.name === 'deeplyNested')).toBe(true);
    expect(res.declarations.some((d) => d.name === 'extra')).toBe(true);

    let visitCount = 0;
    expect(() => {
      traverseAst(res.sourceFile, {
        onNode: () => {
          visitCount++;
        },
      });
    }).not.toThrow();
    expect(visitCount).toBeGreaterThan(NEST_DEPTH);
  });

  it('gracefully degrades on syntax errors, returning partial results and typed diagnostics', () => {
    // Malformed code with a valid function followed by a severe syntax error followed by another function
    const code = `
export function validBefore(): string {
  return "hello";
}

// Broken syntax
const broken = = = ;;;

export function validAfter(): number {
  return 42;
}
`;
    const res = parseAndExtractAst({
      filePath: 'src/malformed.ts',
      sourceText: code,
    });

    expect(res.hasSyntaxErrors).toBe(true);
    expect(res.diagnostics.length).toBeGreaterThan(0);
    expect(res.diagnostics.some((d) => d.severity === 'error')).toBe(true);

    // Partial results are preserved
    expect(res.declarations.some((d) => d.name === 'validBefore')).toBe(true);
    expect(res.declarations.some((d) => d.name === 'validAfter')).toBe(true);
  });
});
