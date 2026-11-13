CREATE TABLE `events` (
	`id` integer,
	`title` text,
	`start` text,
	`microlax` integer,
	CONSTRAINT `events_pk` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `api_clients` (
	`client_id` text NOT NULL,
	`client_secret` blob NOT NULL,
	`description` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP,
	CONSTRAINT `api_clients_pk` PRIMARY KEY(`client_id`)
);
