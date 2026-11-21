import fs from 'node:fs';
import path from 'node:path';
import type { TestRecommendation } from '@falcon/domain';
import { ExitCodes } from '../constants.js';
import type { CliCommandResult } from './analyze.js';
import { runFalconAnalysisWorkflow } from '@falcon/impact';
import { validateRepositoryRoot } from '@falcon/repository';

export interface TestRecommendCliOptions {
  readonly repo?: string | undefined;
  readonly base?: string | undefined;
  readonly target?: string | undefined;
  readonly files?: readonly string[] | undefined;
  readonly coverage?: string | undefined;
  readonly format?: 'text' | 'json' | undefined;
  readonly outputFile?: string | undefined;
  readonly maxTests?: number | undefined;
}

export async function runTestRecommendCommand(
  options: TestRecommendCliOptions,
): Promise<CliCommandResult> {
  const repoRoot = path.resolve(options.repo ?? '.');
  const validation = validateRepositoryRoot(repoRoot);
  if (!validation.ok) {
    return {
      exitCode: ExitCodes.REPOSITORY_ERROR,
      stdout: '',
      stderr: `Repository validation error: ${validation.error.message}`,
    };
  }

  // Read coverage file if path provided
  let coverageContent: string | undefined;
  if (options.coverage) {
    try {
      const coveragePath = path.resolve(repoRoot, options.coverage);
      coverageContent = fs.readFileSync(coveragePath, 'utf-8');
    } catch (err) {
      return {
        exitCode: ExitCodes.REPOSITORY_ERROR,
        stdout: '',
        stderr: `Failed to read coverage file "${options.coverage}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  // Parse changed files if passed
  const changedFiles = options.files
    ? options.files.map((f) => f.trim()).filter(Boolean)
    : undefined;

  let workflowResult;
  try {
    workflowResult = await runFalconAnalysisWorkflow({
      repoRoot,
      baseRef: options.base,
      targetRef: options.target,
      changedFiles,
      coverage: coverageContent,
      maxTests: options.maxTests,
    });
  } catch (err) {
    return {
      exitCode: ExitCodes.INTERNAL_ERROR,
      stdout: '',
      stderr: `Test recommendation workflow failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const recReport = workflowResult.testIntelligence;
  let stdoutOutput = '';

  if (options.format === 'json') {
    stdoutOutput = JSON.stringify(
      {
        schemaVersion: '1',
        analyzerVersion: '0.1.0',
        repository: {
          rootPath: workflowResult.repository.rootPath,
          baseRevision: options.base,
          targetRevision: options.target,
        },
        report: recReport,
      },
      null,
      2,
    );
  } else {
    const lines: string[] = [];
    lines.push('FALCON Test Recommendations');
    lines.push(`Repository: ${workflowResult.repository.rootPath}`);
    if (options.base && options.target) {
      lines.push(`Revisions: ${options.base} -> ${options.target}`);
    }
    lines.push(`Discovered test files evaluated: ${recReport.totalTestsEvaluated}`);
    lines.push(`Recommended tests to run: ${recReport.recommendedTests.length}`);
    lines.push('');

    if (recReport.recommendedTests.length > 0) {
      lines.push('RECOMMENDED TESTS:');
      recReport.recommendedTests.forEach((t: TestRecommendation, i: number) => {
        const priorityTag = t.priority ? `[${t.priority.toUpperCase()}] ` : '';
        const confTag = `[${t.confidence.toUpperCase()}]`;
        const evidenceTag = `[${t.evidenceLevel}]`;
        lines.push(
          `  ${i + 1}. ${priorityTag}${confTag} ${evidenceTag} ${t.testFile} (distance: ${t.distance})`,
        );
        lines.push(
          `     Target: ${t.targetChangedFile}${t.targetSymbol ? ` (${t.targetSymbol})` : ''}`,
        );
        lines.push(`     Reason: ${t.reason}`);
      });
      lines.push('');
    } else {
      lines.push('No tests recommended for the specified changes.');
      lines.push('');
    }

    if (recReport.missingMappings.length > 0) {
      lines.push('MISSING TEST MAPPINGS (test_mapping_missing):');
      for (const m of recReport.missingMappings) {
        lines.push(`  - ${m}: No mapped unit or integration tests detected`);
      }
      lines.push('');
    }

    if (recReport.coverageGaps.length > 0) {
      lines.push('COVERAGE GAPS DETECTED:');
      for (const g of recReport.coverageGaps) {
        lines.push(`  - ${g.filePath}: ${g.reason}`);
      }
      lines.push('');
    }

    lines.push('STATISTICS:');
    lines.push(
      `  Total Recommendations: ${recReport.statistics.totalRecommendations} | Direct: ${recReport.statistics.directTestCount} | Transitive: ${recReport.statistics.transitiveTestCount} | Naming: ${recReport.statistics.namingHeuristicCount} | Coverage: ${recReport.statistics.coverageDerivedCount}`,
    );
    lines.push(`  Execution Time: ${recReport.statistics.executionTimeMs}ms`);

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
        stderr: `Failed to write test recommendations to "${options.outputFile}": ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  return {
    exitCode: ExitCodes.SUCCESS,
    stdout: stdoutOutput,
    stderr: '',
  };
}
