import type { Metadata } from "next"
import { JetBrains_Mono, Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { cn } from "@/lib/utils"

import { Toaster } from "react-hot-toast"

const inter = Inter({ subsets: ["latin"], variable: "--font-sans" })
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
})

export const metadata: Metadata = {
  title: "purge-chat | Ephemeral Zero-Knowledge Chat",
  description:
    "Ultra lightweight real-time chat with instant auto-vanish timeout, zero-knowledge AES-256 client encryption, and low RAM consumption.",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn("dark antialiased", jetbrainsMono.variable, inter.variable)}
    >
      <body
        suppressHydrationWarning
        className="flex min-h-svh flex-col bg-background font-mono text-foreground selection:bg-primary selection:text-primary-foreground"
      >
        <ThemeProvider>
          {children}
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: "var(--background)",
                color: "var(--foreground)",
                border: "1px solid rgba(var(--foreground-rgb), 0.3)",
                fontFamily: "var(--font-mono), monospace",
                fontSize: "12px",
                borderRadius: "6px",
                boxShadow: "0 0 15px rgba(var(--foreground-rgb), 0.15)",
              },
            }}
          />
        </ThemeProvider>
      </body>
    </html>
  )
}
