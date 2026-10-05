import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const inventories = sqliteTable(
  "inventories",
  {
    id: text("id").primaryKey(),
    ownerKey: text("owner_key").notNull(),
    supplierSlug: text("supplier_slug").notNull(),
    savedAt: text("saved_at").notNull(),
    positionCount: integer("position_count").notNull(),
    totalCount: integer("total_count").notNull(),
    defectiveCount: integer("defective_count").notNull().default(0),
  },
  (table) => [
    index("inventories_owner_supplier_idx").on(table.ownerKey, table.supplierSlug),
  ],
);

export const inventoryItems = sqliteTable(
  "inventory_items",
  {
    id: text("id").primaryKey(),
    inventoryId: text("inventory_id").notNull(),
    supplierSlug: text("supplier_slug").notNull(),
    productId: text("product_id").notNull(),
    barcode: text("barcode").notNull(),
    count: integer("count").notNull(),
    defective: integer("defective", { mode: "boolean" }).notNull().default(false),
    position: integer("position").notNull(),
  },
  (table) => [index("inventory_items_inventory_idx").on(table.inventoryId)],
);

export const inventoryPhotos = sqliteTable(
  "inventory_photos",
  {
    id: text("id").primaryKey(),
    inventoryItemId: text("inventory_item_id").notNull(),
    objectKey: text("object_key").notNull(),
    position: integer("position").notNull(),
  },
  (table) => [index("inventory_photos_item_idx").on(table.inventoryItemId)],
);
