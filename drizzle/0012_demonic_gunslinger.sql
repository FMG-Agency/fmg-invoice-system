ALTER TABLE `production_work_orders` ADD `operation_note` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `operation_manager_user_id` integer REFERENCES auth_users(id);--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `operation_manager_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `final_approved_at` text DEFAULT '' NOT NULL;