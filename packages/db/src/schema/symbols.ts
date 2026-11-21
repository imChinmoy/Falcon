import { pgTable, text, varchar, integer, boolean } from 'drizzle-orm/pg-core';
import { analysisSnapshots } from './snapshots.js';

export const codeSymbols = pgTable('code_symbols', {
  id: text('id').primaryKey(),
  snapshotId: text('snapshot_id')
    .references(() => analysisSnapshots.id, { onDelete: 'cascade' })
    .notNull(),
  fileId: text('file_id').notNull(),
  filePath: text('file_path').notNull(),
  name: text('name').notNull(),
  qualifiedName: text('qualified_name').notNull(),
  kind: varchar('kind', { length: 50 }).notNull(),
  exported: boolean('exported').notNull().default(false),
  signatureFingerprint: text('signature_fingerprint'),
  parentSymbolId: text('parent_symbol_id'),
  startLine: integer('start_line').notNull(),
  startColumn: integer('start_column').notNull(),
  endLine: integer('end_line').notNull(),
  endColumn: integer('end_column').notNull(),
});

export type CodeSymbol = typeof codeSymbols.$inferSelect;
export type NewCodeSymbol = typeof codeSymbols.$inferInsert;
