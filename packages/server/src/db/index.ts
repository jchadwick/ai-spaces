import { sql } from "drizzle-orm";
import { primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const servers = sqliteTable("servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  runtimeType: text("runtime_type").notNull().default("openclaw"),
  status: text("status").notNull().default("active"),
  pluginUrl: text("plugin_url"),
  gatewayUrl: text("gateway_url"),
  metadata: text("metadata").notNull().default("{}"),
  callbackToken: text("callback_token"),
  callbackTokenHash: text("callback_token_hash"),
  callbackTokenCreatedAt: text("callback_token_created_at"),
  callbackTokenExpiresAt: text("callback_token_expires_at"),
  callbackTokenRevokedAt: text("callback_token_revoked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at"),
});

export const serverRegistrationTokens = sqliteTable("server_registration_tokens", {
  id: text("id").primaryKey(),
  tokenHash: text("token_hash").notNull().unique(),
  name: text("name"),
  runtimeType: text("runtime_type").notNull().default("openclaw"),
  metadata: text("metadata").notNull().default("{}"),
  status: text("status").notNull().default("active"),
  expiresAt: text("expires_at"),
  consumedAt: text("consumed_at"),
  consumedByServerId: text("consumed_by_server_id").references(() => servers.id, {
    onDelete: "set null",
  }),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  displayName: text("display_name"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const serverRoles = sqliteTable(
  "server_roles",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    serverId: text("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("user"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [primaryKey({ columns: [table.userId, table.serverId] })],
);

export const authProviders = sqliteTable(
  "auth_providers",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    passwordHash: text("password_hash"),
    oauthId: text("oauth_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("auth_providers_user_provider_idx").on(table.userId, table.provider)],
);

export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  refreshToken: text("refresh_token").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const spaces = sqliteTable(
  "spaces",
  {
    id: text("id").primaryKey(),
    serverId: text("server_id")
      .notNull()
      .default("00000000-0000-0000-0000-000000000001")
      .references(() => servers.id),
    runtimeSpaceId: text("runtime_space_id").notNull(),
    agentId: text("agent_id").notNull(),
    agentType: text("agent_type").notNull(),
    path: text("path").notNull(),
    configPath: text("config_path"),
    config: text("config").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [
    uniqueIndex("spaces_server_runtime_space_idx").on(table.serverId, table.runtimeSpaceId),
    uniqueIndex("spaces_server_agent_path_idx").on(table.serverId, table.agentId, table.path),
  ],
);

export const spaceMembers = sqliteTable(
  "space_members",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("space_members_space_user_idx").on(table.spaceId, table.userId)],
);

export const spaceTopics = sqliteTable(
  "space_topics",
  {
    id: text("id").primaryKey(),
    spaceId: text("space_id")
      .notNull()
      .references(() => spaces.id, { onDelete: "cascade" }),
    topicPath: text("topic_path").notNull(),
    targetType: text("target_type").notNull().default("directory"),
    status: text("status").notNull().default("active"),
    acpSessionId: text("acp_session_id"),
    archivedAt: text("archived_at"),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
    updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  },
  (table) => [uniqueIndex("space_topics_space_path_idx").on(table.spaceId, table.topicPath)],
);

export const inviteTokens = sqliteTable("invite_tokens", {
  id: text("id").primaryKey(),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  role: text("role").notNull(),
  recipientUserId: text("recipient_user_id").references(() => users.id),
  expiresAt: text("expires_at").notNull(),
  consumedAt: text("consumed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const confirmationNonces = sqliteTable("confirmation_nonces", {
  id: text("id").primaryKey(),
  spaceId: text("space_id").notNull(),
  issuingUserId: text("issuing_user_id")
    .notNull()
    .references(() => users.id),
  action: text("action").notNull(),
  payload: text("payload").notNull(),
  expiresAt: text("expires_at").notNull(),
  redeemedAt: text("redeemed_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const notifications = sqliteTable("notifications", {
  id: text("id").primaryKey(),
  type: text("type").notNull(),
  recipientUserId: text("recipient_user_id").references(() => users.id),
  spaceId: text("space_id")
    .notNull()
    .references(() => spaces.id, { onDelete: "cascade" }),
  role: text("role").notNull(),
  inviteId: text("invite_id")
    .notNull()
    .references(() => inviteTokens.id),
  read: text("read").notNull().default("false"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type UserWithServerRole = typeof users.$inferSelect & { serverRole: "admin" | "user" };
export type Server = typeof servers.$inferSelect;
export type ServerRegistrationToken = typeof serverRegistrationTokens.$inferSelect;
export type NewServerRegistrationToken = typeof serverRegistrationTokens.$inferInsert;
export type ServerRole = typeof serverRoles.$inferSelect;
export type NewServerRole = typeof serverRoles.$inferInsert;
export type AuthProvider = typeof authProviders.$inferSelect;
export type NewAuthProvider = typeof authProviders.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Space = typeof spaces.$inferSelect;
export type NewSpace = typeof spaces.$inferInsert;
export type SpaceMember = typeof spaceMembers.$inferSelect;
export type NewSpaceMember = typeof spaceMembers.$inferInsert;
export type SpaceTopic = typeof spaceTopics.$inferSelect;
export type NewSpaceTopic = typeof spaceTopics.$inferInsert;
export type InviteToken = typeof inviteTokens.$inferSelect;
export type NewInviteToken = typeof inviteTokens.$inferInsert;
export type ConfirmationNonce = typeof confirmationNonces.$inferSelect;
export type NewConfirmationNonce = typeof confirmationNonces.$inferInsert;
export type Notification = typeof notifications.$inferSelect;
export type NewNotification = typeof notifications.$inferInsert;
