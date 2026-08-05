CREATE TABLE `attendance_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`file_name` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`employee_count` integer DEFAULT 0 NOT NULL,
	`record_count` integer DEFAULT 0 NOT NULL,
	`created_employees` integer DEFAULT 0 NOT NULL,
	`imported_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `attendance_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer,
	`employee_id` integer NOT NULL,
	`work_date` text NOT NULL,
	`first_in` text DEFAULT '' NOT NULL,
	`last_out` text DEFAULT '' NOT NULL,
	`punches_json` text DEFAULT '[]' NOT NULL,
	`status` text DEFAULT 'present' NOT NULL,
	`late_excused` integer DEFAULT 0 NOT NULL,
	`overtime_approved` integer DEFAULT 1 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `attendance_imports`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attendance_records_employee_id_work_date_unique` ON `attendance_records` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_work_date` ON `attendance_records` (`work_date`);--> statement-breakpoint
CREATE INDEX `idx_attendance_employee_date` ON `attendance_records` (`employee_id`,`work_date`);--> statement-breakpoint
CREATE TABLE `employees` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`biometric_code` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`title` text DEFAULT '' NOT NULL,
	`department` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`hire_date` text DEFAULT '' NOT NULL,
	`base_salary` real DEFAULT 0 NOT NULL,
	`monthly_commission` real DEFAULT 0 NOT NULL,
	`monthly_deduction` real DEFAULT 0 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_employees_name` ON `employees` (`name`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_employees_biometric_code` ON `employees` (`biometric_code`) WHERE "employees"."biometric_code" <> '';--> statement-breakpoint
CREATE TABLE `hr_policy` (
	`id` integer PRIMARY KEY NOT NULL,
	`currency` text DEFAULT 'EGP' NOT NULL,
	`salary_divisor` real DEFAULT 30 NOT NULL,
	`workday_minutes` integer DEFAULT 480 NOT NULL,
	`free_arrival_until` text DEFAULT '11:05' NOT NULL,
	`minor_late_until` text DEFAULT '11:15' NOT NULL,
	`quarter_day_until` text DEFAULT '11:45' NOT NULL,
	`overtime_starts_at` text DEFAULT '19:15' NOT NULL,
	`overtime_arrival_cutoff` text DEFAULT '11:30' NOT NULL,
	`minute_penalty_multiplier` real DEFAULT 4 NOT NULL,
	`overtime_multiplier` real DEFAULT 2 NOT NULL,
	`friday_multiplier` real DEFAULT 2 NOT NULL,
	`absence_deduction_enabled` integer DEFAULT 0 NOT NULL,
	`absence_day_multiplier` real DEFAULT 1 NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payroll_adjustments` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`period_month` text NOT NULL,
	`type` text NOT NULL,
	`label` text NOT NULL,
	`amount` real DEFAULT 0 NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_adjustments_month_employee` ON `payroll_adjustments` (`period_month`,`employee_id`);