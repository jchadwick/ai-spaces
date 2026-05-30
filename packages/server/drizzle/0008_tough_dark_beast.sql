PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_space_topics` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`topic_path` text NOT NULL,
	`target_type` text DEFAULT 'directory' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`acp_session_id` text,
	`archived_at` text,
	`created_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_space_topics`("id", "space_id", "topic_path", "target_type", "status", "acp_session_id", "archived_at", "created_by_user_id", "created_at", "updated_at")
SELECT "id", "space_id", "topic_path",
  CASE WHEN "topic_path" = '/' THEN 'root' ELSE 'directory' END,
  CASE WHEN "topic_path" = '/' THEN 'active' ELSE 'archived' END,
  "acp_session_id",
  CASE WHEN "topic_path" = '/' THEN NULL ELSE CURRENT_TIMESTAMP END,
  "created_by_user_id", "created_at", "updated_at"
FROM `space_topics`;--> statement-breakpoint
DROP TABLE `space_topics`;--> statement-breakpoint
ALTER TABLE `__new_space_topics` RENAME TO `space_topics`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `space_topics_space_path_idx` ON `space_topics` (`space_id`,`topic_path`);
