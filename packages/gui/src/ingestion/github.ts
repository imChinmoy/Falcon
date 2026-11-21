import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ok, err, type Result } from '@falcon/domain';

const execFileAsync = promisify(execFile);

export interface ParsedGitHubUrl {
  readonly owner: string;
  readonly repo: string;
  readonly cloneUrl: string;
  readonly webUrl: string;
}

export class GitHubIngestError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = 'GitHubIngestError';
    this.code = code;
  }
}

const SAFE_IDENTIFIER_REGEX = /^[a-zA-Z0-9][a-zA-Z0-9_.-]*$/;

/**
 * Validates that an identifier (owner, repo, branch) does not start with hyphens
 * or contain dangerous argument-injection characters.
 */
function isValidGitIdentifier(value: string): boolean {
  if (!value || value.startsWith('-') || value.startsWith('.')) {
    return false;
  }
  return SAFE_IDENTIFIER_REGEX.test(value);
}

/**
 * Parses and canonicalizes a GitHub repository specifier.
 * Accepts:
 *   - "owner/repo"
 *   - "https://github.com/owner/repo"
 *   - "https://github.com/owner/repo.git"
 *   - "git@github.com:owner/repo.git"
 *
 * Strictly rejects:
 *   - Protocols other than HTTPS / HTTP (e.g. file://, ssh://, git://)
 *   - Options / flags starting with "-" (argument injection defense)
 *   - Control characters and null bytes
 */
