CREATE TABLE `employee_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`employee_id` integer NOT NULL,
	`requester_user_id` integer NOT NULL,
	`type` text NOT NULL,
	`leave_kind` text DEFAULT 'vacation' NOT NULL,
	`date_from` text NOT NULL,
	`date_to` text NOT NULL,
	`start_time` text DEFAULT '' NOT NULL,
	`end_time` text DEFAULT '' NOT NULL,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`details` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`assigned_reviewer_id` integer,
	`reviewer_note` text DEFAULT '' NOT NULL,
	`reviewed_by_user_id` integer,
	`reviewed_at` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`employee_id`) REFERENCES `employees`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`requester_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`assigned_reviewer_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`reviewed_by_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_employee_requests_employee` ON `employee_requests` (`employee_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_employee_requests_status` ON `employee_requests` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_employee_requests_reviewer` ON `employee_requests` (`assigned_reviewer_id`,`status`);--> statement-breakpoint
ALTER TABLE `auth_users` ADD `employee_id` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_auth_users_employee_id` ON `auth_users` (`employee_id`) WHERE "auth_users"."employee_id" IS NOT NULL;