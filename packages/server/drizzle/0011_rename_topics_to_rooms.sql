PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_space_rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`room_path` text NOT NULL,
	`target_type` text DEFAULT 'directory' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`acp_session_id` text,
	`archived_at` text,
	`created_by_user_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
INSERT INTO `__new_space_rooms` (
	`id`,
	`space_id`,
	`room_path`,
	`target_type`,
	`status`,
	`acp_session_id`,
	`archived_at`,
	`created_by_user_id`,
	`created_at`,
	`updated_at`
)
SELECT
	`id`,
	`space_id`,
	`topic_path`,
	`target_type`,
	`status`,
	`acp_session_id`,
	`archived_at`,
	`created_by_user_id`,
	`created_at`,
	`updated_at`
FROM `space_topics`;--> statement-breakpoint
DROP TABLE `space_topics`;--> statement-breakpoint
ALTER TABLE `__new_space_rooms` RENAME TO `space_rooms`;--> statement-breakpoint
CREATE UNIQUE INDEX `space_rooms_space_path_idx` ON `space_rooms` (`space_id`,`room_path`);--> statement-breakpoint
PRAGMA foreign_keys=ON;
