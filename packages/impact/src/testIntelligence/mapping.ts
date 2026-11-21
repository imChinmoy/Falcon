import type { TestMapping } from '@falcon/domain';
import type { DependencyGraph } from '@falcon/graph';
import { isTestFile, inferSourceFileCandidates, inferTestFilesFromSource } from './discovery.js';
import type { ParsedCoverageReport } from './coverage.js';

export interface BuildTestMappingOptions {
  readonly graph: DependencyGraph;
  readonly allFiles?: readonly string[] | undefined;
  readonly coverage?: ParsedCoverageReport | undefined;
  readonly snapshotId?: string | undefined;
}

/**
 * Builds comprehensive mappings between test files/symbols and source files/symbols
 * combining static graph analysis, naming conventions, and optional coverage.
 */
export function buildTestMappings(options: BuildTestMappingOptions): TestMapping[] {
  const { graph, allFiles = [], coverage, snapshotId = 'snap-default' } = options;
  const mappings: TestMapping[] = [];
  const existingMappingKeys = new Set<string>();

  function addMapping(mapping: TestMapping): void {
    const key = `${mapping.testFilePath}->${mapping.sourceFilePath}:${mapping.sourceSymbolId ?? ''}:${mapping.evidenceLevel}`;
    if (!existingMappingKeys.has(key)) {
      existingMappingKeys.add(key);
      mappings.push(mapping);
    }
  }

  // Collect all known test files and source files
  const graphNodes = graph.getNodes();
  const allKnownFiles = new Set<string>(allFiles);
  for (const node of graphNodes) {
    if (node.filePath) {
      allKnownFiles.add(node.filePath.replace(/\\/g, '/'));
    }
  }

  const testFiles = new Set<string>();
  const sourceFiles = new Set<string>();

  for (const file of allKnownFiles) {
    if (isTestFile(file)) {
      testFiles.add(file);
    } else {
      sourceFiles.add(file);
    }
  }

  // 1. Static Graph Analysis: Test File / Symbol -> Source File / Symbol
  for (const testFile of testFiles) {
    // Check outgoing edges from test file node
    const testFileNode = graph.getNode(testFile);
    const testSymbolNodes = graph.findNodesByFile(testFile);

    const nodesToCheck = [...(testFileNode ? [testFileNode] : []), ...testSymbolNodes];

    for (const node of nodesToCheck) {
      const outgoingEdges = graph.getOutgoingEdges(node.id);
      for (const edge of outgoingEdges) {
        const targetNode = graph.getNode(edge.targetSymbolId);
        const targetFilePath = targetNode?.filePath ?? edge.targetSymbolId;
        const normalizedTarget = targetFilePath.replace(/\\/g, '/');

        // Ensure target is a source file (not another test file)
        if (
          sourceFiles.has(normalizedTarget) ||
          (!isTestFile(normalizedTarget) && normalizedTarget !== testFile)
        ) {
          const isDirect =
            edge.type === 'IMPORTS_MODULE' ||
            edge.type === 'IMPORTS_SYMBOL' ||
            edge.type === 'CALLS' ||
            edge.type === 'REFERENCES' ||
            edge.type === 'TESTS';

          if (isDirect) {
            addMapping({
              id: `map-${testFile}-to-${normalizedTarget}-${edge.id}`,
              snapshotId,
              testFilePath: testFile,
              testSymbolId: node.kind === 'symbol' ? node.id : undefined,
              testSymbolName: node.kind === 'symbol' ? node.name : undefined,
              sourceFilePath: normalizedTarget,
              sourceSymbolId: targetNode?.kind === 'symbol' ? targetNode.id : undefined,
              sourceSymbolName: targetNode?.kind === 'symbol' ? targetNode.name : undefined,
              evidenceLevel: 'direct_import',
              confidence: 'confirmed',
              line: edge.evidence?.line,
              column: edge.evidence?.column,
              notes: `Static edge ${edge.type} from test to source`,
            });
          }
        }
      }
    }
  }

  // 2. Co-located Naming Convention Heuristics
  for (const sourceFile of sourceFiles) {
    const candidateTests = inferTestFilesFromSource(sourceFile, testFiles);
    for (const testFile of candidateTests) {
      addMapping({
        id: `map-naming-${testFile}-to-${sourceFile}`,
        snapshotId,
        testFilePath: testFile,
        sourceFilePath: sourceFile,
        evidenceLevel: 'naming_convention',
        confidence: 'heuristic',
        notes: `Co-located naming convention heuristic: ${testFile} matches ${sourceFile}`,
      });
    }
  }

  // Also check reverse candidate deduction for test files with inferred source files
  for (const testFile of testFiles) {
    const candidateSources = inferSourceFileCandidates(testFile, sourceFiles);
    for (const sourceFile of candidateSources) {
      addMapping({
        id: `map-naming-${testFile}-to-${sourceFile}`,
        snapshotId,
        testFilePath: testFile,
        sourceFilePath: sourceFile,
        evidenceLevel: 'naming_convention',
        confidence: 'heuristic',
        notes: `Test file convention matches source file ${sourceFile}`,
      });
    }
  }

  // 3. Optional Coverage Ingestion Mappings
  if (coverage) {
    for (const [coveredFilePath, fileCoverage] of coverage.entries()) {
      const normalizedPath = coveredFilePath.replace(/\\/g, '/');
      if (fileCoverage.totalLinesHit > 0) {
        // If specific test names are recorded in the coverage report
        if (fileCoverage.testNames && fileCoverage.testNames.length > 0) {
          for (const testName of fileCoverage.testNames) {
            addMapping({
              id: `map-cov-${testName}-to-${normalizedPath}`,
              snapshotId,
              testFilePath: testName,
              sourceFilePath: normalizedPath,
              evidenceLevel: 'coverage',
              confidence: 'confirmed',
              notes: `Execution coverage: ${fileCoverage.totalLinesHit}/${fileCoverage.totalLinesFound} lines hit in ${normalizedPath}`,
            });
          }
        } else {
          // If coverage is file-level, map to any candidate test that covers this file
          const candidateTests = inferTestFilesFromSource(normalizedPath, testFiles);
          for (const candidateTest of candidateTests) {
            addMapping({
              id: `map-cov-${candidateTest}-to-${normalizedPath}`,
              snapshotId,
              testFilePath: candidateTest,
              sourceFilePath: normalizedPath,
              evidenceLevel: 'coverage',
              confidence: 'confirmed',
              notes: `Execution coverage: ${fileCoverage.totalLinesHit} lines executed in ${normalizedPath}`,
            });
          }
        }
      }
    }
  }

  return mappings;
}
