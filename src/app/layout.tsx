import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Santa Psikoloji · Operasyon",
  description: "Randevu onay kuyruğu ve WhatsApp asistanı yönetim ekranı",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
