CREATE TABLE `categories` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`prefix` text NOT NULL,
	`footer_text_1` text DEFAULT '' NOT NULL,
	`footer_text_2` text DEFAULT '' NOT NULL,
	`counter` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `categories_name_unique` ON `categories` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `categories_prefix_unique` ON `categories` (`prefix`);--> statement-breakpoint
CREATE TABLE `clients` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`company_name` text DEFAULT '' NOT NULL,
	`owner_name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `documents` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`generated_code` text NOT NULL,
	`client_id` integer NOT NULL,
	`category_id` integer NOT NULL,
	`date` text NOT NULL,
	`valid_until` text DEFAULT '' NOT NULL,
	`prepared_by` text DEFAULT 'Finance Department' NOT NULL,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`project` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'Draft' NOT NULL,
	`items_json` text NOT NULL,
	`subtotal` real DEFAULT 0 NOT NULL,
	`discount` real DEFAULT 0 NOT NULL,
	`tax` real DEFAULT 0 NOT NULL,
	`total` real DEFAULT 0 NOT NULL,
	`payment_terms` text DEFAULT '' NOT NULL,
	`notes_exclusions` text DEFAULT '' NOT NULL,
	`pdf_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`category_id`) REFERENCES `categories`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `documents_generated_code_unique` ON `documents` (`generated_code`);--> statement-breakpoint
CREATE TABLE `settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`agency_name` text DEFAULT 'FMG Agency' NOT NULL,
	`default_currency` text DEFAULT 'EGP' NOT NULL,
	`prepared_by` text DEFAULT 'Finance Department' NOT NULL,
	`default_payment_terms` text DEFAULT '50% advance payment • 50% upon completion' NOT NULL,
	`default_tax` real DEFAULT 0 NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
