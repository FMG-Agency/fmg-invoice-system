ALTER TABLE `production_crew_members` ADD `model_nationality` text;--> statement-breakpoint
ALTER TABLE `production_crew_members` ADD `hourly_rate` real;--> statement-breakpoint
ALTER TABLE `production_crew_members` ADD `daily_rate` real;--> statement-breakpoint
UPDATE `production_crew_members`
SET `model_nationality` = CASE WHEN LOWER(`notes`) LIKE '%foreign%' THEN 'foreign' ELSE 'egyptian' END
WHERE `category` = 'model' AND `model_nationality` IS NULL;
