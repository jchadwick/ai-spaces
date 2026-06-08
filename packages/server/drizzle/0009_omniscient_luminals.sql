PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`runtime_type` text DEFAULT 'openclaw' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`plugin_url` text,
	`gateway_url` text,
	`metadata` text DEFAULT '{}' NOT NULL,
	`callback_token` text,
	`callback_token_hash` text,
	`callback_token_created_at` text,
	`callback_token_expires_at` text,
	`callback_token_revoked_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text
);--> statement-breakpoint
INSERT INTO `__new_servers` (
	`id`,
	`name`,
	`runtime_type`,
	`status`,
	`plugin_url`,
	`gateway_url`,
	`metadata`,
	`callback_token`,
	`callback_token_hash`,
	`callback_token_created_at`,
	`callback_token_expires_at`,
	`callback_token_revoked_at`,
	`created_at`,
	`updated_at`,
	`last_seen_at`
)
SELECT
	`id`,
	`name`,
	'openclaw',
	'active',
	`plugin_url`,
	`gateway_url`,
	'{}',
	`callback_token`,
	NULL,
	NULL,
	NULL,
	NULL,
	`created_at`,
	`created_at`,
	NULL
FROM `servers`;--> statement-breakpoint
DROP TABLE `servers`;--> statement-breakpoint
ALTER TABLE `__new_servers` RENAME TO `servers`;--> statement-breakpoint
DROP INDEX `spaces_agent_path_idx`;--> statement-breakpoint
ALTER TABLE `spaces` ADD `runtime_space_id` text DEFAULT '' NOT NULL;--> statement-breakpoint
UPDATE `spaces` SET `runtime_space_id` = `id` WHERE `runtime_space_id` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_server_runtime_space_idx` ON `spaces` (`server_id`,`runtime_space_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `spaces_server_agent_path_idx` ON `spaces` (`server_id`,`agent_id`,`path`);--> statement-breakpoint
CREATE TABLE `server_registration_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`token_hash` text NOT NULL,
	`name` text,
	`runtime_type` text DEFAULT 'openclaw' NOT NULL,
	`metadata` text DEFAULT '{}' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`expires_at` text,
	`consumed_at` text,
	`consumed_by_server_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`consumed_by_server_id`) REFERENCES `servers`(`id`) ON UPDATE no action ON DELETE set null
);--> statement-breakpoint
CREATE UNIQUE INDEX `server_registration_tokens_token_hash_unique` ON `server_registration_tokens` (`token_hash`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
