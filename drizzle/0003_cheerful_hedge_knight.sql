CREATE TABLE `auth_user_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_auth_user_sessions_expires_at` ON `auth_user_sessions` (`expires_at`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text DEFAULT '' NOT NULL,
	`role_label` text DEFAULT 'Team Member' NOT NULL,
	`password_hash` text NOT NULL,
	`password_salt` text NOT NULL,
	`password_iterations` integer NOT NULL,
	`is_admin` integer DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`permissions_json` text DEFAULT '[]' NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_username_unique` ON `auth_users` (`username`);--> statement-breakpoint
CREATE INDEX `idx_auth_users_active` ON `auth_users` (`active`);--> statement-breakpoint
INSERT OR IGNORE INTO `auth_users`
	(`id`, `username`, `display_name`, `role_label`, `password_hash`, `password_salt`, `password_iterations`, `is_admin`, `active`, `permissions_json`, `created_at`, `updated_at`)
	SELECT `id`, `username`, 'Administrator', 'Administrator', `password_hash`, `password_salt`, `password_iterations`, 1, 1, '[]', `created_at`, `updated_at`
	FROM `auth_credentials` WHERE `id` = 1;--> statement-breakpoint
INSERT OR IGNORE INTO `auth_user_sessions` (`token_hash`, `user_id`, `expires_at`, `created_at`)
	SELECT `token_hash`, `user_id`, `expires_at`, `created_at` FROM `auth_sessions` WHERE `user_id` = 1;--> statement-breakpoint
DELETE FROM `auth_sessions`;
