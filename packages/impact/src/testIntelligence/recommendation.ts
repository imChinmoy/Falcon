import type {
  CoverageGap,
  Diagnostic,
  EvidenceLevel,
  TestMapping,
  TestRecommendation,
  TestRecommendationReport,
  TestRecommendationStatistics,
} from '@falcon/domain';
import type { DependencyGraph } from '@falcon/graph';
import { analyzeImpact } from '../engine.js';
import type { ImpactReport } from '../types.js';
import { confidenceRank } from '../confidence.js';
import { isTestFile, discoverTestFiles } from './discovery.js';
import { detectCoverageGaps, ingestCoverage, type ParsedCoverageReport } from './coverage.js';
import { buildTestMappings } from './mapping.js';

export interface TestRecommendationOptions {
  readonly graph: DependencyGraph;
  readonly changedFiles?: readonly string[] | undefined;
  readonly changedSymbolIds?: readonly string[] | undefined;
  readonly impactReport?: ImpactReport | undefined;
  readonly coverage?: string | Record<string, unknown> | ParsedCoverageReport | undefined;
  readonly changedLinesMap?: ReadonlyMap<string, readonly number[]> | undefined;
  readonly maxTests?: number | undefined;
  readonly analysisRunId?: string | undefined;
  readonly includeTransitive?: boolean | undefined;
}

/**
 * Weights for evidence levels to sort recommendations deterministically.
 */
const EVIDENCE_LEVEL_WEIGHT: Readonly<Record<EvidenceLevel, number>> = {
  direct_import: 4,
  coverage: 4,
  naming_convention: 3,
  transitive_dependency: 2,
};

/**
 * Test Recommendation Algorithm.
 *
 * Given changed files / symbols (from Git diff or Impact findings), traverses the
 * dependency graph and test mappings to select and prioritize tests to run, with
 * explainable reasons and evidence levels.
 *
 * Flags `test_mapping_missing` when changed symbols or affected files have no mapped tests.
 */
