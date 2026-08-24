ALTER TABLE `attendance_records` ADD `early_leave_excused` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `attendance_records` ADD `leave_paid` integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE `employee_requests` ADD `leave_paid` integer;--> statement-breakpoint
ALTER TABLE `employee_requests` ADD `decision_token` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `workday_ends_at` text DEFAULT '19:00' NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `early_leave_day_multiplier` real DEFAULT 0.5 NOT NULL;--> statement-breakpoint
ALTER TABLE `hr_policy` ADD `unpaid_leave_day_multiplier` real DEFAULT 1 NOT NULL;--> statement-breakpoint
UPDATE `employee_requests`
SET `duration_minutes` = MAX(
  0,
  (CAST(substr(`end_time`, 1, 2) AS integer) * 60 + CAST(substr(`end_time`, 4, 2) AS integer)) -
  MAX(
    CAST(substr(`start_time`, 1, 2) AS integer) * 60 + CAST(substr(`start_time`, 4, 2) AS integer),
    COALESCE((SELECT CAST(substr(`overtime_starts_at`, 1, 2) AS integer) * 60 + CAST(substr(`overtime_starts_at`, 4, 2) AS integer) FROM `hr_policy` WHERE `id` = 1), 1155)
  )
)
WHERE `type` = 'mission' AND `start_time` <> '' AND `end_time` <> '';--> statement-breakpoint
UPDATE `employee_requests`
SET `leave_paid` = 1
WHERE `type` = 'leave' AND `status` = 'approved';--> statement-breakpoint
UPDATE `attendance_records`
SET `early_leave_excused` = 1,
    `late_excused` = 0,
    `updated_at` = CURRENT_TIMESTAMP
WHERE EXISTS (
  SELECT 1
  FROM `employee_requests`
  WHERE `employee_requests`.`employee_id` = `attendance_records`.`employee_id`
    AND `employee_requests`.`date_from` = `attendance_records`.`work_date`
    AND `employee_requests`.`type` = 'early_leave'
    AND `employee_requests`.`status` = 'approved'
);
