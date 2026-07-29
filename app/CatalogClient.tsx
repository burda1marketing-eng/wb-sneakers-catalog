"use client";

import { useEffect, useMemo, useState } from "react";

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

const PAGE_SIZE = 24;
const PUBLIC_BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function localHref(pathname: string) {
  return `${PUBLIC_BASE_PATH}${pathname}`;
}

function normalize(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").trim();
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

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [brand, query, supplier.slug]);

  useEffect(() => {
    if (!selectedProduct) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedProduct(null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedProduct]);

  const visibleProducts = filteredProducts.slice(0, visibleCount);
  const totalSizes = supplier.products.reduce(
    (total, product) => total + product.sizes.length,
    0,
  );

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

        <section className="search-panel" aria-label="Поиск и фильтры">
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

                    <p className="product-note">{product.description}</p>
                    <div className="product-footer">
                      <span className="size-count">{product.sizes.length} размеров</span>
                      <button
                        className="open-product"
                        type="button"
                        onClick={() => setSelectedProduct(product)}
                      >
                        Подробнее →
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
              aria-label="Закрыть карточку"
            >
              ×
            </button>
            <div className="modal-media">
              {selectedProduct.photos[0] ? (
                <img
                  src={selectedProduct.photos[0]}
                  alt={`${selectedProduct.title}, вид спереди`}
                />
              ) : null}
            </div>
            <div className="modal-content">
              <p className="product-brand">{selectedProduct.brand}</p>
              <h2 id="product-modal-title">{selectedProduct.title}</h2>
              <p className="modal-subtitle">
                Артикул продавца {selectedProduct.vendorCode} · WB {selectedProduct.id}
              </p>
              <div className="modal-tags">
                <span>{selectedProduct.category}</span>
                {selectedProduct.gender ? <span>{selectedProduct.gender}</span> : null}
                {selectedProduct.colors.map((color) => (
                  <span key={color}>{color}</span>
                ))}
              </div>
              <p className="description">{selectedProduct.description}</p>

              <section className="size-section" aria-labelledby="size-grid-title">
                <h3 id="size-grid-title">Размерная сетка и штрихкоды</h3>
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

              <a
                className="wb-link"
                href={`https://www.wildberries.ru/catalog/${selectedProduct.id}/detail.aspx`}
                target="_blank"
                rel="noreferrer"
              >
                Открыть на Wildberries ↗
              </a>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
