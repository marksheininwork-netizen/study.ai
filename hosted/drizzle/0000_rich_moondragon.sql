CREATE TABLE `credentials` (
	`owner` text PRIMARY KEY NOT NULL,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `oauth_states` (
	`state` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`verifier` text NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`type` text NOT NULL,
	`course_id` text,
	`data` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_owner` ON `records` (`owner`);--> statement-breakpoint
CREATE INDEX `records_course` ON `records` (`owner`,`course_id`);