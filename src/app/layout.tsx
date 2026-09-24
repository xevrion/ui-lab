import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Script from "next/script";
import { Analytics } from "@vercel/analytics/next";
import { LabSidebar } from "@/components/lab-sidebar";
import { SiteFooter } from "@/components/site-footer";
import { themeScript } from "@/components/theme-toggle";
import { site } from "@/lib/site";
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
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name}: small interaction experiments by ${site.author.handle}`,
    template: `%s · ${site.name}`,
  },
  description: site.description,
  applicationName: site.name,
  keywords: [
    "react components",
    "interaction design",
    "ui components",
    "micro-interactions",
    "animation",
    "tailwind css",
    "motion",
    "framer motion",
    "next.js",
    "design engineering",
    "interaction experiments",
  ],
  authors: [{ name: site.author.name, url: site.author.url }],
  creator: site.author.name,
  publisher: site.author.name,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: site.name,
    locale: site.locale,
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    creator: site.author.twitter,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        {/* Before first paint, so a saved theme never flashes the other one.
            Next's Script keeps it out of client re-renders (a 404 renders
            the layout on the client, and a raw script tag warns there). */}
        <Script id="theme" strategy="beforeInteractive">
          {themeScript}
        </Script>
      </head>
      <body className="min-h-full">
        {/* Sidebar and page side by side on wide screens; the page column
            carries its own header, content and footer. */}
        <div className="flex min-h-dvh">
          <LabSidebar />
          <div className="flex min-w-0 flex-1 flex-col">
            {children}
            <SiteFooter />
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
