import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'POLCO TOURS',
  description: 'Tourism Operating System for Namibia & the Democratic Republic of Congo.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
