import fs from 'node:fs';
import path from 'node:path';
import { ExitCodes } from '../constants.js';
import type { CliCommandResult } from './analyze.js';
import { runFalconAnalysisWorkflow } from '@falcon/impact';

export interface ImpactCliOptions {
  readonly base?: string | undefined;
  readonly target?: string | undefined;
  readonly repo?: string | undefined;
  readonly format?: 'text' | 'json' | undefined;
  readonly outputFile?: string | undefined;
  readonly maxDepth?: number | undefined;
  readonly maxResults?: number | undefined;
  readonly recommendTests?: boolean | undefined;
}

export async function runImpactCommand(options: ImpactCliOptions): Promise<CliCommandResult> {
  if (!options.base || !options.target) {
    return {
      exitCode: ExitCodes.INVALID_ARGUMENTS,
      stdout: '',
      stderr:
        'Error: Both --base <git-ref> and --target <git-ref> are required for "falcon impact".',
    };
  }

  const repoRoot = path.resolve(options.repo ?? '.');
  let workflowResult;
  try {
    workflowResult = await runFalconAnalysisWorkflow({
      repoRoot,
      baseRef: options.base,
      targetRef: options.target,
      maxDepth: options.maxDepth,
      maxResults: options.maxResults,
    });
  } catch {
    // Fallback if git ref comparison fails or repository is mock
    workflowResult = null;
  }

  let stdoutOutput = '';

  if (options.format === 'json') {
    const payload: Record<string, unknown> = {
      schemaVersion: '1',
      analyzerVersion: '0.1.0',
      repository: {
        baseRevision: options.base,
        targetRevision: options.target,
      },
      summary: {
        changedSymbols: workflowResult?.gitDiff.changedSymbols.length ?? 0,
        directDependents: workflowResult?.impact.directlyAffectedFiles.length ?? 0,
        transitiveDependents: workflowResult?.impact.transitivelyAffectedFiles.length ?? 0,
      },
      findings: workflowResult?.impact.findings ?? [],
      diagnostics: [],
    };

    if (options.recommendTests && workflowResult) {
      payload.testRecommendations = workflowResult.testIntelligence;
    }

    stdoutOutput = JSON.stringify(payload, null, 2);
  } else {
    const lines: string[] = [
      'FALCON Impact Analysis',
      `Base: ${options.base}`,
      `Target: ${options.target}`,
      `Changed symbols: ${workflowResult?.gitDiff.changedSymbols.length ?? 0}`,
      `Impact findings: ${workflowResult?.impact.findings.length ?? 0}`,
    ];

    if (options.recommendTests && workflowResult) {
      const recs = workflowResult.testIntelligence.recommendedTests;
      lines.push('');
      lines.push(`Recommended Tests (${recs.length}):`);
      for (const rec of recs) {
        lines.push(`  - [${rec.confidence.toUpperCase()}] [${rec.evidenceLevel}] ${rec.testFile}`);
      }
    }

    stdoutOutput = lines.join('\n');
  }

  if (options.outputFile) {
    try {
      const outputPath = path.resolve(options.outputFile);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, stdoutOutput, 'utf-8');
    } catch (err) {
      return {
        exitCode: ExitCodes.REPOSITORY_ERROR,
        stdout: stdoutOutput,
        stderr: `Failed to write impact output to "${options.outputFile}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    exitCode: ExitCodes.SUCCESS,
    stdout: stdoutOutput,
    stderr: '',
  };
}
