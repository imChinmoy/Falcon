import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import http from 'node:http';
import { parseGitHubUrl } from '../ingestion/github.js';
import { RepositoryManager } from '../ingestion/manager.js';
import { createGuiServer } from '../server.js';

describe('Falcon GUI & Ingestion Engine', () => {
  describe('GitHub URL Parser', () => {
    it('parses owner/repo shorthand correctly', () => {
      const result = parseGitHubUrl('expressjs/express');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.owner).toBe('expressjs');
      expect(result.value.repo).toBe('express');
      expect(result.value.cloneUrl).toBe('https://github.com/expressjs/express.git');
      expect(result.value.webUrl).toBe('https://github.com/expressjs/express');
    });

    it('parses https github URL correctly', () => {
      const result = parseGitHubUrl('https://github.com/facebook/react.git');
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.value.owner).toBe('facebook');
      expect(result.value.repo).toBe('react');
    });

    it('rejects empty input or invalid format', () => {
      const resEmpty = parseGitHubUrl('');
      expect(resEmpty.ok).toBe(false);

      const resInvalid = parseGitHubUrl('https://notgithub.com/foo/bar');
      expect(resInvalid.ok).toBe(false);
      if (resInvalid.ok) return;
      expect(resInvalid.error.code).toBe('UNSUPPORTED_HOST');
    });
  });

  describe('RepositoryManager & Local Ingestion', () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falcon-gui-test-'));
      await fs.promises.mkdir(path.join(tempDir, '.git'));
      await fs.promises.mkdir(path.join(tempDir, 'src'), { recursive: true });
      await fs.promises.writeFile(path.join(tempDir, 'src/math.ts'), 'export const add = 1;');
      await fs.promises.writeFile(path.join(tempDir, 'src/index.ts'), 'import "./math.js";');
    });

    afterEach(async () => {
      await fs.promises.rm(tempDir, { recursive: true, force: true });
    });

    it('ingests a local repository and builds dependency graph snapshot', async () => {
      const manager = new RepositoryManager();
      const repoInfo = await manager.ingestLocal(tempDir);

      expect(repoInfo.rootPath).toBe(tempDir);
      expect(repoInfo.isGitRepo).toBe(true);
      expect(repoInfo.inventory.files.length).toBe(2);
      expect(repoInfo.totalNodes).toBeGreaterThan(0);

      const graphData = manager.getGraphData();
      expect(graphData).not.toBeNull();
      if (!graphData) return;
      expect(graphData.nodes.length).toBeGreaterThan(0);
      expect(graphData.hasCycle).toBe(false);
    });

    it('runs impact traversal on ingested local repository', async () => {
      const manager = new RepositoryManager();
      await manager.ingestLocal(tempDir);

      const report = manager.runImpactAnalysis(['src/index.ts']);
      expect(report).toBeDefined();
      expect(report.statistics).toBeDefined();
    });
  });

  describe('GUI HTTP Server Endpoints', () => {
    let tempDir: string;
    let server: http.Server;
    let port: number;
    let baseUrl: string;

    beforeEach(async () => {
      tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falcon-server-test-'));
      await fs.promises.mkdir(path.join(tempDir, '.git'));
      await fs.promises.writeFile(path.join(tempDir, 'index.ts'), 'export const app = true;');

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

    it('serves /api/status endpoint', async () => {
      const res = await fetch(`${baseUrl}/api/status`);
      expect(res.status).toBe(200);
      const data = (await res.json()) as { status: string; version: string };
      expect(data.status).toBe('online');
      expect(data.version).toBe('0.1.0');
    });

    it('serves static html for root /', async () => {
      const res = await fetch(`${baseUrl}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain('FALCON');
      expect(html).toContain('apple-window');
    });

    it('reads file content via /api/repository/file', async () => {
      await fetch(`${baseUrl}/api/ingest/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tempDir }),
      });

      const res = await fetch(`${baseUrl}/api/repository/file?path=index.ts`);
      expect(res.status).toBe(200);
      const fileData = (await res.json()) as { content: string; language: string };
      expect(fileData.content).toBe('export const app = true;');
      expect(fileData.language).toBe('typescript');
    });

    it('edits file content via /api/repository/file/edit', async () => {
      await fetch(`${baseUrl}/api/ingest/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tempDir }),
      });

      const editRes = await fetch(`${baseUrl}/api/repository/file/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: 'index.ts',
          find: 'true',
          replace: 'false',
        }),
      });

      expect(editRes.status).toBe(200);
      const editData = (await editRes.json()) as { success: boolean };
      expect(editData.success).toBe(true);

      const diskContent = await fs.promises.readFile(path.join(tempDir, 'index.ts'), 'utf-8');
      expect(diskContent).toBe('export const app = false;');
    });

    it('returns test recommendations via /api/test-intelligence/recommend and /api/impact/analyze', async () => {
      await fetch(`${baseUrl}/api/ingest/local`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: tempDir }),
      });

      // Impact analysis with test recommendations attached
      const impactRes = await fetch(`${baseUrl}/api/impact/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changedFiles: ['index.ts'] }),
      });

      expect(impactRes.status).toBe(200);
      const impactData = (await impactRes.json()) as {
        testRecommendations?: { totalTestsEvaluated: number; recommendedTests: unknown[] };
      };
      expect(impactData.testRecommendations).toBeDefined();

      // Test intelligence recommendation endpoint
      const recRes = await fetch(`${baseUrl}/api/test-intelligence/recommend`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ changedFiles: ['index.ts'] }),
      });

      expect(recRes.status).toBe(200);
      const recData = (await recRes.json()) as {
        analysisRunId: string;
        recommendedTests: unknown[];
        statistics: { totalRecommendations: number };
      };
      expect(recData.analysisRunId).toBeDefined();
      expect(recData.statistics).toBeDefined();
    });
  });
});
