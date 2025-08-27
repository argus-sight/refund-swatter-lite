import './globals.css'

export const metadata = {
  title: 'Refund Swatter Lite',
  description: 'Simplified Apple App Store refund prevention service',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}