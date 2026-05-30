CREATE TABLE `space_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`topic_path` text NOT NULL,
	`acp_session_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `space_topics_space_path_idx` ON `space_topics` (`space_id`,`topic_path`);