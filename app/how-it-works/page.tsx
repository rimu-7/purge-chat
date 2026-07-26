"use client"

import Link from "next/link"
import {
  Terminal,
  ArrowLeft,
  Shield,
  Database,
  Lock,
  Clock,
  RefreshCw,
  Cpu,
  CheckCircle,
  Zap,
  ChevronRight,
  Server,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Footer } from "@/components/footer"
import { SystemArchitectureDiagram } from "./diagram"

export default function HowItWorksPage() {
  return (
    <div className="relative flex min-h-svh w-full flex-col overflow-x-hidden bg-background font-mono text-foreground selection:bg-primary/20 selection:text-primary">
      {/* CRT Scanlines Overlay */}
      <div className="crt-scanlines pointer-events-none fixed inset-0 z-50 opacity-15" />

      {/* Ambient Radial Background Glows */}
      <div className="pointer-events-none fixed top-0 left-1/2 h-[300px] w-[600px] -translate-x-1/2 rounded-full bg-primary/5 blur-[120px]" />
      <div className="pointer-events-none fixed right-0 bottom-0 h-[400px] w-[400px] rounded-full bg-primary/5 blur-[140px]" />

      {/* Header Bar */}
      <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center justify-between border-b border-border/80 bg-background/80 px-4 backdrop-blur-md sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex items-center gap-2">
            <span className="glow-text truncate text-xs font-bold tracking-wider text-primary sm:text-sm">
              PURGE-CHAT // ARCHITECTURE & AUTOMATION
            </span>
          </div>
        </div>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase">
            ENGINE ONLINE
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-8 sm:px-6 md:py-12 lg:px-8">
        {/* Hero Title Header */}
        <div className="space-y-3 text-center md:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-2.5 py-1 text-[11px] text-primary">
            <Shield className="h-3.5 w-3.5" />
            <span>Zero-Knowledge & Ephemeral Storage Specs</span>
          </div>

          <h1 className="glow-text flex items-center justify-center gap-3 text-2xl font-extrabold tracking-tight text-primary sm:text-3xl md:justify-start md:text-4xl">
            <Cpu className="h-7 w-7 shrink-0 text-primary sm:h-9 sm:w-9" />
            SYSTEM ARCHITECTURE & VANISHING ENGINE
          </h1>

          <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Understand how Purge-Chat delivers real-time secure communication
            using automated TTL eviction, client-side AES-256-GCM encryption,
            and zero-log retention.
          </p>
        </div>

        {/* System Highlights Banner */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: Lock, title: "AES-256-GCM", desc: "Client Encryption" },
            { icon: Clock, title: "Native TTL", desc: "Auto Eviction" },
            { icon: Database, title: "Relational DB", desc: "No Memory Bloat" },
            {
              icon: RefreshCw,
              title: "60-Day Purge",
              desc: "Inactive Backups",
            },
          ].map((item, i) => (
            <div
              key={i}
              className="flex flex-col items-center gap-2 rounded-lg border border-border/80 bg-card/60 p-3 text-center backdrop-blur sm:flex-row sm:items-start sm:gap-3 sm:text-left"
            >
              <item.icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <div>
                <div className="text-xs font-bold text-foreground">
                  {item.title}
                </div>
                <div className="text-[10px] text-muted-foreground">
                  {item.desc}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Terminal Window Frame */}
        <div className="overflow-hidden rounded-lg border border-border bg-card/90 shadow-2xl backdrop-blur">
          {/* Terminal Titlebar */}
          <div className="flex h-9 items-center justify-between border-b border-border bg-muted/40 px-4">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500/80" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-yellow-500/80" />
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <Terminal className="h-3.5 w-3.5 text-primary" />
              <span>system_architecture.puml</span>
            </div>
            <div className="hidden font-mono text-[10px] text-primary/70 sm:block">
              UTF-8
            </div>
          </div>

          {/* Terminal Content Component */}
          <div className="bg-black/40 p-2 sm:p-4">
            <SystemArchitectureDiagram />
          </div>
        </div>

        {/* Lifecycle Steps Grid */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold tracking-wider text-foreground uppercase">
              Execution Lifecycle Breakdown
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {/* Step 01 */}
            <Card className="border-border/80 bg-card/70 backdrop-blur transition-all duration-200 hover:border-primary/40">
              <CardHeader className="px-4 pt-4 pb-3 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Clock className="h-4 w-4 shrink-0" />
                    <CardTitle className="text-xs font-bold sm:text-sm">
                      STEP 01: Room Creation & Native TTL
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-primary/40 px-2 py-0.5 text-[10px] text-primary"
                  >
                    01 / LIFECYCLE
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-5 text-xs leading-relaxed text-muted-foreground sm:px-5">
                <p>
                  Upon secret room creation, the system issues a secure
                  16-character NanoID key and records the room in the datastore
                  with an explicit timestamp (
                  <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-primary">
                    expires_at
                  </code>
                  ).
                </p>
                <p>
                  A lightweight key-value cache entry is initialized with a
                  native TTL (e.g. 10m, 1h, 24h). This prevents memory bloat and
                  forces instant metadata eviction upon timer expiry.
                </p>
              </CardContent>
            </Card>

            {/* Step 02 */}
            <Card className="border-border/80 bg-card/70 backdrop-blur transition-all duration-200 hover:border-primary/40">
              <CardHeader className="px-4 pt-4 pb-3 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Database className="h-4 w-4 shrink-0" />
                    <CardTitle className="text-xs font-bold sm:text-sm">
                      STEP 02: Real-Time Transport & Storage
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-primary/40 px-2 py-0.5 text-[10px] text-primary"
                  >
                    02 / MESSAGING
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-5 text-xs leading-relaxed text-muted-foreground sm:px-5">
                <p>
                  Messages stream instantly across active participants. Incoming
                  payloads are stored in an ephemeral relational database table
                  explicitly linked via foreign keys to the parent room.
                </p>
                <p>
                  Because message histories are handled via structured
                  disk-backed relational storage rather than unbounded RAM, room
                  capacity remains high without causing memory spikes.
                </p>
              </CardContent>
            </Card>

            {/* Step 03 */}
            <Card className="border-border/80 bg-card/70 backdrop-blur transition-all duration-200 hover:border-primary/40">
              <CardHeader className="px-4 pt-4 pb-3 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <RefreshCw className="h-4 w-4 shrink-0" />
                    <CardTitle className="text-xs font-bold sm:text-sm">
                      STEP 03: Automated Cascading Purge
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-primary/40 px-2 py-0.5 text-[10px] text-primary"
                  >
                    03 / AUTOMATION
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-5 text-xs leading-relaxed text-muted-foreground sm:px-5">
                <p>Purging operates via a 3-tier automated safeguard:</p>
                <ul className="space-y-1.5 pl-1 text-foreground/90">
                  <li className="flex items-start gap-2">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>
                      <strong className="text-primary">
                        On-Access Validation:
                      </strong>{" "}
                      Direct checks trigger immediate room destruction if{" "}
                      <code className="rounded bg-primary/10 px-1 py-0.5 text-primary">
                        NOW() &gt; expiresAt
                      </code>
                      .
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>
                      <strong className="text-primary">
                        Cascading Key Purge:
                      </strong>{" "}
                      Room deletion automatically purges all connected messages
                      in a single atomic database operation.
                    </span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                    <span>
                      <strong className="text-primary">Worker Sweep:</strong>{" "}
                      Background workers sweep every minute to clean up orphaned
                      or expired records.
                    </span>
                  </li>
                </ul>
              </CardContent>
            </Card>

            {/* Step 04 */}
            <Card className="border-border/80 bg-card/70 backdrop-blur transition-all duration-200 hover:border-primary/40">
              <CardHeader className="px-4 pt-4 pb-3 sm:px-5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-primary">
                    <Lock className="h-4 w-4 shrink-0" />
                    <CardTitle className="text-xs font-bold sm:text-sm">
                      STEP 04: Zero-Knowledge Backup & 60D Purge
                    </CardTitle>
                  </div>
                  <Badge
                    variant="outline"
                    className="shrink-0 border-primary/40 px-2 py-0.5 text-[10px] text-primary"
                  >
                    04 / BACKUP
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 px-4 pb-5 text-xs leading-relaxed text-muted-foreground sm:px-5">
                <p>
                  When a room creator requests a backup, the client encrypts the
                  message payload locally using AES-256-GCM prior to uploading
                  the encrypted blob to the backup repository.
                </p>
                <p>
                  Backups track a{" "}
                  <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-primary">
                    last_accessed_at
                  </code>{" "}
                  timestamp. The automated worker permanently purges any
                  untouched backup where{" "}
                  <code className="rounded border border-primary/20 bg-primary/10 px-1.5 py-0.5 text-primary">
                    last_accessed_at &lt; NOW() - 60 Days
                  </code>
                  .
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* CTA Callout */}
        <Card className="relative flex flex-col items-center justify-between gap-6 overflow-hidden border border-primary/30 bg-gradient-to-r from-primary/10 via-card to-card p-6 text-center sm:flex-row sm:text-left md:p-8">
          <div className="relative z-10 max-w-xl space-y-2">
            <h3 className="flex items-center justify-center gap-2 text-lg font-bold text-foreground sm:justify-start sm:text-xl">
              <span>Ready to communicate with total privacy?</span>
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground">
              No registration required. Create an encrypted room, share your
              single-use access link, and let the vanishing engine handle the
              rest.
            </p>
          </div>

          <div className="relative z-10 w-full shrink-0 sm:w-auto">
            <Link href="/" className="block w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full gap-2 bg-primary px-6 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 sm:w-auto"
              >
                <CheckCircle className="h-4 w-4" />
                <span>START ANONYMOUS CHAT</span>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </Link>
          </div>
        </Card>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  )
}