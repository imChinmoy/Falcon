import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';
import { analysisSnapshots } from './snapshots.js';

export const testMappings = pgTable('test_mappings', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id')
    .references(() => analysisSnapshots.id, { onDelete: 'cascade' })
    .notNull(),
  testFilePath: text('test_file_path').notNull(),
  testSymbolId: text('test_symbol_id'),
  sourceFilePath: text('source_file_path').notNull(),
  sourceSymbolId: text('source_symbol_id'),
  evidenceLevel: varchar('evidence_level', { length: 50 }).notNull(),
  confidence: varchar('confidence', { length: 50 }).notNull(),
  line: integer('line'),
  notes: text('notes'),
});

export type TestMapping = typeof testMappings.$inferSelect;
export type NewTestMapping = typeof testMappings.$inferInsert;
