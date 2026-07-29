import { cp, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outputDir = resolve(projectRoot, "work", "gh-pages");
const basePath = "/wb-sneakers-catalog";
const publicOrigin = "https://burda1marketing-eng.github.io";
const routes = [
  "/",
  "/inventory",
  "/catalog/filippov-ru",
  "/catalog/filippov-kg",
  "/catalog/rubtsova-lv-ru",
  "/catalog/rubtsova-av-ru",
  "/catalog/discountus-kg",
];

const workerUrl = pathToFileURL(resolve(projectRoot, "dist", "server", "index.js"));
workerUrl.searchParams.set("static-export", `${Date.now()}`);
const { default: worker } = await import(workerUrl.href);

await mkdir(outputDir, { recursive: true });
for (const entry of await readdir(outputDir)) {
  if (entry !== ".git") {
    await rm(resolve(outputDir, entry), { recursive: true, force: true });
  }
}
await cp(resolve(projectRoot, "dist", "client", "assets"), resolve(outputDir, "assets"), {
  recursive: true,
});
await cp(resolve(projectRoot, "dist", "client", "og.png"), resolve(outputDir, "og.png"));

for (const route of routes) {
  const response = await worker.fetch(
    new Request(`http://localhost${route}`, { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  if (!response.ok) {
    throw new Error(`Could not render ${route}: HTTP ${response.status}`);
  }

  let html = await response.text();
  html = html
    .replaceAll("/assets/", `${basePath}/assets/`)
    .replaceAll("http://localhost:3000/og.png", `${publicOrigin}${basePath}/og.png`)
    .replaceAll("http://localhost/og.png", `${publicOrigin}${basePath}/og.png`);

  const routePath = route === "/" ? "index.html" : `${route.slice(1)}/index.html`;
  const target = resolve(outputDir, routePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, html, "utf8");
}

await cp(resolve(outputDir, "index.html"), resolve(outputDir, "404.html"));
await writeFile(resolve(outputDir, ".nojekyll"), "", "utf8");
console.log(`Exported ${routes.length} routes to ${outputDir}`);
