CREATE TABLE `glossary_entries` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`term` varchar(255) NOT NULL,
	`translation` varchar(500) NOT NULL,
	`notes` text,
	`source_language` varchar(50),
	`target_language` varchar(50),
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `glossary_entries_id` PRIMARY KEY(`id`)
);
