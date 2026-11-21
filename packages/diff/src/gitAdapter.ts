import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { Result } from '@falcon/domain';
import { err, ok } from '@falcon/domain';
import type {
  ChangedFileEntry,
  FileChangeStatus,
  GitAdapter,
  GitAdapterOptions,
  GitError,
} from './types.js';

const execFileAsync = promisify(execFile);

/**
 * Validates a Git revision ref name, preventing flag / argument injection.
 */
export function validateGitRef(ref: string, fieldName = 'Git ref'): Result<string, GitError> {
  if (!ref || typeof ref !== 'string') {
    return err({ error: `${fieldName} cannot be empty` });
  }
  const trimmed = ref.trim();
  if (trimmed.startsWith('-')) {
    return err({ error: `${fieldName} cannot start with a hyphen: "${ref}"` });
  }
  if (/[\0\r\n\t]/.test(trimmed)) {
    return err({ error: `${fieldName} contains invalid control characters: "${ref}"` });
  }
  return ok(trimmed);
}

/**
 * Validates a repository-relative path, preventing argument injection or null-byte poisoning.
 */
export function validateGitPath(pathStr: string): Result<string, GitError> {
  if (!pathStr || typeof pathStr !== 'string') {
    return err({ error: 'File path cannot be empty' });
  }
  if (pathStr.includes('\0')) {
    return err({ error: 'File path contains null byte' });
  }
  const clean = pathStr.replace(/\\/g, '/').replace(/^\/+/, '');
  if (clean.startsWith('-')) {
    return err({ error: `File path cannot start with a hyphen: "${pathStr}"` });
  }
  return ok(clean);
}

/**
 * Parses git diff --name-status output into structured ChangedFileEntry objects.
 */
export function parseNameStatusOutput(rawOutput: string): readonly ChangedFileEntry[] {
  const lines = rawOutput.trim().split('\n');
  const entries: ChangedFileEntry[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const parts = trimmed.split('\t');
    const statusCode = parts[0] ?? '';

    if (statusCode.startsWith('R') && parts.length >= 3) {
      // Renamed: R100\toldPath\tnewPath
      const similarityStr = statusCode.substring(1);
      const similarity = similarityStr ? parseInt(similarityStr, 10) : undefined;
      const oldPath = (parts[1] ?? '').replace(/\\/g, '/');
      const newPath = (parts[2] ?? '').replace(/\\/g, '/');
      entries.push({
        path: newPath,
        oldPath,
        status: 'renamed',
        ...(similarity !== undefined ? { similarity } : {}),
      });
    } else if (statusCode.startsWith('C') && parts.length >= 3) {
      // Copied: C100\toldPath\tnewPath
      const similarityStr = statusCode.substring(1);
      const similarity = similarityStr ? parseInt(similarityStr, 10) : undefined;
      const oldPath = (parts[1] ?? '').replace(/\\/g, '/');
      const newPath = (parts[2] ?? '').replace(/\\/g, '/');
      entries.push({
        path: newPath,
        oldPath,
        status: 'copied',
        ...(similarity !== undefined ? { similarity } : {}),
      });
    } else if (parts.length >= 2) {
      const filePath = (parts[1] ?? '').replace(/\\/g, '/');
      let status: FileChangeStatus = 'modified';

      if (statusCode === 'A') {
        status = 'added';
      } else if (statusCode === 'D') {
        status = 'deleted';
      } else if (statusCode === 'M') {
        status = 'modified';
      }

      entries.push({
        path: filePath,
        status,
      });
    }
  }

  return entries;
}

/**
 * Native Git adapter executing Git CLI commands safely using argument arrays.
 */
export class NativeGitAdapter implements GitAdapter {
  private readonly repoRoot: string;
  private readonly timeoutMs: number;
  private readonly maxBuffer: number;

  constructor(options: GitAdapterOptions) {
    this.repoRoot = options.repoRoot;
    this.timeoutMs = options.timeoutMs ?? 10000;
    this.maxBuffer = options.maxBuffer ?? 10 * 1024 * 1024; // 10MB
  }

  private async runGit(args: readonly string[]): Promise<Result<string, GitError>> {
    try {
      const { stdout } = await execFileAsync('git', args as string[], {
        cwd: this.repoRoot,
        timeout: this.timeoutMs,
        maxBuffer: this.maxBuffer,
        encoding: 'utf8',
      });
      return ok(stdout);
    } catch (e: unknown) {
      const error = e as { message?: string; code?: number; stderr?: string };
      return err({
        error: error.stderr?.trim() || error.message || 'Unknown git execution error',
        ...(error.code !== undefined ? { exitCode: error.code } : {}),
      });
    }
  }

  async resolveRef(ref: string): Promise<Result<string, GitError>> {
    const validRef = validateGitRef(ref, 'Ref');
    if (!validRef.ok) return validRef;

    const res = await this.runGit([
      'rev-parse',
      '--verify',
      '--end-of-options',
      `${validRef.value}^{commit}`,
    ]);
    if (res.ok) {
      return ok(res.value.trim());
    }
    return res;
  }

  async diffNameStatus(
    baseRef: string,
    targetRef: string,
  ): Promise<Result<readonly ChangedFileEntry[], GitError>> {
    const validBase = validateGitRef(baseRef, 'Base ref');
    if (!validBase.ok) return validBase;

    const validTarget = validateGitRef(targetRef, 'Target ref');
    if (!validTarget.ok) return validTarget;

    const res = await this.runGit([
      'diff',
      '--name-status',
      '-M',
      '--end-of-options',
      validBase.value,
      validTarget.value,
      '--',
    ]);
    if (!res.ok) {
      return res;
    }
    return ok(parseNameStatusOutput(res.value));
  }

