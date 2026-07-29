"use client";

import { useEffect, useMemo, useState } from "react";
import { parseInventoryShareToken, type InventorySharePayload } from "./share";

type Size = { label: string; ru: string; barcode: string };
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
    const supplierSlug = serverReport?.supplierSlug ?? legacyPayload?.s;
    const supplier = suppliers.find((item) => item.slug === supplierSlug);
    if (!supplier) return null;

    const sourceItems = serverReport?.items ?? legacyPayload?.i.map(([productId, barcode, count]) => ({
      productId,
      barcode,
      count,
      defective: false,
      photos: [],
    })) ?? [];
    const items = sourceItems.flatMap((entry) => {
      const product = supplier.products.find((item) => item.id === entry.productId);
      const size = product?.sizes.find((item) => item.barcode === entry.barcode);
      return product && size ? [{ product, size, ...entry }] : [];
    });
    return {
      supplier,
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
        <a className="wordmark" href={localHref("/")} aria-label="Вернуться в каталог">
          <span className="wordmark-mark">↗</span>
          Каталог обуви
        </a>
        <p className="eyebrow">Сохранённая инвентаризация</p>
        <h1>Остатки после инвентаризации</h1>
        <p className="report-supplier">
          <strong>{report.supplier.legalName}</strong>
          <span>{report.supplier.country} · {report.supplier.storeName}</span>
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
          {report.items.map(({ product, size, count, defective, photos }) => (
            <article className={`report-item${defective ? " is-defective" : ""}`} key={`${product.id}:${size.barcode}`}>
              <div className="report-image-wrap">
                {product.photos[0] ? <img src={product.photos[0]} alt={`${product.title}, вид спереди`} /> : null}
              </div>
              <div className="report-item-copy">
                <p>{product.brand}</p>
                <h2>{product.title}</h2>
                <div className="report-item-meta">
                  <span>WB {product.id}</span>
                  <span>Арт. {product.vendorCode}</span>
                  {defective ? <strong>Брак</strong> : null}
                </div>
              </div>
              <div className="report-size">
                <small>Размер</small>
                <strong>{size.label || "—"}</strong>
                <span>RU {size.ru || "—"}</span>
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
