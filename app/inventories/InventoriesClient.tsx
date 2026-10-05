"use client";

import { useEffect, useState } from "react";
import { parseInventoryShareToken } from "../inventory/share";
import { primarySizeLabel, type CatalogSize as Size } from "../size-format";

type Product = { id: string; vendorCode: string; title: string; brand: string; sizes: Size[] };
type Supplier = { slug: string; legalName: string; storeName: string; country: string; products: Product[] };
type HistoryItem = {
  id: string;
  supplierSlug: string;
  savedAt: string;
  positionCount: number;
  totalCount: number;
  defectiveCount: number;
  token?: string;
};
type ReportItem = {
  supplierSlug: string;
  productId: string;
  barcode: string;
  count: number;
  defective: boolean;
  photos: string[];
};

const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
const OWNER_KEY = "wb-catalog-inventory-owner";
const HISTORY_KEY = "wb-catalog-inventory-history:v3";

function localHref(pathname: string) {
  return `${PUBLIC_BASE_PATH}${pathname}`;
}

function apiHref(pathname: string) {
  return API_ORIGIN ? `${API_ORIGIN.replace(/\/$/, "")}${pathname}` : pathname;
}

function reportHref(report: HistoryItem) {
  return report.token
    ? `${localHref("/inventory/")}#${report.token}`
    : `${localHref("/inventory/")}?id=${encodeURIComponent(report.id)}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "long", timeStyle: "short" }).format(new Date(value));
}

async function photoAsDataUrl(source: string) {
  if (source.startsWith("data:image/")) return source;
  const response = await fetch(source);
  if (!response.ok) throw new Error();
  const blob = await response.blob();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export default function InventoriesClient({ suppliers }: { suppliers: Supplier[] }) {
  const [reports, setReports] = useState<HistoryItem[]>([]);
  const [status, setStatus] = useState("Загружаем сохранённые инвентаризации…");
  const [exportingId, setExportingId] = useState("");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let localReports: HistoryItem[] = [];
      try {
        localReports = JSON.parse(window.localStorage.getItem(HISTORY_KEY) || "[]") as HistoryItem[];
      } catch {
        localReports = [];
      }
      try {
        const ownerKey = window.localStorage.getItem(OWNER_KEY) || "";
        const params = new URLSearchParams({ ownerKey, supplierSlug: "all" });
        const response = await fetch(apiHref(`/api/inventories?${params}`));
        if (!response.ok) throw new Error();
        const data = await response.json() as { reports?: HistoryItem[] };
        if (!cancelled) setReports([...(data.reports ?? []), ...localReports].sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
      } catch {
        if (!cancelled) setReports(localReports);
      } finally {
        if (!cancelled) setStatus("");
      }
    };
    void load();
    return () => { cancelled = true; };
  }, []);

  async function copyLink(report: HistoryItem) {
    const url = new URL(reportHref(report), window.location.origin).toString();
    await navigator.clipboard.writeText(url);
    setStatus("Ссылка скопирована");
  }

  async function getReportItems(report: HistoryItem) {
    if (report.token) {
      const payload = parseInventoryShareToken(report.token);
      if (!payload) throw new Error("Отчёт повреждён");
      if (payload.v === 3) {
        return payload.i.map(([supplierSlug, productId, barcode, count, defective, photos]) => ({
          supplierSlug, productId, barcode, count, defective: defective === 1, photos,
        }));
      }
      return payload.i.map((entry) => ({
        supplierSlug: payload.s,
        productId: entry[0],
        barcode: entry[1],
        count: entry[2],
        defective: payload.v === 2 ? entry[3] === 1 : false,
        photos: payload.v === 2 ? entry[4] : [],
      }));
    }
    const response = await fetch(apiHref(`/api/inventories?id=${encodeURIComponent(report.id)}`));
    if (!response.ok) throw new Error("Не удалось загрузить отчёт");
    return ((await response.json()) as { items: ReportItem[] }).items;
  }

  async function downloadExcel(report: HistoryItem) {
    if (exportingId) return;
    setExportingId(report.id);
    setStatus("Формируем Excel…");
    try {
      const items = await getReportItems(report);
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      workbook.creator = "Инвентаризация обуви";
      const sheet = workbook.addWorksheet("Инвентаризация", { views: [{ state: "frozen", ySplit: 4 }] });
      sheet.columns = [
        { width: 32 }, { width: 42 }, { width: 18 }, { width: 16 }, { width: 16 },
        { width: 20 }, { width: 10 }, { width: 10 }, { width: 22 }, { width: 14 },
        { width: 12 }, { width: 14 },
      ];
      sheet.mergeCells("A1:L1");
      sheet.getCell("A1").value = "Сохранённая инвентаризация";
      sheet.getCell("A1").font = { bold: true, size: 18 };
      sheet.mergeCells("A2:L2");
      sheet.getCell("A2").value = `Сохранено ${formatDate(report.savedAt)} · ${report.positionCount} позиций · ${report.totalCount} единиц`;
      sheet.addTable({
        name: `Inventory${report.id.replace(/[^a-z0-9]/gi, "").slice(0, 20) || "Report"}`,
        ref: "A4",
        headerRow: true,
        style: { theme: "TableStyleMedium4", showRowStripes: true },
        columns: ["Кабинет", "Модель", "Бренд", "Артикул WB", "Артикул продавца", "Размер производителя", "EU", "US", "Штрихкод", "Количество", "Брак", "Фото"].map((name) => ({ name })),
        rows: items.map((item) => {
          const supplier = suppliers.find((entry) => entry.slug === item.supplierSlug);
          const product = supplier?.products.find((entry) => entry.id === item.productId);
          const size = product?.sizes.find((entry) => entry.barcode === item.barcode);
          return [
            supplier ? `${supplier.legalName} · ${supplier.storeName}` : item.supplierSlug,
            product?.title ?? item.productId,
            product?.brand ?? "",
            item.productId,
            product?.vendorCode ?? "",
            size ? primarySizeLabel(size) : "",
            size?.eu ?? "",
            size ? `${size.usApproximate ? "≈" : ""}${size.us || ""}` : "",
            item.barcode,
            item.count,
            item.defective ? "Да" : "Нет",
            item.photos.length,
          ];
        }),
      });
      sheet.getColumn(9).numFmt = "@";

      const withPhotos = items.filter((item) => item.photos.length);
      if (withPhotos.length) {
        const photos = workbook.addWorksheet("Фото брака", { views: [{ state: "frozen", ySplit: 2 }] });
        photos.columns = [{ width: 42 }, { width: 24 }, { width: 12 }, { width: 30 }];
        photos.getRow(1).values = ["Модель", "Штрихкод", "Фото №", "Изображение"];
        photos.getRow(1).font = { bold: true };
        let row = 2;
        for (const item of withPhotos) {
          const supplier = suppliers.find((entry) => entry.slug === item.supplierSlug);
          const product = supplier?.products.find((entry) => entry.id === item.productId);
          for (let index = 0; index < item.photos.length; index += 1) {
            photos.getRow(row).values = [product?.title ?? item.productId, item.barcode, index + 1, ""];
            photos.getRow(row).height = 94;
            try {
              const base64 = await photoAsDataUrl(item.photos[index]);
              const imageId = workbook.addImage({ base64, extension: "jpeg" });
              photos.addImage(imageId, { tl: { col: 3.08, row: row - 0.92 }, ext: { width: 150, height: 112 } });
            } catch {
              photos.getCell(`D${row}`).value = "Фото недоступно";
            }
            row += 1;
          }
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const url = URL.createObjectURL(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory-${report.savedAt.slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setStatus("Excel-файл сформирован и скачан");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Не удалось сформировать Excel");
    } finally {
      setExportingId("");
    }
  }

  return (
    <main className="inventories-shell">
      <header className="inventories-header">
        <button type="button" onClick={() => window.history.back()}>← Вернуться назад</button>
        <p className="eyebrow">Архив</p>
        <h1>Сохранённые инвентаризации</h1>
        <p>Каждое сохранение — отдельный отчёт. Его можно открыть, скачать в Excel или отправить ссылкой.</p>
      </header>
      {status ? <p className="inventories-status" role="status">{status}</p> : null}
      {reports.length ? (
        <section className="inventories-list" aria-label="Список сохранённых инвентаризаций">
          {reports.map((report) => (
            <article key={report.id}>
              <div>
                <time>{formatDate(report.savedAt)}</time>
                <strong>{report.positionCount} позиций · {report.totalCount} единиц</strong>
                <span>{report.defectiveCount} с браком</span>
              </div>
              <div>
                <a href={reportHref(report)}>Открыть список</a>
                <button type="button" onClick={() => copyLink(report)}>Поделиться</button>
                <button type="button" onClick={() => downloadExcel(report)} disabled={Boolean(exportingId)}>
                  {exportingId === report.id ? "Готовим…" : "Скачать Excel"}
                </button>
              </div>
            </article>
          ))}
        </section>
      ) : !status ? (
        <section className="inventories-empty"><strong>Сохранённых инвентаризаций пока нет</strong><p>Начните инвентаризацию в любом кабинете и сохраните её в конце.</p></section>
      ) : null}
    </main>
  );
}
