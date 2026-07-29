import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";

export type InventoryShareItem = [productId: string, barcode: string, count: number];
export type InventoryShareItemV2 = [
  productId: string,
  barcode: string,
  count: number,
  defective: 0 | 1,
  photos: string[],
];

export type InventorySharePayloadV1 = {
  v: 1;
  s: string;
  d: string;
  i: InventoryShareItem[];
};

export type InventorySharePayloadV2 = {
  v: 2;
  s: string;
  d: string;
  i: InventoryShareItemV2[];
};

export type InventorySharePayload = InventorySharePayloadV1 | InventorySharePayloadV2;

export function createInventoryShareToken(payload: InventorySharePayload) {
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export function parseInventoryShareToken(token: string): InventorySharePayload | null {
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (!json) return null;

    const payload = JSON.parse(json) as Partial<InventorySharePayload>;
    if (
      (payload.v !== 1 && payload.v !== 2) ||
      typeof payload.s !== "string" ||
      typeof payload.d !== "string" ||
      !Array.isArray(payload.i)
    ) {
      return null;
    }

    if (payload.v === 1) {
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
    }

    const items = payload.i.filter(
      (item): item is InventoryShareItemV2 =>
        Array.isArray(item) &&
        item.length === 5 &&
        typeof item[0] === "string" &&
        typeof item[1] === "string" &&
        Number.isInteger(item[2]) &&
        item[2] > 0 &&
        (item[3] === 0 || item[3] === 1) &&
        Array.isArray(item[4]) &&
        item[4].length <= 10 &&
        item[4].every((photo) => typeof photo === "string" && photo.startsWith("data:image/")),
    );
    return { v: 2, s: payload.s, d: payload.d, i: items };
  } catch {
    return null;
  }
}
