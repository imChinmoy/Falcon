import { pgTable, text, varchar, timestamp } from 'drizzle-orm/pg-core';
import { repositories } from './repositories.js';

export const analysisSnapshots = pgTable('analysis_snapshots', {
  id: text('id').primaryKey(),
  repositoryId: text('repository_id')
    .references(() => repositories.id, { onDelete: 'cascade' })
    .notNull(),
  commitSha: varchar('commit_sha', { length: 64 }),
  branch: varchar('branch', { length: 100 }),
  status: varchar('status', { length: 50 }).notNull().default('completed'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

export type AnalysisSnapshot = typeof analysisSnapshots.$inferSelect;
export type NewAnalysisSnapshot = typeof analysisSnapshots.$inferInsert;
