import path from 'node:path';

/**
 * Standard test file extensions and directory conventions.
 */
const TEST_FILE_REGEX = /\.(test|spec)\.([mc]?[jt]sx?)$/i;
const TEST_DIR_REGEX = /(?:^|\/)(?:__tests__|tests|test|spec)\//i;

/**
 * Determines whether a file path corresponds to a test file based on conventions.
 *
 * Recognizes:
 * - `*.test.ts`, `*.test.tsx`, `*.test.js`, `*.test.jsx`, `*.test.mts`, `*.test.cts`
 * - `*.spec.ts`, `*.spec.tsx`, `*.spec.js`, `*.spec.jsx`, `*.spec.mts`, `*.spec.cts`
 * - Any supported script file inside `__tests__/`, `tests/`, `test/`, or `spec/` directories
 */
export function isTestFile(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  if (TEST_FILE_REGEX.test(normalized)) {
    return true;
  }
  if (TEST_DIR_REGEX.test(normalized)) {
    const ext = path.extname(normalized).toLowerCase();
    return ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts', '.mjs', '.cjs'].includes(ext);
  }
  return false;
}

/**
 * Filters a list of file paths and returns only discovered test files.
 */
export function discoverTestFiles(filePaths: readonly string[]): string[] {
  return filePaths.filter(isTestFile);
}

/**
 * Strips test prefixes/suffixes and directories to obtain the underlying source base name.
 * e.g.,
 * - `src/__tests__/auth.test.ts` -> `src/auth`
 * - `src/auth.spec.ts` -> `src/auth`
 * - `tests/calculator.test.ts` -> `calculator`
 */
export function extractBaseNameFromTestFile(testFilePath: string): string {
  const normalized = testFilePath.replace(/\\/g, '/');
  const dir = path.dirname(normalized);
  const ext = path.extname(normalized);
  let baseName = path.basename(normalized, ext);

  // Strip .test or .spec suffix
  baseName = baseName.replace(/\.(test|spec)$/i, '');

  // Strip __tests__, tests, test, spec from directory if present
  const cleanedDir = dir
    .replace(/(?:^|\/)(?:__tests__|tests|test|spec)(?:\/|$)/g, '/')
    .replace(/^\/+|\/+$/g, '');

  return cleanedDir ? `${cleanedDir}/${baseName}` : baseName;
}

/**
 * Generates candidate source file paths that a test file might be testing by naming conventions.
 */
export function inferSourceFileCandidates(
  testFilePath: string,
  knownSourceFiles?: ReadonlySet<string>,
): string[] {
  const normalized = testFilePath.replace(/\\/g, '/');
  const dir = path.dirname(normalized);
  const ext = path.extname(normalized);
  let baseName = path.basename(normalized, ext);
  baseName = baseName.replace(/\.(test|spec)$/i, '');

  const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.cts'];
  const candidates: string[] = [];

  // If inside __tests__, test, or spec directory, candidate is in parent directory
  const parentDir = dir.replace(/\/(?:__tests__|tests|test|spec)$/, '');
  const dirsToTry = [dir];
  if (parentDir !== dir) {
    dirsToTry.push(parentDir);
  }
  // Also try root `src/` if test was under `tests/` or `test/`
  if (dir.startsWith('tests/') || dir.startsWith('test/') || dir === 'tests' || dir === 'test') {
    const stripped = dir.replace(/^tests?\/?/, '');
    dirsToTry.push(stripped ? `src/${stripped}` : 'src');
    dirsToTry.push(stripped || '.');
  }

  for (const d of dirsToTry) {
    for (const e of extensions) {
      const candidate = d === '.' || !d ? `${baseName}${e}` : `${d}/${baseName}${e}`;
      candidates.push(candidate);
    }
  }

  if (knownSourceFiles !== undefined) {
    return candidates.filter((c) => knownSourceFiles.has(c));
  }

  return Array.from(new Set(candidates));
}

/**
 * Generates candidate test file paths for a given source file path based on co-located naming conventions.
 */
export function inferTestFilesFromSource(
  sourceFilePath: string,
  knownTestFiles?: ReadonlySet<string>,
): string[] {
  const normalized = sourceFilePath.replace(/\\/g, '/');
  const dir = path.dirname(normalized);
  const ext = path.extname(normalized);
  const baseName = path.basename(normalized, ext);

  const testExtensions = ['.test.ts', '.spec.ts', '.test.tsx', '.spec.tsx', '.test.js', '.spec.js'];
  const candidates: string[] = [];

  // 1. Co-located in same directory: `src/auth.test.ts`
  for (const tExt of testExtensions) {
    const candidate = dir === '.' || !dir ? `${baseName}${tExt}` : `${dir}/${baseName}${tExt}`;
    candidates.push(candidate);
  }

  // 2. In __tests__ subdirectory: `src/__tests__/auth.test.ts`
  for (const tExt of testExtensions) {
    const candidate =
      dir === '.' || !dir ? `__tests__/${baseName}${tExt}` : `${dir}/__tests__/${baseName}${tExt}`;
    candidates.push(candidate);
  }

  // 3. In root tests/ or test/ directory: `tests/auth.test.ts`
  for (const tExt of testExtensions) {
    const candidate = `tests/${baseName}${tExt}`;
    const candidateWithDir =
      dir === '.' || !dir ? candidate : `tests/${dir.replace(/^src\/?/, '')}/${baseName}${tExt}`;
    candidates.push(candidate);
    candidates.push(candidateWithDir);
  }

  const uniqueCandidates = Array.from(new Set(candidates));

  if (knownTestFiles !== undefined) {
    return uniqueCandidates.filter((c) => knownTestFiles.has(c));
  }

  return uniqueCandidates;
}
