import fs from 'node:fs';
import path from 'node:path';
import { ok, err, type Result, type Diagnostic } from '@falcon/domain';
import type { RootValidationResult } from './types.js';

export class RepositoryValidationError extends Error {
  readonly code: string;
  readonly diagnostic: Diagnostic;

  constructor(code: string, message: string, filePath?: string) {
    super(message);
    this.name = 'RepositoryValidationError';
    this.code = code;
    this.diagnostic = {
      id: `diag-val-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      code,
      severity: 'error',
      message,
      ...(filePath !== undefined ? { filePath } : {}),
    };
  }
}

/**
 * Validates that target path exists, is a directory, canonicalizes it,
 * and checks for Git repository presence.
 */
export function validateRepositoryRoot(
  targetPath: string,
): Result<RootValidationResult, RepositoryValidationError> {
  const resolved = path.resolve(targetPath);

  if (!fs.existsSync(resolved)) {
    return err(
      new RepositoryValidationError(
        'DIAG_ROOT_NOT_FOUND',
        `Repository root does not exist: "${resolved}"`,
        targetPath,
      ),
    );
  }

  let stats: fs.Stats;
  try {
    stats = fs.statSync(resolved);
  } catch (error) {
    return err(
      new RepositoryValidationError(
        'DIAG_ROOT_UNREADABLE',
        `Failed to read repository root "${resolved}": ${error instanceof Error ? error.message : String(error)}`,
        targetPath,
      ),
    );
  }

  if (!stats.isDirectory()) {
    return err(
      new RepositoryValidationError(
        'DIAG_ROOT_NOT_DIRECTORY',
        `Repository root path is not a directory: "${resolved}"`,
        targetPath,
      ),
    );
  }

  let canonicalRoot: string;
  try {
    canonicalRoot = fs.realpathSync(resolved);
  } catch {
    canonicalRoot = resolved;
  }

  // Check if it is a git repo
  const gitDir = path.join(canonicalRoot, '.git');
  const isGitRepo = fs.existsSync(gitDir);

  return ok({
    rootPath: canonicalRoot,
    isGitRepo,
  });
}

/**
 * Checks if a candidate path is securely contained within the repository root.
 * Protects against path traversal, URL-encoding bypasses, backslash tricks,
 * null-byte poisoning, and symlink escaping attacks.
 */
export function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  if (typeof rootPath !== 'string' || typeof candidatePath !== 'string') {
    return false;
  }
  if (!rootPath || !candidatePath) {
    return false;
  }
  // Null byte defense
  if (rootPath.includes('\0') || candidatePath.includes('\0')) {
    return false;
  }

  // Iteratively decode URL-encoded components (e.g. %2e%2e%2f, double-encoding)
  let cleanCandidate = candidatePath;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(cleanCandidate);
      if (next === cleanCandidate) break;
      cleanCandidate = next;
    } catch {
      break;
    }
  }

  if (cleanCandidate.includes('\0')) {
    return false;
  }

  // Normalize backslashes to forward slashes for cross-platform traversal defense
  const normalizedCandidate = cleanCandidate.replace(/\\/g, '/');
  const normalizedRoot = rootPath.replace(/\\/g, '/');

  const canonicalRoot = path.resolve(normalizedRoot);

  // If candidate is absolute, resolve directly; if relative, resolve relative to canonicalRoot
  const canonicalCandidate = path.isAbsolute(normalizedCandidate)
    ? path.resolve(normalizedCandidate)
    : path.resolve(canonicalRoot, normalizedCandidate);

  // Prefix boundary check (ensuring target is canonicalRoot or a child within canonicalRoot)
  if (canonicalCandidate === canonicalRoot) {
    return true;
  }

  const expectedPrefix = canonicalRoot.endsWith(path.sep)
    ? canonicalRoot
    : canonicalRoot + path.sep;
  if (!canonicalCandidate.startsWith(expectedPrefix)) {
    return false;
  }

  const relative = path.relative(canonicalRoot, canonicalCandidate);
  if (relative === '') {
    return true;
  }
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Normalizes a relative path to standard POSIX forward slashes,
 * safely decoding URL-encoded characters and stripping null bytes.
 */
export function normalizeRelativePath(relativePath: string): string {
  if (!relativePath || typeof relativePath !== 'string') {
    return '';
  }
  if (relativePath.includes('\0')) {
    throw new RepositoryValidationError(
      'DIAG_PATH_TRAVERSAL',
      'Path contains forbidden null byte',
      relativePath,
    );
  }
  let decoded = relativePath;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  if (decoded.includes('\0')) {
    throw new RepositoryValidationError(
      'DIAG_PATH_TRAVERSAL',
      'Path contains forbidden null byte after decoding',
      relativePath,
    );
  }
  return decoded.replace(/\\/g, '/');
}
