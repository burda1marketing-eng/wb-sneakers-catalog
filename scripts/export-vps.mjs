import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "work", "vps", "public");
const routes = [
  "/",
  "/inventory",
  "/inventories",
  "/catalog/filippov-ru",
  "/catalog/filippov-kg",
  "/catalog/rubtsova-lv-ru",
  "/catalog/rubtsova-av-ru",
  "/catalog/discountus-kg",
  "/catalog/talin-cn",
];

const workerUrl = pathToFileURL(resolve(projectRoot, "dist", "server", "index.js"));
workerUrl.searchParams.set("vps-export", `${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

await mkdir(outputDir, { recursive: true });
for (const entry of await readdir(outputDir)) {
  await rm(resolve(outputDir, entry), { recursive: true, force: true });
}
await cp(resolve(projectRoot, "dist", "client", "assets"), resolve(outputDir, "assets"), { recursive: true });
await cp(resolve(projectRoot, "dist", "client", "og.png"), resolve(outputDir, "og.png"));

for (const route of routes) {
  const response = await worker.fetch(
    new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
  if (!response.ok) throw new Error(`Could not render ${route}: HTTP ${response.status}`);
  const routePath = route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
  const target = resolve(outputDir, routePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, await response.text(), "utf8");
}

await cp(resolve(outputDir, "index.html"), resolve(outputDir, "404.html"));
console.log(`Exported ${routes.length} VPS routes to ${outputDir}`);
