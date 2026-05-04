import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "vietnamese"],
  weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
  title: "SaveVid.Pro — Tải Video TikTok, YouTube, Facebook",
  description:
    "Tải video TikTok không watermark, YouTube và Facebook miễn phí. Chọn chất lượng 360p đến 4K. Nhanh, đơn giản, không cần đăng ký.",
  keywords: "tải video tiktok, download tiktok, youtube downloader, facebook video download, không watermark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" className={`${inter.variable} antialiased`}>
      <body>{children}</body>
    </html>
  );
}
