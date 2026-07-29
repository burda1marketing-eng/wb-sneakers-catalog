/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { createInventoryShareToken } from "./inventory/share";

type Size = {
  label: string;
  ru: string;
  barcode: string;
};

type Product = {
  id: string;
  vendorCode: string;
  title: string;
  category: string;
  brand: string;
  description: string;
  photos: string[];
  gender: string;
  colors: string[];
  composition: string[];
  sizes: Size[];
};

type Supplier = {
  slug: string;
  sourceDir: string;
  legalName: string;
  storeName: string;
  country: string;
  inn: string;
  supplierId: string;
  products: Product[];
};

type SupplierSummary = Omit<Supplier, "products"> & {
  productCount: number;
};

type InventoryItem = {
  key: string;
  productId: string;
  vendorCode: string;
  title: string;
  brand: string;
  sizeLabel: string;
  sizeRu: string;
  barcode: string;
  count: number;
  defective: boolean;
  defectPhotos: string[];
};

type SavedInventory = {
  id?: string;
  token?: string;
  savedAt: string;
  items: InventoryItem[];
};

type InventoryHistoryItem = {
  id: string;
  supplierSlug: string;
  savedAt: string;
  positionCount: number;
  totalCount: number;
  defectiveCount: number;
  token?: string;
};

const PAGE_SIZE = 24;
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";

function localHref(pathname: string) {
  return `${PUBLIC_BASE_PATH}${pathname}`;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
}

function inventoryStorageKey(supplierSlug: string) {
  return `wb-catalog-inventory:${supplierSlug}`;
}

function inventoryHistoryStorageKey(supplierSlug: string) {
  return `wb-catalog-inventory-history:${supplierSlug}`;
}

function apiHref(pathname: string) {
  return API_ORIGIN ? `${API_ORIGIN.replace(/\/$/, "")}${pathname}` : pathname;
}

function inventoryOwnerKey() {
  const storageKey = "wb-catalog-inventory-owner";
  const existing = window.localStorage.getItem(storageKey);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(storageKey, created);
  return created;
}

function formatInventoryDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

async function compressDefectPhoto(file: File) {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Не удалось прочитать фото"));
    reader.onload = () => resolve(String(reader.result));
    reader.readAsDataURL(file);
  });
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const element = new Image();
    element.onload = () => resolve(element);
    element.onerror = () => reject(new Error("Не удалось открыть фото"));
    element.src = dataUrl;
  });
  const scale = Math.min(1, 720 / Math.max(image.naturalWidth, image.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Не удалось обработать фото");
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.62);
}

