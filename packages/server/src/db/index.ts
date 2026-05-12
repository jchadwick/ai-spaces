import { sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  role: text('role').notNull().default('user'),
  displayName: text('display_name'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const sessions = sqliteTable('sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  refreshToken: text('refresh_token').notNull(),
  expiresAt: text('expires_at').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const spaces = sqliteTable('spaces', {
  id: text('id').primaryKey(),
  agentId: text('agent_id').notNull(),
  agentType: text('agent_type').notNull(),
  path: text('path').notNull(),
  configPath: text('config_path'),
  config: text('config').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('spaces_agent_path_idx').on(table.agentId, table.path),
]);

export const spaceMembers = sqliteTable('space_members', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex('space_members_space_user_idx').on(table.spaceId, table.userId),
]);

export const inviteTokens = sqliteTable('invite_tokens', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  role: text('role').notNull(),
  createdByUserId: text('created_by_user_id').notNull().references(() => users.id),
  recipientUserId: text('recipient_user_id').references(() => users.id),
  expiresAt: text('expires_at').notNull(),
  consumedAt: text('consumed_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const confirmationNonces = sqliteTable('confirmation_nonces', {
  id: text('id').primaryKey(),
  spaceId: text('space_id').notNull(),
  issuingUserId: text('issuing_user_id').notNull().references(() => users.id),
  action: text('action').notNull(),
  payload: text('payload').notNull(),
  expiresAt: text('expires_at').notNull(),
  redeemedAt: text('redeemed_at'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notifications = sqliteTable('notifications', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  recipientUserId: text('recipient_user_id').references(() => users.id),
  spaceId: text('space_id').notNull().references(() => spaces.id, { onDelete: 'cascade' }),
  role: text('role').notNull(),
  inviteId: text('invite_id').notNull().references(() => inviteTokens.id),
  read: text('read').notNull().default('false'),
  createdAt: text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Space = typeof spaces.$inferSelect;
export type NewSpace = typeof spaces.$inferInsert;
export type SpaceMember = typeof spaceMembers.$inferSelect;
export type NewSpaceMember = typeof spaceMembers.$inferInsert;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type NewInviteToken = typeof inviteTokens.$inferInsert;
export type ConfirmationNonce = typeof confirmationNonces.$inferSelect;
export type NewConfirmationNonce = typeof confirmationNonces.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;