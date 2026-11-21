import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runFalconAnalysisWorkflow } from '../workflow.js';
import { VirtualGitAdapter } from '@falcon/diff';

describe('Falcon End-to-End Analysis Workflow', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'falcon-workflow-test-'));

    // Create a mock Git repository structure
    await fs.promises.mkdir(path.join(tempDir, '.git'));
    await fs.promises.mkdir(path.join(tempDir, 'src/__tests__'), { recursive: true });

    // File 1: Base math utility
    await fs.promises.writeFile(
      path.join(tempDir, 'src/math.ts'),
      `export function add(a: number, b: number): number {
  return a + b;
}

export function subtract(a: number, b: number): number {
  return a - b;
}
`,
    );

    // File 2: Calculator service importing math
    await fs.promises.writeFile(
      path.join(tempDir, 'src/calculator.ts'),
      `import { add } from './math.js';

export function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => add(sum, item), 0);
}
`,
    );

    // File 3: Unit test importing calculator
    await fs.promises.writeFile(
      path.join(tempDir, 'src/__tests__/calculator.test.ts'),
      `import { calculateTotal } from '../calculator.js';

export function testCalculate() {
  return calculateTotal([1, 2, 3]) === 6;
}
`,
    );

    // File 4: Co-located test for math
    await fs.promises.writeFile(
      path.join(tempDir, 'src/__tests__/math.test.ts'),
      `import { add } from '../math.js';

export function testAdd() {
  return add(2, 3) === 5;
}
`,
    );

    // File 5: Untested service
    await fs.promises.writeFile(
      path.join(tempDir, 'src/untested.ts'),
      `export function orphanFunction() {
  return "no test for me";
}
`,
    );
  });

  afterEach(async () => {
    await fs.promises.rm(tempDir, { recursive: true, force: true });
  });

  it('runs complete 6-phase pipeline end-to-end and outputs test recommendations', async () => {
    // Set up mock virtual git adapter simulating a change to src/math.ts
    const gitAdapter = new VirtualGitAdapter({
      commits: {
        'HEAD~1': {
          sha: 'commit-base-sha',
          files: {
            'src/math.ts': 'export function add(a: number, b: number): number { return a + b; }\n',
          },
        },
        HEAD: {
          sha: 'commit-target-sha',
          files: {
            'src/math.ts':
              'export function add(a: number, b: number): number { return a + b + 0; }\n',
          },
        },
      },
    });

    const result = await runFalconAnalysisWorkflow({
      repoRoot: tempDir,
      baseRef: 'HEAD~1',
      targetRef: 'HEAD',
      gitAdapter,
    });

    // 1. Repo Scan verification
    expect(result.repository.rootPath).toBe(path.resolve(tempDir));
    expect(result.repository.totalFiles).toBeGreaterThanOrEqual(5);
    expect(result.repository.testFiles).toBe(2);

    // 2. AST Parse & 3. Graph Build verification
    expect(result.graph.totalNodes).toBeGreaterThan(5);
    expect(result.graph.totalEdges).toBeGreaterThan(0);

    // 4. Git Diff verification
    expect(result.gitDiff.changedFiles).toContain('src/math.ts');

    // 5. Impact Traversal verification
    // Modifying math.ts affects calculator.ts
    expect(result.impact).toBeDefined();
    const affectedFilePaths = result.impact.directlyAffectedFiles.map((f) => f.filePath);
    expect(affectedFilePaths).toContain('src/calculator.ts');

    // 6. Test Intelligence Recommendation verification
    const recReport = result.testIntelligence;
    expect(recReport).toBeDefined();
    expect(recReport.totalTestsEvaluated).toBe(2);
    expect(recReport.recommendedTests.length).toBeGreaterThan(0);

    // Direct test for math.ts
    const directMathTest = recReport.recommendedTests.find((t) =>
      t.testFile.includes('math.test.ts'),
    );
    expect(directMathTest).toBeDefined();
    expect(directMathTest?.evidenceLevel).toBe('direct_import');
    expect(directMathTest?.confidence).toBe('confirmed');
    expect(directMathTest?.distance).toBe(1);

    // Transitive test for calculator.ts (which depends on math.ts)
    const transitiveCalcTest = recReport.recommendedTests.find((t) =>
      t.testFile.includes('calculator.test.ts'),
    );
    expect(transitiveCalcTest).toBeDefined();
    expect(transitiveCalcTest?.evidenceLevel).toBe('transitive_dependency');
    expect(transitiveCalcTest?.confidence).toBe('inferred');

    // Statistics verification
    expect(recReport.statistics.totalRecommendations).toBeGreaterThanOrEqual(2);
    expect(recReport.statistics.directTestCount).toBeGreaterThanOrEqual(1);
    expect(recReport.statistics.transitiveTestCount).toBeGreaterThanOrEqual(1);
  });

  it('detects missing test mappings and coverage gaps in workflow', async () => {
    const lcov = `
SF:src/untested.ts
DA:1,0
LF:1
LH:0
end_of_record
`;

    const result = await runFalconAnalysisWorkflow({
      repoRoot: tempDir,
      changedFiles: ['src/untested.ts'],
      coverage: lcov,
    });

    const recReport = result.testIntelligence;
    expect(recReport.missingMappings).toContain('src/untested.ts');
    expect(recReport.statistics.missingMappingsCount).toBe(1);

    // Coverage gap detected
    expect(recReport.coverageGaps.length).toBeGreaterThan(0);
    expect(recReport.coverageGaps[0]?.filePath).toBe('src/untested.ts');
  });
});
