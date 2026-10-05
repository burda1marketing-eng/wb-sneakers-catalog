export type CatalogSize = {
  label: string;
  ru: string;
  barcode: string;
  sourceLabel?: string;
  primarySystem?: "EU" | "US" | "UK";
  primaryValue?: string;
  eu?: string;
  us?: string;
  uk?: string;
  cm?: string;
  russian?: string;
  usApproximate?: boolean;
};

function legacyPrimary(size: CatalogSize) {
  const text = size.label || size.ru || "—";
  if (/\b(?:US|UK|EU|EUR)\b/i.test(text)) return text.replace(/EUR/gi, "EU");
  return `EU ${text}`;
}

export function primarySizeLabel(size: CatalogSize) {
  if (!size.primarySystem || !size.primaryValue) return legacyPrimary(size);
  return `${size.primarySystem} ${size.primaryValue}`;
}

export function sizeSecondaryLabel(size: CatalogSize) {
  return [
    size.eu ? `EU ${size.eu}` : "",
    size.us ? `US ${size.usApproximate ? "≈" : ""}${size.us}` : "",
  ].filter(Boolean).join(" · ");
}

export function fullSizeLabel(size: CatalogSize) {
  const values = [
    size.eu ? `EU ${size.eu}` : "",
    size.us ? `US ${size.usApproximate ? "≈" : ""}${size.us}` : "",
  ].filter(Boolean);
  return values.length ? values.join(" · ") : primarySizeLabel(size);
}

export function sizeSearchText(size: CatalogSize) {
  return [
    size.label,
    size.ru,
    size.primarySystem,
    size.primaryValue,
    size.eu,
    size.us,
    size.uk,
    size.cm,
    size.russian,
    size.barcode,
  ].filter(Boolean).join(" ");
}