export default function CatalogClient({
  supplier,
  suppliers,
}: {
  supplier: Supplier;
  suppliers: SupplierSummary[];
}) {
  const [query, setQuery] = useState("");
  const [brand, setBrand] = useState("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);

  const [inventoryOpen, setInventoryOpen] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryHydrated, setInventoryHydrated] = useState(false);
  const [inventoryLookup, setInventoryLookup] = useState("");
  const [inventoryProductId, setInventoryProductId] = useState("");
  const [inventorySizeBarcode, setInventorySizeBarcode] = useState("");
  const [inventoryQuantity, setInventoryQuantity] = useState(1);
  const [inventoryFeedback, setInventoryFeedback] = useState("");
  const [savedInventory, setSavedInventory] = useState<SavedInventory | null>(null);
  const [inventoryHistory, setInventoryHistory] = useState<InventoryHistoryItem[]>([]);
  const [inventoryOwner, setInventoryOwner] = useState("");
  const [savingInventory, setSavingInventory] = useState(false);
  const [exportingInventory, setExportingInventory] = useState(false);
  const [catalogPickerOpen, setCatalogPickerOpen] = useState(false);
  const [catalogPickerQuery, setCatalogPickerQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [scannerStatus, setScannerStatus] = useState("");
  const scannerVideoRef = useRef<HTMLVideoElement | null>(null);
  const scannerControlsRef = useRef<IScannerControls | null>(null);

  const brands = useMemo(
    () =>
      [...new Set(supplier.products.map((product) => product.brand).filter(Boolean))].sort(
        (a, b) => a.localeCompare(b, "ru"),
      ),
    [supplier.products],
  );

  const filteredProducts = useMemo(() => {
    const needle = normalize(query);
    return supplier.products.filter((product) => {
      if (brand !== "all" && product.brand !== brand) return false;
      if (!needle) return true;

      const searchable = normalize(
        [
          product.title,
          product.brand,
          product.category,
          product.id,
          product.vendorCode,
          product.colors.join(" "),
          product.sizes.map((size) => `${size.label} ${size.ru} ${size.barcode}`).join(" "),
        ].join(" "),
      );
      return searchable.includes(needle);
    });
  }, [brand, query, supplier.products]);

  const inventoryProductOptions = useMemo(() => {
    const needle = normalize(inventoryLookup);
    if (!needle) return supplier.products;

    return supplier.products.filter((product) =>
      normalize(
        [
          product.title,
          product.brand,
          product.id,
          product.vendorCode,
          product.sizes.map((size) => size.barcode).join(" "),
        ].join(" "),
      ).includes(needle),
    );
  }, [inventoryLookup, supplier.products]);

  const inventoryProduct = useMemo(
    () => supplier.products.find((product) => product.id === inventoryProductId) ?? null,
    [inventoryProductId, supplier.products],
  );

  const catalogPickerProducts = useMemo(() => {
    const needle = normalize(catalogPickerQuery);
    if (!needle) return supplier.products;
    return supplier.products.filter((product) =>
      normalize([
        product.title,
        product.brand,
        product.id,
        product.vendorCode,
        product.sizes.map((size) => `${size.label} ${size.ru} ${size.barcode}`).join(" "),
      ].join(" ")).includes(needle),
    );
  }, [catalogPickerQuery, supplier.products]);

  const inventoryTotal = inventoryItems.reduce((total, item) => total + item.count, 0);
  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const totalSizes = supplier.products.reduce(
    (total, product) => total + product.sizes.length,
    0,
  );

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [brand, query, supplier.slug]);

  useEffect(() => {
    setInventoryHydrated(false);
    try {
      const saved = window.localStorage.getItem(inventoryStorageKey(supplier.slug));
      const parsed = saved ? (JSON.parse(saved) as Partial<InventoryItem>[]) : [];
      setInventoryItems(parsed.map((item) => ({
        ...(item as InventoryItem),
        defective: item.defective === true,
        defectPhotos: Array.isArray(item.defectPhotos) ? item.defectPhotos : [],
      })));
      setSavedInventory(null);
      setInventoryOwner(inventoryOwnerKey());
    } catch {
      setInventoryItems([]);
      setSavedInventory(null);
      setInventoryOwner(inventoryOwnerKey());
    } finally {
      setInventoryHydrated(true);
    }
  }, [supplier.slug]);

  useEffect(() => {
    if (!inventoryHydrated) return;
    try {
      window.localStorage.setItem(
        inventoryStorageKey(supplier.slug),
        JSON.stringify(inventoryItems),
      );
    } catch {
      setInventoryFeedback("Черновик с фото слишком большой для памяти браузера. Сохраните инвентаризацию на сервере.");
    }
  }, [inventoryHydrated, inventoryItems, supplier.slug]);

  const invalidateSavedInventory = useCallback(() => {
    setSavedInventory(null);
  }, []);

  const loadInventoryHistory = useCallback(async () => {
    if (!inventoryOwner) return;
    let localReports: InventoryHistoryItem[] = [];
    try {
      const saved = window.localStorage.getItem(inventoryHistoryStorageKey(supplier.slug));
      localReports = saved ? (JSON.parse(saved) as InventoryHistoryItem[]) : [];
    } catch {
      localReports = [];
    }
    try {
      const params = new URLSearchParams({ ownerKey: inventoryOwner, supplierSlug: supplier.slug });
      const response = await fetch(apiHref(`/api/inventories?${params}`));
      if (!response.ok) throw new Error();
      const data = await response.json() as { reports?: InventoryHistoryItem[] };
      const serverReports = data.reports ?? [];
      setInventoryHistory([...serverReports, ...localReports].sort((a, b) => b.savedAt.localeCompare(a.savedAt)));
    } catch {
      setInventoryHistory(localReports);
    }
  }, [inventoryOwner, supplier.slug]);

  useEffect(() => {
    if (inventoryOpen) void loadInventoryHistory();
  }, [inventoryOpen, loadInventoryHistory]);

  useEffect(() => {
    if (!inventoryProduct) {
      setInventorySizeBarcode("");
      return;
    }

    if (!inventoryProduct.sizes.some((size) => size.barcode === inventorySizeBarcode)) {
      setInventorySizeBarcode(inventoryProduct.sizes[0]?.barcode ?? "");
    }
  }, [inventoryProduct, inventorySizeBarcode]);

  useEffect(() => {
    const modalOpen = Boolean(selectedProduct || inventoryOpen);
    if (!modalOpen) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [inventoryOpen, selectedProduct]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (scannerOpen) setScannerOpen(false);
      else if (catalogPickerOpen) setCatalogPickerOpen(false);
      else if (historyOpen) setHistoryOpen(false);
      else if (inventoryOpen) setInventoryOpen(false);
      else if (selectedProduct) setSelectedProduct(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [catalogPickerOpen, historyOpen, inventoryOpen, scannerOpen, selectedProduct]);

  const addInventorySize = useCallback(
    (product: Product, size: Size, amount = 1, feedback = "Добавлено в ведомость") => {
      const key = `${product.id}:${size.barcode}`;
      const safeAmount = Math.min(999, Math.max(1, Math.round(amount)));
      setInventoryItems((current) => {
        const existing = current.find((item) => item.key === key);
        if (existing) {
          return current.map((item) =>
            item.key === key ? { ...item, count: item.count + safeAmount } : item,
          );
        }

        return [
          {
            key,
            productId: product.id,
            vendorCode: product.vendorCode,
            title: product.title,
            brand: product.brand,
            sizeLabel: size.label,
            sizeRu: size.ru,
            barcode: size.barcode,
            count: safeAmount,
            defective: false,
            defectPhotos: [],
          },
          ...current,
        ];
      });
      invalidateSavedInventory();
      setInventoryFeedback(`${feedback}: ${product.title}, ${size.label || size.ru}`);
    },
    [invalidateSavedInventory],
  );

  const registerScannedBarcode = useCallback(
    (barcode: string) => {
      for (const product of supplier.products) {
        const size = product.sizes.find((item) => item.barcode === barcode);
        if (size) {
          setInventoryLookup(barcode);
          setInventoryProductId(product.id);
          setInventorySizeBarcode(size.barcode);
          addInventorySize(product, size, 1, "Штрихкод распознан");
          return true;
        }
      }
      setInventoryLookup(barcode);
      setInventoryFeedback(`Штрихкод ${barcode} не найден в этом кабинете`);
      return false;
    },
    [addInventorySize, supplier.products],
  );

  useEffect(() => {
    if (!scannerOpen || !scannerVideoRef.current) return;

    let cancelled = false;
    setScannerStatus("Разрешите доступ к камере и наведите её на штрихкод");

    const startScanner = async () => {
      try {
        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        if (cancelled || !scannerVideoRef.current) return;

        const reader = new BrowserMultiFormatReader(undefined, {
          delayBetweenScanAttempts: 180,
          delayBetweenScanSuccess: 700,
        });
        const controls = await reader.decodeFromConstraints(
          {
            audio: false,
            video: {
              facingMode: { ideal: "environment" },
              width: { ideal: 1280 },
              height: { ideal: 720 },
            },
          },
          scannerVideoRef.current,
          (result) => {
            if (!result || cancelled) return;
            const barcode = result.getText().trim();
            if (!barcode) return;
            controls.stop();
            scannerControlsRef.current = null;
            registerScannedBarcode(barcode);
            setScannerOpen(false);
          },
        );
        if (cancelled) controls.stop();
        else {
          scannerControlsRef.current = controls;
          setScannerStatus("Камера включена — поместите штрихкод в рамку");
        }
      } catch (error) {
        const name = error instanceof Error ? error.name : "";
        if (name === "NotAllowedError") {
          setScannerStatus("Доступ к камере не разрешён. Разрешите его в настройках браузера или используйте ручной ввод.");
        } else if (name === "NotFoundError") {
          setScannerStatus("Камера не найдена. Используйте ручной ввод штрихкода.");
        } else {
          setScannerStatus("Не удалось запустить камеру. Используйте ручной ввод штрихкода.");
        }
      }
    };

    void startScanner();
    return () => {
      cancelled = true;
      scannerControlsRef.current?.stop();
      scannerControlsRef.current = null;
    };
  }, [registerScannedBarcode, scannerOpen]);

  function handleInventoryLookup(value: string) {
    setInventoryLookup(value);
    setInventoryFeedback("");
    const needle = normalize(value);
    if (!needle) return;

    for (const product of supplier.products) {
      const exactSize = product.sizes.find((size) => normalize(size.barcode) === needle);
      if (exactSize) {
        setInventoryProductId(product.id);
        setInventorySizeBarcode(exactSize.barcode);
        setInventoryFeedback("Штрихкод найден — проверьте модель и добавьте её");
        return;
      }
    }

    const exactProduct = supplier.products.find(
      (product) => normalize(product.title) === needle || normalize(product.vendorCode) === needle,
    );
    if (exactProduct) setInventoryProductId(exactProduct.id);
  }

  function addManualInventoryItem() {
    if (!inventoryProduct) {
      setInventoryFeedback("Сначала выберите модель");
      return;
    }
    const size = inventoryProduct.sizes.find(
      (item) => item.barcode === inventorySizeBarcode,
    );
    if (!size) {
      setInventoryFeedback("Выберите размер");
      return;
    }
    addInventorySize(inventoryProduct, size, inventoryQuantity);
    setInventoryQuantity(1);
  }

  function chooseInventoryProduct(product: Product) {
    setInventoryProductId(product.id);
    setInventorySizeBarcode(product.sizes[0]?.barcode ?? "");
    setInventoryLookup(product.title);
    setInventoryQuantity(1);
    setCatalogPickerOpen(false);
    setInventoryFeedback(`Выбрана модель: ${product.title}. Укажите размер и количество.`);
  }

  function changeInventoryCount(key: string, difference: number) {
    invalidateSavedInventory();
    setInventoryItems((current) =>
      current
        .map((item) =>
          item.key === key ? { ...item, count: Math.max(0, item.count + difference) } : item,
        )
        .filter((item) => item.count > 0),
    );
  }

  function setInventoryDefective(key: string, defective: boolean) {
    invalidateSavedInventory();
    setInventoryItems((current) => current.map((item) =>
      item.key === key
        ? { ...item, defective, defectPhotos: defective ? item.defectPhotos : [] }
        : item,
    ));
  }

  async function addDefectPhotos(key: string, files: FileList | null) {
    if (!files?.length) return;
    const item = inventoryItems.find((entry) => entry.key === key);
    if (!item) return;
    const room = 10 - item.defectPhotos.length;
    if (room <= 0) {
      setInventoryFeedback("Для одной позиции можно добавить не больше 10 фото брака");
      return;
    }
    try {
      setInventoryFeedback("Обрабатываем фото…");
      const photos: string[] = [];
      for (const file of Array.from(files).slice(0, room)) {
        if (!file.type.startsWith("image/")) continue;
        photos.push(await compressDefectPhoto(file));
      }
      invalidateSavedInventory();
      setInventoryItems((current) => current.map((entry) =>
        entry.key === key
          ? { ...entry, defective: true, defectPhotos: [...entry.defectPhotos, ...photos].slice(0, 10) }
          : entry,
      ));
      const skipped = Math.max(0, files.length - room);
      setInventoryFeedback(`${photos.length} фото добавлено${skipped ? `. Ещё ${skipped} не добавлено: лимит 10.` : ""}`);
    } catch {
      setInventoryFeedback("Не удалось обработать фото. Попробуйте другой файл.");
    }
  }

  function removeDefectPhoto(key: string, photoIndex: number) {
    invalidateSavedInventory();
    setInventoryItems((current) => current.map((item) =>
      item.key === key
        ? { ...item, defectPhotos: item.defectPhotos.filter((_, index) => index !== photoIndex) }
        : item,
    ));
  }

  function inventoryShareUrl(id?: string, token?: string) {
    const base = `${window.location.origin}${localHref("/inventory/")}`;
    return token ? `${base}#${token}` : `${base}?id=${encodeURIComponent(id ?? "")}`;
  }

  async function saveInventory() {
    if (!inventoryItems.length) {
      setInventoryFeedback("Добавьте хотя бы одну позицию перед сохранением");
      return;
    }
    if (!inventoryOwner || savingInventory) return;
    setSavingInventory(true);
    setInventoryFeedback("Сохраняем отчёт и фото…");
    try {
      const response = await fetch(apiHref("/api/inventories"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerKey: inventoryOwner,
          supplierSlug: supplier.slug,
          items: inventoryItems.map((item) => ({
            productId: item.productId,
            barcode: item.barcode,
            count: item.count,
            defective: item.defective,
            photos: item.defectPhotos,
          })),
        }),
      });
      const result = await response.json() as { id?: string; savedAt?: string; error?: string };
      if (!response.ok || !result.id || !result.savedAt) {
        throw new Error(result.error || "Не удалось сохранить инвентаризацию");
      }
      const snapshot = {
        id: result.id,
        savedAt: result.savedAt,
        items: inventoryItems.map((item) => ({ ...item, defectPhotos: [...item.defectPhotos] })),
      };
      setSavedInventory(snapshot);
      await loadInventoryHistory();
      setInventoryFeedback("Инвентаризация сохранена отдельным отчётом. Её можно скачать или отправить по ссылке.");
    } catch {
      const savedAt = new Date().toISOString();
      const token = createInventoryShareToken({
        v: 2,
        s: supplier.slug,
        d: savedAt,
        i: inventoryItems.map((item) => [
          item.productId,
          item.barcode,
          item.count,
          item.defective ? 1 : 0,
          item.defectPhotos,
        ]),
      });
      const snapshot = {
        token,
        savedAt,
        items: inventoryItems.map((item) => ({ ...item, defectPhotos: [...item.defectPhotos] })),
      };
      const localReport: InventoryHistoryItem = {
        id: `local:${savedAt}`,
        supplierSlug: supplier.slug,
        savedAt,
        positionCount: inventoryItems.length,
        totalCount: inventoryItems.reduce((sum, item) => sum + item.count, 0),
        defectiveCount: inventoryItems.filter((item) => item.defective).length,
        token,
      };
      setSavedInventory(snapshot);
      setInventoryHistory((current) => {
        const next = [localReport, ...current.filter((item) => item.id !== localReport.id)].slice(0, 12);
        try {
          window.localStorage.setItem(
            inventoryHistoryStorageKey(supplier.slug),
            JSON.stringify(next.filter((item) => item.token)),
          );
        } catch {
          // The current report still stays available until the page is closed.
        }
        return next;
      });
      setInventoryFeedback("Инвентаризация сохранена. Публичная ссылка содержит весь отчёт и фото — её можно отправить без входа в аккаунт.");
    } finally {
      setSavingInventory(false);
    }
  }

  async function copyInventoryLink() {
    if (!savedInventory) return;
    const url = inventoryShareUrl(savedInventory.id, savedInventory.token);
    try {
      await navigator.clipboard.writeText(url);
      setInventoryFeedback("Ссылка скопирована — её можно отправить любому получателю");
    } catch {
      const input = document.createElement("input");
      input.value = url;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
      setInventoryFeedback("Ссылка скопирована — её можно отправить любому получателю");
    }
  }

  async function copyHistoryLink(id: string, token?: string) {
    const url = inventoryShareUrl(id, token);
    try {
      await navigator.clipboard.writeText(url);
      setInventoryFeedback("Ссылка на сохранённый отчёт скопирована");
    } catch {
      setInventoryFeedback("Не удалось скопировать ссылку. Откройте отчёт и скопируйте адрес браузера.");
    }
  }

  function startNewInventory() {
    setInventoryItems([]);
    setSavedInventory(null);
    setInventoryLookup("");
    setInventoryProductId("");
    setInventorySizeBarcode("");
    setInventoryQuantity(1);
    window.localStorage.removeItem(inventoryStorageKey(supplier.slug));
    setInventoryFeedback("Создана новая пустая инвентаризация. Предыдущий отчёт остался в истории.");
  }

  async function exportInventoryExcel() {
    if (!savedInventory || exportingInventory) return;
    setExportingInventory(true);
    try {
      const { Workbook } = await import("exceljs");
      const workbook = new Workbook();
      workbook.creator = "Каталог обуви";
      workbook.created = new Date(savedInventory.savedAt);
      const sheet = workbook.addWorksheet("Инвентаризация", {
        views: [{ state: "frozen", ySplit: 6 }],
        properties: { defaultRowHeight: 20 },
      });
      sheet.columns = [
        { key: "cabinet", width: 28 },
        { key: "model", width: 42 },
        { key: "brand", width: 18 },
        { key: "wb", width: 16 },
        { key: "vendor", width: 20 },
        { key: "size", width: 16 },
        { key: "ru", width: 11 },
        { key: "barcode", width: 22 },
        { key: "count", width: 14 },
        { key: "defective", width: 12 },
        { key: "photos", width: 14 },
      ];

      sheet.mergeCells("A1:K1");
      sheet.getCell("A1").value = "Остатки после инвентаризации";
      sheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF171817" } };
      sheet.getCell("A1").alignment = { vertical: "middle" };
      sheet.getRow(1).height = 34;

      sheet.getCell("A2").value = "Кабинет";
      sheet.mergeCells("B2:K2");
      sheet.getCell("B2").value = supplier.legalName;
      sheet.getCell("A3").value = "Магазин";
      sheet.mergeCells("B3:K3");
      sheet.getCell("B3").value = `${supplier.country} · ${supplier.storeName}`;
      sheet.getCell("A4").value = "Сохранено";
      sheet.mergeCells("B4:C4");
      sheet.getCell("B4").value = new Date(savedInventory.savedAt);
      sheet.getCell("B4").numFmt = "yyyy-mm-dd hh:mm";
      sheet.getCell("D4").value = "Позиций";
      sheet.getCell("E4").value = savedInventory.items.length;
      sheet.getCell("G4").value = "Единиц";
      sheet.getCell("H4").value = savedInventory.items.reduce((sum, item) => sum + item.count, 0);
      sheet.getCell("J4").value = "С браком";
      sheet.getCell("K4").value = savedInventory.items.filter((item) => item.defective).length;

      ["A2", "A3", "A4", "D4", "G4", "J4"].forEach((address) => {
        sheet.getCell(address).font = { bold: true, color: { argb: "FF696A64" } };
      });
      for (let rowNumber = 1; rowNumber <= 4; rowNumber += 1) {
        sheet.getRow(rowNumber).eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFF3F0E8" },
          };
        });
      }

      sheet.addTable({
        name: "InventoryTable",
        ref: "A6",
        headerRow: true,
        style: { theme: "TableStyleMedium4", showRowStripes: true },
        columns: [
          { name: "Кабинет" },
          { name: "Модель" },
          { name: "Бренд" },
          { name: "Артикул WB" },
          { name: "Артикул продавца" },
          { name: "Размер" },
          { name: "RU" },
          { name: "Штрихкод" },
          { name: "Количество" },
          { name: "Брак" },
          { name: "Фото брака" },
        ],
        rows: savedInventory.items.map((item) => [
          supplier.legalName,
          item.title,
          item.brand,
          item.productId,
          item.vendorCode,
          item.sizeLabel,
          item.sizeRu,
          item.barcode,
          item.count,
          item.defective ? "Да" : "Нет",
          item.defectPhotos.length,
        ]),
      });
      sheet.getColumn("H").numFmt = "@";
      sheet.getColumn("I").numFmt = "#,##0";
      sheet.getColumn("I").alignment = { horizontal: "right" };

      const photoItems = savedInventory.items.filter((item) => item.defectPhotos.length);
      if (photoItems.length) {
        const photoSheet = workbook.addWorksheet("Фото брака", {
          views: [{ state: "frozen", ySplit: 3 }],
          properties: { defaultRowHeight: 20 },
        });
        photoSheet.columns = [
          { key: "model", width: 42 },
          { key: "size", width: 16 },
          { key: "barcode", width: 22 },
          { key: "number", width: 12 },
          { key: "photo", width: 28 },
        ];
        photoSheet.mergeCells("A1:E1");
        photoSheet.getCell("A1").value = "Фото брака";
        photoSheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF171817" } };
        photoSheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F0E8" } };
        photoSheet.getRow(1).height = 34;
        photoSheet.getRow(3).values = ["Модель", "Размер", "Штрихкод", "Фото №", "Изображение"];
        photoSheet.getRow(3).font = { bold: true, color: { argb: "FFFFFFFF" } };
        photoSheet.getRow(3).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4F6150" } };
        let rowNumber = 4;
        for (const item of photoItems) {
          for (let photoIndex = 0; photoIndex < item.defectPhotos.length; photoIndex += 1) {
            photoSheet.getRow(rowNumber).values = [
              item.title,
              `${item.sizeLabel} / RU ${item.sizeRu || "—"}`,
              item.barcode,
              photoIndex + 1,
              "",
            ];
            photoSheet.getCell(`C${rowNumber}`).numFmt = "@";
            photoSheet.getRow(rowNumber).height = 96;
            const imageId = workbook.addImage({
              base64: item.defectPhotos[photoIndex],
              extension: "jpeg",
            });
            photoSheet.addImage(imageId, {
              tl: { col: 4.08, row: rowNumber - 0.92 },
              ext: { width: 150, height: 118 },
            });
            rowNumber += 1;
          }
        }
        photoSheet.autoFilter = { from: "A3", to: `E${Math.max(3, rowNumber - 1)}` };
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `inventory-${supplier.slug}-${savedInventory.savedAt.slice(0, 10)}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setInventoryFeedback("Excel-файл сформирован и скачан");
    } catch {
      setInventoryFeedback("Не удалось сформировать Excel-файл. Попробуйте ещё раз.");
    } finally {
      setExportingInventory(false);
    }
  }

  return (
    <div className="catalog-shell">
      <main className="catalog-main">
        <div className="topline">
          <a className="wordmark" href={localHref("/")} aria-label="Главная страница каталога">
            <span className="wordmark-mark">↗</span>
            Каталог обуви
          </a>
          <span className="updated">Данные обновлены 29 июля 2026</span>
        </div>

        <section className="hero" aria-labelledby="catalog-title">
          <p className="eyebrow">
            {supplier.country} · {supplier.storeName}
          </p>
          <h1 id="catalog-title">{supplier.legalName}</h1>
          <div className="hero-meta">
            <span className="meta-chip">
              <strong>{supplier.products.length}</strong> моделей
            </span>
            <span className="meta-chip">
              <strong>{totalSizes}</strong> размеров
            </span>
            <span className="meta-chip">ИНН {supplier.inn}</span>
            <span className="meta-chip">ID {supplier.supplierId}</span>
          </div>
        </section>

        <section className="search-panel" aria-label="Поиск, фильтры и инвентаризация">
          <label className="search-box">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Название, артикул, размер или штрихкод"
              aria-label="Поиск по каталогу"
            />
            {query ? (
              <button
                className="clear-search"
                type="button"
                onClick={() => setQuery("")}
                aria-label="Очистить поиск"
              >
                ×
              </button>
            ) : null}
          </label>
          <select
            className="brand-select"
            value={brand}
            onChange={(event) => setBrand(event.target.value)}
            aria-label="Фильтр по бренду"
          >
            <option value="all">Все бренды</option>
            {brands.map((item) => (
              <option value={item} key={item}>
                {item}
              </option>
            ))}
          </select>
          <button
            className="inventory-start"
            type="button"
            onClick={() => setInventoryOpen(true)}
          >
            <span aria-hidden="true">▦</span>
            Провести инвентаризацию
            {inventoryTotal ? <strong>{inventoryTotal}</strong> : null}
          </button>
        </section>

        <div className="results-bar">
          <h2>Модели</h2>
          <span>
            {filteredProducts.length} из {supplier.products.length}
          </span>
        </div>

        {filteredProducts.length ? (
          <>
            <section className="product-grid" aria-label="Товары">
              {visibleProducts.map((product) => (
                <article className="product-card" key={product.id}>
                  <div className="product-image-wrap">
                    <span className="product-number">WB {product.id}</span>
                    {product.photos[0] ? (
                      <img
                        className="product-image"
                        src={product.photos[0]}
                        alt={`${product.title}, вид спереди`}
                        loading="lazy"
                        decoding="async"
                      />
                    ) : null}
                  </div>
                  <div className="product-body">
                    <p className="product-brand">{product.brand}</p>
                    <h3 className="product-title">{product.title}</h3>

                    <div className="mobile-size-strip" aria-label="Размеры и штрихкоды">
                      {product.sizes.map((size) => (
                        <div className="mobile-size-item" key={`${size.ru}-${size.barcode}`}>
                          <span>RU {size.ru || "—"}</span>
                          <small>{size.label || "Размер"}</small>
                          <code>{size.barcode}</code>
                        </div>
                      ))}
                    </div>

                    <div className="product-footer">
                      <span className="size-count">{product.sizes.length} размеров</span>
                      <button
                        className="open-product"
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                      >
                        Размеры →
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            {visibleCount < filteredProducts.length ? (
              <button
                className="load-more"
                type="button"
                onClick={() => setVisibleCount((current) => current + PAGE_SIZE)}
              >
                Показать ещё {Math.min(PAGE_SIZE, filteredProducts.length - visibleCount)}
              </button>
            ) : null}
          </>
        ) : (
          <div className="empty-state" role="status">
            <strong>Ничего не найдено</strong>
            <span>Попробуйте изменить запрос или выбрать другой бренд.</span>
          </div>
        )}
      </main>

      <aside className="supplier-rail" aria-label="Переключение магазинов">
        <div className="supplier-mobile-switcher">
          <label htmlFor="supplier-mobile-select">Кабинет</label>
          <select
            id="supplier-mobile-select"
            value={supplier.slug}
            onChange={(event) => {
              window.location.href = localHref(`/catalog/${event.target.value}/`);
            }}
          >
            {suppliers.map((item) => (
              <option value={item.slug} key={item.slug}>
                {item.country === "Россия" ? "RU" : "KG"} · {item.legalName} · {item.storeName}
              </option>
            ))}
          </select>
        </div>

        <h2>Магазины</h2>
        <nav className="supplier-list">
          {suppliers.map((item) => (
            <a
              className={`supplier-link ${item.slug === supplier.slug ? "active" : ""}`}
              href={localHref(`/catalog/${item.slug}/`)}
              aria-current={item.slug === supplier.slug ? "page" : undefined}
              key={item.slug}
            >
              <span className="country-mark">
                {item.country === "Россия" ? "RU" : "KG"}
              </span>
              <span className="supplier-name">
                <strong>{item.legalName}</strong>
                <span>{item.storeName}</span>
              </span>
              <span className="supplier-count">{item.productCount}</span>
            </a>
          ))}
        </nav>
        <p className="rail-note">
          Данные карточек выгружены из кабинетов Seller Wildberries. Размеры и
          штрихкоды показаны отдельно для каждой модели.
        </p>
      </aside>

      {selectedProduct ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSelectedProduct(null);
          }}
        >
          <section
            className="product-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="product-modal-title"
          >
            <button
              className="close-modal"
              type="button"
              onClick={() => setSelectedProduct(null)}
              aria-label="Закрыть размеры"
            >
              ×
            </button>
            <div className="modal-content">
              <p className="product-brand">{selectedProduct.brand}</p>
              <h2 id="product-modal-title">{selectedProduct.title}</h2>
              <div className="modal-tags">
                <span>WB {selectedProduct.id}</span>
                <span>Арт. {selectedProduct.vendorCode}</span>
                <span>{selectedProduct.category}</span>
                {selectedProduct.gender ? <span>{selectedProduct.gender}</span> : null}
                {selectedProduct.colors.map((color) => (
                  <span key={color}>{color}</span>
                ))}
              </div>

              <section className="size-section" aria-labelledby="size-grid-title">
                <h3 id="size-grid-title">Размеры и штрихкоды</h3>
                <div className="size-table-wrap">
                  <table className="size-table">
                    <thead>
                      <tr>
                        <th>Размер</th>
                        <th>Российский</th>
                        <th>Штрихкод</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.sizes.map((size) => (
                        <tr key={`${size.label}-${size.ru}-${size.barcode}`}>
                          <td>{size.label || "—"}</td>
                          <td>{size.ru || "—"}</td>
                          <td className="barcode">{size.barcode}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </section>
        </div>
      ) : null}

      {inventoryOpen ? (
        <div className="inventory-backdrop" role="presentation">
          <section
            className="inventory-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-title"
          >
            <header className="inventory-header">
              <div>
                <p>{supplier.storeName}</p>
                <h2 id="inventory-title">Инвентаризация</h2>
              </div>
              <div className="inventory-summary">
                <span><strong>{inventoryItems.length}</strong> позиций</span>
                <span><strong>{inventoryTotal}</strong> единиц</span>
                <button
                  className="inventory-history-button"
                  type="button"
                  onClick={() => {
                    setHistoryOpen(true);
                    void loadInventoryHistory();
                  }}
                >
                  Отчёты {inventoryHistory.length ? `(${inventoryHistory.length})` : ""}
                </button>
              </div>
              <button
                className="close-inventory"
                type="button"
                onClick={() => setInventoryOpen(false)}
                aria-label="Закрыть инвентаризацию"
              >
                ×
              </button>
            </header>

            <div className="inventory-body">
              <div className="inventory-entry">
                <button
                  className="scan-button"
                  type="button"
                  onClick={() => {
                    setScannerStatus("");
                    setScannerOpen(true);
                  }}
                >
                  <span aria-hidden="true">▣</span>
                  Сканировать камерой
                </button>
                <button
                  className="catalog-picker-button"
                  type="button"
                  onClick={() => {
                    setCatalogPickerQuery("");
                    setCatalogPickerOpen(true);
                  }}
                >
                  <span aria-hidden="true">▦</span>
                  Выбрать из общего каталога
                </button>
                <div className="entry-divider"><span>или найти вручную</span></div>

                <label className="inventory-field">
                  <span>Штрихкод или название</span>
                  <input
                    type="search"
                    value={inventoryLookup}
                    onChange={(event) => handleInventoryLookup(event.target.value)}
                    placeholder="Например, 2041531851844 или Air 95"
                    aria-label="Штрихкод или название модели для инвентаризации"
                  />
                </label>

                <label className="inventory-field inventory-quantity-field">
                  <span>Количество, шт.</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="1"
                    max="999"
                    value={inventoryQuantity}
                    onChange={(event) => setInventoryQuantity(Math.min(999, Math.max(1, Number(event.target.value) || 1)))}
                    aria-label="Количество для добавления"
                  />
                </label>

                <label className="inventory-field">
                  <span>Модель</span>
                  <select
                    value={inventoryProductId}
                    onChange={(event) => {
                      setInventoryProductId(event.target.value);
                      setInventoryFeedback("");
                    }}
                    aria-label="Модель для инвентаризации"
                  >
                    <option value="">Выберите модель</option>
                    {inventoryProductOptions.map((product) => (
                      <option value={product.id} key={product.id}>
                        {product.title} · {product.brand} · WB {product.id}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="inventory-field">
                  <span>Размер и штрихкод</span>
                  <select
                    value={inventorySizeBarcode}
                    onChange={(event) => setInventorySizeBarcode(event.target.value)}
                    disabled={!inventoryProduct}
                    aria-label="Размер для инвентаризации"
                  >
                    <option value="">Выберите размер</option>
                    {inventoryProduct?.sizes.map((size) => (
                      <option value={size.barcode} key={size.barcode}>
                        {size.label || "Размер не указан"} · RU {size.ru || "—"} · {size.barcode}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="inventory-add"
                  type="button"
                  onClick={addManualInventoryItem}
                >
                  Добавить в ведомость
                </button>
                {inventoryFeedback ? (
                  <p className="inventory-feedback" role="status">{inventoryFeedback}</p>
                ) : null}
              </div>

              <div className="inventory-list-panel">
                <div className="inventory-list-heading">
                  <h3>Найдено</h3>
                </div>

                {inventoryItems.length ? (
                  <div className="inventory-list">
                    {inventoryItems.map((item) => (
                      <article className={`inventory-item${item.defective ? " is-defective" : ""}`} key={item.key}>
                        <div className="inventory-item-copy">
                          <strong>{item.title}</strong>
                          <span>{item.brand} · {item.sizeLabel} · RU {item.sizeRu || "—"}</span>
                          <code>{item.barcode}</code>
                        </div>
                        <div className="inventory-counter" aria-label={`Количество ${item.title}`}>
                          <button
                            type="button"
                            onClick={() => changeInventoryCount(item.key, -1)}
                            aria-label={`Уменьшить количество ${item.title}`}
                          >
                            −
                          </button>
                          <strong>{item.count}</strong>
                          <button
                            type="button"
                            onClick={() => changeInventoryCount(item.key, 1)}
                            aria-label={`Увеличить количество ${item.title}`}
                          >
                            +
                          </button>
                        </div>
                        <div className="defect-controls">
                          <label className="defect-checkbox">
                            <input
                              type="checkbox"
                              checked={item.defective}
                              onChange={(event) => setInventoryDefective(item.key, event.target.checked)}
                            />
                            <span>Брак</span>
                          </label>
                          {item.defective ? (
                            <div className="defect-photo-panel">
                              <div className="defect-photo-actions">
                                <label>
                                  Снять фото
                                  <input
                                    type="file"
                                    accept="image/*"
                                    capture="environment"
                                    onChange={(event) => {
                                      const input = event.currentTarget;
                                      void addDefectPhotos(item.key, input.files).finally(() => { input.value = ""; });
                                    }}
                                  />
                                </label>
                                <label>
                                  Из галереи
                                  <input
                                    type="file"
                                    accept="image/*"
                                    multiple
                                    onChange={(event) => {
                                      const input = event.currentTarget;
                                      void addDefectPhotos(item.key, input.files).finally(() => { input.value = ""; });
                                    }}
                                  />
                                </label>
                                <span>{item.defectPhotos.length}/10</span>
                              </div>
                              {item.defectPhotos.length ? (
                                <div className="defect-photo-grid">
                                  {item.defectPhotos.map((photo, photoIndex) => (
                                    <div key={`${item.key}:photo:${photoIndex}`}>
                                      <img src={photo} alt={`Фото брака ${photoIndex + 1}: ${item.title}`} />
                                      <button
                                        type="button"
                                        onClick={() => removeDefectPhoto(item.key, photoIndex)}
                                        aria-label={`Удалить фото брака ${photoIndex + 1}`}
                                      >
                                        ×
                                      </button>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <p>Добавьте до 10 фото брака с камеры или из галереи.</p>
                              )}
                            </div>
                          ) : null}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="inventory-empty">
                    <span aria-hidden="true">▦</span>
                    <strong>Ведомость пока пустая</strong>
                    <p>Отсканируйте штрихкод или добавьте модель и размер вручную.</p>
                  </div>
                )}
              </div>
            </div>

            <footer className="inventory-footer">
              <button
                className="inventory-save"
                type="button"
                onClick={saveInventory}
                disabled={!inventoryItems.length || savingInventory}
              >
                {savingInventory ? "Сохраняем…" : "Сохранить инвентаризацию"}
              </button>
              {savedInventory ? (
                <div className="inventory-saved-actions" role="status">
                  <span>Сохранено · {savedInventory.items.length} позиций</span>
                  <button
                    type="button"
                    onClick={exportInventoryExcel}
                    disabled={exportingInventory}
                  >
                    {exportingInventory ? "Готовим Excel…" : "Выгрузить в Excel"}
                  </button>
                  <a
                    href={inventoryShareUrl(savedInventory.id, savedInventory.token)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Посмотреть на сайте
                  </a>
                  <button type="button" onClick={copyInventoryLink}>Копировать ссылку</button>
                  <button className="inventory-new" type="button" onClick={startNewInventory}>
                    Создать новую
                  </button>
                </div>
              ) : null}
            </footer>

            {catalogPickerOpen ? (
              <div className="inventory-overlay inventory-picker-layer" role="dialog" aria-modal="true" aria-label="Общий каталог моделей">
                <header>
                  <div>
                    <p>Нажмите на карточку — модель заполнит форму</p>
                    <h3>Общий каталог</h3>
                  </div>
                  <button type="button" onClick={() => setCatalogPickerOpen(false)} aria-label="Закрыть общий каталог">×</button>
                </header>
                <div className="inventory-overlay-search">
                  <input
                    type="search"
                    autoFocus
                    value={catalogPickerQuery}
                    onChange={(event) => setCatalogPickerQuery(event.target.value)}
                    placeholder="Модель, артикул, размер или штрихкод"
                    aria-label="Поиск модели в общем каталоге"
                  />
                  <span>{catalogPickerProducts.length} моделей</span>
                </div>
                <div className="inventory-picker-grid">
                  {catalogPickerProducts.map((product) => (
                    <button type="button" key={product.id} onClick={() => chooseInventoryProduct(product)}>
                      <span className="inventory-picker-image">
                        {product.photos[0] ? <img src={product.photos[0]} alt="" /> : null}
                      </span>
                      <span className="inventory-picker-copy">
                        <small>{product.brand}</small>
                        <strong>{product.title}</strong>
                        <span>WB {product.id} · {product.sizes.length} размеров</span>
                        <em>{product.sizes.slice(0, 5).map((size) => size.label || size.ru).filter(Boolean).join(" · ")}</em>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {historyOpen ? (
              <div className="inventory-overlay inventory-history-layer" role="dialog" aria-modal="true" aria-label="Сохранённые отчёты">
                <header>
                  <div>
                    <p>{supplier.storeName}</p>
                    <h3>Сохранённые отчёты</h3>
                  </div>
                  <button type="button" onClick={() => setHistoryOpen(false)} aria-label="Закрыть историю отчётов">×</button>
                </header>
                {inventoryHistory.length ? (
                  <div className="inventory-history-list">
                    {inventoryHistory.map((report) => (
                      <article key={report.id}>
                        <div>
                          <strong>{formatInventoryDate(report.savedAt)}</strong>
                          <span>{report.positionCount} позиций · {report.totalCount} единиц · {report.defectiveCount} с браком</span>
                        </div>
                        <div>
                          <a href={inventoryShareUrl(report.id, report.token)} target="_blank" rel="noreferrer">Открыть</a>
                          <button type="button" onClick={() => copyHistoryLink(report.id, report.token)}>Копировать ссылку</button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="inventory-history-empty">
                    <span aria-hidden="true">▦</span>
                    <strong>Сохранённых отчётов пока нет</strong>
                    <p>Завершите текущую инвентаризацию — она появится здесь отдельной записью.</p>
                  </div>
                )}
              </div>
            ) : null}

            {scannerOpen ? (
              <div className="scanner-layer">
                <video ref={scannerVideoRef} muted playsInline autoPlay />
                <div className="scanner-shade" aria-hidden="true">
                  <span className="scanner-frame" />
                </div>
                <div className="scanner-toolbar">
                  <div>
                    <strong>Сканирование штрихкода</strong>
                    <span>{scannerStatus || "Запуск камеры…"}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setScannerOpen(false)}
                    aria-label="Закрыть сканер"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