export function recommendTests(options: TestRecommendationOptions): TestRecommendationReport {
  const startTime = Date.now();
  const {
    graph,
    changedFiles = [],
    changedSymbolIds = [],
    coverage: coverageInput,
    changedLinesMap,
    maxTests = 100,
    analysisRunId = `test-rec-${Date.now()}`,
    includeTransitive = true,
  } = options;

  const diagnostics: Diagnostic[] = [];

  // Parse coverage if provided
  let parsedCoverage: ParsedCoverageReport | undefined;
  if (coverageInput) {
    if (coverageInput instanceof Map) {
      parsedCoverage = coverageInput;
    } else {
      try {
        parsedCoverage = ingestCoverage(coverageInput);
      } catch (err) {
        diagnostics.push({
          id: 'diag-cov-parse-err',
          severity: 'warning',
          code: 'DIAG_COVERAGE_PARSE_ERROR',
          message: `Failed to parse coverage data: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
    }
  }

  // 1. Identify all test files in the graph and workspace
  const allNodes = graph.getNodes();
  const allFilePaths = new Set<string>();
  for (const n of allNodes) {
    if (n.filePath) {
      allFilePaths.add(n.filePath.replace(/\\/g, '/'));
    }
  }
  for (const f of changedFiles) {
    allFilePaths.add(f.replace(/\\/g, '/'));
  }

  const testFiles = discoverTestFiles(Array.from(allFilePaths));
  const totalTestsEvaluated = testFiles.length;

  // 2. Build test mappings
  const testMappings = buildTestMappings({
    graph,
    allFiles: Array.from(allFilePaths),
    coverage: parsedCoverage,
    snapshotId: analysisRunId,
  });

  // Index mappings by source file path and source symbol ID
  const mappingsBySourceFile = new Map<string, TestMapping[]>();
  const mappingsBySourceSymbol = new Map<string, TestMapping[]>();

  for (const m of testMappings) {
    const fileKey = m.sourceFilePath.replace(/\\/g, '/');
    if (!mappingsBySourceFile.has(fileKey)) {
      mappingsBySourceFile.set(fileKey, []);
    }
    mappingsBySourceFile.get(fileKey)!.push(m);

    if (m.sourceSymbolId) {
      if (!mappingsBySourceSymbol.has(m.sourceSymbolId)) {
        mappingsBySourceSymbol.set(m.sourceSymbolId, []);
      }
      mappingsBySourceSymbol.get(m.sourceSymbolId)!.push(m);
    }
  }

  // 3. Resolve changed files & symbols
  const directChangedFiles = new Set<string>(changedFiles.map((f) => f.replace(/\\/g, '/')));
  const directChangedSymbols = new Set<string>(changedSymbolIds);

  for (const symId of directChangedSymbols) {
    const node = graph.getNode(symId);
    if (node?.filePath) {
      directChangedFiles.add(node.filePath.replace(/\\/g, '/'));
    }
  }

  // 4. Run or use Impact Analysis to discover transitive dependents
  const impact =
    options.impactReport ??
    analyzeImpact({
      graph,
      changedFilePaths: Array.from(directChangedFiles),
      changedSymbolIds: Array.from(directChangedSymbols),
      analysisRunId,
    });

  // Track recommendations: testFile -> TestRecommendation
  const recommendationsMap = new Map<string, TestRecommendation>();

  function registerRecommendation(rec: TestRecommendation): void {
    const existing = recommendationsMap.get(rec.testFile);
    if (!existing) {
      recommendationsMap.set(rec.testFile, rec);
      return;
    }

    // Keep the higher priority / closer / higher evidence recommendation
    const existingWeight =
      EVIDENCE_LEVEL_WEIGHT[existing.evidenceLevel] * 10 -
      existing.distance * 2 +
      confidenceRank(existing.confidence);
    const newWeight =
      EVIDENCE_LEVEL_WEIGHT[rec.evidenceLevel] * 10 -
      rec.distance * 2 +
      confidenceRank(rec.confidence);

    if (newWeight > existingWeight) {
      recommendationsMap.set(rec.testFile, rec);
    } else if (existingWeight === newWeight && rec.distance < existing.distance) {
      recommendationsMap.set(rec.testFile, rec);
    }
  }

  // Track which changed files / symbols have at least one test recommendation
  const coveredChangedFiles = new Set<string>();
  const coveredChangedSymbols = new Set<string>();

  // 5. Direct Recommendations for directly changed files and symbols (Distance = 1)
  for (const changedFile of directChangedFiles) {
    const directMappings = mappingsBySourceFile.get(changedFile) ?? [];

    for (const m of directMappings) {
      coveredChangedFiles.add(changedFile);
      if (m.sourceSymbolId) {
        coveredChangedSymbols.add(m.sourceSymbolId);
      }

      let priority: 'high' | 'medium' | 'low' = 'high';
      if (m.evidenceLevel === 'naming_convention') {
        priority = 'medium';
      }

      let reason = `Test directly relates to changed file "${changedFile}" via ${m.evidenceLevel.replace('_', ' ')}.`;
      if (m.evidenceLevel === 'direct_import') {
        reason = `Test directly imports or executes changed file "${changedFile}".`;
      } else if (m.evidenceLevel === 'coverage') {
        reason = `Test execution coverage confirms coverage of changed file "${changedFile}".`;
      } else if (m.evidenceLevel === 'naming_convention') {
        reason = `Co-located test matches naming convention for changed file "${changedFile}".`;
      }

      registerRecommendation({
        testFile: m.testFilePath,
        testSymbols: m.testSymbolName ? [m.testSymbolName] : undefined,
        targetChangedFile: changedFile,
        targetSymbol: m.sourceSymbolName ?? m.sourceSymbolId,
        evidenceLevel: m.evidenceLevel,
        confidence: m.confidence,
        distance: 1,
        reason,
        priority,
      });
    }

    // Check direct symbol mappings for symbols in this file
    const fileSymbols = graph.findNodesByFile(changedFile);
    for (const sym of fileSymbols) {
      const symMappings = mappingsBySourceSymbol.get(sym.id) ?? [];
      for (const m of symMappings) {
        coveredChangedSymbols.add(sym.id);
        coveredChangedFiles.add(changedFile);
        registerRecommendation({
          testFile: m.testFilePath,
          testSymbols: m.testSymbolName ? [m.testSymbolName] : undefined,
          targetChangedFile: changedFile,
          targetSymbol: sym.name,
          evidenceLevel: m.evidenceLevel,
          confidence: m.confidence,
          distance: 1,
          reason: `Test directly targets changed symbol "${sym.name}" in "${changedFile}".`,
          priority: 'high',
        });
      }
    }
  }

  // 6. Transitive Recommendations via Impact Traversal (Distance > 1)
  if (includeTransitive) {
    // A: Transitively affected files
    for (const affectedFile of impact.directlyAffectedFiles) {
      const fileMappings = mappingsBySourceFile.get(affectedFile.filePath) ?? [];
      for (const m of fileMappings) {
        registerRecommendation({
          testFile: m.testFilePath,
          testSymbols: m.testSymbolName ? [m.testSymbolName] : undefined,
          targetChangedFile: affectedFile.filePath,
          targetSymbol: m.sourceSymbolName,
          evidenceLevel: 'transitive_dependency',
          confidence: 'inferred',
          distance: affectedFile.distance + 1,
          reason: `Test tests dependent file "${affectedFile.filePath}" directly affected by the change.`,
          priority: 'medium',
        });
      }
    }

    for (const affectedFile of impact.transitivelyAffectedFiles) {
      const fileMappings = mappingsBySourceFile.get(affectedFile.filePath) ?? [];
      for (const m of fileMappings) {
        registerRecommendation({
          testFile: m.testFilePath,
          testSymbols: m.testSymbolName ? [m.testSymbolName] : undefined,
          targetChangedFile: affectedFile.filePath,
          targetSymbol: m.sourceSymbolName,
          evidenceLevel: 'transitive_dependency',
          confidence: 'inferred',
          distance: affectedFile.distance + 1,
          reason: `Test tests transitively impacted file "${affectedFile.filePath}" (${affectedFile.distance} hops away).`,
          priority: 'low',
        });
      }
    }

    // B: Transitively affected symbols
    for (const finding of impact.findings) {
      const affectedSymbolNode = graph.getNode(finding.affectedSymbolId);
      if (affectedSymbolNode?.filePath && isTestFile(affectedSymbolNode.filePath)) {
        // The affected node IS a test file or test symbol in the graph!
        const dist = finding.path.length;
        registerRecommendation({
          testFile: affectedSymbolNode.filePath,
          testSymbols: affectedSymbolNode.kind === 'symbol' ? [affectedSymbolNode.name] : undefined,
          targetChangedFile: finding.changedSymbolId,
          targetSymbol: finding.affectedSymbolId,
          evidenceLevel: dist === 1 ? 'direct_import' : 'transitive_dependency',
          confidence: finding.confidence,
          distance: dist,
          reason: `Test dependency path in graph: ${finding.reason}`,
          priority: dist === 1 ? 'high' : dist === 2 ? 'medium' : 'low',
        });
      }
    }
  }

  // 7. Sort recommendations
  const allRecommendations = Array.from(recommendationsMap.values());
  allRecommendations.sort((a, b) => {
    // 1. Distance ascending
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    // 2. Evidence level weight descending
    const weightDiff =
      EVIDENCE_LEVEL_WEIGHT[b.evidenceLevel] - EVIDENCE_LEVEL_WEIGHT[a.evidenceLevel];
    if (weightDiff !== 0) {
      return weightDiff;
    }
    // 3. Confidence rank descending
    const confDiff = confidenceRank(b.confidence) - confidenceRank(a.confidence);
    if (confDiff !== 0) {
      return confDiff;
    }
    // 4. Stable alphabetical sort
    return a.testFile.localeCompare(b.testFile);
  });

  const cappedRecommendations = allRecommendations.slice(0, maxTests);

  // 8. Missing Mappings: Identify changed files/symbols with no test recommendations
  const missingMappings: string[] = [];
  for (const changedFile of directChangedFiles) {
    if (!coveredChangedFiles.has(changedFile)) {
      missingMappings.push(changedFile);
    }
  }
  for (const symId of directChangedSymbols) {
    if (!coveredChangedSymbols.has(symId)) {
      missingMappings.push(symId);
    }
  }

  // 9. Coverage Gaps: Detect gaps if coverage is available
  let coverageGaps: CoverageGap[] = [];
  if (parsedCoverage) {
    coverageGaps = detectCoverageGaps(
      parsedCoverage,
      Array.from(directChangedFiles),
      changedLinesMap,
    );
  }

  // 10. Compute Statistics
  let directTestCount = 0;
  let transitiveTestCount = 0;
  let namingHeuristicCount = 0;
  let coverageDerivedCount = 0;

  for (const rec of cappedRecommendations) {
    if (rec.evidenceLevel === 'direct_import') directTestCount++;
    else if (rec.evidenceLevel === 'transitive_dependency') transitiveTestCount++;
    else if (rec.evidenceLevel === 'naming_convention') namingHeuristicCount++;
    else if (rec.evidenceLevel === 'coverage') coverageDerivedCount++;
  }

  const statistics: TestRecommendationStatistics = {
    totalRecommendations: cappedRecommendations.length,
    directTestCount,
    transitiveTestCount,
    namingHeuristicCount,
    coverageDerivedCount,
    missingMappingsCount: missingMappings.length,
    executionTimeMs: Date.now() - startTime,
  };

  return {
    analysisRunId,
    recommendedTests: cappedRecommendations,
    totalTestsEvaluated,
    coverageGaps,
    missingMappings,
    statistics,
    diagnostics: diagnostics.length > 0 ? diagnostics : undefined,
  };
}
