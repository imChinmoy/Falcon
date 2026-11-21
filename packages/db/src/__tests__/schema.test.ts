import { describe, it, expect } from 'vitest';
import { getTableName, getTableColumns } from 'drizzle-orm';
import {
  repositories,
  analysisSnapshots,
  sourceFiles,
  codeSymbols,
  dependencyEdges,
  impactRuns,
  impactFindings,
  diagnostics,
  repositoriesRelations,
  analysisSnapshotsRelations,
  sourceFilesRelations,
  codeSymbolsRelations,
  dependencyEdgesRelations,
  impactRunsRelations,
  impactFindingsRelations,
  diagnosticsRelations,
  testMappings,
  testMappingsRelations,
} from '../schema/index.js';
import { normalizeConnectionString } from '../migrate.js';

describe('@falcon/db schema definitions', () => {
  it('should define repositories table with expected columns and primary key', () => {
    expect(getTableName(repositories)).toBe('repositories');
    const cols = getTableColumns(repositories);

    expect(cols.id.primary).toBe(true);
    expect(cols.id.dataType).toBe('string');
    expect(cols.name.notNull).toBe(true);
    expect(cols.rootPath.notNull).toBe(true);
    expect(cols.remoteUrl.notNull).toBe(false);
    expect(cols.defaultBranch.default).toBe('main');
    expect(cols.createdAt).toBeDefined();
    expect(cols.updatedAt).toBeDefined();
  });

  it('should define analysisSnapshots table with expected columns and foreign key', () => {
    expect(getTableName(analysisSnapshots)).toBe('analysis_snapshots');
    const cols = getTableColumns(analysisSnapshots);

    expect(cols.id.primary).toBe(true);
    expect(cols.repositoryId.notNull).toBe(true);
    expect(cols.commitSha.notNull).toBe(false);
    expect(cols.branch.notNull).toBe(false);
    expect(cols.status.default).toBe('completed');
    expect(cols.createdAt).toBeDefined();
  });

  it('should define sourceFiles table with expected columns', () => {
    expect(getTableName(sourceFiles)).toBe('source_files');
    const cols = getTableColumns(sourceFiles);

    expect(cols.id.primary).toBe(true);
    expect(cols.snapshotId.notNull).toBe(true);
    expect(cols.relativePath.notNull).toBe(true);
    expect(cols.language.notNull).toBe(true);
    expect(cols.contentHash.notNull).toBe(true);
    expect(cols.sizeBytes.notNull).toBe(true);
    expect(cols.parseStatus.default).toBe('parsed');
  });

  it('should define codeSymbols table with expected columns', () => {
    expect(getTableName(codeSymbols)).toBe('code_symbols');
    const cols = getTableColumns(codeSymbols);

    expect(cols.id.primary).toBe(true);
    expect(cols.snapshotId.notNull).toBe(true);
    expect(cols.fileId.notNull).toBe(true);
    expect(cols.filePath.notNull).toBe(true);
    expect(cols.name.notNull).toBe(true);
    expect(cols.qualifiedName.notNull).toBe(true);
    expect(cols.kind.notNull).toBe(true);
    expect(cols.exported.default).toBe(false);
    expect(cols.signatureFingerprint.notNull).toBe(false);
    expect(cols.parentSymbolId.notNull).toBe(false);
    expect(cols.startLine.notNull).toBe(true);
    expect(cols.startColumn.notNull).toBe(true);
    expect(cols.endLine.notNull).toBe(true);
    expect(cols.endColumn.notNull).toBe(true);
  });

  it('should define dependencyEdges table with expected columns', () => {
    expect(getTableName(dependencyEdges)).toBe('dependency_edges');
    const cols = getTableColumns(dependencyEdges);

    expect(cols.id.primary).toBe(true);
    expect(cols.snapshotId.notNull).toBe(true);
    expect(cols.sourceSymbolId.notNull).toBe(true);
    expect(cols.targetSymbolId.notNull).toBe(true);
    expect(cols.type.notNull).toBe(true);
    expect(cols.resolutionStatus.notNull).toBe(true);
    expect(cols.confidence.notNull).toBe(true);
    expect(cols.evidenceFile.notNull).toBe(true);
    expect(cols.evidenceLine.notNull).toBe(true);
    expect(cols.evidenceColumn.notNull).toBe(false);
    expect(cols.evidenceSnippet.notNull).toBe(false);
    expect(cols.notes.notNull).toBe(false);
  });

  it('should define impactRuns and impactFindings tables with expected columns', () => {
    expect(getTableName(impactRuns)).toBe('impact_runs');
    const runCols = getTableColumns(impactRuns);
    expect(runCols.id.primary).toBe(true);
    expect(runCols.snapshotId.notNull).toBe(true);
    expect(runCols.baseRef.notNull).toBe(false);
    expect(runCols.targetRef.notNull).toBe(false);
    expect(runCols.totalAffectedFiles.default).toBe(0);
    expect(runCols.totalAffectedSymbols.default).toBe(0);

    expect(getTableName(impactFindings)).toBe('impact_findings');
    const findingCols = getTableColumns(impactFindings);
    expect(findingCols.id.primary).toBe(true);
    expect(findingCols.impactRunId.notNull).toBe(true);
    expect(findingCols.filePath.notNull).toBe(true);
    expect(findingCols.kind.notNull).toBe(true);
    expect(findingCols.distance.notNull).toBe(true);
    expect(findingCols.confidence.notNull).toBe(true);
    expect(findingCols.reason.notNull).toBe(true);
  });

  it('should define diagnostics table with expected columns', () => {
    expect(getTableName(diagnostics)).toBe('diagnostics');
    const cols = getTableColumns(diagnostics);

    expect(cols.id.primary).toBe(true);
    expect(cols.snapshotId.notNull).toBe(true);
    expect(cols.code.notNull).toBe(true);
    expect(cols.message.notNull).toBe(true);
    expect(cols.severity.notNull).toBe(true);
    expect(cols.filePath.notNull).toBe(false);
    expect(cols.line.notNull).toBe(false);
    expect(cols.column.notNull).toBe(false);
  });

  it('should properly export all relation definitions', () => {
    expect(repositoriesRelations).toBeDefined();
    expect(analysisSnapshotsRelations).toBeDefined();
    expect(sourceFilesRelations).toBeDefined();
    expect(codeSymbolsRelations).toBeDefined();
    expect(dependencyEdgesRelations).toBeDefined();
    expect(impactRunsRelations).toBeDefined();
    expect(impactFindingsRelations).toBeDefined();
    expect(diagnosticsRelations).toBeDefined();
    expect(testMappingsRelations).toBeDefined();
  });

  it('should define testMappings table with expected columns', () => {
    expect(getTableName(testMappings)).toBe('test_mappings');
    const cols = getTableColumns(testMappings);

    expect(cols.id.primary).toBe(true);
    expect(cols.snapshotId.notNull).toBe(true);
    expect(cols.testFilePath.notNull).toBe(true);
    expect(cols.testSymbolId.notNull).toBe(false);
    expect(cols.sourceFilePath.notNull).toBe(true);
    expect(cols.sourceSymbolId.notNull).toBe(false);
    expect(cols.evidenceLevel.notNull).toBe(true);
    expect(cols.confidence.notNull).toBe(true);
    expect(cols.line.notNull).toBe(false);
    expect(cols.notes.notNull).toBe(false);
  });
});

describe('normalizeConnectionString', () => {
  it('should encode @ character in password', () => {
    const raw =
      'postgresql://postgres.bdehscovmcmjncloifbk:iam@Kaiser07@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';
    const normalized = normalizeConnectionString(raw);
    expect(normalized).toBe(
      'postgresql://postgres.bdehscovmcmjncloifbk:iam%40Kaiser07@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres',
    );
  });

  it('should preserve already encoded password or simple passwords', () => {
    const simple = 'postgresql://user:secret@localhost:5432/mydb';
    expect(normalizeConnectionString(simple)).toBe(simple);

    const alreadyEncoded = 'postgresql://user:pass%40word@localhost:5432/mydb';
    expect(normalizeConnectionString(alreadyEncoded)).toBe(alreadyEncoded);
  });
});
