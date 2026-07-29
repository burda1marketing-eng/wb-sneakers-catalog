"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

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
};

const PAGE_SIZE = 24;
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function localHref(pathname: string) {
  return `${PUBLIC_BASE_PATH}${pathname}`;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
}

function inventoryStorageKey(supplierSlug: string) {
  return `wb-catalog-inventory:${supplierSlug}`;
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
  const [inventoryFeedback, setInventoryFeedback] = useState("");
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
      setInventoryItems(saved ? (JSON.parse(saved) as InventoryItem[]) : []);
    } catch {
      setInventoryItems([]);
    } finally {
      setInventoryHydrated(true);
    }
  }, [supplier.slug]);

  useEffect(() => {
    if (!inventoryHydrated) return;
    window.localStorage.setItem(
      inventoryStorageKey(supplier.slug),
      JSON.stringify(inventoryItems),
    );
  }, [inventoryHydrated, inventoryItems, supplier.slug]);

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
      else if (inventoryOpen) setInventoryOpen(false);
      else if (selectedProduct) setSelectedProduct(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [inventoryOpen, scannerOpen, selectedProduct]);

  const addInventorySize = useCallback(
    (product: Product, size: Size, feedback = "Добавлено в ведомость") => {
      const key = `${product.id}:${size.barcode}`;
      setInventoryItems((current) => {
        const existing = current.find((item) => item.key === key);
        if (existing) {
          return current.map((item) =>
            item.key === key ? { ...item, count: item.count + 1 } : item,
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
            count: 1,
          },
          ...current,
        ];
      });
      setInventoryFeedback(`${feedback}: ${product.title}, ${size.label || size.ru}`);
    },
    [],
  );

  const registerScannedBarcode = useCallback(
    (barcode: string) => {
      for (const product of supplier.products) {
        const size = product.sizes.find((item) => item.barcode === barcode);
        if (size) {
          setInventoryLookup(barcode);
          setInventoryProductId(product.id);
          setInventorySizeBarcode(size.barcode);
          addInventorySize(product, size, "Штрихкод распознан");
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
    addInventorySize(inventoryProduct, size);
  }

  function changeInventoryCount(key: string, difference: number) {
    setInventoryItems((current) =>
      current
        .map((item) =>
          item.key === key ? { ...item, count: Math.max(0, item.count + difference) } : item,
        )
        .filter((item) => item.count > 0),
    );
  }

  function exportInventory() {
    const rows = [
      ["Кабинет", "Модель", "Бренд", "Артикул WB", "Артикул продавца", "Размер", "RU", "Штрихкод", "Количество"],
      ...inventoryItems.map((item) => [
        supplier.legalName,
        item.title,
        item.brand,
        item.productId,
        item.vendorCode,
        item.sizeLabel,
        item.sizeRu,
        item.barcode,
        String(item.count),
      ]),
    ];
    const csv = rows
      .map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";"))
      .join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventory-${supplier.slug}.csv`;
    link.click();
    URL.revokeObjectURL(url);
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
                <div className="entry-divider"><span>или вручную</span></div>

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
                  {inventoryItems.length ? (
                    <button type="button" onClick={exportInventory}>Скачать CSV</button>
                  ) : null}
                </div>

                {inventoryItems.length ? (
                  <div className="inventory-list">
                    {inventoryItems.map((item) => (
                      <article className="inventory-item" key={item.key}>
                        <div>
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
