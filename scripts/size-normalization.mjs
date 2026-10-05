const charts = {
  nikeMen: [
    [35.5, 3.5], [36, 4], [36.5, 4.5], [37.5, 5], [38, 5.5], [38.5, 6],
    [39, 6.5], [40, 7], [40.5, 7.5], [41, 8], [42, 8.5], [42.5, 9],
    [43, 9.5], [44, 10], [44.5, 10.5], [45, 11], [45.5, 11.5], [46, 12],
    [47, 12.5], [47.5, 13], [48.5, 14], [49.5, 15],
  ],
  nikeWomen: [
    [35.5, 5], [36, 5.5], [36.5, 6], [37.5, 6.5], [38, 7], [38.5, 7.5],
    [39, 8], [40, 8.5], [40.5, 9], [41, 9.5], [42, 10], [42.5, 10.5],
    [43, 11], [44, 11.5], [44.5, 12], [45, 12.5], [45.5, 13], [46, 13.5],
  ],
  adidasMen: [
    [36, 4], [36 + 2 / 3, 4.5], [37 + 1 / 3, 5], [38, 5.5], [38 + 2 / 3, 6],
    [39 + 1 / 3, 6.5], [40, 7], [40 + 2 / 3, 7.5], [41 + 1 / 3, 8],
    [42, 8.5], [42 + 2 / 3, 9], [43 + 1 / 3, 9.5], [44, 10],
    [44 + 2 / 3, 10.5], [45 + 1 / 3, 11], [46, 11.5], [46 + 2 / 3, 12],
    [47 + 1 / 3, 12.5], [48, 13], [48 + 2 / 3, 13.5], [49 + 1 / 3, 14],
  ],
  adidasWomen: [
    [35.5, 5], [36, 5.5], [36 + 2 / 3, 6], [37 + 1 / 3, 6.5], [38, 7],
    [38 + 2 / 3, 7.5], [39 + 1 / 3, 8], [40, 8.5], [40 + 2 / 3, 9],
    [41 + 1 / 3, 9.5], [42, 10], [42 + 2 / 3, 10.5], [43 + 1 / 3, 11],
    [44, 11.5], [44 + 2 / 3, 12], [45 + 1 / 3, 12.5], [46, 13],
  ],
  asics: [
    [35, 3], [35.5, 3.5], [36, 4], [37, 4.5], [37.5, 5], [38, 5.5],
    [39, 6], [39.5, 6.5], [40, 7], [40.5, 7.5], [41.5, 8], [42, 8.5],
    [42.5, 9], [43.5, 9.5], [44, 10], [44.5, 10.5], [45, 11], [46, 11.5],
    [46.5, 12], [47, 12.5], [48, 13], [49, 14],
  ],
  hokaMen: [
    [39 + 1 / 3, 6.5], [40, 7], [40 + 2 / 3, 7.5], [41 + 1 / 3, 8],
    [42, 8.5], [42 + 2 / 3, 9], [43 + 1 / 3, 9.5], [44, 10],
    [44 + 2 / 3, 10.5], [45 + 1 / 3, 11], [46, 11.5], [46 + 2 / 3, 12],
    [47 + 1 / 3, 12.5], [48, 13],
  ],
  hokaWomen: [
    [36, 5], [36 + 2 / 3, 5.5], [37 + 1 / 3, 6], [38, 6.5],
    [38 + 2 / 3, 7], [39 + 1 / 3, 7.5], [40, 8], [40 + 2 / 3, 8.5],
    [41 + 1 / 3, 9], [42, 9.5], [42 + 2 / 3, 10], [43 + 1 / 3, 10.5],
    [44, 11], [44 + 2 / 3, 11.5],
  ],
  mizuno: [
    [38.5, 6], [39, 6.5], [40, 7], [40.5, 7.5], [41, 8], [42, 8.5],
    [42.5, 9], [43, 9.5], [44, 10], [44.5, 10.5], [45, 11], [46, 11.5],
    [46.5, 12], [47, 12.5], [48, 13], [49, 14],
  ],
  onMen: [
    [39, 6.5], [40, 7], [40.5, 7.5], [41, 8], [42, 8.5], [42.5, 9],
    [43, 9.5], [44, 10], [44.5, 10.5], [45, 11], [46, 11.5], [47, 12],
    [47.5, 12.5], [48, 13],
  ],
  onWomen: [
    [36, 5], [36.5, 5.5], [37, 6], [37.5, 6.5], [38, 7], [38.5, 7.5],
    [39, 8], [40, 8.5], [40.5, 9], [41, 9.5], [42, 10], [42.5, 10.5],
    [43, 11], [44, 11.5],
  ],
  reebokMen: [
    [38.5, 6], [39, 6.5], [40, 7.5], [40.5, 8], [41, 8.5], [42, 9],
    [42.5, 9.5], [43, 10], [44, 10.5], [44.5, 11], [45, 11.5],
    [45.5, 12], [46, 12.5], [47, 13],
  ],
};

