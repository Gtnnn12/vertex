-- TAREA 1: monedero de créditos (wallet). El saldo vive en users.credit_balance
-- (INTEGER, default 0). TODA variación se audita en credit_transactions con
-- amount con signo (+ recarga, − gasto) y reason — nunca créditos sin registro.
ALTER TABLE `users` ADD `credit_balance` integer NOT NULL DEFAULT 0;
--> statement-breakpoint
CREATE TABLE `credit_transactions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`amount` integer NOT NULL,
	`reason` text NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_credit_transactions_user_id` ON `credit_transactions` (`user_id`);
