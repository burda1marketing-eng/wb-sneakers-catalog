import { notFound } from "next/navigation";
import CatalogClient from "../../CatalogClient";
import catalog from "../../data/catalog.json";

export function generateStaticParams() {
  return catalog.suppliers.map((supplier) => ({ supplier: supplier.slug }));
}

export default async function SupplierCatalogPage({
  params,
}: {
  params: Promise<{ supplier: string }>;
}) {
  const { supplier: slug } = await params;
  const supplier = catalog.suppliers.find((item) => item.slug === slug);

  if (!supplier) notFound();

  const suppliers = catalog.suppliers.map(({ products, ...item }) => ({
    ...item,
    productCount: products.length,
  }));

  return <CatalogClient supplier={supplier} suppliers={suppliers} />;
}
