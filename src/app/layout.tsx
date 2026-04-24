import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Navbar } from "@/components/Navbar";
import { LockBanner } from "@/components/LockBanner";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "WC2026 Predictions",
  description: "Predict FIFA World Cup 2026 match results and compete with friends",
};

// Without this, iOS Safari renders at a virtual 980 CSS px width and scales
// down — which means every responsive Tailwind class (sm:, md:, …) is
// effectively ignored on phones. Setting width=device-width is the prerequisite
// for any other mobile work to take effect.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Keep zoom enabled — we never want to fight assistive zoom by setting
  // maximum-scale or user-scalable=no.
  themeColor: "#003366", // matches the navbar bg-fifa-blue, paints the iOS/Android status bar
  viewportFit: "cover",  // lets us paint into the iPhone safe-area regions when we add padding
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <Providers>
          <Navbar />
          <LockBanner />
          <main className="min-h-screen">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
