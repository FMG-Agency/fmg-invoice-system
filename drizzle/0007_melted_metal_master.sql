ALTER TABLE `quotation_catalog` ADD `inputs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `quotation_catalog` ADD `outputs_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
UPDATE `quotation_catalog` SET `inputs_json` = `included_services_json`;
