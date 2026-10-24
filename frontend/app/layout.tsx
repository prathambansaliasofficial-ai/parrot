import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import ParrotProvider from "@/components/parrot/ParrotProvider";
import ParrotWidget from "@/components/parrot/ParrotWidget";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Fresources | Study smarter with Parrot AI",
  description:
    "College resources and an AI study companion built around your course material.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.variable}>
        {children}
        <ParrotProvider>
          <ParrotWidget />
        </ParrotProvider>
      </body>
    </html>
  );
}
