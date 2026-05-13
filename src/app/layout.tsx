import './globals.css'
import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono } from 'next/font/google'

const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-outfit',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'GemPrism — AI Gateway for the Gemini API',
  description:
    'High-availability load balancing for Google Gemini API keys. Bring your own keys, we handle the routing, rate-limit recovery, and failover.',
  keywords: ['Gemini API', 'AI Gateway', 'Load Balancing', 'Rate Limit', 'Google AI', 'GemPrism'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${mono.variable}`}>
      <body
        className="antialiased bg-[#030303] text-white"
        style={{ fontFamily: "var(--font-outfit, 'Outfit', sans-serif)" }}
      >
        {children}
      </body>
    </html>
  )
}