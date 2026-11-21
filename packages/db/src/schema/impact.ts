import { pgTable, text, varchar, integer, timestamp } from 'drizzle-orm/pg-core';
import { analysisSnapshots } from './snapshots.js';

export const impactRuns = pgTable('impact_runs', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id')
    .references(() => analysisSnapshots.id, { onDelete: 'cascade' })
    .notNull(),
  baseRef: varchar('base_ref', { length: 100 }),
  targetRef: varchar('target_ref', { length: 100 }),
  analyzedAt: timestamp('analyzed_at', { withTimezone: true }).defaultNow().notNull(),
  totalAffectedFiles: integer('total_affected_files').notNull().default(0),
  totalAffectedSymbols: integer('total_affected_symbols').notNull().default(0),
});

export const impactFindings = pgTable('impact_findings', {
  id: text('id').primaryKey(),
  impactRunId: text('impact_run_id')
    .references(() => impactRuns.id, { onDelete: 'cascade' })
    .notNull(),
  symbolId: text('symbol_id'),
  filePath: text('file_path').notNull(),
  kind: varchar('kind', { length: 50 }).notNull(),
  distance: integer('distance').notNull(),
  confidence: varchar('confidence', { length: 50 }).notNull(),
  reason: text('reason').notNull(),
});

export type ImpactRun = typeof impactRuns.$inferSelect;
export type NewImpactRun = typeof impactRuns.$inferInsert;
export type ImpactFinding = typeof impactFindings.$inferSelect;
export type NewImpactFinding = typeof impactFindings.$inferInsert;
