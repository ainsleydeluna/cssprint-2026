import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Tangkay",
  description: "Sagot agad sa \"hm po?\": quotes for small florists.",
  appleWebApp: {
    capable: true,
    title: "Tangkay",
    statusBarStyle: "black-translucent",
  },
  // Icons: app/icon.png and app/apple-icon.png (the logo, padded); the manifest's are in public/icons.
};

export const viewport: Viewport = {
  // "cover" lets the page reach under notches; the shell pads with safe-area insets.
  viewportFit: "cover",
  themeColor: "#166534",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fil"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip">{children}</body>
    </html>
  );
}
