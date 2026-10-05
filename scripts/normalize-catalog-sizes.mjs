import fs from "node:fs/promises";
import { normalizeProductSizes } from "./size-normalization.mjs";

const catalogPath = new URL("../app/data/catalog.json", import.meta.url);
const catalog = JSON.parse(await fs.readFile(catalogPath, "utf8"));

for (const supplier of catalog.suppliers) {
  for (const product of supplier.products) {
    product.sizes = normalizeProductSizes(product);
  }
}

await fs.writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`, "utf8");

const sizes = catalog.suppliers.flatMap((supplier) => supplier.products.flatMap((product) => product.sizes));
const missingEu = sizes.filter((size) => !size.eu);
const missingUs = sizes.filter((size) => !size.us);
const primaryCounts = sizes.reduce((counts, size) => {
  counts[size.primarySystem] = (counts[size.primarySystem] || 0) + 1;
  return counts;
}, {});

console.log(JSON.stringify({
  sizes: sizes.length,
  primaryCounts,
  missingEu: missingEu.length,
  missingUs: missingUs.length,
  centimeters: sizes.filter((size) => size.cm).length,
  russianSupplemental: sizes.filter((size) => size.russian).length,
  approximateUs: sizes.filter((size) => size.usApproximate).length,
}, null, 2));

if (missingEu.length || missingUs.length) process.exitCode = 1;
