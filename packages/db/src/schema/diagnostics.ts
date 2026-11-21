import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';
import { analysisSnapshots } from './snapshots.js';

export const diagnostics = pgTable('diagnostics', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id')
    .references(() => analysisSnapshots.id, { onDelete: 'cascade' })
    .notNull(),
  code: varchar('code', { length: 50 }).notNull(),
  message: text('message').notNull(),
  severity: varchar('severity', { length: 20 }).notNull(),
  filePath: text('file_path'),
  line: integer('line'),
  column: integer('column'),
});

export type Diagnostic = typeof diagnostics.$inferSelect;
export type NewDiagnostic = typeof diagnostics.$inferInsert;
