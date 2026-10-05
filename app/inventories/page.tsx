import catalog from "../data/catalog.json";
import InventoriesClient from "./InventoriesClient";

export default function InventoriesPage() {
  return <InventoriesClient suppliers={catalog.suppliers} />;
}
