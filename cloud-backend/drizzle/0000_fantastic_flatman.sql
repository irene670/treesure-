CREATE TABLE `sapling_events` (
	`id` text PRIMARY KEY NOT NULL,
	`json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sapling_rate_limits` (
	`key` text NOT NULL,
	`window_start` text NOT NULL,
	`count` text NOT NULL,
	PRIMARY KEY(`key`, `window_start`)
);
--> statement-breakpoint
CREATE TABLE `sapling_registrations` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`email` text NOT NULL,
	`json` text NOT NULL,
	`photo_key` text,
	`unsubscribe_token` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sapling_registrations_unsubscribe_token_unique` ON `sapling_registrations` (`unsubscribe_token`);--> statement-breakpoint
CREATE UNIQUE INDEX `sapling_registrations_event_email_unique` ON `sapling_registrations` (`event_id`,`email`);