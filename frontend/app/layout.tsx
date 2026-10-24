import type { Metadata } from "next";
import "./globals.css";
import ParrotProvider from "@/components/parrot/ParrotProvider";
import ParrotWidget from "@/components/parrot/ParrotWidget";

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
      <body>
        {children}
        <ParrotProvider>
          <ParrotWidget />
        </ParrotProvider>
      </body>
    </html>
  );
}
