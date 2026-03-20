import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '2026 Agenda Calendar',
  description: 'A clean planner-style agenda calendar for projects and travel planning in 2026.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
