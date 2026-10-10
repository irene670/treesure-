CREATE TABLE `newsletter_subscribers` (
	`email` text PRIMARY KEY NOT NULL,
	`unsubscribe_token` text NOT NULL,
	`consent_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`active` text DEFAULT '1' NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `newsletter_subscribers_unsubscribe_token_unique` ON `newsletter_subscribers` (`unsubscribe_token`);