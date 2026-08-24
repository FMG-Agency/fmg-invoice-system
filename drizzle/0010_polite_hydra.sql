PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer,
	`employee_id` integer NOT NULL,
	`work_date` text NOT NULL,
	`first_in` text DEFAULT '' NOT NULL,
	`last_out` text DEFAULT '' NOT NULL,
	`punches_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'present' NOT NULL,
	`late_excused` integer DEFAULT 0 NOT NULL,
	`early_leave_excused` integer DEFAULT 0 NOT NULL,
	`leave_paid` integer DEFAULT 1 NOT NULL,
	`overtime_approved` integer DEFAULT 0 NOT NULL,
	`early_overtime_approved` integer DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `attendance_imports`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_attendance_records`("id", "import_id", "employee_id", "work_date", "first_in", "last_out", "punches_json", "status", "late_excused", "early_leave_excused", "leave_paid", "overtime_approved", "early_overtime_approved", "notes", "created_at", "updated_at") SELECT "id", "import_id", "employee_id", "work_date", "first_in", "last_out", "punches_json", "status", "late_excused", "early_leave_excused", "leave_paid", "overtime_approved", 0, "notes", "created_at", "updated_at" FROM `attendance_records`;--> statement-breakpoint
DROP TABLE `attendance_records`;--> statement-breakpoint
ALTER TABLE `__new_attendance_records` RENAME TO `attendance_records`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_records_employee_id_work_date_unique` ON `attendance_records` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_work_date` ON `attendance_records` (`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_employee_date` ON `attendance_records` (`employee_id`,`work_date`);--> statement-breakpoint
ALTER TABLE `employee_requests` ADD `attachment_key` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_requests` ADD `attachment_name` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_requests` ADD `attachment_type` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `policy_version` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `workday_starts_at` text DEFAULT '11:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `overtime_approval_after` text DEFAULT '22:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `early_overtime_multiplier` real DEFAULT 2.5 NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `urgent_leave_deadline` text DEFAULT '12:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `urgent_leave_year_limit` integer DEFAULT 12 NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `sick_report_after_days` integer DEFAULT 2 NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `resort_leave_days` integer DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `resort_notice_days` integer DEFAULT 14 NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `normal_leave_notice_days` integer DEFAULT 2 NOT NULL;
