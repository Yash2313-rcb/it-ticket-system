import type { Metadata } from 'next';
import { Public_Sans } from 'next/font/google';
import { ThemeProvider } from 'next-themes';
import './globals.css';

const font = Public_Sans({ subsets: ['latin'], variable: '--font-sans' });

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME ?? 'IT Operations Platform',
  description: 'IT department management and operations for manufacturing organizations',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={font.variable}>
        <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
