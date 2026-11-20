import fs from 'node:fs';
import path from 'node:path';
import ignore, { type Ignore } from 'ignore';
import { normalizeRelativePath } from './validator.js';

export const DEFAULT_EXCLUDED_DIRECTORIES: readonly string[] = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.cache',
  '.falcon',
  'reports',
  '.next',
  '.nuxt',
  '.output',
  '.idea',
  '.vscode',
];

export const DEFAULT_EXCLUDED_PATTERNS: readonly string[] = [
  '*.log',
  '*.lock',
  '*.tsbuildinfo',
  '.DS_Store',
  'pnpm-lock.yaml',
  'package-lock.json',
  'yarn.lock',
  '*.map',
  '**/*.d.ts',
  '**/*.d.mts',
  '**/*.d.cts',
];

export interface FileFilter {
  shouldExclude(relativePath: string, isDirectory: boolean): boolean;
}

/**
 * Creates an ignore matcher for a repository considering defaults,
 * root .gitignore (if enabled), and custom exclude patterns.
 */
export function createRepositoryFilter(options: {
  rootPath: string;
  respectGitignore?: boolean | undefined;
  exclude?: readonly string[] | undefined;
}): FileFilter {
  const { rootPath, respectGitignore = true, exclude = [] } = options;

  // Initialize ignore instance with default exclusions
  // Cast to Ignore to avoid ESM/CJS interop type mismatch with default export
  const ig: Ignore =
    typeof (ignore as unknown as { default?: unknown }).default === 'function'
      ? (ignore as unknown as { default: () => Ignore }).default()
      : (ignore as unknown as () => Ignore)();

  // Add default directory rules
  for (const dir of DEFAULT_EXCLUDED_DIRECTORIES) {
    ig.add(`${dir}/`);
    ig.add(`**/${dir}/`);
  }

  // Add default pattern rules
  for (const pattern of DEFAULT_EXCLUDED_PATTERNS) {
    ig.add(pattern);
  }

  // Add custom exclusions
  for (const customPattern of exclude) {
    ig.add(customPattern);
  }

  // Read root .gitignore if requested and exists
  if (respectGitignore) {
    const gitignorePath = path.join(rootPath, '.gitignore');
    if (fs.existsSync(gitignorePath)) {
      try {
        const content = fs.readFileSync(gitignorePath, 'utf8');
        const lines = content
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line.length > 0 && !line.startsWith('#'));
        ig.add(lines);
      } catch {
        // Failed to read .gitignore, continue with defaults
      }
    }
  }

  return {
    shouldExclude(relativePath: string, isDirectory: boolean): boolean {
      const normalized = normalizeRelativePath(relativePath);
      if (!normalized || normalized === '.') {
        return false;
      }

      // Check simple directory name match
      const baseName = path.basename(normalized);
      if (isDirectory && DEFAULT_EXCLUDED_DIRECTORIES.includes(baseName)) {
        return true;
      }

      const testPath = isDirectory && !normalized.endsWith('/') ? `${normalized}/` : normalized;
      return ig.ignores(testPath);
    },
  };
}
