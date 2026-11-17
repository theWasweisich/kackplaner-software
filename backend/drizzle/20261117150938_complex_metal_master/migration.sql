CREATE TABLE `users` (
	`id` integer PRIMARY KEY,
	`username` text UNIQUE,
	`display_name` text,
	`password` text
);
--> statement-breakpoint
ALTER TABLE `events` ADD `userId` integer REFERENCES users(id);