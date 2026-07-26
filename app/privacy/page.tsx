"use client";

import Link from "next/link";
import { Shield, ArrowLeft, Lock, Database, Trash2, EyeOff, Server } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Footer } from "@/components/footer";

export default function PrivacyPage() {
  return (
    <div className="relative min-h-svh w-full bg-background text-foreground flex flex-col font-mono overflow-x-hidden">
      {/* CRT Scanlines Overlay */}
      <div className="crt-scanlines fixed inset-0 z-50 pointer-events-none opacity-20" />

      {/* Header Bar */}
      <header className="h-14 border-b border-border bg-card/90 backdrop-blur px-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-primary">
              <ArrowLeft className="w-4 h-4" />
            </Button>
          </Link>
          <span className="font-bold text-sm text-primary tracking-wider glow-text">
            PURGE-CHAT // PRIVACY POLICY
          </span>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-4 md:p-8 space-y-6">
        <div className="space-y-2 text-center md:text-left">
          <h1 className="text-2xl md:text-4xl font-bold text-primary glow-text flex items-center justify-center md:justify-start gap-2">
            <Shield className="w-8 h-8 text-primary" /> PRIVACY & DATA POLICY
          </h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            Zero-Knowledge, Zero-Logs, and Permanent Data Vanishing by Design.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6">
          {/* Section 1: Zero-Knowledge Architecture */}
          <Card className="border-border bg-card/80 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <Lock className="w-4 h-4" /> 1. Zero-Knowledge AES-256 Client Encryption
              </CardTitle>
              <CardDescription className="text-xs">
                Your private backup keys and message payloads never leave your browser unencrypted.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">purge-chat</strong> implements a true Zero-Knowledge security model. When you initiate a room backup, all messages are encrypted client-side using Web Crypto API (<code className="text-primary">AES-256-GCM</code>) with keys derived via PBKDF2 (<code className="text-primary">SHA-256</code>, 100,000 iterations).
              </p>
              <p>
                The server only stores an opaque encrypted binary blob and an un-linkable SHA-256 hash of the room identifier. Server administrators cannot inspect, decrypt, or recover your backup without your client-generated secret key.
              </p>
            </CardContent>
          </Card>

          {/* Section 2: Ephemeral Message Lifetime */}
          <Card className="border-border bg-card/80 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <Trash2 className="w-4 h-4" /> 2. Automatic & Cascade Data Vanishing
              </CardTitle>
              <CardDescription className="text-xs">
                When a room expires or is manually purged, all message history vanishes instantly.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground space-y-2">
              <p>
                Active messages exist only during the designated room duration (10 minutes, 1 hour, or 24 hours). Messages are stored in an ephemeral relational database linked via foreign key constraints with <code className="text-primary">ON DELETE CASCADE</code>.
              </p>
              <p>
                Upon room expiration or owner manual purge:
              </p>
              <ul className="list-disc list-inside space-y-1 text-foreground pl-2">
                <li>The room entry is deleted from the datastore.</li>
                <li>Relational cascading deletion instantly purges all linked messages from disk.</li>
                <li>In-memory metadata cache automatically evicts room keys via native TTLs.</li>
                <li>Client connections receive an instant termination signal to clear local React memory.</li>
              </ul>
            </CardContent>
          </Card>

          {/* Section 3: Cost-Optimized Cache */}
          <Card className="border-border bg-card/80 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <Server className="w-4 h-4" /> 3. Lightweight In-Memory Metadata Caching
              </CardTitle>
              <CardDescription className="text-xs">
                Memory caching is reserved strictly for lightweight ephemeral metadata.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">purge-chat</strong> keeps memory consumption to a minimum by holding only lightweight, short-lived metadata in memory while keeping room state ephemeral.
              </p>
              <p>
                Native TTL keys expire automatically when room lifespan completes, preventing memory leaks, persistent logs, or un-purged data.
              </p>
            </CardContent>
          </Card>

          {/* Section 4: Zero Logs & No Tracking */}
          <Card className="border-border bg-card/80 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <EyeOff className="w-4 h-4" /> 4. Zero Logging, No Analytics & No Cookies
              </CardTitle>
              <CardDescription className="text-xs">
                Complete anonymity without persistent identification or tracking scripts.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs leading-relaxed text-muted-foreground space-y-2">
              <p>
                <strong className="text-foreground">purge-chat</strong> does not collect or store:
              </p>
              <ul className="list-disc list-inside space-y-1 text-foreground pl-2">
                <li>No IP addresses or location data.</li>
                <li>No tracking cookies or analytics telemetry.</li>
                <li>No personal names, email addresses, or phone numbers.</li>
                <li>No persistent user profiles or account registries.</li>
              </ul>
              <p>
                Sender aliases (e.g., <code className="text-primary">Cipher Lynx</code>) and sender IDs are generated locally in your browser and stored temporarily in your browser&apos;s <code className="text-primary">localStorage</code>.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
