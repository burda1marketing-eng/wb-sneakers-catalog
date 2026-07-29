CREATE TABLE `inventories` (
	`id` text PRIMARY KEY NOT NULL,
	`owner_key` text NOT NULL,
	`supplier_slug` text NOT NULL,
	`saved_at` text NOT NULL,
	`position_count` integer NOT NULL,
	`total_count` integer NOT NULL,
	`defective_count` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventories_owner_supplier_idx` ON `inventories` (`owner_key`,`supplier_slug`);--> statement-breakpoint
CREATE TABLE `inventory_items` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_id` text NOT NULL,
	`product_id` text NOT NULL,
	`barcode` text NOT NULL,
	`count` integer NOT NULL,
	`defective` integer DEFAULT false NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_items_inventory_idx` ON `inventory_items` (`inventory_id`);--> statement-breakpoint
CREATE TABLE `inventory_photos` (
	`id` text PRIMARY KEY NOT NULL,
	`inventory_item_id` text NOT NULL,
	`object_key` text NOT NULL,
	`position` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `inventory_photos_item_idx` ON `inventory_photos` (`inventory_item_id`);