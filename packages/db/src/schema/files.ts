import { pgTable, text, varchar, integer } from 'drizzle-orm/pg-core';
import { analysisSnapshots } from './snapshots.js';

export const sourceFiles = pgTable('source_files', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id')
    .references(() => analysisSnapshots.id, { onDelete: 'cascade' })
    .notNull(),
  relativePath: text('relative_path').notNull(),
  language: varchar('language', { length: 50 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  parseStatus: varchar('parse_status', { length: 50 }).notNull().default('parsed'),
});

export type SourceFile = typeof sourceFiles.$inferSelect;
export type NewSourceFile = typeof sourceFiles.$inferInsert;
