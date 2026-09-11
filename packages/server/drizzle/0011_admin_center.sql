ALTER TABLE `users` ADD `netrex_enabled` integer DEFAULT 0;
--> statement-breakpoint
ALTER TABLE `users` ADD `netrex_expires_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `staff_role` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `last_seen_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `banned_until` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `ban_reason` text;
--> statement-breakpoint
ALTER TABLE `users` ADD `banned_at` integer;
--> statement-breakpoint
ALTER TABLE `users` ADD `banned_by` text;
--> statement-breakpoint
CREATE TABLE `staff_roles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`granted_by` text,
	`granted_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`granted_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `moderation_events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`action` text NOT NULL,
	`reason` text,
	`actor_id` text,
	`duration_seconds` integer,
	`expires_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_moderation_events_user_id` ON `moderation_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `idx_moderation_events_created_at` ON `moderation_events` (`created_at`);
--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`target_id` text,
	`target_type` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`actor_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_created_at` ON `audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX `idx_audit_log_action` ON `audit_log` (`action`);