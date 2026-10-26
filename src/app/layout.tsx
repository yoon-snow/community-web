import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "커뮤니티",
  description: "소규모 커뮤니티 웹사이트 초기 환경",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
