import ts from 'typescript';
import type { CompilerProgramOptions } from './types.js';

export const DEFAULT_COMPILER_OPTIONS: ts.CompilerOptions = {
  target: ts.ScriptTarget.Latest,
  module: ts.ModuleKind.NodeNext,
  moduleResolution: ts.ModuleResolutionKind.NodeNext,
  jsx: ts.JsxEmit.ReactJSX,
  allowJs: true,
  checkJs: false,
  declaration: false,
  noEmit: true,
  skipLibCheck: true,
  allowSyntheticDefaultImports: true,
  esModuleInterop: true,
};

/**
 * Creates a standard TypeScript Program from root file paths or custom options.
 */
export function createCompilerProgram(options: CompilerProgramOptions = {}): ts.Program {
  const rootNames = options.rootNames ? Array.from(options.rootNames) : [];
  const compilerOptions = { ...DEFAULT_COMPILER_OPTIONS, ...options.options };

  return ts.createProgram({
    rootNames,
    options: compilerOptions,
    ...(options.host !== undefined ? { host: options.host } : {}),
  });
}

/**
 * Creates an in-memory virtual TypeScript Program for fast, isolated testing
 * without filesystem dependencies.
 */
export function createVirtualProgram(
  files: Record<string, string>,
  options?: ts.CompilerOptions | undefined,
): ts.Program {
  const compilerOptions: ts.CompilerOptions = {
    ...DEFAULT_COMPILER_OPTIONS,
    ...options,
  };

  const fileMap = new Map<string, string>();
  for (const [rawPath, content] of Object.entries(files)) {
    const normalized = rawPath.replace(/\\/g, '/');
    fileMap.set(normalized, content);
  }

  const host = ts.createCompilerHost(compilerOptions, true);

  host.getSourceFile = (fileName: string, languageVersion: ts.ScriptTarget) => {
    const normalized = fileName.replace(/\\/g, '/');
    const content = fileMap.get(normalized);
    if (content !== undefined) {
      return ts.createSourceFile(normalized, content, languageVersion, true);
    }
    // Return empty source file if standard lib is asked
    return ts.createSourceFile(fileName, '', languageVersion, false);
  };

  host.fileExists = (fileName: string) => {
    const normalized = fileName.replace(/\\/g, '/');
    return fileMap.has(normalized);
  };

  host.readFile = (fileName: string) => {
    const normalized = fileName.replace(/\\/g, '/');
    return fileMap.get(normalized);
  };

  return ts.createProgram({
    rootNames: Array.from(fileMap.keys()),
    options: compilerOptions,
    host,
  });
}
