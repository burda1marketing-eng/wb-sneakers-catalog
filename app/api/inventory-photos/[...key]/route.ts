import { getSiteRuntimeEnv } from "../../../../worker/runtime-env";

export async function GET(request: Request) {
  const bucket = getSiteRuntimeEnv().INVENTORY_PHOTOS;
  if (!bucket) return new Response("Photo storage unavailable", { status: 503 });
  const pathname = new URL(request.url).pathname;
  const encodedKey = pathname.slice("/api/inventory-photos/".length);
  const key = encodedKey.split("/").map(decodeURIComponent).join("/");
  if (!key.startsWith("inventories/")) return new Response("Not found", { status: 404 });
  const object = await bucket.get(key);
  if (!object) return new Response("Not found", { status: 404 });
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set("ETag", object.httpEtag);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("X-Content-Type-Options", "nosniff");
  return new Response(object.body, { headers });
}
