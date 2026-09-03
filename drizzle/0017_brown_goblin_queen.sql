ALTER TABLE `production_work_orders` ADD `addons_json` text DEFAULT '[]' NOT NULL;
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Rana Wagih', '01055875887', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Rana Wagih' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Margret', '01278264486', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Margret' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Layal', '01115559983', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Layal' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Youstina', '01279230089', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Youstina' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Nour', '01063820556', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Nour' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Maha', '01090509247', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Maha' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Hla', '01055445568', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Hla' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Sherouk Abdallah', '01153458342', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Sherouk Abdallah' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Ranem', '01111692898', '', '', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Ranem' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Neven Tarek', '01118229804', '', 'Ahmed Attia', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Neven Tarek' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Esraa Elsobky', '01118229804', '', 'Ahmed Attia', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Esraa Elsobky' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Samar Heagazy', '01118229804', '', 'Ahmed Attia', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Samar Heagazy' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Aya El Tourki', '01118229804', '', 'Ahmed Attia', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Aya El Tourki' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Manal Fathlla', '01118229804', '', 'Ahmed Attia', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Manal Fathlla' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Tia Zuhair', '01140445763', '', 'Foreign model', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Tia Zuhair' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Angel', '01062485466', '', 'Foreign model', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Angel' COLLATE NOCASE);
--> statement-breakpoint
INSERT INTO `production_crew_members` (`category`, `name`, `phone`, `profile_url`, `notes`, `active`)
SELECT 'model', 'Anastasia', '01559911997', '', 'Foreign model', 1 WHERE NOT EXISTS (SELECT 1 FROM `production_crew_members` WHERE `category` = 'model' AND `name` = 'Anastasia' COLLATE NOCASE);
