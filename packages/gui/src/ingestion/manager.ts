import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { scanRepository, validateRepositoryRoot } from '@falcon/repository';
import {
  createDependencyGraph,
  createFileNode,
  createNode,
  type DependencyGraph,
  type DependencyEdge,
} from '@falcon/graph';
import type { TestRecommendationReport } from '@falcon/domain';
import { analyzeImpact, type ImpactReport, recommendTests } from '@falcon/impact';
import { cloneOrUpdateGitHubRepository } from './github.js';
import type {
  IngestedRepositoryInfo,
  GraphSnapshotData,
  SerializableGraphNode,
  SerializableGraphEdge,
} from '../types.js';

const execFileAsync = promisify(execFile);

export class RepositoryManager {
  private currentRepoInfo: IngestedRepositoryInfo | null = null;
  private currentGraph: DependencyGraph | null = null;
  private currentGraphSnapshot: GraphSnapshotData | null = null;

  getCurrentRepo(): IngestedRepositoryInfo | null {
    return this.currentRepoInfo;
  }

  getGraphData(): GraphSnapshotData | null {
    return this.currentGraphSnapshot;
  }

  getGraph(): DependencyGraph | null {
    return this.currentGraph;
  }

  /**
   * Ingests a local repository by root path.
   */
  async ingestLocal(targetPath: string): Promise<IngestedRepositoryInfo> {
    const rootPath = path.resolve(targetPath);
    const validation = validateRepositoryRoot(rootPath);
    if (!validation.ok) {
      throw new Error(`Repository validation failed: ${validation.error.message}`);
    }

    const { rootPath: canonicalRoot, isGitRepo } = validation.value;
    let branch = 'main';
    let commitSha = 'local-draft';

    if (isGitRepo) {
      try {
        const { stdout: bOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
          cwd: canonicalRoot,
        });
        branch = bOut.trim();

        const { stdout: sOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
          cwd: canonicalRoot,
        });
        commitSha = sOut.trim().slice(0, 10);
      } catch {
        // fallback
      }
    }

    const inventory = await scanRepository({ rootPath: canonicalRoot });
    const repoName = path.basename(canonicalRoot);

    const info: IngestedRepositoryInfo = {
      id: `local-${repoName}-${Date.now()}`,
      name: repoName,
      source: 'local',
      rootPath: canonicalRoot,
      isGitRepo,
      branch,
      commitSha,
      ingestedAt: new Date().toISOString(),
      inventory,
      totalNodes: 0,
      totalEdges: 0,
    };

    this.currentRepoInfo = info;
    this.rebuildGraph();
    return this.currentRepoInfo;
  }

  /**
   * Ingests a GitHub repository by URL or shorthand ("owner/repo").
   */
  async ingestGitHub(
    url: string,
    branch?: string,
    depth?: number,
  ): Promise<IngestedRepositoryInfo> {
    const cloneResult = await cloneOrUpdateGitHubRepository({
      url,
      branch,
      depth,
    });

    if (!cloneResult.ok) {
      throw new Error(
        `GitHub ingestion error [${cloneResult.error.code}]: ${cloneResult.error.message}`,
      );
    }

    const {
      rootPath,
      owner,
      repo,
      cloneUrl,
      branch: resolvedBranch,
      commitSha,
    } = cloneResult.value;
    const inventory = await scanRepository({ rootPath });

    const info: IngestedRepositoryInfo = {
      id: `github-${owner}-${repo}`,
      name: `${owner}/${repo}`,
      source: 'github',
      url: cloneUrl,
      rootPath,
      isGitRepo: true,
      branch: resolvedBranch,
      commitSha: commitSha.slice(0, 10),
      ingestedAt: new Date().toISOString(),
      inventory,
      totalNodes: 0,
      totalEdges: 0,
    };

    this.currentRepoInfo = info;
    this.rebuildGraph();
    return this.currentRepoInfo;
  }

  /**
   * Rebuilds dependency graph based on discovered files and relationships.
   */
  private rebuildGraph(): void {
    if (!this.currentRepoInfo) return;

    const graph = createDependencyGraph();
    const inventory = this.currentRepoInfo.inventory;

    // 1. Add file nodes
    for (const file of inventory.files) {
      const fileNode = createFileNode(file.relativePath, file);
      graph.addNode(fileNode);
    }

    // 2. Discover static file-level relations
    const filePaths = new Set(inventory.files.map((f) => f.relativePath));

    for (const file of inventory.files) {
      const mainSymbolId = `${file.relativePath}#default`;
      graph.addNode(
        createNode({
          id: mainSymbolId,
          kind: 'symbol',
          name: path.basename(file.relativePath, path.extname(file.relativePath)),
          filePath: file.relativePath,
        }),
      );

      // Link symbol to file
      const refEdge: DependencyEdge = {
        id: `edge-${mainSymbolId}-to-${file.relativePath}`,
        snapshotId: 'snap-1',
        sourceSymbolId: mainSymbolId,
        targetSymbolId: file.relativePath,
        type: 'REFERENCES',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: file.relativePath, line: 1 },
      };
      graph.addEdge(refEdge);
    }

    // Connect common parent/child or sibling packages in monorepo/modules
    for (const file of inventory.files) {
      const dir = path.dirname(file.relativePath);
      if (dir && dir !== '.') {
        const potentialIndex = path.join(dir, 'index.ts');
        if (potentialIndex !== file.relativePath && filePaths.has(potentialIndex)) {
          const importEdge: DependencyEdge = {
            id: `edge-${file.relativePath}-imports-${potentialIndex}`,
            snapshotId: 'snap-1',
            sourceSymbolId: file.relativePath,
            targetSymbolId: potentialIndex,
            type: 'IMPORTS_MODULE',
            resolutionStatus: 'resolved',
            confidence: 'inferred',
            evidence: { file: file.relativePath, line: 1 },
          };
          graph.addEdge(importEdge);
        }
      }
    }

    this.currentGraph = graph;

    // Build serializable representation for the web client
    const serializableNodes: SerializableGraphNode[] = [];
    for (const node of graph.getNodes()) {
      serializableNodes.push({
        id: node.id,
        label: node.kind === 'file' ? node.filePath : node.name,
        kind: node.kind,
        filePath: node.filePath,
      });
    }

    const serializableEdges: SerializableGraphEdge[] = [];
    for (const edge of graph.getEdges()) {
      serializableEdges.push({
        id: edge.id,
        source: edge.sourceSymbolId,
        target: edge.targetSymbolId,
        type: edge.type,
        confidence: edge.confidence,
      });
    }

    const cycles = graph.findCycles();

    this.currentGraphSnapshot = {
      nodes: serializableNodes,
      edges: serializableEdges,
      hasCycle: graph.hasCycle(),
      cyclesCount: cycles.length,
    };

    // Update counts on repo info
    this.currentRepoInfo = {
      ...this.currentRepoInfo,
      totalNodes: serializableNodes.length,
      totalEdges: serializableEdges.length,
    };
  }

  /**
   * Executes change impact analysis on the current repository graph.
   */
  runImpactAnalysis(changedFiles: readonly string[], maxDepth?: number): ImpactReport {
    if (!this.currentGraph) {
      throw new Error('No active repository graph loaded.');
    }

    const report = analyzeImpact({
      graph: this.currentGraph,
      changedFilePaths: changedFiles,
      ...(maxDepth !== undefined ? { maxDepth } : {}),
    });

    return report;
  }

  /**
   * Recommends relevant unit/integration tests for changed files with evidence levels.
   */
  recommendTests(
    changedFiles: readonly string[],
    coverageContent?: string | Record<string, unknown>,
    maxTests?: number,
  ): TestRecommendationReport {
    if (!this.currentGraph) {
      throw new Error('No active repository graph loaded.');
    }

    return recommendTests({
      graph: this.currentGraph,
      changedFiles,
      coverage: coverageContent,
      maxTests,
    });
  }
}
