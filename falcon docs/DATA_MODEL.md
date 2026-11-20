# FALCON Data Model

MVP may keep these structures in memory and export JSON. This document defines the conceptual model and a future persistence direction.

## 1. Core entities

### Repository
- `id`
- `displayName`
- `rootPath` (local only; never expose server paths to other tenants)
- `defaultBranch`
- `createdAt`

### AnalysisSnapshot
- `id`
- `repositoryId`
- `commitSha`
- `analyzerVersion`
- `configHash`
- `createdAt`
- `status`

A snapshot is immutable for a specific commit, analyzer version and configuration.

### SourceFile
- `id`
- `snapshotId`
- `relativePath`
- `contentHash`
- `language`
- `parseStatus`
- `isExcluded`

### Symbol
- `id`
- `snapshotId`
- `fileId`
- `qualifiedName`
- `kind`
- `startLine`
- `startColumn`
- `endLine`
- `endColumn`
- `signatureFingerprint`
- `exported`
- `parentSymbolId` (optional)

### DependencyEdge
- `id`
- `snapshotId`
- `sourceSymbolId`
- `targetSymbolId`
- `type`
- `resolutionStatus`
- `confidence`
- `evidenceFile`
- `evidenceLine`
- `evidenceColumn`

Define edge direction explicitly in implementation. Recommended convention: `source -> target` means “source depends on target”; reverse adjacency is used to find dependents of a changed target.

### AnalysisRun
- `id`
- `repositoryId`
- `baseSnapshotId`
- `targetSnapshotId`
- `status`
- `startedAt`
- `completedAt`
- `analyzerVersion`
- `configHash`

### ImpactFinding
- `id`
- `analysisRunId`
- `changedSymbolId`
- `affectedSymbolId`
- `impactKind` (`direct` or `transitive`)
- `path`
- `evidence`
- `riskFactors`

### Diagnostic
- `id`
- `analysisRunId`
- `code`
- `severity`
- `message`
- `filePath`
- `line`
- `details`

## 2. Identity and indexing

- Snapshot-local symbol IDs must be deterministic where practical.
- Use repository-relative paths, normalized to `/`.
- Never use symbol name alone as a primary key.
- Suggested unique key: `(snapshot_id, file_path, qualified_name, kind, start_line)`, with care for line shifts.
- Index symbols by file and qualified name.
- Index edges by source, target and type.
- Index analysis runs by repository and commit pair.

## 3. Versioning

Every report includes:
- `schemaVersion`
- `analyzerVersion`
- `configHash`
- `repositoryRevision`
- `generatedAt`

Changing extraction semantics should increment analyzer version and invalidate incompatible cached snapshots.

## 4. Data retention

For local CLI, user controls output artifacts. A future hosted service must define retention, deletion, encryption, tenant isolation and source-code handling before launch.
