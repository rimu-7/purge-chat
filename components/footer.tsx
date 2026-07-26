import Link from "next/link"
import { Terminal, Shield, Lock, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"

export function Footer() {
  return (
    <footer className="mt-auto w-full shrink-0 border-t border-border/80 bg-card/60 px-4 py-6 font-mono text-xs text-muted-foreground backdrop-blur">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 md:flex-row">
        {/* Brand & Tagline */}
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" />
          <span className="glow-text font-bold tracking-wider text-primary">
            PURGE-CHAT
          </span>
          <span className="text-[11px] text-muted-foreground">v1.0.0</span>
        </div>

        {/* Navigation Links */}
        <nav className="flex items-center gap-4 text-[12px] font-bold">
          <Link href="/" className="transition-colors hover:text-primary">
            [ Home ]
          </Link>
          <Link
            href="/privacy"
            className="transition-colors hover:text-primary"
          >
            [ Privacy Policy ]
          </Link>
          <Link
            href="/how-it-works"
            className="transition-colors hover:text-primary"
          >
            [ How It Works ]
          </Link>
        </nav>
      </div>
    </footer>
  )
}
