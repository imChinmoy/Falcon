import { relations } from 'drizzle-orm';
import { repositories } from './repositories.js';
import { analysisSnapshots } from './snapshots.js';
import { sourceFiles } from './files.js';
import { codeSymbols } from './symbols.js';
import { dependencyEdges } from './edges.js';
import { impactRuns, impactFindings } from './impact.js';
import { diagnostics } from './diagnostics.js';

export const repositoriesRelations = relations(repositories, ({ many }) => ({
  snapshots: many(analysisSnapshots),
}));

export const analysisSnapshotsRelations = relations(analysisSnapshots, ({ one, many }) => ({
  repository: one(repositories, {
    fields: [analysisSnapshots.repositoryId],
    references: [repositories.id],
  }),
  sourceFiles: many(sourceFiles),
  codeSymbols: many(codeSymbols),
  dependencyEdges: many(dependencyEdges),
  impactRuns: many(impactRuns),
  diagnostics: many(diagnostics),
}));

export const sourceFilesRelations = relations(sourceFiles, ({ one }) => ({
  snapshot: one(analysisSnapshots, {
    fields: [sourceFiles.snapshotId],
    references: [analysisSnapshots.id],
  }),
}));

export const codeSymbolsRelations = relations(codeSymbols, ({ one }) => ({
  snapshot: one(analysisSnapshots, {
    fields: [codeSymbols.snapshotId],
    references: [analysisSnapshots.id],
  }),
}));

export const dependencyEdgesRelations = relations(dependencyEdges, ({ one }) => ({
  snapshot: one(analysisSnapshots, {
    fields: [dependencyEdges.snapshotId],
    references: [analysisSnapshots.id],
  }),
}));

export const impactRunsRelations = relations(impactRuns, ({ one, many }) => ({
  snapshot: one(analysisSnapshots, {
    fields: [impactRuns.snapshotId],
    references: [analysisSnapshots.id],
  }),
  findings: many(impactFindings),
}));

export const impactFindingsRelations = relations(impactFindings, ({ one }) => ({
  impactRun: one(impactRuns, {
    fields: [impactFindings.impactRunId],
    references: [impactRuns.id],
  }),
}));

export const diagnosticsRelations = relations(diagnostics, ({ one }) => ({
  snapshot: one(analysisSnapshots, {
    fields: [diagnostics.snapshotId],
    references: [analysisSnapshots.id],
  }),
}));
