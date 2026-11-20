import path from 'node:path';
import type { FileLanguage } from '@falcon/domain';

export const SUPPORTED_EXTENSIONS: ReadonlySet<string> = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
]);

/**
 * Detects programming language from a file path based on its extension.
 */
export function detectLanguage(filePath: string): FileLanguage | undefined {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.ts':
    case '.mts':
    case '.cts':
      return 'typescript';
    case '.tsx':
      return 'tsx';
    case '.js':
    case '.mjs':
    case '.cjs':
      return 'javascript';
    case '.jsx':
      return 'jsx';
    default:
      return undefined;
  }
}

/**
 * Determines whether a file path has a supported source extension.
 */
export function isSupportedSourceFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.has(ext);
}
