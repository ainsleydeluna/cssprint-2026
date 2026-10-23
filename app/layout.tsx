import type { Metadata, Viewport } from "next";
import { Quicksand, Geist_Mono } from "next/font/google";
import "./globals.css";

const quicksand = Quicksand({
  variable: "--font-quicksand",
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
  themeColor: "#fdfbf7",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fil"
      className={`${quicksand.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col overflow-x-clip bg-background text-foreground font-sans">
  <svg aria-hidden="true" style={{ position: "absolute", width: 0, height: 0, overflow: "hidden" }}>
    <defs>
      <filter id="pastel-smear" x="-30%" y="-30%" width="160%" height="160%">
        <feTurbulence type="fractalNoise" baseFrequency="0.04" numOctaves="4" result="noise" />
        <feDisplacementMap in="SourceGraphic" in2="noise" scale="5.5" xChannelSelector="R" yChannelSelector="G" result="displaced" />
        <feGaussianBlur in="displaced" stdDeviation="1.2" result="blurred" />
        <feMerge>
          <feMergeNode in="blurred" />
          <feMergeNode in="displaced" />
        </feMerge>
      </filter>
    </defs>
  </svg>
  {children}
</body>
    </html>
  );
}