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
    "Case study: a standalone call quality compliance platform that gives the quality team control of its own rules, built as an exact replica of the old tool and then redesigned around the analysts' working day.",
  openGraph: {
    title: "QA Compliance Platform",
    description:
      "Gives the quality team control of its own compliance rules, with no engineering release in the way.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "QA Compliance Platform",
    description:
      "Gives the quality team control of its own compliance rules, with no engineering release in the way.",
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
