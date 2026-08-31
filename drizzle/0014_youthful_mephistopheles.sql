CREATE TABLE `client_portal_plans` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`part` integer NOT NULL,
	`title` text DEFAULT 'Content plan' NOT NULL,
	`url` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`published` integer DEFAULT 1 NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_client_portal_plans_period_part` ON `client_portal_plans` (`client_id`,`year`,`month`,`part`);--> statement-breakpoint
CREATE INDEX `idx_client_portal_plans_client_year` ON `client_portal_plans` (`client_id`,`year`,`month`);--> statement-breakpoint
ALTER TABLE `auth_users` ADD `client_id` integer REFERENCES clients(id);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_users_client_id` ON `auth_users` (`client_id`) WHERE "auth_users"."client_id" IS NOT NULL;