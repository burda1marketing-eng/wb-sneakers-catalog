/* eslint-disable react-hooks/set-state-in-effect */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";
import { createInventoryShareToken } from "./inventory/share";
import {
  fullSizeLabel,
  primarySizeLabel,
  sizeSearchText,
  sizeSecondaryLabel,
  type CatalogSize as Size,
} from "./size-format";

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
  supplierSlug: string;
  supplierLegalName: string;
  supplierStoreName: string;
  supplierCountry: string;
  productId: string;
  vendorCode: string;
  title: string;
  brand: string;
  sizeLabel: string;
  sizeRu: string;
  sizePrimarySystem?: "EU" | "US" | "UK";
  sizePrimaryValue?: string;
  sizeEu?: string;
  sizeUs?: string;
  sizeUk?: string;
  sizeUsApproximate?: boolean;
  barcode: string;
  count: number;
  defective: boolean;
  defectPhotos: string[];
  colors: string[];
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

function countryCode(country: string) {
  if (country === "Россия") return "RU";
  if (country === "Китай") return "CN";
  return "KG";
}

function inventoryStorageKey(supplierSlug: string) {
  void supplierSlug;
  return "wb-catalog-active-inventory:v3";
}

function inventoryHistoryStorageKey(supplierSlug: string) {
  void supplierSlug;
  return "wb-catalog-inventory-history:v3";
}

const INVENTORY_ACTIVE_KEY = "wb-catalog-inventory-mode:v3";

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

function inventoryItemSize(item: InventoryItem): Size {
  return {
    label: item.sizeLabel,
    ru: item.sizeRu,
    barcode: item.barcode,
    primarySystem: item.sizePrimarySystem,
    primaryValue: item.sizePrimaryValue,
    eu: item.sizeEu,
    us: item.sizeUs,
    uk: item.sizeUk,
    usApproximate: item.sizeUsApproximate,
  };
}

