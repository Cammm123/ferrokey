import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "@fontsource/source-code-pro/400.css";
import "@fontsource/source-code-pro/500.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "ferrokey",
  description: "Post-quantum encrypted messages. Your key has a shape.",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#111111" },
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
  ],
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Reading the request headers renders every page per request, so Next.js can tag
  // its scripts with this request's CSP nonce (see middleware.ts).
  await headers();
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
