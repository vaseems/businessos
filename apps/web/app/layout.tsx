import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { AppProvider } from '@/components/AppContext';
import '../styles/style.css';
import '../styles/glass.css';
import '../styles/app.css';

export const metadata: Metadata = {
  metadataBase: new URL('https://groundwork.viagradient.com'),
  title: 'Groundwork',
  description: 'Lay the groundwork. Build what’s next.',
  robots: { index: false, follow: false },
  icons: { icon: [{ url: '/favicon.ico' }, { url: '/brand/favicon-32.png', sizes: '32x32', type: 'image/png' }], apple: '/brand/apple-touch-icon.png' },
  openGraph: { title: 'Groundwork', description: 'Lay the groundwork. Build what’s next.', images: ['/brand/og.png'] },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', colorScheme: 'light dark' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body><AppProvider>{children}</AppProvider></body>
    </html>
  );
}