function inventoryItemSizeKey(item: InventoryItem) {
  return `${item.sizeEu || ""}|${item.sizeUs || ""}|${item.sizePrimarySystem || ""}:${item.sizePrimaryValue || item.sizeLabel}`;
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
  const [inventoryPanelView, setInventoryPanelView] = useState<"add" | "list">("add");
  const [inventoryBarExpanded, setInventoryBarExpanded] = useState(false);
  const [inventoryActive, setInventoryActive] = useState(false);
  const [inventoryItems, setInventoryItems] = useState<InventoryItem[]>([]);
  const [inventoryHydrated, setInventoryHydrated] = useState(false);
  const [inventoryLookup, setInventoryLookup] = useState("");
  const [inventoryProductId, setInventoryProductId] = useState("");
  const [inventorySizeBarcode, setInventorySizeBarcode] = useState("");
  const [inventoryQuantity, setInventoryQuantity] = useState(1);
  const [inventoryBrand, setInventoryBrand] = useState("all");
  const [inventoryColor, setInventoryColor] = useState("all");
  const [cardSelections, setCardSelections] = useState<Record<string, { barcode: string; quantity: number }>>({});
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
  const [inventoryFilterSupplier, setInventoryFilterSupplier] = useState("all");
  const [inventoryFilterProduct, setInventoryFilterProduct] = useState("all");
  const [inventoryFilterSize, setInventoryFilterSize] = useState("all");
  const [inventoryFilterColor, setInventoryFilterColor] = useState("all");
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
          product.sizes.map(sizeSearchText).join(" "),
        ].join(" "),
      );
      return searchable.includes(needle);
    });
  }, [brand, query, supplier.products]);

  const inventoryProductOptions = useMemo(() => {
    const needle = normalize(inventoryLookup);
    return supplier.products.filter((product) => {
      if (inventoryBrand !== "all" && product.brand !== inventoryBrand) return false;
      if (inventoryColor !== "all" && !product.colors.includes(inventoryColor)) return false;
      if (!needle) return true;
      return normalize([
          product.title,
          product.brand,
          product.id,
          product.vendorCode,
          product.sizes.map(sizeSearchText).join(" "),
        ].join(" ")).includes(needle);
    });
  }, [inventoryBrand, inventoryColor, inventoryLookup, supplier.products]);

  const inventoryColors = useMemo(() => [...new Set(
    supplier.products
      .filter((product) => inventoryBrand === "all" || product.brand === inventoryBrand)
      .flatMap((product) => product.colors)
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "ru")), [inventoryBrand, supplier.products]);

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
        product.sizes.map(sizeSearchText).join(" "),
      ].join(" ")).includes(needle),
    );
  }, [catalogPickerQuery, supplier.products]);

  const inventoryTotal = inventoryItems.reduce((total, item) => total + item.count, 0);
  const inventorySupplierOptions = useMemo(() => [...new Map(
    inventoryItems.map((item) => [item.supplierSlug, {
      value: item.supplierSlug,
      label: `${item.supplierLegalName} · ${item.supplierStoreName}`,
    }]),
  ).values()], [inventoryItems]);
  const inventoryModelOptions = useMemo(() => [...new Map(
    inventoryItems
      .filter((item) => inventoryFilterSupplier === "all" || item.supplierSlug === inventoryFilterSupplier)
      .map((item) => [`${item.supplierSlug}:${item.productId}`, {
        value: `${item.supplierSlug}:${item.productId}`,
        label: `${item.title} · ${item.brand}`,
      }]),
  ).values()].sort((a, b) => a.label.localeCompare(b.label, "ru")), [inventoryFilterSupplier, inventoryItems]);
  const inventorySizeOptions = useMemo(() => [...new Map(
    inventoryItems
      .filter((item) => inventoryFilterSupplier === "all" || item.supplierSlug === inventoryFilterSupplier)
      .filter((item) => inventoryFilterProduct === "all" || `${item.supplierSlug}:${item.productId}` === inventoryFilterProduct)
      .map((item) => [inventoryItemSizeKey(item), {
        value: inventoryItemSizeKey(item),
        label: fullSizeLabel(inventoryItemSize(item)),
      }]),
  ).values()].sort((a, b) => a.label.localeCompare(b.label, "ru", { numeric: true })), [inventoryFilterProduct, inventoryFilterSupplier, inventoryItems]);
  const inventoryColorOptions = useMemo(() => [...new Set(
    inventoryItems
      .filter((item) => inventoryFilterSupplier === "all" || item.supplierSlug === inventoryFilterSupplier)
      .filter((item) => inventoryFilterProduct === "all" || `${item.supplierSlug}:${item.productId}` === inventoryFilterProduct)
      .filter((item) => inventoryFilterSize === "all" || inventoryItemSizeKey(item) === inventoryFilterSize)
      .flatMap((item) => item.colors || [])
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b, "ru")), [inventoryFilterProduct, inventoryFilterSize, inventoryFilterSupplier, inventoryItems]);
  const filteredInventoryItems = useMemo(() => inventoryItems.filter((item) =>
    (inventoryFilterSupplier === "all" || item.supplierSlug === inventoryFilterSupplier)
    && (inventoryFilterProduct === "all" || `${item.supplierSlug}:${item.productId}` === inventoryFilterProduct)
    && (inventoryFilterSize === "all" || inventoryItemSizeKey(item) === inventoryFilterSize)
    && (inventoryFilterColor === "all" || item.colors?.includes(inventoryFilterColor)),
  ), [inventoryFilterColor, inventoryFilterProduct, inventoryFilterSize, inventoryFilterSupplier, inventoryItems]);
  const inventoryFiltersActive = inventoryFilterSupplier !== "all"
    || inventoryFilterProduct !== "all"
    || inventoryFilterSize !== "all"
    || inventoryFilterColor !== "all";
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
      setInventoryItems(parsed.map((item) => {
        const itemSupplierSlug = item.supplierSlug || supplier.slug;
        const sourceProduct = itemSupplierSlug === supplier.slug
          ? supplier.products.find((product) => product.id === item.productId)
          : null;
        return {
          ...(item as InventoryItem),
          supplierSlug: itemSupplierSlug,
          supplierLegalName: item.supplierLegalName || supplier.legalName,
          supplierStoreName: item.supplierStoreName || supplier.storeName,
          supplierCountry: item.supplierCountry || supplier.country,
          defective: item.defective === true,
          defectPhotos: Array.isArray(item.defectPhotos) ? item.defectPhotos : [],
          colors: Array.isArray(item.colors) ? item.colors : sourceProduct?.colors ?? [],
        };
      }));
      setInventoryActive(window.localStorage.getItem(INVENTORY_ACTIVE_KEY) === "1");
      setSavedInventory(null);
      setInventoryOwner(inventoryOwnerKey());
    } catch {
      setInventoryItems([]);
      setSavedInventory(null);
      setInventoryOwner(inventoryOwnerKey());
    } finally {
      setInventoryHydrated(true);
    }
  }, [supplier.country, supplier.legalName, supplier.products, supplier.slug, supplier.storeName]);

  useEffect(() => {
    window.localStorage.setItem(INVENTORY_ACTIVE_KEY, inventoryActive ? "1" : "0");
  }, [inventoryActive]);

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
      const params = new URLSearchParams({ ownerKey: inventoryOwner, supplierSlug: "all" });
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

    if (inventorySizeBarcode && !inventoryProduct.sizes.some((size) => size.barcode === inventorySizeBarcode)) {
      setInventorySizeBarcode("");
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
      const key = `${supplier.slug}:${product.id}:${size.barcode}`;
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
            supplierSlug: supplier.slug,
            supplierLegalName: supplier.legalName,
            supplierStoreName: supplier.storeName,
            supplierCountry: supplier.country,
            productId: product.id,
            vendorCode: product.vendorCode,
            title: product.title,
            brand: product.brand,
            sizeLabel: size.label,
            sizeRu: size.ru,
            sizePrimarySystem: size.primarySystem,
            sizePrimaryValue: size.primaryValue,
            sizeEu: size.eu,
            sizeUs: size.us,
            sizeUk: size.uk,
            sizeUsApproximate: size.usApproximate,
            barcode: size.barcode,
            count: safeAmount,
            defective: false,
            defectPhotos: [],
            colors: [...product.colors],
          },
          ...current,
        ];
      });
      invalidateSavedInventory();
      setInventoryFeedback(`${feedback}: ${product.title}, ${primarySizeLabel(size)}`);
    },
    [invalidateSavedInventory, supplier.country, supplier.legalName, supplier.slug, supplier.storeName],
  );

  const registerScannedBarcode = useCallback(
    (barcode: string) => {
      for (const product of supplier.products) {
        const size = product.sizes.find((item) => item.barcode === barcode);
        if (size) {
          setInventoryLookup(barcode);
          setInventoryProductId(product.id);
          setInventorySizeBarcode(size.barcode);
          setInventoryBrand(product.brand || "all");
          setInventoryColor(product.colors[0] || "all");
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
    setInventoryProductId("");
    setInventorySizeBarcode("");
    const needle = normalize(value);
    if (!needle) return;

    for (const product of supplier.products) {
      const exactSize = product.sizes.find((size) => normalize(size.barcode) === needle);
      if (exactSize) {
        setInventoryProductId(product.id);
        setInventorySizeBarcode(exactSize.barcode);
        setInventoryBrand(product.brand || "all");
        setInventoryColor(product.colors[0] || "all");
        setInventoryFeedback("Штрихкод найден — проверьте модель и добавьте её");
        return;
      }
    }

    const exactProduct = supplier.products.find(
      (product) => normalize(product.title) === needle || normalize(product.vendorCode) === needle,
    );
    if (exactProduct) {
      setInventoryProductId(exactProduct.id);
      setInventoryBrand(exactProduct.brand || "all");
      setInventoryColor(exactProduct.colors[0] || "all");
    }
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
    setInventorySizeBarcode("");
    setInventoryLookup(product.title);
    setInventoryBrand(product.brand || "all");
    setInventoryColor(product.colors[0] || "all");
    setInventoryQuantity(1);
    setCatalogPickerOpen(false);
    setInventoryFeedback(`Выбрана модель: ${product.title}. Укажите размер и количество.`);
  }

  function beginInventory() {
    if (savedInventory) {
      setInventoryItems([]);
      setSavedInventory(null);
      window.localStorage.removeItem(inventoryStorageKey(supplier.slug));
    }
    setInventoryActive(true);
    setInventoryBarExpanded(false);
    setInventoryFeedback("Инвентаризация начата. Выбирайте размеры прямо в карточках любого кабинета.");
  }

  function selectCardSize(product: Product, size: Size) {
    const key = `${supplier.slug}:${product.id}`;
    setCardSelections((current) => ({ ...current, [key]: { barcode: size.barcode, quantity: 1 } }));
  }

  function changeCardQuantity(product: Product, difference: number) {
    const key = `${supplier.slug}:${product.id}`;
    setCardSelections((current) => {
      const selected = current[key];
      if (!selected) return current;
      return {
        ...current,
        [key]: { ...selected, quantity: Math.min(999, Math.max(1, selected.quantity + difference)) },
      };
    });
  }

  function addCardInventoryItem(product: Product) {
    const key = `${supplier.slug}:${product.id}`;
    const selected = cardSelections[key];
    const size = product.sizes.find((item) => item.barcode === selected?.barcode);
    if (!selected || !size) return;
    addInventorySize(product, size, selected.quantity, "Добавлено");
    setCardSelections((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
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

  function removeInventoryItem(key: string) {
    const removed = inventoryItems.find((item) => item.key === key);
    if (!removed) return;
    invalidateSavedInventory();
    setInventoryItems((current) => current.filter((item) => item.key !== key));
    setInventoryFeedback(`Удалено из ведомости: ${removed.title}, ${primarySizeLabel(inventoryItemSize(removed))}`);
  }

  function resetInventoryFilters() {
    setInventoryFilterSupplier("all");
    setInventoryFilterProduct("all");
    setInventoryFilterSize("all");
    setInventoryFilterColor("all");
  }

  function openInventoryPanel(view: "add" | "list") {
    setInventoryPanelView(view);
    setInventoryOpen(true);
  }

  function cancelEmptyInventory() {
    if (inventoryItems.length) return;
    setInventoryActive(false);
    setInventoryOpen(false);
    setScannerOpen(false);
    setInventoryBarExpanded(false);
    setCardSelections({});
    setInventoryFeedback("");
    window.localStorage.removeItem(INVENTORY_ACTIVE_KEY);
    window.localStorage.removeItem(inventoryStorageKey(supplier.slug));
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
          supplierSlug: "all",
          items: inventoryItems.map((item) => ({
            supplierSlug: item.supplierSlug,
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
      setInventoryActive(false);
      await loadInventoryHistory();
      setInventoryFeedback("Инвентаризация сохранена отдельным отчётом. Её можно скачать или отправить по ссылке.");
    } catch {
      const savedAt = new Date().toISOString();
      const token = createInventoryShareToken({
        v: 3,
        s: "all",
        d: savedAt,
        i: inventoryItems.map((item) => [
          item.supplierSlug,
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
        supplierSlug: "all",
        savedAt,
        positionCount: inventoryItems.length,
        totalCount: inventoryItems.reduce((sum, item) => sum + item.count, 0),
        defectiveCount: inventoryItems.filter((item) => item.defective).length,
        token,
      };
      setSavedInventory(snapshot);
      setInventoryActive(false);
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
    resetInventoryFilters();
    setSavedInventory(null);
    setInventoryLookup("");
    setInventoryProductId("");
    setInventorySizeBarcode("");
    setInventoryQuantity(1);
    setInventoryActive(true);
    setInventoryBarExpanded(false);
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
        { key: "boxSize", width: 15 },
        { key: "eu", width: 10 },
        { key: "us", width: 10 },
        { key: "barcode", width: 22 },
        { key: "count", width: 14 },
        { key: "defective", width: 12 },
        { key: "photos", width: 14 },
      ];

      sheet.mergeCells("A1:L1");
      sheet.getCell("A1").value = "Остатки после инвентаризации";
      sheet.getCell("A1").font = { bold: true, size: 18, color: { argb: "FF171817" } };
      sheet.getCell("A1").alignment = { vertical: "middle" };
      sheet.getRow(1).height = 34;

      sheet.getCell("A2").value = "Кабинет";
      sheet.mergeCells("B2:L2");
      sheet.getCell("B2").value = "Все кабинеты";
      sheet.getCell("A3").value = "Магазин";
      sheet.mergeCells("B3:L3");
      sheet.getCell("B3").value = "Общая инвентаризация";
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
          { name: "Размер производителя" },
          { name: "EU" },
          { name: "US" },
          { name: "Штрихкод" },
          { name: "Количество" },
          { name: "Брак" },
          { name: "Фото брака" },
        ],
        rows: savedInventory.items.map((item) => {
          const size = inventoryItemSize(item);
          return [
            `${item.supplierLegalName} · ${item.supplierStoreName}`,
            item.title,
            item.brand,
            item.productId,
            item.vendorCode,
            primarySizeLabel(size),
            size.eu || "",
            `${size.usApproximate ? "≈" : ""}${size.us || ""}`,
            item.barcode,
            item.count,
            item.defective ? "Да" : "Нет",
            item.defectPhotos.length,
          ];
        }),
      });
      sheet.getColumn("I").numFmt = "@";
      sheet.getColumn("J").numFmt = "#,##0";
      sheet.getColumn("J").alignment = { horizontal: "right" };

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
              fullSizeLabel(inventoryItemSize(item)),
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
      link.download = `inventory-all-${savedInventory.savedAt.slice(0, 10)}.xlsx`;
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
          <a className="inventory-archive-link" href={localHref("/inventories/")}>Сохранённые инвентаризации</a>
          <span className="updated">Данные обновлены 1 августа 2026</span>
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
            onClick={() => {
              if (inventoryActive) {
                openInventoryPanel("add");
                setScannerStatus("");
                setScannerOpen(true);
              } else beginInventory();
            }}
          >
            <span aria-hidden="true">▦</span>
            {inventoryActive ? "Сканировать штрихкод" : savedInventory ? "Начать новую инвентаризацию" : "Начать инвентаризацию"}
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

                    {inventoryActive ? (() => {
                      const selectionKey = `${supplier.slug}:${product.id}`;
                      const selection = cardSelections[selectionKey];
                      return (
                        <div className="card-inventory-controls">
                          <strong>Выберите размер</strong>
                          <div className="card-size-picker" aria-label={`Размеры ${product.title}`}>
                            {product.sizes.map((size) => (
                              <button
                                className={selection?.barcode === size.barcode ? "is-active" : ""}
                                type="button"
                                key={size.barcode}
                                onClick={() => selectCardSize(product, size)}
                                aria-pressed={selection?.barcode === size.barcode}
                              >
                                <span>{primarySizeLabel(size)}</span>
                                <small>{sizeSecondaryLabel(size)}</small>
                              </button>
                            ))}
                          </div>
                          {selection ? (
                            <div className="card-add-panel">
                              <div className="card-quantity" aria-label={`Количество ${product.title}`}>
                                <button type="button" onClick={() => changeCardQuantity(product, -1)} aria-label="Уменьшить количество">−</button>
                                <strong>{selection.quantity}</strong>
                                <button type="button" onClick={() => changeCardQuantity(product, 1)} aria-label="Увеличить количество">+</button>
                              </div>
                              <button className="card-add-button" type="button" onClick={() => addCardInventoryItem(product)}>
                                Добавить в ведомость
                              </button>
                            </div>
                          ) : (
                            <p>Листайте размеры по горизонтали и нажмите нужный.</p>
                          )}
                        </div>
                      );
                    })() : (
                      <div className="mobile-size-strip" aria-label="Размеры и штрихкоды">
                        {product.sizes.map((size) => (
                          <div className="mobile-size-item" key={`${size.ru}-${size.barcode}`}>
                            <span>{primarySizeLabel(size)}</span>
                            <small>{sizeSecondaryLabel(size)}</small>
                            <code>{size.barcode}</code>
                          </div>
                        ))}
                      </div>
                    )}

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
                {countryCode(item.country)} · {item.legalName} · {item.storeName}
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
                {countryCode(item.country)}
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

      {inventoryActive ? (
        <div className={`inventory-mode-bar ${inventoryBarExpanded ? "is-expanded" : "is-collapsed"}`} role="region" aria-label="Текущая инвентаризация">
          <button
            className="inventory-mode-toggle"
            type="button"
            aria-expanded={inventoryBarExpanded}
            aria-label={inventoryBarExpanded ? "Свернуть панель инвентаризации" : "Развернуть панель инвентаризации"}
            onClick={() => setInventoryBarExpanded((current) => !current)}
          >
            <span>Инвентаризация идёт</span>
            <strong>{inventoryItems.length} позиций · {inventoryTotal} единиц</strong>
            <b aria-hidden="true">{inventoryBarExpanded ? "↓" : "↑"}</b>
          </button>
          <button
            className="inventory-mode-scan"
            type="button"
            onClick={() => {
              openInventoryPanel("add");
              setScannerStatus("");
              setScannerOpen(true);
            }}
          >
            <span aria-hidden="true">▣</span>
            Сканировать штрихкод
          </button>
          <button
            className="inventory-mode-sheet"
            type="button"
            onClick={() => openInventoryPanel("list")}
          >
            <span aria-hidden="true">▤</span>
            Открыть ведомость
            <strong>{inventoryItems.length}</strong>
          </button>
          <button className="inventory-mode-manual" type="button" onClick={() => openInventoryPanel("add")}>Добавить вручную</button>
          {!inventoryItems.length ? (
            <button className="inventory-mode-cancel" type="button" onClick={cancelEmptyInventory}>Отменить инвентаризацию</button>
          ) : (
            <button className="inventory-mode-save" type="button" onClick={saveInventory} disabled={savingInventory}>
              {savingInventory ? "Сохраняем…" : "Сохранить инвентаризацию"}
            </button>
          )}
        </div>
      ) : null}

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
                        <th>Размер производителя</th>
                        <th>EU</th>
                        <th>US</th>
                        <th>Штрихкод</th>
                      </tr>
                    </thead>
                    <tbody>
                      {selectedProduct.sizes.map((size) => (
                        <tr key={`${size.label}-${size.ru}-${size.barcode}`}>
                          <td><strong>{primarySizeLabel(size)}</strong></td>
                          <td>{size.eu || "—"}</td>
                          <td>{size.us ? `${size.usApproximate ? "≈" : ""}${size.us}` : "—"}</td>
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
            className={`inventory-panel inventory-view-${inventoryPanelView}`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-title"
          >
            <header className="inventory-header">
              <div>
                <p>{supplier.storeName}</p>
                <h2 id="inventory-title">{inventoryPanelView === "list" ? "Текущая ведомость" : "Добавить вручную"}</h2>
                <div className="inventory-view-tabs" role="tablist" aria-label="Разделы текущей инвентаризации">
                  <button
                    className={inventoryPanelView === "add" ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={inventoryPanelView === "add"}
                    onClick={() => setInventoryPanelView("add")}
                  >
                    Добавить
                  </button>
                  <button
                    className={inventoryPanelView === "list" ? "is-active" : ""}
                    type="button"
                    role="tab"
                    aria-selected={inventoryPanelView === "list"}
                    onClick={() => setInventoryPanelView("list")}
                  >
                    Ведомость {inventoryItems.length}
                  </button>
                </div>
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
                <div className="entry-divider"><span>или выбрать параметры</span></div>

                <fieldset className="inventory-brand-filter">
                  <legend>Бренд</legend>
                  <div>
                    <button
                      type="button"
                      className={inventoryBrand === "all" ? "is-active" : ""}
                      onClick={() => {
                        setInventoryBrand("all");
                        setInventoryColor("all");
                        setInventoryProductId("");
                        setInventorySizeBarcode("");
                      }}
                    >
                      Все
                    </button>
                    {brands.map((item) => (
                      <button
                        type="button"
                        className={inventoryBrand === item ? "is-active" : ""}
                        key={item}
                        onClick={() => {
                          setInventoryBrand(item);
                          setInventoryColor("all");
                          setInventoryProductId("");
                          setInventorySizeBarcode("");
                        }}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </fieldset>

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

                <label className="inventory-field">
                  <span>Цвет</span>
                  <select
                    value={inventoryColor}
                    onChange={(event) => {
                      setInventoryColor(event.target.value);
                      setInventoryProductId("");
                      setInventorySizeBarcode("");
                    }}
                    aria-label="Цвет модели для инвентаризации"
                  >
                    <option value="all">Все цвета</option>
                    {inventoryColors.map((color) => <option value={color} key={color}>{color}</option>)}
                  </select>
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
                      setInventorySizeBarcode("");
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
                    key={inventoryProduct?.id ?? "no-product"}
                    value={inventorySizeBarcode}
                    onChange={(event) => setInventorySizeBarcode(event.target.value)}
                    disabled={!inventoryProduct}
                    aria-label="Размер для инвентаризации"
                  >
                    <option value="">Выберите размер</option>
                    {inventoryProduct?.sizes.map((size) => (
                      <option value={size.barcode} key={size.barcode}>
                        {primarySizeLabel(size)} · {sizeSecondaryLabel(size)} · {size.barcode}
                      </option>
                    ))}
                  </select>
                </label>

                <button
                  className="inventory-add"
                  type="button"
                  onClick={addManualInventoryItem}
                  disabled={!inventoryProduct?.sizes.some((size) => size.barcode === inventorySizeBarcode)}
                >
                  Добавить в ведомость
                </button>
                {inventoryFeedback ? (
                  <p className="inventory-feedback" role="status">{inventoryFeedback}</p>
                ) : null}
              </div>

              <div className="inventory-list-panel">
                <div className="inventory-list-heading">
                  <h3>
                    В ведомости
                    <span>{filteredInventoryItems.length} из {inventoryItems.length}</span>
                  </h3>
                  {inventoryFiltersActive ? (
                    <button type="button" onClick={resetInventoryFilters}>Сбросить фильтры</button>
                  ) : null}
                </div>

                {inventoryItems.length ? (
                  <div className="inventory-list-filters" aria-label="Фильтры ведомости">
                    <label>
                      <span>Магазин</span>
                      <select
                        value={inventoryFilterSupplier}
                        onChange={(event) => {
                          setInventoryFilterSupplier(event.target.value);
                          setInventoryFilterProduct("all");
                          setInventoryFilterSize("all");
                          setInventoryFilterColor("all");
                        }}
                        aria-label="Фильтр ведомости по магазину"
                      >
                        <option value="all">Все магазины</option>
                        {inventorySupplierOptions.map((option) => (
                          <option value={option.value} key={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Модель</span>
                      <select
                        value={inventoryFilterProduct}
                        onChange={(event) => {
                          setInventoryFilterProduct(event.target.value);
                          setInventoryFilterSize("all");
                          setInventoryFilterColor("all");
                        }}
                        aria-label="Фильтр ведомости по модели"
                      >
                        <option value="all">Все модели</option>
                        {inventoryModelOptions.map((option) => (
                          <option value={option.value} key={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Размер</span>
                      <select
                        value={inventoryFilterSize}
                        onChange={(event) => {
                          setInventoryFilterSize(event.target.value);
                          setInventoryFilterColor("all");
                        }}
                        aria-label="Фильтр ведомости по размеру"
                      >
                        <option value="all">Все размеры</option>
                        {inventorySizeOptions.map((option) => (
                          <option value={option.value} key={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Цвет</span>
                      <select
                        value={inventoryFilterColor}
                        onChange={(event) => setInventoryFilterColor(event.target.value)}
                        aria-label="Фильтр ведомости по цвету"
                      >
                        <option value="all">Все цвета</option>
                        {inventoryColorOptions.map((color) => (
                          <option value={color} key={color}>{color}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                ) : null}

                {inventoryItems.length ? (
                  filteredInventoryItems.length ? (
                    <div className="inventory-list">
                    {filteredInventoryItems.map((item) => (
                      <article className={`inventory-item${item.defective ? " is-defective" : ""}`} key={item.key}>
                        <div className="inventory-item-copy">
                          <strong>{item.title}</strong>
                          <span>{item.supplierLegalName} · {item.supplierStoreName}</span>
                          <span>{item.brand} · {fullSizeLabel(inventoryItemSize(item))}</span>
                          {item.colors?.length ? <span>Цвет: {item.colors.join(", ")}</span> : null}
                          <code>{item.barcode}</code>
                        </div>
                        <div className="inventory-item-actions">
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
                          <button
                            className="inventory-remove-item"
                            type="button"
                            onClick={() => removeInventoryItem(item.key)}
                            aria-label={`Удалить ${item.title}, ${primarySizeLabel(inventoryItemSize(item))} из ведомости`}
                          >
                            Удалить
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
                    <div className="inventory-filter-empty">
                      <strong>По выбранным фильтрам позиций нет</strong>
                      <button type="button" onClick={resetInventoryFilters}>Показать всю ведомость</button>
                    </div>
                  )
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
                        <em>{product.sizes.slice(0, 5).map(primarySizeLabel).join(" · ")}</em>
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
