import assert from "node:assert/strict";
import test from "node:test";

async function render(pathname = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}-${pathname}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request(`http://localhost${pathname}`, {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("renders the mobile-first catalog with visible sizes and barcodes", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Каталог обуви/);
  assert.match(html, /ИП Филиппов/);
  assert.match(html, /mobile-size-strip/);
  assert.match(html, /штрихкод/i);
  assert.match(html, /Поиск по каталогу/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton/);
});

test("renders a separate page for every supplier", async () => {
  const routes = [
    ["/catalog/filippov-ru", "ИП Филиппов"],
    ["/catalog/filippov-kg", "FD Store"],
    ["/catalog/rubtsova-lv-ru", "ИП Рубцова Л. В."],
    ["/catalog/rubtsova-av-ru", "ИП Рубцова А. В."],
    ["/catalog/discountus-kg", "ДИСКОНТУС"],
  ];

  for (const [route, marker] of routes) {
    const response = await render(route);
    assert.equal(response.status, 200, route);
    assert.match(await response.text(), new RegExp(marker), route);
  }
});
