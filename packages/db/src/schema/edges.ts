import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';
import { analysisSnapshots } from './snapshots.js';

export const dependencyEdges = pgTable('dependency_edges', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id')
    .references(() => analysisSnapshots.id, { onDelete: 'cascade' })
    .notNull(),
  sourceSymbolId: text('source_symbol_id').notNull(),
  targetSymbolId: text('target_symbol_id').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  resolutionStatus: varchar('resolution_status', { length: 50 }).notNull(),
  confidence: varchar('confidence', { length: 50 }).notNull(),
  evidenceFile: text('evidence_file').notNull(),
  evidenceLine: integer('evidence_line').notNull(),
  evidenceColumn: integer('evidence_column'),
  evidenceSnippet: text('evidence_snippet'),
  notes: text('notes'),
});

export type DependencyEdge = typeof dependencyEdges.$inferSelect;
export type NewDependencyEdge = typeof dependencyEdges.$inferInsert;
