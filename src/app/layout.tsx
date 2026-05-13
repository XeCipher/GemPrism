import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'GemPrism',
  description: 'High-Availability Gateway for AI Routing',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased bg-[#0a0a0a] text-white">
        {children}
      </body>
    </html>
  )
}