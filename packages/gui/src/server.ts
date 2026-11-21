import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RepositoryManager } from './ingestion/manager.js';
import {
  readSourceFile,
  writeSourceFile,
  editSourceFile,
  isPathWithinRoot,
} from '@falcon/repository';
import type { GuiServerOptions } from './types.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const MAX_BODY_SIZE_BYTES = 10 * 1024 * 1024; // 10MB limit

export const SECURITY_HEADERS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'",
};

export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function sendJson(res: http.ServerResponse, statusCode: number, data: unknown): void {
  const payload = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
    'Access-Control-Allow-Headers': 'Content-Type',
    ...SECURITY_HEADERS,
  });
  res.end(payload);
}

function sendText(res: http.ServerResponse, statusCode: number, text: string): void {
  res.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    ...SECURITY_HEADERS,
  });
  res.end(text);
}

export function parseJsonBody<T>(
  req: http.IncomingMessage,
  maxSizeBytes: number = MAX_BODY_SIZE_BYTES,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const contentLength = req.headers['content-length'];
    if (contentLength) {
      const length = parseInt(contentLength, 10);
      if (!Number.isNaN(length) && length > maxSizeBytes) {
        return reject(
          new HttpError(
            413,
            'PAYLOAD_TOO_LARGE',
            `Request body exceeds maximum allowed size of ${maxSizeBytes} bytes`,
          ),
        );
      }
    }

    let totalBytes = 0;
    const chunks: Buffer[] = [];

    const onData = (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes > maxSizeBytes) {
        req.off('data', onData);
        req.off('end', onEnd);
        req.off('error', onError);
        req.destroy();
        reject(
          new HttpError(
            413,
            'PAYLOAD_TOO_LARGE',
            `Request body exceeded maximum allowed size of ${maxSizeBytes} bytes`,
          ),
        );
      } else {
        chunks.push(chunk);
      }
    };

    const onEnd = () => {
      try {
        if (chunks.length === 0) {
          return resolve({} as T);
        }
        const raw = Buffer.concat(chunks).toString('utf-8').trim();
        if (!raw) {
          return resolve({} as T);
        }
        resolve(JSON.parse(raw) as T);
      } catch {
        reject(new HttpError(400, 'INVALID_JSON', 'Malformed JSON in request body'));
      }
    };

    const onError = (err: Error) => {
      reject(new HttpError(400, 'STREAM_ERROR', err.message));
    };

    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
  });
}

