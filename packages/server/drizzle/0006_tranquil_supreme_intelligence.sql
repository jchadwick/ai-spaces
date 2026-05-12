PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_invite_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`role` text NOT NULL,
	`recipient_user_id` text,
	`expires_at` text NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_invite_tokens`("id", "space_id", "token_hash", "role", "recipient_user_id", "expires_at", "consumed_at", "created_at") SELECT "id", "space_id", "token_hash", "role", "recipient_user_id", "expires_at", "consumed_at", "created_at" FROM `invite_tokens`;--> statement-breakpoint
DROP TABLE `invite_tokens`;--> statement-breakpoint
ALTER TABLE `__new_invite_tokens` RENAME TO `invite_tokens`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `invite_tokens_token_hash_unique` ON `invite_tokens` (`token_hash`);