  async showFile(ref: string, relativePath: string): Promise<Result<string, GitError>> {
    const validRef = validateGitRef(ref, 'Ref');
    if (!validRef.ok) return validRef;

    const validPath = validateGitPath(relativePath);
    if (!validPath.ok) return validPath;

    const res = await this.runGit([
      'show',
      '--end-of-options',
      `${validRef.value}:${validPath.value}`,
    ]);
    return res;
  }

  async getCurrentBranch(): Promise<Result<string, GitError>> {
    const res = await this.runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (res.ok) {
      return ok(res.value.trim());
    }
    return res;
  }

  async getHeadSha(): Promise<Result<string, GitError>> {
    const res = await this.runGit(['rev-parse', 'HEAD']);
    if (res.ok) {
      return ok(res.value.trim());
    }
    return res;
  }

  async isGitRepository(): Promise<boolean> {
    const res = await this.runGit(['rev-parse', '--is-inside-work-tree']);
    return res.ok && res.value.trim() === 'true';
  }
}

/**
 * Creates a native git adapter for a repository.
 */
export function createGitAdapter(options: GitAdapterOptions): GitAdapter {
  return new NativeGitAdapter(options);
}

/**
 * In-memory Virtual Git Adapter for testing commit pairs and diffs hermetically.
 */
export interface VirtualCommit {
  readonly sha: string;
  readonly files: Readonly<Record<string, string>>;
}

export interface VirtualGitAdapterOptions {
  readonly commits: Readonly<Record<string, VirtualCommit>>;
  readonly currentBranch?: string | undefined;
  readonly headSha?: string | undefined;
}

export class VirtualGitAdapter implements GitAdapter {
  private readonly commits: Readonly<Record<string, VirtualCommit>>;
  private readonly currentBranch: string;
  private readonly headSha: string;

  constructor(options: VirtualGitAdapterOptions) {
    this.commits = options.commits;
    this.currentBranch = options.currentBranch ?? 'main';
    this.headSha = options.headSha ?? Object.keys(options.commits)[0] ?? 'head-sha';
  }

  async resolveRef(ref: string): Promise<Result<string, GitError>> {
    const valid = validateGitRef(ref, 'Ref');
    if (!valid.ok) return valid;
    const cleanRef = valid.value;

    if (cleanRef === 'HEAD') {
      return ok(this.headSha);
    }
    if (this.commits[cleanRef]) {
      return ok(this.commits[cleanRef].sha);
    }
    for (const commit of Object.values(this.commits)) {
      if (commit.sha === cleanRef || commit.sha.startsWith(cleanRef)) {
        return ok(commit.sha);
      }
    }
    return err({ error: `Ref not found: ${cleanRef}` });
  }

  async diffNameStatus(
    baseRef: string,
    targetRef: string,
  ): Promise<Result<readonly ChangedFileEntry[], GitError>> {
    const validBase = validateGitRef(baseRef, 'Base ref');
    if (!validBase.ok) return validBase;

    const validTarget = validateGitRef(targetRef, 'Target ref');
    if (!validTarget.ok) return validTarget;

    const baseCommit =
      this.commits[validBase.value] ??
      Object.values(this.commits).find((c) => c.sha === validBase.value);
    const targetCommit =
      this.commits[validTarget.value] ??
      Object.values(this.commits).find((c) => c.sha === validTarget.value);

    if (!baseCommit) {
      return err({ error: `Base commit ref '${validBase.value}' not found` });
    }
    if (!targetCommit) {
      return err({ error: `Target commit ref '${validTarget.value}' not found` });
    }

    const baseFiles = baseCommit.files;
    const targetFiles = targetCommit.files;

    const allPaths = new Set([...Object.keys(baseFiles), ...Object.keys(targetFiles)]);
    const entries: ChangedFileEntry[] = [];

    for (const p of allPaths) {
      const inBase = p in baseFiles;
      const inTarget = p in targetFiles;

      if (!inBase && inTarget) {
        entries.push({ path: p, status: 'added' });
      } else if (inBase && !inTarget) {
        entries.push({ path: p, status: 'deleted' });
      } else if (inBase && inTarget) {
        if (baseFiles[p] !== targetFiles[p]) {
          entries.push({ path: p, status: 'modified' });
        }
      }
    }

    return ok(entries);
  }

  async showFile(ref: string, relativePath: string): Promise<Result<string, GitError>> {
    const validRef = validateGitRef(ref, 'Ref');
    if (!validRef.ok) return validRef;

    const validPath = validateGitPath(relativePath);
    if (!validPath.ok) return validPath;

    const commit =
      this.commits[validRef.value] ??
      Object.values(this.commits).find((c) => c.sha === validRef.value);
    if (!commit) {
      return err({ error: `Commit ref '${validRef.value}' not found` });
    }
    const cleanPath = validPath.value;
    const content = commit.files[cleanPath];
    if (content === undefined) {
      return err({ error: `Path '${cleanPath}' does not exist in revision '${validRef.value}'` });
    }
    return ok(content);
  }

  async getCurrentBranch(): Promise<Result<string, GitError>> {
    return ok(this.currentBranch);
  }

  async getHeadSha(): Promise<Result<string, GitError>> {
    return ok(this.headSha);
  }

  async isGitRepository(): Promise<boolean> {
    return true;
  }
}

export function createVirtualGitAdapter(options: VirtualGitAdapterOptions): GitAdapter {
  return new VirtualGitAdapter(options);
}
