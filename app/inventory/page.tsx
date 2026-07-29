import InventoryReportClient from "./InventoryReportClient";
import catalog from "../data/catalog.json";

export default function InventoryReportPage() {
  return <InventoryReportClient suppliers={catalog.suppliers} />;
}