export function parseGitHubUrl(input: string): Result<ParsedGitHubUrl, GitHubIngestError> {
  const trimmed = input.trim();
  if (!trimmed) {
    return err(new GitHubIngestError('INVALID_URL', 'Repository specifier cannot be empty'));
  }

  // Reject control characters, newlines, and null bytes
  if (/[\0\r\n\t]/.test(trimmed)) {
    return err(
      new GitHubIngestError(
        'INVALID_SPECIFIER',
        'Repository specifier contains invalid control characters',
      ),
    );
  }

  // Reject strings starting with hyphens to defend against argument injection
  if (trimmed.startsWith('-')) {
    return err(
      new GitHubIngestError('INVALID_SPECIFIER', 'Repository specifier cannot start with a hyphen'),
    );
  }

  // Check owner/repo format e.g. "facebook/react"
  const shorthandMatch = /^([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)$/.exec(trimmed);
  if (shorthandMatch && shorthandMatch[1] && shorthandMatch[2]) {
    const owner = shorthandMatch[1];
    const repo = shorthandMatch[2].replace(/\.git$/, '');

    if (!isValidGitIdentifier(owner) || !isValidGitIdentifier(repo)) {
      return err(
        new GitHubIngestError(
          'INVALID_SPECIFIER',
          `Repository specifier contains invalid owner or repo name: "${owner}/${repo}"`,
        ),
      );
    }

    return ok({
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      webUrl: `https://github.com/${owner}/${repo}`,
    });
  }

  // Check SCP-like Git SSH syntax: git@github.com:owner/repo.git
  if (trimmed.startsWith('git@')) {
    const scpMatch = /^git@github\.com:([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+?)(\.git)?$/.exec(
      trimmed,
    );
    if (!scpMatch || !scpMatch[1] || !scpMatch[2]) {
      return err(
        new GitHubIngestError(
          'INVALID_SPECIFIER',
          'Only standard "git@github.com:owner/repo.git" format is supported for SSH URLs',
        ),
      );
    }
    const owner = scpMatch[1];
    const repo = scpMatch[2];
    if (!isValidGitIdentifier(owner) || !isValidGitIdentifier(repo)) {
      return err(
        new GitHubIngestError(
          'INVALID_SPECIFIER',
          `Repository specifier contains invalid owner or repo name: "${owner}/${repo}"`,
        ),
      );
    }
    return ok({
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      webUrl: `https://github.com/${owner}/${repo}`,
    });
  }

  // Check URL
  try {
    const url = new URL(trimmed);

    // Defense: strictly reject dangerous protocols like file://, ssh://, git://
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return err(
        new GitHubIngestError(
          'UNSUPPORTED_PROTOCOL',
          `Unsupported protocol: "${url.protocol}". Only HTTPS repositories are supported.`,
        ),
      );
    }

    // Defense: reject credentials starting with "-" (prevent argument injection)
    if (url.username.startsWith('-') || url.password.startsWith('-')) {
      return err(
        new GitHubIngestError('INVALID_URL', 'URL credentials cannot start with a hyphen'),
      );
    }

    if (url.hostname !== 'github.com' && !url.hostname.endsWith('.github.com')) {
      return err(
        new GitHubIngestError(
          'UNSUPPORTED_HOST',
          `Only github.com is supported for now: "${url.hostname}"`,
        ),
      );
    }

    const segments = url.pathname
      .replace(/^\/+/, '')
      .replace(/\.git$/, '')
      .split('/');
    if (segments.length < 2 || !segments[0] || !segments[1]) {
      return err(
        new GitHubIngestError(
          'INVALID_URL_PATH',
          `Invalid GitHub repository URL path: "${url.pathname}"`,
        ),
      );
    }

    const owner = segments[0];
    const repo = segments[1];

    if (!isValidGitIdentifier(owner) || !isValidGitIdentifier(repo)) {
      return err(
        new GitHubIngestError(
          'INVALID_URL_PATH',
          `Invalid GitHub repository owner or repo name: "${owner}/${repo}"`,
        ),
      );
    }

    return ok({
      owner,
      repo,
      cloneUrl: `https://github.com/${owner}/${repo}.git`,
      webUrl: `https://github.com/${owner}/${repo}`,
    });
  } catch (error) {
    if (error instanceof GitHubIngestError) {
      return err(error);
    }
    return err(
      new GitHubIngestError(
        'INVALID_SPECIFIER',
        `Could not parse "${input}" as a valid GitHub repository or owner/repo format`,
      ),
    );
  }
}

export interface CloneGitHubRepoOptions {
  readonly url: string;
  readonly branch?: string | undefined;
  readonly depth?: number | undefined;
  readonly baseStorageDir?: string | undefined;
}

export interface CloneGitHubRepoResult {
  readonly rootPath: string;
  readonly owner: string;
  readonly repo: string;
  readonly cloneUrl: string;
  readonly branch: string;
  readonly commitSha: string;
  readonly commitMessage: string;
}

/**
 * Clones or updates a GitHub repository safely into local managed storage.
 * Enforces argument array execution (no shell string interpolation).
 */
export async function cloneOrUpdateGitHubRepository(
  options: CloneGitHubRepoOptions,
): Promise<Result<CloneGitHubRepoResult, GitHubIngestError>> {
  const parsed = parseGitHubUrl(options.url);
  if (!parsed.ok) {
    return err(parsed.error);
  }

  const depth = options.depth ?? 1;
  if (!Number.isInteger(depth) || depth <= 0) {
    return err(new GitHubIngestError('INVALID_DEPTH', 'Clone depth must be a positive integer'));
  }

  const branch = options.branch;
  if (branch !== undefined) {
    if (!branch || branch.startsWith('-') || /[\s\0\r\n]/.test(branch)) {
      return err(
        new GitHubIngestError(
          'INVALID_BRANCH',
          `Invalid or malicious branch name specified: "${branch}"`,
        ),
      );
    }
  }

  const { owner, repo, cloneUrl } = parsed.value;
  const storageRoot = options.baseStorageDir ?? path.join(os.homedir(), '.falcon', 'ingested');
  const targetDir = path.join(storageRoot, `${owner}__${repo}`);

  try {
    await fs.promises.mkdir(storageRoot, { recursive: true });
  } catch (error) {
    return err(
      new GitHubIngestError(
        'DIR_CREATE_FAILED',
        `Failed to create storage directory "${storageRoot}": ${error instanceof Error ? error.message : String(error)}`,
      ),
    );
  }

  const exists = fs.existsSync(targetDir) && fs.existsSync(path.join(targetDir, '.git'));

  if (exists) {
    // Repository already exists: fetch latest
    try {
      if (branch) {
        await execFileAsync('git', ['fetch', '--depth', String(depth), '--', 'origin', branch], {
          cwd: targetDir,
          timeout: 60000,
        });
        await execFileAsync('git', ['checkout', '--', branch], {
          cwd: targetDir,
          timeout: 30000,
        });
      } else {
        await execFileAsync('git', ['fetch', '--depth', String(depth), '--', 'origin'], {
          cwd: targetDir,
          timeout: 60000,
        });
      }
    } catch (error) {
      return err(
        new GitHubIngestError(
          'GIT_FETCH_FAILED',
          `Failed to update existing clone at "${targetDir}": ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  } else {
    // Clone new repository with positional argument boundary (--)
    const cloneArgs = ['clone', '--depth', String(depth)];
    if (branch) {
      cloneArgs.push('--branch', branch);
    }
    // Defense: "--" separator prevents positional URLs or directories from being interpreted as options
    cloneArgs.push('--', cloneUrl, targetDir);

    try {
      await execFileAsync('git', cloneArgs, { timeout: 120000 });
    } catch (error) {
      return err(
        new GitHubIngestError(
          'GIT_CLONE_FAILED',
          `Failed to clone "${cloneUrl}": ${error instanceof Error ? error.message : String(error)}`,
        ),
      );
    }
  }

  // Extract commit SHA, branch name, and commit message
  let commitSha = 'unknown';
  let resolvedBranch = branch ?? 'main';
  let commitMessage = '';

  try {
    const { stdout: shaOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: targetDir,
    });
    commitSha = shaOut.trim();

    const { stdout: branchOut } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      {
        cwd: targetDir,
      },
    );
    resolvedBranch = branchOut.trim();

    const { stdout: msgOut } = await execFileAsync('git', ['log', '-1', '--pretty=%B'], {
      cwd: targetDir,
    });
    commitMessage = msgOut.trim().split('\n')[0] ?? '';
  } catch {
    // Non-fatal if metadata command fails
  }

  return ok({
    rootPath: targetDir,
    owner,
    repo,
    cloneUrl,
    branch: resolvedBranch,
    commitSha,
    commitMessage,
  });
}
