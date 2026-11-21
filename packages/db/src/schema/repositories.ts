import { pgTable, text, varchar, timestamp } from 'drizzle-orm/pg-core';

export const repositories = pgTable('repositories', {
  id: text('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  rootPath: text('root_path').notNull(),
  remoteUrl: text('remote_url'),
  defaultBranch: varchar('default_branch', { length: 100 }).default('main'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

export type Repository = typeof repositories.$inferSelect;
export type NewRepository = typeof repositories.$inferInsert;
