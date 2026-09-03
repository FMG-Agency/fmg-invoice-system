CREATE TABLE `production_crew_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`category` text NOT NULL,
	`name` text NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`profile_url` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_production_crew_category` ON `production_crew_members` (`category`,`name`);--> statement-breakpoint
CREATE INDEX `idx_production_crew_active` ON `production_crew_members` (`active`);--> statement-breakpoint
CREATE TABLE `production_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`model_catalog_url` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
