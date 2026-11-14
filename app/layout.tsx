import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://qa-compliance-platform.vercel.app"),
  title: "QA Compliance Platform | Wahid Tawsif Ratul",
  description:
    "Case study: replacing a call quality review tool with a standalone platform, proven by re-scoring 1,281 of 1,281 historical reviews to the same result, then rebuilt around the analysts' working day.",
  openGraph: {
    title: "QA Compliance Platform",
    description:
      "An exact copy first, proven on 1,281 of 1,281 reviews, then a call quality platform built around the analysts' day.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QA Compliance Platform",
    description:
      "An exact copy first, proven on 1,281 of 1,281 reviews, then a call quality platform built around the analysts' day.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">{children}
        <Analytics />
      </body>
    </html>
  );
}
