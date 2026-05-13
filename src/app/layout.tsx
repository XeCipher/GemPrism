import './globals.css'
import type { Metadata } from 'next'
import { Outfit, JetBrains_Mono } from 'next/font/google'
import Script from 'next/script'

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

const siteDescription = "High-availability load balancer for the Gemini API.";

export const metadata: Metadata = {
  title: 'GemPrism',
  description: siteDescription,
  keywords: ['Gemini API', 'AI Gateway', 'Load Balancing', 'Rate Limit', 'Google AI', 'GemPrism'],
  openGraph: {
    title: 'GemPrism',
    description: siteDescription,
    url: 'https://gemprism.vercel.app',
    siteName: 'GemPrism',
    images: [
      {
        url: '/opengraph-image.png',
        width: 1200,
        height: 630,
        alt: 'GemPrism - AI Gateway for Gemini',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GemPrism',
    description: siteDescription,
    images: ['/opengraph-image.png'],
  },
  icons: {
    icon: [
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/apple-icon.png' },
    ],
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${mono.variable}`}>
      <head>
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-9PRHBBL8BV"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-9PRHBBL8BV');
          `}
        </Script>
      </head>
      <body
        className="antialiased bg-[#030303] text-white"
        style={{ fontFamily: "var(--font-outfit, 'Outfit', sans-serif)" }}
      >
        {children}
      </body>
    </html>
  )
}