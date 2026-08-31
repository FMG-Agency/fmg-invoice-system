CREATE TABLE `production_work_order_events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`work_order_id` integer NOT NULL,
	`event_type` text NOT NULL,
	`actor_user_id` integer NOT NULL,
	`actor_name` text NOT NULL,
	`actor_role` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`work_order_id`) REFERENCES `production_work_orders`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_production_work_order_events_order` ON `production_work_order_events` (`work_order_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `production_work_orders` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`document_type` text DEFAULT 'media_guide' NOT NULL,
	`client_id` integer NOT NULL,
	`client_name` text NOT NULL,
	`bundle_catalog_id` integer NOT NULL,
	`bundle_name` text NOT NULL,
	`addon_catalog_id` integer,
	`addon_name` text DEFAULT '' NOT NULL,
	`work_date` text NOT NULL,
	`call_time` text DEFAULT '' NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`model_name` text DEFAULT '' NOT NULL,
	`photographer_name` text DEFAULT '' NOT NULL,
	`account_note` text DEFAULT '' NOT NULL,
	`production_note` text DEFAULT '' NOT NULL,
	`status` text DEFAULT 'pending_production' NOT NULL,
	`created_by_user_id` integer NOT NULL,
	`created_by_name` text NOT NULL,
	`created_by_role` text NOT NULL,
	`production_manager_user_id` integer,
	`production_manager_name` text DEFAULT '' NOT NULL,
	`account_submitted_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`production_submitted_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`client_id`) REFERENCES `clients`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bundle_catalog_id`) REFERENCES `quotation_catalog`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`addon_catalog_id`) REFERENCES `quotation_catalog`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`production_manager_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_production_work_orders_status_date` ON `production_work_orders` (`status`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_production_work_orders_creator` ON `production_work_orders` (`created_by_user_id`,`created_at`);