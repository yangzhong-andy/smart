import type { Metadata } from 'next';
import './globals.css';
import { ReactNode } from 'react';
import { Toaster } from 'sonner';
import { Providers } from './providers';
import LayoutWrapper from './layout-wrapper';
import CryptoPolyfill from './crypto-polyfill';

export const metadata: Metadata = {
  title: 'Smart ERP',
  description: 'AI 智能调度中枢',
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang='zh-CN'>
      <head>
        <CryptoPolyfill />
      </head>
      <body className='h-screen overflow-hidden antialiased'>
        <Providers>
          <LayoutWrapper>{children}</LayoutWrapper>
        </Providers>
        <Toaster position='top-right' richColors />
      </body>
    </html>
  );
}
