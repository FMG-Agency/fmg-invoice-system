CREATE TABLE `quotation_catalog` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`kind` text NOT NULL,
	`name` text NOT NULL,
	`price` real DEFAULT 0 NOT NULL,
	`included_services_json` text DEFAULT '[]' NOT NULL,
	`applies_to` text DEFAULT '' NOT NULL,
	`bundle_total` real,
	`active` integer DEFAULT 1 NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_quotation_catalog_kind_name` ON `quotation_catalog` (`kind`,`name`);--> statement-breakpoint
CREATE INDEX `idx_quotation_catalog_sort` ON `quotation_catalog` (`kind`,`sort_order`);--> statement-breakpoint
INSERT OR IGNORE INTO `quotation_catalog` (`id`,`kind`,`name`,`price`,`included_services_json`,`applies_to`,`bundle_total`,`active`,`sort_order`) VALUES
  (1,'package','Stories Package',15000,'["Videographer","Camera","Model"]','',NULL,1,10),
  (2,'package','Product Photography Package',25000,'["Photographer + Assistant","Camera + Lights","Studio + Props","Retoucher"]','',NULL,1,20),
  (3,'package','G1 Bundle',40000,'["Videographer + Assistant","Camera","Foreign Model","Location"]','',NULL,1,30),
  (4,'package','G1+ Bundle',65000,'["Mobile Content Creator","Foreign Model","Stylist","Art Director"]','',NULL,1,40),
  (5,'package','G2 Bundle',65000,'["Photographer + Assistant","Videographer + Assistant","Foreign Model","Studio","Stylist","Art Director"]','',NULL,1,50),
  (6,'addon','Photography Add-on',10000,'["Photography Add-on"]','G1 Bundle',50000,1,10);
