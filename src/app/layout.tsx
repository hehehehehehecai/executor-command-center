import type { Metadata } from "next";
import { connection } from "next/server";
import { parseExecutorTheme } from "@/shared/visual-system";
import "./globals.css";

export const metadata: Metadata = {
  title: "EXECUTOR — Command Your Projects",
  description: "EXECUTOR 项目指挥中心的工程基线首页。",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  await connection();
  const theme = parseExecutorTheme(process.env.NEXT_PUBLIC_EXECUTOR_THEME);

  return (
    <html lang="zh-CN" data-executor-theme={theme}>
      <body>
        <a className="skip-link" href="#main-content">
          跳到主要内容
        </a>
        {children}
      </body>
    </html>
  );
}
