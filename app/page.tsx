import CatalogClient from "./CatalogClient";
import catalog from "./data/catalog.json";

export default function Home() {
  const supplier = catalog.suppliers[0];
  const suppliers = catalog.suppliers.map(({ products, ...item }) => ({
    ...item,
    productCount: products.length,
  }));

  return <CatalogClient supplier={supplier} suppliers={suppliers} />;
}
