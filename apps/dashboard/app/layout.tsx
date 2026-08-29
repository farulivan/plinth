import { ThemeProvider } from "@plinth/ui/components/theme-provider";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Plinth",
  description: "Plinth — editorial CMS dashboard",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // The proxy's per-request nonce (ADR-0011). next-themes sets the theme class
  // with an inline script, and the CSP only allows nonced first-party scripts
  // — without it the theme script is blocked outright.
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <body>
        <ThemeProvider nonce={nonce}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
