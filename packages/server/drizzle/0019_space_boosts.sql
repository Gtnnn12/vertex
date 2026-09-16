-- TAREA 1: Server Boosts (modelo estilo Nitro server boosts).
-- Cada fila es una mejora comprada por UN miembro de un server. El nivel del
-- server se calcula en tiempo real contando las filas no expiradas — no se
-- guarda en spaces. Freeze rule: al expirar no se borra nada; el nivel
-- efectivo se clampa al base hasta que haya boosts activos de nuevo.
CREATE TABLE IF NOT EXISTS `space_boosts` (
	`id` text PRIMARY KEY NOT NULL,
	`space_id` text NOT NULL,
	`user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`space_id`) REFERENCES `spaces`(`id`) ON DELETE CASCADE,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_space_boosts_space_id` ON `space_boosts` (`space_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_space_boosts_user_id` ON `space_boosts` (`user_id`);
--> statement-breakpoint
-- Créditos de mejora: el webhook de billing (producto "Mejora de server")
-- incrementa el contador del comprador; POST /boost consume 1 crédito e
-- inserta la fila space_boosts. Separar pago (webhook) de compra (endpoint)
-- mantiene el flujo igual al de Discord y permite reintento sin doble cobro.
CREATE TABLE IF NOT EXISTS `boost_credits` (
	`user_id` text PRIMARY KEY NOT NULL,
	`credits` integer NOT NULL DEFAULT 0,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
);
