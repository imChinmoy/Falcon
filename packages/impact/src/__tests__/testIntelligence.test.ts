import { describe, it, expect } from 'vitest';
import {
  isTestFile,
  discoverTestFiles,
  extractBaseNameFromTestFile,
  inferSourceFileCandidates,
  inferTestFilesFromSource,
} from '../testIntelligence/discovery.js';
import {
  parseLcovCoverage,
  parseJsonCoverage,
  detectCoverageGaps,
} from '../testIntelligence/coverage.js';
import { buildTestMappings } from '../testIntelligence/mapping.js';
import { recommendTests } from '../testIntelligence/recommendation.js';
import { createDependencyGraph, createFileNode, createNode } from '@falcon/graph';

describe('Test Intelligence Engine', () => {
  describe('Test File Discovery & Naming Conventions', () => {
    it('identifies test files based on naming patterns and directories', () => {
      expect(isTestFile('src/auth.test.ts')).toBe(true);
      expect(isTestFile('src/auth.spec.tsx')).toBe(true);
      expect(isTestFile('src/__tests__/user.ts')).toBe(true);
      expect(isTestFile('tests/payment.ts')).toBe(true);
      expect(isTestFile('test/calculator.js')).toBe(true);
      expect(isTestFile('src/auth.ts')).toBe(false);
      expect(isTestFile('src/components/Button.tsx')).toBe(false);
    });

    it('filters discovered test files from inventory list', () => {
      const files = [
        'src/auth.ts',
        'src/__tests__/auth.test.ts',
        'src/user.ts',
        'src/user.spec.ts',
        'README.md',
      ];
      const discovered = discoverTestFiles(files);
      expect(discovered).toEqual(['src/__tests__/auth.test.ts', 'src/user.spec.ts']);
    });

    it('extracts source base names from test file paths', () => {
      expect(extractBaseNameFromTestFile('src/__tests__/auth.test.ts')).toBe('src/auth');
      expect(extractBaseNameFromTestFile('src/user.spec.ts')).toBe('src/user');
      expect(extractBaseNameFromTestFile('tests/calculator.test.ts')).toBe('calculator');
    });

    it('infers candidate source files from test files', () => {
      const candidates = inferSourceFileCandidates('src/__tests__/auth.test.ts');
      expect(candidates).toContain('src/auth.ts');
    });

    it('infers candidate test files from source files', () => {
      const candidates = inferTestFilesFromSource('src/auth.ts');
      expect(candidates).toContain('src/auth.test.ts');
      expect(candidates).toContain('src/__tests__/auth.test.ts');
    });
  });

  describe('Coverage Ingestion', () => {
    it('parses standard LCOV coverage format', () => {
      const lcov = `
TN:auth.test.ts
SF:src/auth.ts
DA:1,1
DA:2,1
DA:3,0
DA:4,1
LF:4
LH:3
end_of_record
SF:src/payment.ts
DA:10,0
DA:11,0
LF:2
LH:0
end_of_record
`;
      const report = parseLcovCoverage(lcov);
      expect(report.size).toBe(2);

      const authCov = report.get('src/auth.ts');
      expect(authCov).toBeDefined();
      expect(authCov?.coveredLines.has(1)).toBe(true);
      expect(authCov?.uncoveredLines.has(3)).toBe(true);
      expect(authCov?.totalLinesFound).toBe(4);
      expect(authCov?.totalLinesHit).toBe(3);
      expect(authCov?.testNames).toEqual(['auth.test.ts']);
    });

    it('parses JSON format coverage reports', () => {
      const jsonCoverage = JSON.stringify({
        'src/calculator.ts': {
          coveredLines: [10, 11, 12],
          uncoveredLines: [15],
        },
      });

      const report = parseJsonCoverage(jsonCoverage);
      const calcCov = report.get('src/calculator.ts');
      expect(calcCov).toBeDefined();
      expect(calcCov?.coveredLines.has(10)).toBe(true);
      expect(calcCov?.uncoveredLines.has(15)).toBe(true);
    });

    it('detects coverage gaps for changed files and unexecuted lines', () => {
      const lcov = `
SF:src/auth.ts
DA:1,1
DA:2,0
DA:3,0
LF:3
LH:1
end_of_record
SF:src/zero.ts
DA:1,0
DA:2,0
LF:2
LH:0
end_of_record
`;
      const report = parseLcovCoverage(lcov);

      // Changed lines 2 and 3 in auth.ts
      const changedLinesMap = new Map<string, readonly number[]>([['src/auth.ts', [2, 3]]]);

      const gaps = detectCoverageGaps(
        report,
        ['src/auth.ts', 'src/zero.ts', 'src/untracked.ts'],
        changedLinesMap,
      );

      expect(gaps.length).toBe(3);
      // Gap 1: changed lines not executed in auth.ts
      expect(gaps[0]?.filePath).toBe('src/auth.ts');
      expect(gaps[0]?.unexecutedLines).toEqual([2, 3]);

      // Gap 2: 0% coverage in zero.ts
      expect(gaps[1]?.filePath).toBe('src/zero.ts');

      // Gap 3: completely missing coverage in untracked.ts
      expect(gaps[2]?.filePath).toBe('src/untracked.ts');
    });
  });

  describe('Static Test Mapping & Recommendation Engine', () => {
    it('creates test recommendations with direct_import and confirmed confidence', () => {
      const graph = createDependencyGraph();

      // Nodes
      graph.addNode(createFileNode('src/math.ts'));
      graph.addNode(
        createNode({ id: 'src/math.ts#add', name: 'add', kind: 'symbol', filePath: 'src/math.ts' }),
      );

      graph.addNode(createFileNode('src/__tests__/math.test.ts'));
      graph.addNode(
        createNode({
          id: 'src/__tests__/math.test.ts#testAdd',
          name: 'testAdd',
          kind: 'symbol',
          filePath: 'src/__tests__/math.test.ts',
        }),
      );

      // Test imports math.ts
      graph.addEdge({
        id: 'edge-test-to-math',
        snapshotId: 'snap-1',
        sourceSymbolId: 'src/__tests__/math.test.ts',
        targetSymbolId: 'src/math.ts',
        type: 'IMPORTS_MODULE',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/__tests__/math.test.ts', line: 1 },
      });

      const mappings = buildTestMappings({ graph });
      expect(mappings.length).toBeGreaterThan(0);

      const report = recommendTests({
        graph,
        changedFiles: ['src/math.ts'],
      });

      expect(report.recommendedTests.length).toBe(1);
      const rec = report.recommendedTests[0];
      expect(rec?.testFile).toBe('src/__tests__/math.test.ts');
      expect(rec?.evidenceLevel).toBe('direct_import');
      expect(rec?.confidence).toBe('confirmed');
      expect(rec?.distance).toBe(1);
      expect(report.missingMappings.length).toBe(0);
    });

    it('creates transitive recommendations when a dependent of changed file is tested', () => {
      const graph = createDependencyGraph();

      // A (changed) <- B (dependent) <- B.test.ts (test)
      graph.addNode(createFileNode('src/core.ts'));
      graph.addNode(createFileNode('src/service.ts'));
      graph.addNode(createFileNode('src/__tests__/service.test.ts'));

      // service imports core
      graph.addEdge({
        id: 'e1',
        snapshotId: 's1',
        sourceSymbolId: 'src/service.ts',
        targetSymbolId: 'src/core.ts',
        type: 'IMPORTS_MODULE',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/service.ts', line: 1 },
      });

      // service.test imports service
      graph.addEdge({
        id: 'e2',
        snapshotId: 's1',
        sourceSymbolId: 'src/__tests__/service.test.ts',
        targetSymbolId: 'src/service.ts',
        type: 'IMPORTS_MODULE',
        resolutionStatus: 'resolved',
        confidence: 'confirmed',
        evidence: { file: 'src/__tests__/service.test.ts', line: 1 },
      });

      const report = recommendTests({
        graph,
        changedFiles: ['src/core.ts'],
      });

      expect(report.recommendedTests.length).toBeGreaterThan(0);
      const transRec = report.recommendedTests.find(
        (r) => r.testFile === 'src/__tests__/service.test.ts',
      );
      expect(transRec).toBeDefined();
      expect(transRec?.evidenceLevel).toBe('transitive_dependency');
      expect(transRec?.confidence).toBe('inferred');
      expect(transRec?.distance).toBeGreaterThan(1);
    });

    it('falls back to co-located naming convention when static edge is absent', () => {
      const graph = createDependencyGraph();

      graph.addNode(createFileNode('src/auth.ts'));
      graph.addNode(createFileNode('src/auth.test.ts'));

      // No explicit edge between them in graph!
      const report = recommendTests({
        graph,
        changedFiles: ['src/auth.ts'],
      });

      expect(report.recommendedTests.length).toBe(1);
      const rec = report.recommendedTests[0];
      expect(rec?.testFile).toBe('src/auth.test.ts');
      expect(rec?.evidenceLevel).toBe('naming_convention');
      expect(rec?.confidence).toBe('heuristic');
    });

    it('flags test_mapping_missing when changed file has no mapped tests', () => {
      const graph = createDependencyGraph();
      graph.addNode(createFileNode('src/legacy.ts'));

      const report = recommendTests({
        graph,
        changedFiles: ['src/legacy.ts'],
      });

      expect(report.recommendedTests.length).toBe(0);
      expect(report.missingMappings).toContain('src/legacy.ts');
      expect(report.statistics.missingMappingsCount).toBe(1);
    });

    it('integrates coverage-derived evidence level', () => {
      const graph = createDependencyGraph();
      graph.addNode(createFileNode('src/helper.ts'));
      graph.addNode(createFileNode('tests/helper.test.ts'));

      const lcov = `
TN:tests/helper.test.ts
SF:src/helper.ts
DA:5,10
DA:6,10
LF:2
LH:2
end_of_record
`;
      const report = recommendTests({
        graph,
        changedFiles: ['src/helper.ts'],
        coverage: lcov,
      });

      expect(report.recommendedTests.length).toBeGreaterThan(0);
      const covRec = report.recommendedTests.find((r) => r.evidenceLevel === 'coverage');
      expect(covRec).toBeDefined();
      expect(covRec?.confidence).toBe('confirmed');
    });
  });
});
