ALTER TABLE `documents` ADD `production_work_order_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_documents_production_work_order` ON `documents` (`production_work_order_id`);--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `bundle_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `bundle_inputs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `bundle_outputs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `addon_price` real DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `addon_inputs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `addon_outputs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `production_options_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `production_work_orders` ADD `draft_invoice_id` integer REFERENCES documents(id);