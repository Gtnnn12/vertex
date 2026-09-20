-- Server Evolutions catalog (v1.0.3): custom emojis, custom invite slug and
-- banner content type for animated-banner gating.
CREATE TABLE `space_emojis` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`name` text NOT NULL,
	`file` text NOT NULL,
	`created_by` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`),
	CONSTRAINT `space_emojis_space_name_unique` UNIQUE(`space_id`, `name`)
);
--> statement-breakpoint
ALTER TABLE `spaces` ADD `custom_invite_slug` text;
--> statement-breakpoint
ALTER TABLE `spaces` ADD `banner_content_type` text;
--> statement-breakpoint
ALTER TABLE `channels` ADD `is_event_stage` integer DEFAULT 0;
