CREATE TABLE `client_financial_transactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`client_id` integer NOT NULL,
	`document_id` integer,
	`type` text NOT NULL,
	`amount` real NOT NULL,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`transaction_date` text NOT NULL,
	`payment_method` text DEFAULT 'Bank transfer' NOT NULL,
	`reference` text DEFAULT '' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_client_financial_transactions_client_date` ON `client_financial_transactions` (`client_id`,`transaction_date`);--> statement-breakpoint
CREATE INDEX `idx_client_financial_transactions_document` ON `client_financial_transactions` (`document_id`);