export function createGuiServer(options: GuiServerOptions = {}): {
  server: http.Server;
  manager: RepositoryManager;
} {
  const manager = new RepositoryManager();

  // Find public directory (works in dev or built dist)
  const candidateDirs = [
    path.join(__dirname, 'public'),
    path.join(__dirname, '../src/public'),
    path.join(__dirname, '../public'),
  ];
  let publicDir = candidateDirs[0]!;
  for (const candidate of candidateDirs) {
    if (fs.existsSync(candidate)) {
      publicDir = candidate;
      break;
    }
  }

  // Auto-ingest initial path if provided
  if (options.initialRepoPath) {
    manager.ingestLocal(options.initialRepoPath).catch((err) => {
      console.warn(
        `[Falcon GUI] Failed to auto-ingest initial repo "${options.initialRepoPath}":`,
        err.message,
      );
    });
  }

  const server = http.createServer(async (req, res) => {
    // Enforce base security headers on all responses
    for (const [header, val] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(header, val);
    }

    const parsedUrl = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
    const pathname = parsedUrl.pathname;
    const method = req.method ?? 'GET';

    if (method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS, DELETE',
        'Access-Control-Allow-Headers': 'Content-Type',
        ...SECURITY_HEADERS,
      });
      res.end();
      return;
    }

    // API Routes
    if (pathname.startsWith('/api/')) {
      try {
        // Status & active repo
        if (pathname === '/api/status' && method === 'GET') {
          sendJson(res, 200, {
            status: 'online',
            version: '0.1.0',
            activeRepo: manager.getCurrentRepo(),
          });
          return;
        }

        // GitHub Ingestion
        if (pathname === '/api/ingest/github' && method === 'POST') {
          interface GitHubBody {
            url?: string;
            branch?: string;
            depth?: number;
          }
          const body = await parseJsonBody<GitHubBody>(req);
          if (!body.url) {
            sendJson(res, 400, { error: 'Repository "url" or "owner/repo" is required.' });
            return;
          }

          const repoInfo = await manager.ingestGitHub(body.url, body.branch, body.depth);
          sendJson(res, 200, {
            success: true,
            message: `Successfully ingested GitHub repository ${repoInfo.name}`,
            repo: repoInfo,
          });
          return;
        }

        // Local Ingestion
        if (pathname === '/api/ingest/local' && method === 'POST') {
          interface LocalBody {
            path?: string;
          }
          const body = await parseJsonBody<LocalBody>(req);
          const targetPath = body.path || process.cwd();
          const repoInfo = await manager.ingestLocal(targetPath);
          sendJson(res, 200, {
            success: true,
            message: `Successfully ingested local repository ${repoInfo.name}`,
            repo: repoInfo,
          });
          return;
        }

        // Active repository inventory
        if (pathname === '/api/repository/files' && method === 'GET') {
          const repo = manager.getCurrentRepo();
          if (!repo) {
            sendJson(res, 404, { error: 'No repository currently ingested.' });
            return;
          }
          sendJson(res, 200, {
            files: repo.inventory.files,
            total: repo.inventory.files.length,
          });
          return;
        }

        // Read file content (Enforce repository root boundary check)
        if (pathname === '/api/repository/file' && method === 'GET') {
          const repo = manager.getCurrentRepo();
          if (!repo) {
            sendJson(res, 404, { error: 'No repository currently ingested.' });
            return;
          }
          const relativePath = parsedUrl.searchParams.get('path');
          if (!relativePath) {
            sendJson(res, 400, { error: 'Query parameter "path" is required.' });
            return;
          }

          // Strict traversal defense at endpoint layer
          if (
            relativePath.includes('\0') ||
            !isPathWithinRoot(repo.rootPath, path.resolve(repo.rootPath, relativePath))
          ) {
            sendJson(res, 403, {
              error: `Access denied: path "${relativePath}" escapes repository root`,
              code: 'DIAG_PATH_TRAVERSAL',
            });
            return;
          }

          const readResult = await readSourceFile({
            rootPath: repo.rootPath,
            relativePath,
          });

          if (!readResult.ok) {
            const isForbidden =
              readResult.error.code === 'DIAG_PATH_TRAVERSAL' ||
              readResult.error.code === 'DIAG_SYMLINK_ESCAPE';
            sendJson(res, isForbidden ? 403 : 400, {
              error: readResult.error.message,
              code: readResult.error.code,
            });
            return;
          }

          sendJson(res, 200, readResult.value);
          return;
        }

        // Edit file content (Enforce repository root boundary check)
        if (pathname === '/api/repository/file/edit' && method === 'POST') {
          const repo = manager.getCurrentRepo();
          if (!repo) {
            sendJson(res, 404, { error: 'No repository currently ingested.' });
            return;
          }

          interface EditBody {
            path?: string;
            content?: string;
            find?: string;
            replace?: string;
          }
          const body = await parseJsonBody<EditBody>(req);
          if (!body.path) {
            sendJson(res, 400, { error: 'Property "path" is required.' });
            return;
          }

          // Strict traversal defense at endpoint layer
          if (
            body.path.includes('\0') ||
            !isPathWithinRoot(repo.rootPath, path.resolve(repo.rootPath, body.path))
          ) {
            sendJson(res, 403, {
              error: `Access denied: path "${body.path}" escapes repository root`,
              code: 'DIAG_PATH_TRAVERSAL',
            });
            return;
          }

          if (body.content !== undefined) {
            // Overwrite with new content
            const writeResult = await writeSourceFile({
              rootPath: repo.rootPath,
              relativePath: body.path,
              content: body.content,
            });

            if (!writeResult.ok) {
              const isForbidden =
                writeResult.error.code === 'DIAG_PATH_TRAVERSAL' ||
                writeResult.error.code === 'DIAG_SYMLINK_ESCAPE';
              sendJson(res, isForbidden ? 403 : 400, {
                error: writeResult.error.message,
                code: writeResult.error.code,
              });
              return;
            }
            sendJson(res, 200, { success: true, updated: writeResult.value });
            return;
          }

          if (body.find !== undefined && body.replace !== undefined) {
            const editResult = await editSourceFile({
              rootPath: repo.rootPath,
              relativePath: body.path,
              find: body.find,
              replace: body.replace,
            });

            if (!editResult.ok) {
              const isForbidden =
                editResult.error.code === 'DIAG_PATH_TRAVERSAL' ||
                editResult.error.code === 'DIAG_SYMLINK_ESCAPE';
              sendJson(res, isForbidden ? 403 : 400, {
                error: editResult.error.message,
                code: editResult.error.code,
              });
              return;
            }
            sendJson(res, 200, { success: true, edited: editResult.value });
            return;
          }

          sendJson(res, 400, { error: 'Provide either "content" or "find" & "replace".' });
          return;
        }

        // Graph data
        if (pathname === '/api/graph' && method === 'GET') {
          const graphData = manager.getGraphData();
          if (!graphData) {
            sendJson(res, 404, { error: 'No graph currently generated.' });
            return;
          }
          sendJson(res, 200, graphData);
          return;
        }

        // Impact Analysis
        if (pathname === '/api/impact/analyze' && method === 'POST') {
          interface ImpactBody {
            changedFiles?: string[];
            maxDepth?: number;
          }
          const body = await parseJsonBody<ImpactBody>(req);
          const changedFiles = body.changedFiles ?? [];

          if (changedFiles.length === 0) {
            sendJson(res, 400, {
              error: 'At least one changed file is required in "changedFiles".',
            });
            return;
          }

          const report = manager.runImpactAnalysis(changedFiles, body.maxDepth);
          sendJson(res, 200, report);
          return;
        }

        sendJson(res, 404, { error: `Endpoint not found: ${method} ${pathname}` });
        return;
      } catch (error) {
        if (error instanceof HttpError) {
          sendJson(res, error.statusCode, {
            error: error.message,
            code: error.code,
          });
          return;
        }
        // Defense: never leak internal stack traces or environment variables to client
        sendJson(res, 500, {
          error: 'Internal Server Error',
        });
        return;
      }
    }

    // Static Asset Serving (enforce bounds within publicDir)
    const normalizedAssetPath = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    const candidatePath = path.resolve(publicDir, normalizedAssetPath);

    if (!isPathWithinRoot(publicDir, candidatePath)) {
      sendText(res, 403, 'Forbidden');
      return;
    }

    let filePath = candidatePath;

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(publicDir, 'index.html');
      if (!isPathWithinRoot(publicDir, filePath)) {
        sendText(res, 403, 'Forbidden');
        return;
      }
    }

    if (!fs.existsSync(filePath)) {
      sendText(res, 404, 'FALCON GUI Static Assets Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';

    try {
      const fileStream = fs.createReadStream(filePath);
      res.writeHead(200, { 'Content-Type': contentType });
      fileStream.pipe(res);
    } catch {
      sendText(res, 500, 'Internal Server Error loading asset');
    }
  });

  return { server, manager };
}

export async function startGuiServer(options: GuiServerOptions = {}): Promise<{
  server: http.Server;
  manager: RepositoryManager;
  port: number;
  url: string;
}> {
  const port = options.port ?? 4200;
  const host = options.host ?? 'localhost';
  const { server, manager } = createGuiServer(options);

  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      const url = `http://${host}:${port}`;
      resolve({ server, manager, port, url });
    });
    server.on('error', reject);
  });
}
