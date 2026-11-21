import { describe, it, expect } from 'vitest';
import ts from 'typescript';
import { parseAndExtractAst } from '../visitor.js';
import { extractSyntaxDiagnostics, hasSyntaxErrors } from '../diagnostics.js';

describe('Syntax Diagnostics & Error Detection', () => {
  it('detects 0 diagnostics on well-formed TypeScript code', () => {
    const code = `
export interface Point {
  readonly x: number;
  readonly y: number;
}
export const origin: Point = { x: 0, y: 0 };
`;
    const res = parseAndExtractAst({
      filePath: 'src/point.ts',
      sourceText: code,
    });

    expect(res.hasSyntaxErrors).toBe(false);
    expect(res.diagnostics.length).toBe(0);
  });

  it('detects syntax errors on unterminated strings or missing tokens', () => {
    const brokenCode = `
export function broken() {
  const msg = "unterminated string;
  return 123;
// missing closing brace
`;
    const res = parseAndExtractAst({
      filePath: 'src/broken.ts',
      sourceText: brokenCode,
    });

    expect(res.hasSyntaxErrors).toBe(true);
    expect(res.diagnostics.length).toBeGreaterThan(0);

    const firstDiag = res.diagnostics[0]!;
    expect(firstDiag.severity).toBe('error');
    expect(firstDiag.filePath).toBe('src/broken.ts');
    expect(firstDiag.line).toBeDefined();
    expect(firstDiag.column).toBeDefined();
    expect(firstDiag.message).toBeDefined();
    expect(firstDiag.code.startsWith('TS')).toBe(true);
  });

  it('detects malformed export or import syntax', () => {
    const malformed = `
import { from 'nowhere';
`;
    const res = parseAndExtractAst({
      filePath: 'src/malformed.ts',
      sourceText: malformed,
    });

    expect(res.hasSyntaxErrors).toBe(true);
    expect(hasSyntaxErrors(res.diagnostics)).toBe(true);
  });

  it('extracts syntax diagnostics from a standalone ts.SourceFile', () => {
    const sourceFile = ts.createSourceFile('invalid.ts', 'class {', ts.ScriptTarget.Latest, true);
    const diags = extractSyntaxDiagnostics(sourceFile);
    expect(diags.length).toBeGreaterThan(0);
    expect(diags[0]?.severity).toBe('error');
  });
});
