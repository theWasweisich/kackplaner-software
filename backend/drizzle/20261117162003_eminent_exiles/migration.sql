PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_users` (
	`id` integer PRIMARY KEY,
	`username` text CONSTRAINT `users_username_unique` UNIQUE,
	`display_name` text,
	`password` text NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_users`(`id`, `username`, `display_name`, `password`) SELECT `id`, `username`, `display_name`, `password` FROM `users`;--> statement-breakpoint
DROP TABLE `users`;--> statement-breakpoint
ALTER TABLE `__new_users` RENAME TO `users`;--> statement-breakpoint
PRAGMA foreign_keys=ON;