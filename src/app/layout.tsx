import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SpotLight · Volleyball Club",
  description: "함께 뛰고, 함께 빛나는 SpotLight 배구동호회 공식 앱",
  applicationName: "SpotLight",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "SpotLight" },
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#0F1F3D",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("spotlight-theme");document.documentElement.dataset.theme=t==="light"||t==="dark"?t:matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}catch{}`,
          }}
        />
      </head>
      <body>
        <a href="#main-content" className="skip-link">
          본문으로 이동
        </a>
        {children}
      </body>
    </html>
  );
}
