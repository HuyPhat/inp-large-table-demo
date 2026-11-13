import type { ReactNode } from 'react';
import Link from 'next/link';
import './globals.css';

export const metadata = { title: 'INP large table demo' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav>
          <Link href="/broken">Broken (1000 DOM rows)</Link>
          <Link href="/fixed">Fixed (virtualized)</Link>
        </nav>
        {children}
      </body>
    </html>
  );
}
