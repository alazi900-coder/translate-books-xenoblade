CREATE TABLE `translations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`uploaded_file_id` int NOT NULL,
	`source_language` varchar(50) NOT NULL,
	`target_language` varchar(50) NOT NULL,
	`status` enum('pending','processing','completed','failed','paused') NOT NULL DEFAULT 'pending',
	`progress` float NOT NULL DEFAULT 0,
	`translated_file_key` varchar(255),
	`translated_file_url` varchar(500),
	`error_message` text,
	`total_chunks` int DEFAULT 0,
	`processed_chunks` int DEFAULT 0,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	`updated_at` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	`completed_at` timestamp,
	CONSTRAINT `translations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `uploaded_files` (
	`id` int AUTO_INCREMENT NOT NULL,
	`user_id` int NOT NULL,
	`file_name` varchar(255) NOT NULL,
	`file_type` varchar(20) NOT NULL,
	`file_size` int NOT NULL,
	`file_key` varchar(255) NOT NULL,
	`file_url` varchar(500) NOT NULL,
	`created_at` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `uploaded_files_id` PRIMARY KEY(`id`)
);
