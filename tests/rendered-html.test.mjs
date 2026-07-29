import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
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

test("renders mobile catalog content, navigation and inventory entry point", async () => {
  const response = await render("/");
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /Каталог обуви/);
  assert.match(html, /ИП Филиппов/);
  assert.match(html, /mobile-size-strip/);
  assert.match(html, /Размеры и штрихкоды/);
  assert.match(html, /Поиск по каталогу/);
  assert.match(html, /Провести инвентаризацию/);
  assert.match(html, /supplier-mobile-switcher/);
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

test("renders the shareable inventory report route", async () => {
  const response = await render("/inventory");
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Загружаем сохранённую инвентаризацию/);
});

test("ships responsive catalog picker, repeatable inventory and defect photos", async () => {
  const [component, report, api, styles] = await Promise.all([
    readFile(new URL("../app/CatalogClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/inventory/InventoryReportClient.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/inventories/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  assert.match(component, /BrowserMultiFormatReader/);
  assert.match(component, /Сканировать камерой/);
  assert.match(component, /Штрихкод или название/);
  assert.match(component, /Размер для инвентаризации/);
  assert.match(component, /Сохранить инвентаризацию/);
  assert.match(component, /Выгрузить в Excel/);
  assert.match(component, /Посмотреть на сайте/);
  assert.match(component, /Выбрать из общего каталога/);
  assert.match(component, /Количество, шт\./);
  assert.match(component, /Брак/);
  assert.match(component, /capture="environment"/);
  assert.match(component, /Из галереи/);
  assert.match(component, /Создать новую/);
  assert.match(component, /Сохранённые отчёты/);
  assert.match(component, /defectPhotos\.length/);
  assert.match(component, /\.xlsx/);
  assert.doesNotMatch(component, /className="description"|className="modal-media"/);
  assert.match(api, /INVENTORY_PHOTOS/);
  assert.match(api, /CREATE TABLE IF NOT EXISTS inventories/);
  assert.match(api, /photos\.filter/);
  assert.match(report, /api\/inventories\?id=/);
  assert.match(report, /report-defect-photos/);
  assert.match(styles, /@media \(max-width: 900px\)/);
  assert.match(styles, /supplier-mobile-switcher/);
  assert.match(styles, /inventory-saved-actions/);
  assert.match(styles, /inventory-picker-grid/);
  assert.match(styles, /defect-photo-grid/);
  assert.match(styles, /inventory-history-list/);
  assert.match(styles, /report-item/);
  assert.match(styles, /repeat\(auto-fill, minmax/);
});
