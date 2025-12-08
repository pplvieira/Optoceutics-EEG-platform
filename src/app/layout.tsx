import type { Metadata } from "next";
import "./styles/globals.css";

export const metadata: Metadata = {
  title: "Optoceutics EEG Platform",
  description: "Advanced EEG data collection, analysis, and visualization platform for research and experiments",
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-sans">{children}</body>
    </html>
  );
}