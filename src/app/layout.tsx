import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "EXECUTOR — Command Your Projects",
  description: "EXECUTOR 项目指挥中心的工程基线首页。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
