import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

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

  return {
    title: {
      default: "Каталог обуви",
      template: "%s — Каталог обуви",
    },
    description:
      "197 моделей кроссовок и кед из пяти магазинов: фотографии, описания, размеры и штрихкоды.",
    metadataBase: new URL(origin),
    openGraph: {
      title: "Каталог обуви",
      description: "197 моделей · 5 магазинов · размеры и штрихкоды",
      type: "website",
      locale: "ru_RU",
      images: [
        {
          url: `${origin}/og.png`,
          width: 1664,
          height: 944,
          alt: "Каталог обуви — 197 моделей из пяти магазинов",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: "Каталог обуви",
      description: "197 моделей · 5 магазинов · размеры и штрихкоды",
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