function clean(value) {
  return String(value ?? "").trim();
}

function detectSystem(value) {
  const text = clean(value).toUpperCase();
  if (/\bUS\b|\dUS\b/.test(text)) return "US";
  if (/\bUK\b|\dUK\b/.test(text)) return "UK";
  if (/\bEUR?\b|\dEUR?\b/.test(text)) return "EU";
  return "";
}

function parseNumber(value) {
  const text = clean(value)
    .replace(/(\d)\s*[.,]?\s*1\s*[\\/]\s*2/iu, "$1.5")
    .replace(/(\d)\s*\(\s*1\s*[\\/]\s*2\s*\)/iu, "$1.5")
    .replace(/(\d)\s*[.,]?\s*1\s*[\\/]\s*3/iu, (_, whole) => String(Number(whole) + 1 / 3))
    .replace(/(\d)\s*\(\s*1\s*[\\/]\s*3\s*\)/iu, (_, whole) => String(Number(whole) + 1 / 3))
    .replace(/(\d)\s*[.,]?\s*2\s*[\\/]\s*3/iu, (_, whole) => String(Number(whole) + 2 / 3))
    .replace(/(\d)\s*\(\s*2\s*[\\/]\s*3\s*\)/iu, (_, whole) => String(Number(whole) + 2 / 3))
    .replace(",", ".");
  const match = text.match(/\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function parseCm(...values) {
  for (const value of values) {
    const match = clean(value).match(/(\d+(?:[.,]\d+)?)\s*(?:см|cm)/iu);
    if (match) return Number(match[1].replace(",", "."));
  }
  return null;
}

function formatNumber(value) {
  if (value == null || !Number.isFinite(value)) return "";
  const whole = Math.floor(value + 0.001);
  const fraction = value - whole;
  if (Math.abs(fraction - 1 / 3) < 0.03) return `${whole}⅓`;
  if (Math.abs(fraction - 2 / 3) < 0.03) return `${whole}⅔`;
  return Number(value.toFixed(2)).toString().replace(".", ",");
}

function normalizedBrand(brand) {
  return clean(brand).toLowerCase().replace("о", "o");
}

function chartFor(product) {
  const brand = normalizedBrand(product.brand);
  const women = /жен/i.test(product.gender || "") || /женск|wmns|women/i.test(product.title || "");
  if (brand.includes("jordan")) return charts.nikeMen;
  if (brand.includes("nike")) return women ? charts.nikeWomen : charts.nikeMen;
  if (brand.includes("adidas")) return women ? charts.adidasWomen : charts.adidasMen;
  if (brand.includes("asics")) return charts.asics;
  if (brand.includes("hoka")) return women ? charts.hokaWomen : charts.hokaMen;
  if (brand.includes("mizuno")) return charts.mizuno;
  if (brand === "on" || brand.includes("on cloud")) return women ? charts.onWomen : charts.onMen;
  if (brand.includes("reebok")) return charts.reebokMen;
  return null;
}

function chartValue(pairs, fromIndex, value) {
  if (!pairs || value == null) return null;
  const exact = pairs.find((pair) => Math.abs(pair[fromIndex] - value) < 0.03);
  if (exact) return { value: exact[fromIndex === 0 ? 1 : 0], approximate: false };
  const nearest = [...pairs].sort((a, b) => Math.abs(a[fromIndex] - value) - Math.abs(b[fromIndex] - value))[0];
  if (nearest && Math.abs(nearest[fromIndex] - value) <= 0.36) {
    return { value: nearest[fromIndex === 0 ? 1 : 0], approximate: true };
  }
  return null;
}

function genericUs(eu, product) {
  if (eu == null) return null;
  const women = /жен/i.test(product.gender || "") || /женск|wmns|women/i.test(product.title || "");
  return { value: eu - (women ? 30 : 33), approximate: true };
}

function genericEu(us, product) {
  if (us == null) return null;
  const women = /жен/i.test(product.gender || "") || /женск|wmns|women/i.test(product.title || "");
  return { value: us + (women ? 30 : 33), approximate: true };
}

function isPlainNumeric(value) {
  return /^\s*\d+(?:[.,]\d+)?\s*$/u.test(clean(value));
}

export function normalizeProductSizes(product) {
  const dominantSystem = (() => {
    const systems = product.sizes.map((size) => detectSystem(size.label)).filter(Boolean);
    if (!systems.length) return "EU";
    return systems.sort((a, b) => systems.filter((item) => item === b).length - systems.filter((item) => item === a).length)[0];
  })();

  const parsed = product.sizes.map((source) => {
    const label = clean(source.label);
    const ru = clean(source.ru);
    const labelSystem = detectSystem(label);
    const labelValue = parseNumber(label);
    const primarySystem = labelSystem || (labelValue != null && labelValue < 30 ? dominantSystem : "EU");
    const secondarySystem = detectSystem(ru);
    const secondaryValue = parseNumber(ru);
    const result = {
      ...source,
      sourceLabel: label,
      primarySystem,
      primaryValue: labelValue,
      euValue: null,
      usValue: null,
      ukValue: null,
      cmValue: parseCm(label, ru),
      russianValue: null,
      usApproximate: false,
    };
    if (primarySystem === "EU") result.euValue = labelValue;
    if (primarySystem === "US") result.usValue = labelValue;
    if (primarySystem === "UK") result.ukValue = labelValue;
    if (secondarySystem === "EU") result.euValue = secondaryValue;
    if (secondarySystem === "US") result.usValue = secondaryValue;
    if (secondarySystem === "UK") result.ukValue = secondaryValue;

    if (!secondarySystem && secondaryValue != null) {
      if (primarySystem === "US" || primarySystem === "UK") result.euValue = secondaryValue;
      else if (primarySystem === "EU" && isPlainNumeric(ru)) result.russianValue = secondaryValue;
    }
    return result;
  });

  const euToUs = new Map();
  const usToEu = new Map();
  for (const size of parsed) {
    if (size.euValue != null && size.usValue != null) {
      euToUs.set(size.euValue.toFixed(3), size.usValue);
      usToEu.set(size.usValue.toFixed(3), size.euValue);
    }
  }

  const chart = chartFor(product);
  return parsed.map((size) => {
    if (size.euValue == null && size.usValue != null) {
      const fromProduct = usToEu.get(size.usValue.toFixed(3));
      const conversion = fromProduct != null
        ? { value: fromProduct, approximate: false }
        : chartValue(chart, 1, size.usValue) || genericEu(size.usValue, product);
      size.euValue = conversion?.value ?? null;
    }
    if (size.usValue == null && size.euValue != null) {
      const fromProduct = euToUs.get(size.euValue.toFixed(3));
      const conversion = fromProduct != null
        ? { value: fromProduct, approximate: false }
        : chartValue(chart, 0, size.euValue) || genericUs(size.euValue, product);
      size.usValue = conversion?.value ?? null;
      size.usApproximate = Boolean(conversion?.approximate);
    }

    return {
      label: size.label,
      ru: size.ru,
      barcode: size.barcode,
      sourceLabel: size.sourceLabel,
      primarySystem: size.primarySystem,
      primaryValue: formatNumber(size.primaryValue),
      eu: formatNumber(size.euValue),
      us: formatNumber(size.usValue),
      uk: formatNumber(size.ukValue),
      cm: formatNumber(size.cmValue),
      russian: formatNumber(size.russianValue),
      usApproximate: size.usApproximate,
    };
  });
}

