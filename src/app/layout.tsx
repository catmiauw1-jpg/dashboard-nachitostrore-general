import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PoleraFlow | Panel de control",
  description: "Dashboard administrativo para tiendas de poleras y poleras personalizadas."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="dark">{children}</body>
    </html>
  );
}
