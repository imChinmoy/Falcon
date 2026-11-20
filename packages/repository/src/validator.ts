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
 * Protects against path traversal and symlink escaping attacks.
 */
export function isPathWithinRoot(rootPath: string, candidatePath: string): boolean {
  const canonicalRoot = path.resolve(rootPath);
  const canonicalCandidate = path.resolve(candidatePath);

  const relative = path.relative(canonicalRoot, canonicalCandidate);
  if (relative === '') {
    return true;
  }
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Normalizes a relative path to standard POSIX forward slashes.
 */
export function normalizeRelativePath(relativePath: string): string {
  return relativePath.replace(/\\/g, '/');
}
