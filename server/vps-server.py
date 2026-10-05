#!/usr/bin/env python3
import base64
import json
import mimetypes
import os
import re
import sqlite3
import uuid
from datetime import datetime, timezone
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = Path(os.environ.get("PUBLIC_DIR", ROOT / "public")).resolve()
DATA_DIR = Path(os.environ.get("DATA_DIR", ROOT / "data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "inventory.db"
CATALOG_PATH = Path(os.environ.get("CATALOG_PATH", ROOT / "catalog.json")).resolve()
HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8787"))
MAX_BODY = 30 * 1024 * 1024
PHOTO_RE = re.compile(r"^data:(image/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$")

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
CATALOG = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))


def connect():
    db = sqlite3.connect(DB_PATH, timeout=20)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA journal_mode=WAL")
    db.execute("PRAGMA foreign_keys=ON")
    return db


def init_db():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS inventories (
          id TEXT PRIMARY KEY,
          owner_key TEXT NOT NULL,
          saved_at TEXT NOT NULL,
          position_count INTEGER NOT NULL,
          total_count INTEGER NOT NULL,
          defective_count INTEGER NOT NULL DEFAULT 0
        );
        CREATE INDEX IF NOT EXISTS inventories_owner_idx ON inventories(owner_key, saved_at DESC);
        CREATE TABLE IF NOT EXISTS inventory_items (
          id TEXT PRIMARY KEY,
          inventory_id TEXT NOT NULL REFERENCES inventories(id) ON DELETE CASCADE,
          supplier_slug TEXT NOT NULL,
          product_id TEXT NOT NULL,
          barcode TEXT NOT NULL,
          count INTEGER NOT NULL,
          defective INTEGER NOT NULL DEFAULT 0,
          position INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS inventory_items_inventory_idx ON inventory_items(inventory_id, position);
        CREATE TABLE IF NOT EXISTS inventory_photos (
          id TEXT PRIMARY KEY,
          inventory_item_id TEXT NOT NULL REFERENCES inventory_items(id) ON DELETE CASCADE,
          object_key TEXT NOT NULL,
          position INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS inventory_photos_item_idx ON inventory_photos(inventory_item_id, position);
        """)


def catalog_item(supplier_slug, product_id, barcode):
    supplier = next((item for item in CATALOG["suppliers"] if item["slug"] == supplier_slug), None)
    product = next((item for item in supplier["products"] if item["id"] == product_id), None) if supplier else None
    size = next((item for item in product["sizes"] if item["barcode"] == barcode), None) if product else None
    return product is not None and size is not None


class Handler(SimpleHTTPRequestHandler):
    server_version = "InventoryVPS/1.0"

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}", flush=True)

    def send_json(self, payload, status=200):
        body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/api/inventories":
            return self.get_inventories(parse_qs(parsed.query))
        if parsed.path.startswith("/api/inventory-photos/"):
            return self.get_photo(parsed.path[len("/api/inventory-photos/"):])
        return super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path != "/api/inventories":
            return self.send_json({"error": "Маршрут не найден"}, 404)
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_BODY:
            return self.send_json({"error": "Отчёт слишком большой"}, 413)
        try:
            payload = json.loads(self.rfile.read(length))
        except Exception:
            return self.send_json({"error": "Некорректные данные"}, 400)
        return self.save_inventory(payload)

    def translate_path(self, path):
        parsed_path = unquote(urlparse(path).path)
        if parsed_path.endswith("/"):
            parsed_path += "index.html"
        candidate = (PUBLIC_DIR / parsed_path.lstrip("/")).resolve()
        if PUBLIC_DIR not in candidate.parents and candidate != PUBLIC_DIR:
            return str(PUBLIC_DIR / "404.html")
        if not candidate.exists() and not candidate.suffix:
            nested = candidate / "index.html"
            if nested.exists():
                candidate = nested
        if not candidate.exists():
            candidate = PUBLIC_DIR / "404.html"
        return str(candidate)

    def end_headers(self):
        if self.path.startswith("/assets/"):
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        super().end_headers()

    def get_inventories(self, params):
        report_id = (params.get("id") or [""])[0][:100]
        with connect() as db:
            if report_id:
                inventory = db.execute("SELECT * FROM inventories WHERE id=?", (report_id,)).fetchone()
                if inventory is None:
                    return self.send_json({"error": "Инвентаризация не найдена"}, 404)
                items = db.execute("SELECT * FROM inventory_items WHERE inventory_id=? ORDER BY position", (report_id,)).fetchall()
                photos = db.execute("""SELECT p.inventory_item_id, p.object_key, p.position
                    FROM inventory_photos p JOIN inventory_items i ON i.id=p.inventory_item_id
                    WHERE i.inventory_id=? ORDER BY p.position""", (report_id,)).fetchall()
                photo_map = {}
                scheme = self.headers.get("X-Forwarded-Proto", "http").split(",")[0].strip()
                origin = f"{scheme}://{self.headers.get('Host')}"
                for photo in photos:
                    photo_map.setdefault(photo["inventory_item_id"], []).append(
                        f"{origin}/api/inventory-photos/{photo['object_key']}"
                    )
                return self.send_json({
                    "id": inventory["id"], "supplierSlug": "all", "savedAt": inventory["saved_at"],
                    "positionCount": inventory["position_count"], "totalCount": inventory["total_count"],
                    "defectiveCount": inventory["defective_count"],
                    "items": [{
                        "supplierSlug": item["supplier_slug"], "productId": item["product_id"],
                        "barcode": item["barcode"], "count": item["count"],
                        "defective": bool(item["defective"]), "photos": photo_map.get(item["id"], [])
                    } for item in items]
                })
            owner_key = (params.get("ownerKey") or [""])[0][:100]
            if not owner_key:
                return self.send_json({"error": "Не указан владелец истории"}, 400)
            rows = db.execute("""SELECT id, saved_at, position_count, total_count, defective_count
                FROM inventories WHERE owner_key=? ORDER BY saved_at DESC LIMIT 200""", (owner_key,)).fetchall()
            return self.send_json({"reports": [{
                "id": row["id"], "supplierSlug": "all", "savedAt": row["saved_at"],
                "positionCount": row["position_count"], "totalCount": row["total_count"],
                "defectiveCount": row["defective_count"]
            } for row in rows]})

    def get_photo(self, encoded_key):
        key = unquote(encoded_key).replace("\\", "/").lstrip("/")
        if not key.startswith("inventories/") or ".." in key.split("/"):
            return self.send_error(404)
        target = (UPLOAD_DIR / key).resolve()
        if UPLOAD_DIR not in target.parents or not target.is_file():
            return self.send_error(404)
        mime = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
        data = target.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "public, max-age=31536000, immutable")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def save_inventory(self, payload):
        owner_key = str(payload.get("ownerKey", ""))[:100]
        raw_items = payload.get("items")
        if not owner_key or not isinstance(raw_items, list) or not 1 <= len(raw_items) <= 1000:
            return self.send_json({"error": "Проверьте состав инвентаризации"}, 400)
        items = []
        try:
            for raw in raw_items:
                supplier_slug = str(raw.get("supplierSlug", ""))[:100]
                product_id = str(raw.get("productId", ""))[:100]
                barcode = str(raw.get("barcode", ""))[:100]
                count = int(raw.get("count", 0))
                defective = raw.get("defective") is True
                photos = raw.get("photos") if isinstance(raw.get("photos"), list) else []
                photos = photos[:10]
                if not 1 <= count <= 9999 or not catalog_item(supplier_slug, product_id, barcode):
                    raise ValueError()
                decoded = []
                for source in photos:
                    match = PHOTO_RE.match(source) if isinstance(source, str) else None
                    if not match:
                        raise ValueError()
                    data = base64.b64decode(match.group(2), validate=True)
                    if len(data) > 600_000:
                        raise ValueError()
                    decoded.append((match.group(1), data))
                items.append((supplier_slug, product_id, barcode, count, defective, decoded))
        except Exception:
            return self.send_json({"error": "В отчёте есть неизвестная модель, размер, фото или количество"}, 400)

        inventory_id = str(uuid.uuid4())
        saved_at = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        total = sum(item[3] for item in items)
        defects = sum(1 for item in items if item[4])
        created_files = []
        try:
            with connect() as db:
                db.execute("INSERT INTO inventories VALUES (?, ?, ?, ?, ?, ?)",
                           (inventory_id, owner_key, saved_at, len(items), total, defects))
                for position, item in enumerate(items):
                    item_id = str(uuid.uuid4())
                    db.execute("INSERT INTO inventory_items VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                               (item_id, inventory_id, item[0], item[1], item[2], item[3], int(item[4]), position))
                    for photo_position, (mime, data) in enumerate(item[5]):
                        photo_id = str(uuid.uuid4())
                        extension = {"image/png": "png", "image/webp": "webp"}.get(mime, "jpg")
                        object_key = f"inventories/{inventory_id}/{item_id}/{photo_id}.{extension}"
                        target = UPLOAD_DIR / object_key
                        target.parent.mkdir(parents=True, exist_ok=True)
                        target.write_bytes(data)
                        created_files.append(target)
                        db.execute("INSERT INTO inventory_photos VALUES (?, ?, ?, ?)",
                                   (photo_id, item_id, object_key, photo_position))
        except Exception as error:
            for target in created_files:
                target.unlink(missing_ok=True)
            print(f"save failed: {error}", flush=True)
            return self.send_json({"error": "Не удалось сохранить отчёт"}, 500)
        return self.send_json({
            "id": inventory_id, "savedAt": saved_at, "positionCount": len(items),
            "totalCount": total, "defectiveCount": defects
        }, 201)


if __name__ == "__main__":
    init_db()
    print(f"Inventory server listening on http://{HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
