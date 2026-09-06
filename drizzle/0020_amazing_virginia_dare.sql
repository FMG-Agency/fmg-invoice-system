CREATE TABLE `agency_tasks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`details` text DEFAULT '' NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`grid_notes` text DEFAULT '' NOT NULL,
	`references_json` text DEFAULT '[]' NOT NULL,
	`start_at` text NOT NULL,
	`deadline_at` text NOT NULL,
	`assigned_user_id` integer NOT NULL,
	`assigned_user_name` text NOT NULL,
	`assigned_user_role` text DEFAULT 'Team Member' NOT NULL,
	`created_by_user_id` integer NOT NULL,
	`created_by_name` text NOT NULL,
	`created_by_role` text DEFAULT 'Team Member' NOT NULL,
	`status` text DEFAULT 'assigned' NOT NULL,
	`submission_url` text DEFAULT '' NOT NULL,
	`submitted_at` text DEFAULT '' NOT NULL,
	`late_minutes` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_agency_tasks_assignee_status_deadline` ON `agency_tasks` (`assigned_user_id`,`status`,`deadline_at`);--> statement-breakpoint
CREATE INDEX `idx_agency_tasks_schedule` ON `agency_tasks` (`start_at`,`deadline_at`);--> statement-breakpoint
CREATE INDEX `idx_agency_tasks_creator` ON `agency_tasks` (`created_by_user_id`,`created_at`);