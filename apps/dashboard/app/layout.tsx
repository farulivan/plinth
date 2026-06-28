import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Plinth",
  description: "Plinth — editorial CMS dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
