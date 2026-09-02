import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/shared/providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"]
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"]
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),

  icons: {
    icon: "/icon.svg"
  },

  title: {
    default: "HelioBay — Clean energy. Ready when you are.",
    template: "%s | HelioBay"
  },

  description: "Discover solar-powered EV charging, reserve your bay, and take the cleaner road with HelioBay. Interactive network prototype.",

  openGraph: {
    title: "HelioBay — Smart Solar EV Charging",
    description: "Clean energy. Ready when you are.",
    images: ["/images/hero.webp"]
  },

  twitter: {
    card: "summary_large_image",
    title: "HelioBay — Smart Solar EV Charging",
    images: ["/images/hero.webp"]
  }
};

export default function RootLayout(
  {
    children
  }: LayoutProps<"/">
) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>


      <body className="min-h-full">
        <a href="#main-content" className="skip-link">Skip to content</a>
        <Providers>{children}</Providers>
      </body>


    </html>
  );
}
