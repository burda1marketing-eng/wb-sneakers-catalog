import type { Metadata } from "next";
import { headers } from "next/headers";
import catalog from "./data/catalog.json";
import "./globals.css";

function pluralRu(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host =
    requestHeaders.get("x-forwarded-host") ??
    requestHeaders.get("host") ??
    "localhost:3000";
  const protocol =
    requestHeaders.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;

  const storeCount = catalog.suppliers.length;
  const modelCount = catalog.suppliers.reduce(
    (sum, supplier) => sum + supplier.products.length,
    0,
  );
  const storeWord = pluralRu(storeCount, "магазина", "магазинов", "магазинов");
  const modelWord = pluralRu(modelCount, "модель", "модели", "моделей");

  return {
    title: {
      default: "Каталог обуви",
      template: "%s — Каталог обуви",
    },
    description:
      `${modelCount} ${modelWord} кроссовок и кед из ${storeCount} ${storeWord}: фотографии, описания, размеры и штрихкоды.`,
    metadataBase: new URL(origin),
    openGraph: {
      title: "Каталог обуви",
      description: `${modelCount} ${modelWord} · ${storeCount} ${storeWord} · размеры и штрихкоды`,
      type: "website",
      locale: "ru_RU",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1664,
          height: 944,
          alt: `Каталог обуви — ${modelCount} ${modelWord} из ${storeCount} ${storeWord}`,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Каталог обуви",
      description: `${modelCount} ${modelWord} · ${storeCount} ${storeWord} · размеры и штрихкоды`,
      images: [`${origin}/og.png`],
    },
  };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
