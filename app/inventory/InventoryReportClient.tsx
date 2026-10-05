"use client";

import { useEffect, useMemo, useState } from "react";
import { parseInventoryShareToken, type InventorySharePayload } from "./share";
import { primarySizeLabel, sizeSecondaryLabel, type CatalogSize as Size } from "../size-format";

type Product = {
  id: string;
  vendorCode: string;
  title: string;
  brand: string;
  photos: string[];
  sizes: Size[];
};
type Supplier = {
  slug: string;
  legalName: string;
  storeName: string;
  country: string;
  inn: string;
  supplierId: string;
  products: Product[];
};
type ServerReport = {
  id: string;
  supplierSlug: string;
  savedAt: string;
  positionCount: number;
  totalCount: number;
  defectiveCount: number;
  items: Array<{
    supplierSlug: string;
    productId: string;
    barcode: string;
    count: number;
    defective: boolean;
    photos: string[];
  }>;
};

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

function localHref(pathname: string) {
  return `${PUBLIC_BASE_PATH}${pathname}`;
}

function apiHref(pathname: string) {
  return API_ORIGIN ? `${API_ORIGIN.replace(/\/$/, "")}${pathname}` : pathname;
}

function formatSavedAt(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "дата не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);
}

export default function InventoryReportClient({ suppliers }: { suppliers: Supplier[] }) {
  const [serverReport, setServerReport] = useState<ServerReport | null>(null);
  const [legacyPayload, setLegacyPayload] = useState<InventorySharePayload | null>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [openPhoto, setOpenPhoto] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const id = new URLSearchParams(window.location.search).get("id");
      if (id) {
        try {
          const response = await fetch(apiHref(`/api/inventories?id=${encodeURIComponent(id)}`));
          const data = await response.json() as ServerReport & { error?: string };
          if (!response.ok) throw new Error(data.error || "Отчёт не найден");
          if (!cancelled) setServerReport(data);
        } catch (error) {
          if (!cancelled) setLoadError(error instanceof Error ? error.message : "Не удалось загрузить отчёт");
        } finally {
          if (!cancelled) setReady(true);
        }
        return;
      }

      setLegacyPayload(parseInventoryShareToken(window.location.hash.slice(1)));
      setReady(true);
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  const report = useMemo(() => {
    const legacyItems = legacyPayload?.v === 3
      ? legacyPayload.i.map(([supplierSlug, productId, barcode, count, defective, photos]) => ({
          supplierSlug,
          productId,
          barcode,
          count,
          defective: defective === 1,
          photos,
        }))
      : legacyPayload?.v === 2
      ? legacyPayload.i.map(([productId, barcode, count, defective, photos]) => ({
          supplierSlug: legacyPayload.s,
          productId,
          barcode,
          count,
          defective: defective === 1,
          photos,
        }))
      : legacyPayload?.i.map(([productId, barcode, count]) => ({
          supplierSlug: legacyPayload.s,
          productId,
          barcode,
          count,
          defective: false,
          photos: [],
        })) ?? [];
    const sourceItems = serverReport?.items ?? legacyItems;
    const items = sourceItems.flatMap((entry) => {
      const supplier = suppliers.find((item) => item.slug === entry.supplierSlug);
      const product = supplier?.products.find((item) => item.id === entry.productId);
      const size = product?.sizes.find((item) => item.barcode === entry.barcode);
      return supplier && product && size ? [{ supplier, product, size, ...entry }] : [];
    });
    const reportSuppliers = [...new Map(items.map((item) => [item.supplier.slug, item.supplier])).values()];
    return {
      suppliers: reportSuppliers,
      items,
      savedAt: serverReport?.savedAt ?? legacyPayload?.d ?? "",
    };
  }, [legacyPayload, serverReport, suppliers]);

  const total = report?.items.reduce((sum, item) => sum + item.count, 0) ?? 0;
  const defectiveTotal = report?.items.filter((item) => item.defective).length ?? 0;
  const photoTotal = report?.items.reduce((sum, item) => sum + item.photos.length, 0) ?? 0;

  if (!ready) {
    return <main className="report-state">Загружаем сохранённую инвентаризацию…</main>;
  }

  if ((!serverReport && !legacyPayload) || !report) {
    return (
      <main className="report-state">
        <span aria-hidden="true">▦</span>
        <h1>Ссылка на инвентаризацию недействительна</h1>
        <p>{loadError || "Попросите отправителя заново открыть сохранённый отчёт и скопировать новую ссылку."}</p>
        <a href={localHref("/")}>Открыть каталог</a>
      </main>
    );
  }

  return (
    <main className="report-shell">
      <header className="report-header">
        <a className="inventory-archive-link" href={localHref("/inventories/")}>← Все инвентаризации</a>
        <p className="eyebrow">Сохранённая инвентаризация</p>
        <h1>Остатки после инвентаризации</h1>
        <p className="report-supplier">
          <strong>{report.suppliers.length === 1 ? report.suppliers[0].legalName : "Все кабинеты"}</strong>
          <span>{report.suppliers.map((item) => `${item.country} · ${item.storeName}`).join(" · ")}</span>
        </p>
        <div className="report-summary" aria-label="Итоги инвентаризации">
          <span><strong>{report.items.length}</strong> позиций</span>
          <span><strong>{total}</strong> единиц</span>
          <span><strong>{defectiveTotal}</strong> с браком</span>
          <span><strong>{photoTotal}</strong> фото брака</span>
          <span>Сохранено {formatSavedAt(report.savedAt)}</span>
        </div>
      </header>

      {report.items.length ? (
        <section className="report-list" aria-label="Остатки товаров">
          {report.items.map(({ supplier, product, size, count, defective, photos }) => (
            <article className={`report-item${defective ? " is-defective" : ""}`} key={`${supplier.slug}:${product.id}:${size.barcode}`}>
              <div className="report-image-wrap">
                {product.photos[0] ? <img src={product.photos[0]} alt={`${product.title}, вид спереди`} /> : null}
              </div>
              <div className="report-item-copy">
                <p>{product.brand}</p>
                <h2>{product.title}</h2>
                <div className="report-item-meta">
                  <span>WB {product.id}</span>
                  <span>Арт. {product.vendorCode}</span>
                  <span>{supplier.legalName} · {supplier.storeName}</span>
                  {defective ? <strong>Брак</strong> : null}
                </div>
              </div>
              <div className="report-size">
                <small>Размер производителя</small>
                <strong>{primarySizeLabel(size)}</strong>
                <span>{sizeSecondaryLabel(size)}</span>
              </div>
              <div className="report-barcode">
                <small>Штрихкод</small>
                <code>{size.barcode}</code>
              </div>
              <div className="report-count">
                <small>Осталось</small>
                <strong>{count}</strong>
                <span>шт.</span>
              </div>
              {defective ? (
                <div className="report-defect-block">
                  <div>
                    <strong>Брак</strong>
                    <span>{photos.length ? `${photos.length} фото` : "без фото"}</span>
                  </div>
                  {photos.length ? (
                    <div className="report-defect-photos">
                      {photos.map((photo, index) => (
                        <button type="button" key={photo} onClick={() => setOpenPhoto(photo)} aria-label={`Открыть фото брака ${index + 1}`}>
                          <img src={photo} alt={`Фото брака ${index + 1}: ${product.title}`} />
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </section>
      ) : (
        <section className="report-empty">
          <strong>В сохранённой инвентаризации нет остатков</strong>
        </section>
      )}

      {openPhoto ? (
        <button className="report-photo-lightbox" type="button" onClick={() => setOpenPhoto(null)} aria-label="Закрыть увеличенное фото">
          <img src={openPhoto} alt="Увеличенное фото брака" />
          <span>Закрыть ×</span>
        </button>
      ) : null}
    </main>
  );
}
