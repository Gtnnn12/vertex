-- TAREA 1: chat de compra para recargas. El usuario crea un ticket al
-- confirmar "Ya he pagado", conversa (texto + capturas) con el staff, y un
-- admin aprueba (acredita créditos vía credit_wallet) o rechaza con nota.
CREATE TABLE `recharge_tickets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`pack_id` text NOT NULL,
	`status` text NOT NULL DEFAULT 'open',
	`created_at` integer NOT NULL,
	`resolved_at` integer,
	`admin_note` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `recharge_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`ticket_id` text NOT NULL,
	`sender_user_id` text,
	`sender_role` text NOT NULL,
	`body` text,
	`image_url` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`ticket_id`) REFERENCES `recharge_tickets`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`sender_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recharge_tickets_user_id` ON `recharge_tickets` (`user_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recharge_tickets_status` ON `recharge_tickets` (`status`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_recharge_messages_ticket_id` ON `recharge_messages` (`ticket_id`);
