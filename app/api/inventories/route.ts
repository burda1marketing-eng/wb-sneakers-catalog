import catalog from "../../data/catalog.json";
import { getSiteRuntimeEnv } from "../../../worker/runtime-env";

type IncomingItem = {
  productId?: unknown;
  barcode?: unknown;
  count?: unknown;
  defective?: unknown;
  photos?: unknown;
};

const allowedOrigin = (origin: string | null) =>
  !origin ||
  origin === "https://burda1marketing-eng.github.io" ||
  origin.endsWith(".chatgpt.site") ||
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  const headers = new Headers({
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
  });
  if (origin && allowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set("Vary", "Origin");
  }
  return headers;
}

function json(request: Request, body: unknown, status = 200) {
  const headers = corsHeaders(request);
  headers.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers });
}

async function ensureSchema(db: D1Database) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS inventories (
      id TEXT PRIMARY KEY NOT NULL,
      owner_key TEXT NOT NULL,
      supplier_slug TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      position_count INTEGER NOT NULL,
      total_count INTEGER NOT NULL,
      defective_count INTEGER NOT NULL DEFAULT 0
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS inventories_owner_supplier_idx ON inventories (owner_key, supplier_slug)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_items (
      id TEXT PRIMARY KEY NOT NULL,
      inventory_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      barcode TEXT NOT NULL,
      count INTEGER NOT NULL,
      defective INTEGER NOT NULL DEFAULT 0,
      position INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS inventory_items_inventory_idx ON inventory_items (inventory_id)"),
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory_photos (
      id TEXT PRIMARY KEY NOT NULL,
      inventory_item_id TEXT NOT NULL,
      object_key TEXT NOT NULL,
      position INTEGER NOT NULL
    )`),
    db.prepare("CREATE INDEX IF NOT EXISTS inventory_photos_item_idx ON inventory_photos (inventory_item_id)"),
  ]);
}

function decodePhoto(dataUrl: string) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  const binary = atob(match[2]);
  if (binary.length > 600_000) return null;
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return { bytes, contentType: match[1] };
}

function findCatalogItem(supplierSlug: string, productId: string, barcode: string) {
  const supplier = catalog.suppliers.find((entry) => entry.slug === supplierSlug);
  const product = supplier?.products.find((entry) => entry.id === productId);
  const size = product?.sizes.find((entry) => entry.barcode === barcode);
  return product && size ? { product, size } : null;
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request: Request) {
  const bindings = getSiteRuntimeEnv();
  if (!bindings.DB) return json(request, { error: "Хранилище отчётов пока недоступно" }, 503);
  await ensureSchema(bindings.DB);

  const url = new URL(request.url);
  const id = url.searchParams.get("id");
  if (id) {
    const inventory = await bindings.DB.prepare(
      "SELECT id, supplier_slug, saved_at, position_count, total_count, defective_count FROM inventories WHERE id = ?",
    ).bind(id).first<Record<string, string | number>>();
    if (!inventory) return json(request, { error: "Инвентаризация не найдена" }, 404);

    const itemRows = await bindings.DB.prepare(
      "SELECT id, product_id, barcode, count, defective, position FROM inventory_items WHERE inventory_id = ? ORDER BY position",
    ).bind(id).all<Record<string, string | number>>();
    const photoRows = await bindings.DB.prepare(
      "SELECT inventory_item_id, object_key, position FROM inventory_photos WHERE inventory_item_id IN (SELECT id FROM inventory_items WHERE inventory_id = ?) ORDER BY position",
    ).bind(id).all<Record<string, string | number>>();
    const origin = url.origin;
    const photosByItem = new Map<string, string[]>();
    for (const photo of photoRows.results) {
      const itemId = String(photo.inventory_item_id);
      const photos = photosByItem.get(itemId) ?? [];
      photos.push(`${origin}/api/inventory-photos/${String(photo.object_key).split("/").map(encodeURIComponent).join("/")}`);
      photosByItem.set(itemId, photos);
    }

    return json(request, {
      id: String(inventory.id),
      supplierSlug: String(inventory.supplier_slug),
      savedAt: String(inventory.saved_at),
      positionCount: Number(inventory.position_count),
      totalCount: Number(inventory.total_count),
      defectiveCount: Number(inventory.defective_count),
      items: itemRows.results.map((item) => ({
        productId: String(item.product_id),
        barcode: String(item.barcode),
        count: Number(item.count),
        defective: Boolean(item.defective),
        photos: photosByItem.get(String(item.id)) ?? [],
      })),
    });
  }

  const ownerKey = url.searchParams.get("ownerKey")?.slice(0, 100);
  const supplierSlug = url.searchParams.get("supplierSlug")?.slice(0, 100);
  if (!ownerKey || !supplierSlug) return json(request, { error: "Не указаны параметры истории" }, 400);
  const rows = await bindings.DB.prepare(
    "SELECT id, supplier_slug, saved_at, position_count, total_count, defective_count FROM inventories WHERE owner_key = ? AND supplier_slug = ? ORDER BY saved_at DESC LIMIT 100",
  ).bind(ownerKey, supplierSlug).all<Record<string, string | number>>();

  return json(request, {
    reports: rows.results.map((row) => ({
      id: String(row.id),
      supplierSlug: String(row.supplier_slug),
      savedAt: String(row.saved_at),
      positionCount: Number(row.position_count),
      totalCount: Number(row.total_count),
      defectiveCount: Number(row.defective_count),
    })),
  });
}

export async function POST(request: Request) {
  const bindings = getSiteRuntimeEnv();
  if (!bindings.DB || !bindings.INVENTORY_PHOTOS) {
    return json(request, { error: "Хранилище инвентаризаций пока недоступно" }, 503);
  }
  if (!allowedOrigin(request.headers.get("origin"))) {
    return json(request, { error: "Этот источник не разрешён" }, 403);
  }

  let body: { ownerKey?: unknown; supplierSlug?: unknown; items?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(request, { error: "Некорректные данные" }, 400);
  }
  const ownerKey = typeof body.ownerKey === "string" ? body.ownerKey.slice(0, 100) : "";
  const supplierSlug = typeof body.supplierSlug === "string" ? body.supplierSlug.slice(0, 100) : "";
  if (!ownerKey || !supplierSlug || !Array.isArray(body.items) || !body.items.length || body.items.length > 500) {
    return json(request, { error: "Проверьте состав инвентаризации" }, 400);
  }

  const normalized = (body.items as IncomingItem[]).map((item) => {
    const productId = typeof item.productId === "string" ? item.productId : "";
    const barcode = typeof item.barcode === "string" ? item.barcode : "";
    const count = Number(item.count);
    const defective = item.defective === true;
    const photos = Array.isArray(item.photos)
      ? item.photos.filter((photo): photo is string => typeof photo === "string").slice(0, 10)
      : [];
    return { productId, barcode, count, defective, photos };
  });
  if (normalized.some((item) => !Number.isInteger(item.count) || item.count < 1 || item.count > 9999 || !findCatalogItem(supplierSlug, item.productId, item.barcode))) {
    return json(request, { error: "В отчёте есть неизвестная модель, размер или количество" }, 400);
  }

  const decodedPhotos = normalized.map((item) => item.photos.map(decodePhoto));
  if (decodedPhotos.some((photos) => photos.some((photo) => !photo))) {
    return json(request, { error: "Одно из фото имеет неподдерживаемый формат или слишком большой размер" }, 400);
  }

  await ensureSchema(bindings.DB);
  const id = crypto.randomUUID();
  const savedAt = new Date().toISOString();
  const totalCount = normalized.reduce((sum, item) => sum + item.count, 0);
  const defectiveCount = normalized.filter((item) => item.defective).length;
  const statements = [
    bindings.DB.prepare(
      "INSERT INTO inventories (id, owner_key, supplier_slug, saved_at, position_count, total_count, defective_count) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(id, ownerKey, supplierSlug, savedAt, normalized.length, totalCount, defectiveCount),
  ];

  for (let itemIndex = 0; itemIndex < normalized.length; itemIndex += 1) {
    const item = normalized[itemIndex];
    const itemId = crypto.randomUUID();
    statements.push(bindings.DB.prepare(
      "INSERT INTO inventory_items (id, inventory_id, product_id, barcode, count, defective, position) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(itemId, id, item.productId, item.barcode, item.count, item.defective ? 1 : 0, itemIndex));

    for (let photoIndex = 0; photoIndex < decodedPhotos[itemIndex].length; photoIndex += 1) {
      const photo = decodedPhotos[itemIndex][photoIndex]!;
      const photoId = crypto.randomUUID();
      const extension = photo.contentType === "image/png" ? "png" : photo.contentType === "image/webp" ? "webp" : "jpg";
      const objectKey = `inventories/${id}/${itemId}/${photoId}.${extension}`;
      await bindings.INVENTORY_PHOTOS.put(objectKey, photo.bytes, {
        httpMetadata: { contentType: photo.contentType, cacheControl: "public, max-age=31536000, immutable" },
      });
      statements.push(bindings.DB.prepare(
        "INSERT INTO inventory_photos (id, inventory_item_id, object_key, position) VALUES (?, ?, ?, ?)",
      ).bind(photoId, itemId, objectKey, photoIndex));
    }
  }

  await bindings.DB.batch(statements);
  return json(request, { id, savedAt, positionCount: normalized.length, totalCount, defectiveCount }, 201);
}
