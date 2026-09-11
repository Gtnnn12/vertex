CREATE TABLE `spotify_tokens` (
	`user_id` text PRIMARY KEY NOT NULL REFERENCES `users`(`id`) ON DELETE CASCADE,
	`spotify_user` text,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` integer NOT NULL,
	`connected_at` integer NOT NULL,
	`last_polled_at` integer
);
--> statement-breakpoint
CREATE INDEX `idx_spotify_tokens_user_id` ON `spotify_tokens` (`user_id`);
