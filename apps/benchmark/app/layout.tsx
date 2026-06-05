import { GeistMono } from "geist/font/mono";
import { GeistSans } from "geist/font/sans";
import type { Metadata } from "next";
import { Fraunces } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const fraunces = Fraunces({
  axes: ["opsz", "SOFT"],
  display: "swap",
  subsets: ["latin"],
  variable: "--font-fraunces",
});

/** Static metadata for the benchmark Next.js app. */
export const metadata: Metadata = {
  description: "Compare provider route latency for @howells/ai models.",
  title: "Howells AI Benchmark",
};

/** Root document shell that installs benchmark typography and global CSS. */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} ${fraunces.variable}`}>
      <body>{children}</body>
    </html>
  );
}
