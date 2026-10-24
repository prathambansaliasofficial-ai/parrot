import type { Metadata } from "next";
import "./globals.css";

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
      <body>{children}</body>
    </html>
  );
}
