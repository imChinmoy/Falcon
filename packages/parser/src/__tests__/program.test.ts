import { describe, it, expect } from 'vitest';
import {
  createCompilerProgram,
  createVirtualProgram,
  DEFAULT_COMPILER_OPTIONS,
} from '../program.js';
import { extractSyntaxDiagnostics } from '../diagnostics.js';

describe('TypeScript Program Creation', () => {
  it('creates program with default compiler options', () => {
    const program = createCompilerProgram({
      rootNames: [],
    });

    expect(program).toBeDefined();
    const opts = program.getCompilerOptions();
    expect(opts.target).toBe(DEFAULT_COMPILER_OPTIONS.target);
    expect(opts.module).toBe(DEFAULT_COMPILER_OPTIONS.module);
  });

  it('creates in-memory virtual program and typechecks source files', () => {
    const virtualFiles = {
      'src/math.ts': `export const add = (a: number, b: number) => a + b;`,
      'src/main.ts': `import { add } from './math.js';\nexport const res = add(2, 3);`,
    };

    const program = createVirtualProgram(virtualFiles);
    expect(program).toBeDefined();

    const rootFiles = program.getRootFileNames();
    expect(rootFiles).toContain('src/math.ts');
    expect(rootFiles).toContain('src/main.ts');

    const sourceFile = program.getSourceFile('src/main.ts');
    expect(sourceFile).toBeDefined();
    if (!sourceFile) return;

    const diags = extractSyntaxDiagnostics(sourceFile, program);
    expect(diags.length).toBe(0);
  });

  it('virtual program detects syntax diagnostics', () => {
    const virtualFiles = {
      'src/bad.ts': `export function oops( { return; }`,
    };

    const program = createVirtualProgram(virtualFiles);
    const sourceFile = program.getSourceFile('src/bad.ts');
    expect(sourceFile).toBeDefined();
    if (!sourceFile) return;

    const diags = extractSyntaxDiagnostics(sourceFile, program);
    expect(diags.length).toBeGreaterThan(0);
  });
});
