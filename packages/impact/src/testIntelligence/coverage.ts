import type { CoverageGap } from '@falcon/domain';

export interface FileCoverageData {
  readonly filePath: string;
  readonly coveredLines: Set<number>;
  readonly uncoveredLines: Set<number>;
  readonly totalLinesFound: number;
  readonly totalLinesHit: number;
  readonly testNames?: readonly string[] | undefined;
}

export type ParsedCoverageReport = Map<string, FileCoverageData>;

/**
 * Parses LCOV format coverage data into a structured coverage map.
 *
 * Supported LCOV tags:
 * - TN: Test Name (optional)
 * - SF: Source File path
 * - DA: <line_number>,<execution_count>[,<checksum>]
 * - LF: Lines Found
 * - LH: Lines Hit
 * - end_of_record
 */
export function parseLcovCoverage(lcovText: string): ParsedCoverageReport {
  const report: ParsedCoverageReport = new Map();
  const lines = lcovText.split(/\r?\n/);

  let currentFile: string | null = null;
  let currentTest: string | undefined = undefined;
  let coveredLines = new Set<number>();
  let uncoveredLines = new Set<number>();
  let linesFound = 0;
  let linesHit = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('TN:')) {
      const tn = trimmed.slice(3).trim();
      if (tn) currentTest = tn;
    } else if (trimmed.startsWith('SF:')) {
      currentFile = trimmed.slice(3).trim().replace(/\\/g, '/');
      coveredLines = new Set<number>();
      uncoveredLines = new Set<number>();
      linesFound = 0;
      linesHit = 0;
    } else if (trimmed.startsWith('DA:')) {
      const parts = trimmed.slice(3).split(',');
      const lineNum = parseInt(parts[0]?.trim() ?? '', 10);
      const hitCount = parseInt(parts[1]?.trim() ?? '', 10);
      if (!Number.isNaN(lineNum) && !Number.isNaN(hitCount)) {
        if (hitCount > 0) {
          coveredLines.add(lineNum);
        } else {
          uncoveredLines.add(lineNum);
        }
      }
    } else if (trimmed.startsWith('LF:')) {
      linesFound = parseInt(trimmed.slice(3).trim(), 10) || 0;
    } else if (trimmed.startsWith('LH:')) {
      linesHit = parseInt(trimmed.slice(3).trim(), 10) || 0;
    } else if (trimmed === 'end_of_record') {
      if (currentFile) {
        // If LF or LH weren't explicitly provided, infer from DA
        if (linesFound === 0) linesFound = coveredLines.size + uncoveredLines.size;
        if (linesHit === 0) linesHit = coveredLines.size;

        const existing = report.get(currentFile);
        if (existing) {
          // Merge line data
          for (const l of coveredLines) existing.coveredLines.add(l);
          for (const l of uncoveredLines) {
            if (!existing.coveredLines.has(l)) {
              existing.uncoveredLines.add(l);
            }
          }
        } else {
          report.set(currentFile, {
            filePath: currentFile,
            coveredLines,
            uncoveredLines,
            totalLinesFound: linesFound,
            totalLinesHit: linesHit,
            testNames: currentTest ? [currentTest] : undefined,
          });
        }
      }
      currentFile = null;
      currentTest = undefined;
    }
  }

  return report;
}

/**
 * Parses JSON format coverage reports (e.g. Istanbul / Vitest coverage-summary.json or coverage-final.json or custom maps).
 */
export function parseJsonCoverage(
  jsonInput: string | Record<string, unknown>,
): ParsedCoverageReport {
  const report: ParsedCoverageReport = new Map();
  const data = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;

  for (const [key, value] of Object.entries(data)) {
    if (!value || typeof value !== 'object') continue;
    const entry = value as Record<string, unknown>;
    const filePath = (typeof entry['path'] === 'string' ? entry['path'] : key).replace(/\\/g, '/');

    const coveredLines = new Set<number>();
    const uncoveredLines = new Set<number>();

    // Istanbul statementMap + s format
    if (entry['statementMap'] && entry['s'] && typeof entry['s'] === 'object') {
      const sMap = entry['statementMap'] as Record<string, { start?: { line?: number } }>;
      const sCounts = entry['s'] as Record<string, number>;
      for (const [stmtId, count] of Object.entries(sCounts)) {
        const stmt = sMap[stmtId];
        const line = stmt?.start?.line;
        if (line) {
          if (count > 0) {
            coveredLines.add(line);
          } else {
            uncoveredLines.add(line);
          }
        }
      }
    } else if (Array.isArray(entry['coveredLines'])) {
      // Direct array format
      for (const l of entry['coveredLines']) {
        if (typeof l === 'number') coveredLines.add(l);
      }
      if (Array.isArray(entry['uncoveredLines'])) {
        for (const l of entry['uncoveredLines']) {
          if (typeof l === 'number') uncoveredLines.add(l);
        }
      }
    }

    report.set(filePath, {
      filePath,
      coveredLines,
      uncoveredLines,
      totalLinesFound: coveredLines.size + uncoveredLines.size,
      totalLinesHit: coveredLines.size,
    });
  }

  return report;
}

/**
 * Ingests coverage data from either LCOV string or JSON format.
 */
export function ingestCoverage(content: string | Record<string, unknown>): ParsedCoverageReport {
  if (typeof content === 'string') {
    const trimmed = content.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      return parseJsonCoverage(trimmed);
    }
    return parseLcovCoverage(trimmed);
  }
  return parseJsonCoverage(content);
}

/**
 * Detects coverage gaps for changed files and changed lines.
 */
export function detectCoverageGaps(
  coverage: ParsedCoverageReport,
  changedFiles: readonly string[],
  changedLinesMap?: ReadonlyMap<string, readonly number[]>,
): CoverageGap[] {
  const gaps: CoverageGap[] = [];

  for (const changedFile of changedFiles) {
    const normalized = changedFile.replace(/\\/g, '/');
    const fileCoverage =
      coverage.get(normalized) ??
      Array.from(coverage.values()).find(
        (c) => c.filePath.endsWith(normalized) || normalized.endsWith(c.filePath),
      );

    if (!fileCoverage) {
      gaps.push({
        filePath: normalized,
        reason: `Changed file "${normalized}" has zero coverage data (no test execution recorded).`,
      });
      continue;
    }

    const changedLines = changedLinesMap?.get(normalized);
    if (changedLines && changedLines.length > 0) {
      const uncoveredChanged = changedLines.filter((l) => !fileCoverage.coveredLines.has(l));
      if (uncoveredChanged.length > 0) {
        gaps.push({
          filePath: normalized,
          unexecutedLines: uncoveredChanged,
          reason: `Changed lines [${uncoveredChanged.join(', ')}] in "${normalized}" were not executed by any test.`,
        });
      }
    } else if (fileCoverage.uncoveredLines.size > 0 && fileCoverage.totalLinesHit === 0) {
      gaps.push({
        filePath: normalized,
        unexecutedLines: Array.from(fileCoverage.uncoveredLines).sort((a, b) => a - b),
        reason: `Changed file "${normalized}" has 0% line coverage (${fileCoverage.totalLinesFound} lines found, 0 hit).`,
      });
    }
  }

  return gaps;
}
