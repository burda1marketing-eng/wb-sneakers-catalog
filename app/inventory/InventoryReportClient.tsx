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

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function localHref(pathname: string) {
  return `${PUBLIC_BASE_PATH}${pathname}`;
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
  const [payload, setPayload] = useState<InventorySharePayload | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const readHash = () => {
      setPayload(parseInventoryShareToken(window.location.hash.slice(1)));
      setReady(true);
    };
    readHash();
    window.addEventListener("hashchange", readHash);
    return () => window.removeEventListener("hashchange", readHash);
  }, []);

  const report = useMemo(() => {
    if (!payload) return null;
    const supplier = suppliers.find((item) => item.slug === payload.s);
    if (!supplier) return null;

    const items = payload.i.flatMap(([productId, barcode, count]) => {
      const product = supplier.products.find((item) => item.id === productId);
      const size = product?.sizes.find((item) => item.barcode === barcode);
      return product && size ? [{ product, size, count }] : [];
    });

    return { supplier, items };
  }, [payload, suppliers]);

  const total = report?.items.reduce((sum, item) => sum + item.count, 0) ?? 0;

  if (!ready) {
    return <main className="report-state">Загружаем сохранённую инвентаризацию…</main>;
  }

  if (!payload || !report) {
    return (
      <main className="report-state">
        <span aria-hidden="true">▦</span>
        <h1>Ссылка на инвентаризацию недействительна</h1>
        <p>Попросите отправителя заново сохранить инвентаризацию и скопировать новую ссылку.</p>
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
          <span>Сохранено {formatSavedAt(payload.d)}</span>
        </div>
      </header>

      {report.items.length ? (
        <section className="report-list" aria-label="Остатки товаров">
          {report.items.map(({ product, size, count }) => (
            <article className="report-item" key={`${product.id}:${size.barcode}`}>
              <div className="report-image-wrap">
                {product.photos[0] ? (
                  <img src={product.photos[0]} alt={`${product.title}, вид спереди`} />
                ) : null}
              </div>
              <div className="report-item-copy">
                <p>{product.brand}</p>
                <h2>{product.title}</h2>
                <div className="report-item-meta">
                  <span>WB {product.id}</span>
                  <span>Арт. {product.vendorCode}</span>
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
            </article>
          ))}
        </section>
      ) : (
        <section className="report-empty">
          <strong>В сохранённой инвентаризации нет остатков</strong>
        </section>
      )}
    </main>
  );
}
