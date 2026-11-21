import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { parseGitHubUrl, cloneOrUpdateGitHubRepository } from '../ingestion/github.js';
import { createGuiServer, MAX_BODY_SIZE_BYTES } from '../server.js';

describe('Security & Hardening Regression Test Suite', () => {
  describe('Subprocess & Command Execution Safety (GitHub & Git Ingestion)', () => {
    it('rejects Git argument injection via repo shorthand starting with hyphens', () => {
      const res1 = parseGitHubUrl('--upload-pack=cat/repo');
      expect(res1.ok).toBe(false);

      const res2 = parseGitHubUrl('-oProxyCommand=calc/repo');
      expect(res2.ok).toBe(false);

      const res3 = parseGitHubUrl('owner/--upload-pack');
      expect(res3.ok).toBe(false);
    });

    it('rejects malicious or unsupported protocols (file://, ssh://, ftp://)', () => {
      const fileRes = parseGitHubUrl('file:///etc/passwd');
      expect(fileRes.ok).toBe(false);
      if (!fileRes.ok) {
        expect(fileRes.error.code).toBe('UNSUPPORTED_PROTOCOL');
      }

      const sshRes = parseGitHubUrl('ssh://-oProxyCommand=id@github.com/foo/bar');
      expect(sshRes.ok).toBe(false);
      if (!sshRes.ok) {
        expect(sshRes.error.code).toBe('UNSUPPORTED_PROTOCOL');
      }

      const ftpRes = parseGitHubUrl('ftp://github.com/foo/bar');
      expect(ftpRes.ok).toBe(false);
      if (!ftpRes.ok) {
        expect(ftpRes.error.code).toBe('UNSUPPORTED_PROTOCOL');
      }
    });

    it('rejects URLs with malicious credentials or control characters', () => {
      const credRes = parseGitHubUrl('https://--upload-pack:secret@github.com/foo/bar');
      expect(credRes.ok).toBe(false);

      const nullByteRes = parseGitHubUrl('https://github.com/foo\0/bar');
      expect(nullByteRes.ok).toBe(false);
    });

    it('rejects malicious branch names starting with hyphens in cloneOrUpdateGitHubRepository', async () => {
      const res = await cloneOrUpdateGitHubRepository({
        url: 'facebook/react',
        branch: '--upload-pack=touch /tmp/pwned',
      });
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error.code).toBe('INVALID_BRANCH');
      }
    });
  });

  describe('HTTP Server Hardening (Headers, DoS limits, Traversal Bounds)', () => {
    let tempDir: string;
    let server: http.Server;
    let port: number;
    let baseUrl: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falcon-sec-server-'));
      await fs.promises.mkdir(path.join(tempDir, '.git'));
      await fs.promises.writeFile(path.join(tempDir, 'safe.ts'), 'export const hello = "world";');

      const gui = createGuiServer({ initialRepoPath: tempDir });
      server = gui.server;

      await new Promise<void>((resolve) => {
        server.listen(0, '127.0.0.1', () => {
          const addr = server.address();
          if (typeof addr === 'object' && addr !== null) {
            port = addr.port;
            baseUrl = `http://127.0.0.1:${port}`;
          }
          resolve();
        });
      });
    });

    afterEach(async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    it('enforces security headers on HTTP responses', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      expect(res.status).toBe(200);

      expect(res.headers.get('x-content-type-options')).toBe('nosniff');
      expect(res.headers.get('x-frame-options')).toBe('DENY');
      expect(res.headers.get('referrer-policy')).toBe('no-referrer');
      expect(res.headers.get('content-security-policy')).toContain("default-src 'self'");
    });

    it('rejects oversized JSON request body (DoS defense)', async () => {
      const status = await new Promise<number>((resolve, reject) => {
        const req = http.request(
          `${baseUrl}/api/ingest/local`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': String(MAX_BODY_SIZE_BYTES + 1024),
            },
          },
          (res) => {
            resolve(res.statusCode ?? 0);
          },
        );
        req.on('error', reject);
        req.end();
      });

      expect(status).toBe(413);
    });

    it('rejects malformed JSON body with HTTP 400', async () => {
      const res = await fetch(`${baseUrl}/api/ingest/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ invalid json ',
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as { code: string; error: string };
      expect(json.code).toBe('INVALID_JSON');
    });

    it('denies reading files outside ingested repo via /api/repository/file (403 Forbidden)', async () => {
      await fetch(`${baseUrl}/api/ingest/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tempDir }),
      });

      // Standard traversal
      const res1 = await fetch(`${baseUrl}/api/repository/file?path=../../etc/passwd`);
      expect(res1.status).toBe(403);

      // URL-encoded traversal
      const res2 = await fetch(`${baseUrl}/api/repository/file?path=%2e%2e%2f%2e%2e%2fetc/passwd`);
      expect(res2.status).toBe(403);

      // Null byte injection
      const res3 = await fetch(`${baseUrl}/api/repository/file?path=safe.ts%00../../etc/passwd`);
      expect(res3.status).toBe(403);
    });

    it('denies editing files outside ingested repo via /api/repository/file/edit (403 Forbidden)', async () => {
      await fetch(`${baseUrl}/api/ingest/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tempDir }),
      });

      const res = await fetch(`${baseUrl}/api/repository/file/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: '../../outside.txt',
          content: 'malicious write',
        }),
      });

      expect(res.status).toBe(403);
    });

    it('prevents directory traversal when serving static assets', async () => {
      const res = await fetch(`${baseUrl}/..%2f..%2fpackage.json`);
      // Should either be 403 Forbidden or 404 (not found in public directory)
      expect([403, 404]).toContain(res.status);
    });

    it('sanitizes internal errors and does not leak stack traces', async () => {
      // Sending request with missing repository or triggering error handler
      const res = await fetch(`${baseUrl}/api/impact/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changedFiles: [] }),
      });

      expect(res.status).toBe(400);
      const json = (await res.json()) as { error: string; stack?: string };
      expect(json.stack).toBeUndefined();
    });
  });
});
