import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

export type InventoryShareItem = [productId: string, barcode: string, count: number];

export type InventorySharePayload = {
  v: 1;
  s: string;
  d: string;
  i: InventoryShareItem[];
};

export function createInventoryShareToken(payload: InventorySharePayload) {
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function parseInventoryShareToken(token: string): InventorySharePayload | null {
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (!json) return null;

    const payload = JSON.parse(json) as Partial<InventorySharePayload>;
    if (
      payload.v !== 1 ||
      typeof payload.s !== "string" ||
      typeof payload.d !== "string" ||
      !Array.isArray(payload.i)
    ) {
      return null;
    }

    const items = payload.i.filter(
      (item): item is InventoryShareItem =>
        Array.isArray(item) &&
        item.length === 3 &&
        typeof item[0] === "string" &&
        typeof item[1] === "string" &&
        Number.isInteger(item[2]) &&
        item[2] > 0,
    );

    return { v: 1, s: payload.s, d: payload.d, i: items };
  } catch {
    return null;
  }
}
