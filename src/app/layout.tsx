import type { Metadata } from "next";
import type { ReactNode } from "react";
import "@fontsource/jost/latin-300.css";
import "@fontsource/jost/latin-400.css";
import "@fontsource/jost/latin-500.css";
import "./globals.css";
import { baseOpenGraph, SITE_NAME } from "@/lib/metadata";
import { getSiteUrl } from "@/lib/site-url";

const DEFAULT_DESCRIPTION =
  "Solid timber furniture handcrafted to order in Torquay. Dining tables, living pieces and bathroom vanities in Messmate, Blackwood, American Oak and more.";

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: "CM Timberhaus | Bespoke timber furniture, Torquay",
    template: `%s | ${SITE_NAME}`,
  },
  description: DEFAULT_DESCRIPTION,
  openGraph: baseOpenGraph,
  twitter: { card: "summary_large_image" },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-AU">
      <body>{children}</body>
    </html>
  );
}
