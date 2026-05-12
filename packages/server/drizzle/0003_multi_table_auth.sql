PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `servers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `servers` (`id`, `name`) VALUES ('00000000-0000-0000-0000-000000000001', 'default');
--> statement-breakpoint
CREATE TABLE `auth_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`provider` text NOT NULL,
	`password_hash` text,
	`oauth_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CHECK (`provider` IN ('password', 'github', 'google'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_providers_user_provider_idx` ON `auth_providers` (`user_id`, `provider`);
--> statement-breakpoint
CREATE TABLE `server_roles` (
	`user_id` text NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`server_id` text NOT NULL REFERENCES `servers`(`id`) ON DELETE CASCADE,
	`role` text NOT NULL DEFAULT 'user',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY (`user_id`, `server_id`)
);
--> statement-breakpoint
INSERT INTO `auth_providers` (`id`, `user_id`, `provider`, `password_hash`, `created_at`, `updated_at`)
SELECT hex(randomblob(16)), `id`, 'password', `password_hash`, `created_at`, `updated_at` FROM `users`;
--> statement-breakpoint
INSERT INTO `server_roles` (`user_id`, `server_id`, `role`, `created_at`)
SELECT `id`, '00000000-0000-0000-0000-000000000001', `role`, `created_at` FROM `users`;
--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`(`id`, `email`, `display_name`, `created_at`, `updated_at`)
SELECT `id`, `email`, `display_name`, `created_at`, `updated_at` FROM `users`;
--> statement-breakpoint
DROP TABLE `users`;
--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);
--> statement-breakpoint
ALTER TABLE `spaces` ADD COLUMN `server_id` text NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001' REFERENCES `servers`(`id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;
