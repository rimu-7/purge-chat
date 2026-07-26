"use client"

import React, { useRef } from "react"
import { motion } from "framer-motion"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import {
  Laptop,
  Smartphone,
  Server,
  Cpu,
  Database,
  Radio,
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Key,
  Layers,
  Lock,
  Zap,
  Activity,
  ShieldCheck,
  ChevronRight,
  Sliders,
} from "lucide-react"

export function SystemArchitectureDiagram() {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Pipeline execution nodes for horizontal sequence track
  const horizontalPipelineNodes = [
    {
      id: "node-1",
      step: "01 / TRANSPORT",
      title: "WebSocket Stream",
      desc: "Bidirectional encrypted pipe with heartbeats",
      icon: Radio,
      badge: "TLS 1.3",
      tag: "100ms Latency",
      accent: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    },
    {
      id: "node-2",
      step: "02 / ROUTER",
      title: "Application Server",
      desc: "NanoID route validation & handshake",
      icon: Server,
      badge: "Next.js Edge",
      tag: "Zero Logs",
      accent: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    },
    {
      id: "node-3",
      step: "03 / EVICTION",
      title: "TTL Sweep Engine",
      desc: "Evaluates NOW() > expiresAt eviction trigger",
      icon: Zap,
      badge: "Real-Time",
      tag: "Atomic Purge",
      accent: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    },
    {
      id: "node-4",
      step: "04 / CIPHER",
      title: "GCM Payload Vault",
      desc: "Local client AES-256 binary validation",
      icon: ShieldCheck,
      badge: "E2E Secure",
      tag: "No Plaintext",
      accent: "text-purple-400 border-purple-500/30 bg-purple-500/10",
    },
  ]

  return (
    <div className="mx-auto w-full max-w-5xl p-2 font-mono text-xs sm:p-4 md:p-6">
      <div className="flex flex-col items-center">
        {/* ==================== STAGE 1: VERTICAL ENTRY ==================== */}
        <motion.div
          initial={{ opacity: 0, y: -15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="flex w-full max-w-md flex-col items-start justify-between gap-2.5 rounded-lg border border-primary/40 bg-card/90 p-3.5 shadow-lg backdrop-blur sm:flex-row sm:items-center sm:p-4"
        >
          <div className="flex items-center gap-3">
            <div className="shrink-0 rounded-md bg-primary/10 p-2 text-primary ring-1 ring-primary/20">
              <div className="flex items-center gap-1.5">
                <Laptop className="h-4 w-4" />
                <Smartphone className="h-3.5 w-3.5" />
              </div>
            </div>
            <div>
              <div className="text-xs font-bold text-foreground sm:text-sm">
                Stage 01: Client Entry Node
              </div>
              <div className="text-[10px] text-muted-foreground sm:text-[11px]">
                Mobile & Desktop Browsers (Client Encrypted)
              </div>
            </div>
          </div>
          <Badge
            variant="outline"
            className="shrink-0 border-primary/30 bg-primary/5 px-2 py-0.5 text-[9px] text-primary sm:text-[10px]"
          >
            ORIGIN NODE
          </Badge>
        </motion.div>

        {/* Transition Connector: Vertical -> Horizontal Pipeline */}
        <div className="my-2 flex flex-col items-center">
          <div className="h-4 w-px bg-gradient-to-b from-primary/80 to-primary/30" />
          <motion.div
            animate={{ y: [0, 3, 0] }}
            transition={{ repeat: Infinity, duration: 2, ease: "easeInOut" }}
            className="my-0.5 flex items-center gap-1.5 rounded-full border border-primary/30 bg-muted/90 px-3 py-1 text-[9px] font-medium text-primary shadow-sm sm:text-[10px]"
          >
            <Activity className="h-3 w-3 animate-pulse text-primary" />
            <span>ENTER PIPELINE STREAM (SWIPE HORIZONTALLY)</span>
            <ChevronRight className="h-3 w-3 text-primary" />
          </motion.div>
          <div className="h-4 w-px bg-gradient-to-b from-primary/30 to-primary/80" />
          <ArrowDown className="-mt-1 h-3.5 w-3.5 text-primary" />
        </div>

        {/* ==================== STAGE 2: HORIZONTAL SCROLL TRACK ==================== */}
        <div className="relative my-2 w-full overflow-hidden rounded-xl border border-primary/30 bg-black/50 p-3 shadow-inner">
          {/* Scroll Track Ambient Glow Effects */}
          <div className="pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-black/80 to-transparent z-10" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-black/80 to-transparent z-10" />

          {/* Top Track Control Bar */}
          <div className="mb-3 flex items-center justify-between px-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5 text-primary">
              <Sliders className="h-3 w-3" />
              <span>STAGE 02: HIGH-SPEED PROCESSING TRACK</span>
            </span>
            <span className="hidden sm:inline-block text-[9px] uppercase text-muted-foreground/70">
              [ Drag or Scroll Horizontally ]
            </span>
          </div>

          {/* Smooth Scrollable Container */}
          <motion.div
            ref={scrollRef}
            drag="x"
            dragConstraints={{ right: 0, left: -400 }}
            whileTap={{ cursor: "grabbing" }}
            className="flex cursor-grab items-center gap-4 overflow-x-auto pb-3 pt-1 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-primary/20 hover:scrollbar-thumb-primary/40 focus:outline-none"
            style={{ touchAction: "pan-x" }}
          >
            {horizontalPipelineNodes.map((node, index) => {
              const NodeIcon = node.icon
              return (
                <React.Fragment key={node.id}>
                  {/* Node Item Card */}
                  <motion.div
                    initial={{ opacity: 0, x: 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{
                      duration: 0.35,
                      delay: index * 0.1,
                      ease: "easeOut",
                    }}
                    whileHover={{ scale: 1.02 }}
                    className="group relative flex w-64 shrink-0 flex-col justify-between rounded-lg border border-border/80 bg-card/80 p-3.5 shadow-md backdrop-blur transition-colors hover:border-primary/50"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[9px] font-bold tracking-wider text-muted-foreground">
                          {node.step}
                        </span>
                        <Badge
                          variant="outline"
                          className={`px-1.5 py-0 text-[9px] ${node.accent}`}
                        >
                          {node.badge}
                        </Badge>
                      </div>

                      <div className="mt-2.5 flex items-center gap-2">
                        <div className="rounded-md bg-primary/10 p-1.5 text-primary group-hover:bg-primary/20 transition-colors">
                          <NodeIcon className="h-4 w-4" />
                        </div>
                        <h4 className="text-xs font-bold text-foreground">
                          {node.title}
                        </h4>
                      </div>

                      <p className="mt-2 text-[10px] leading-normal text-muted-foreground">
                        {node.desc}
                      </p>
                    </div>

                    <div className="mt-3.5 flex items-center justify-between border-t border-border/50 pt-2 text-[9px]">
                      <span className="text-muted-foreground">Status</span>
                      <span className="font-semibold text-primary">
                        {node.tag}
                      </span>
                    </div>
                  </motion.div>

                  {/* Inter-node Horizontal Connector */}
                  {index < horizontalPipelineNodes.length - 1 && (
                    <div className="flex shrink-0 items-center justify-center px-1">
                      <div className="relative flex items-center">
                        <div className="h-px w-6 bg-gradient-to-r from-primary/40 via-primary to-primary/40" />
                        <motion.div
                          animate={{ x: [0, 8, 0] }}
                          transition={{
                            repeat: Infinity,
                            duration: 1.5,
                            ease: "easeInOut",
                          }}
                        >
                          <ArrowRight className="h-3.5 w-3.5 text-primary" />
                        </motion.div>
                      </div>
                    </div>
                  )}
                </React.Fragment>
              )
            })}
          </motion.div>
        </div>

        {/* Transition Connector: Horizontal -> Vertical Outro */}
        <div className="my-2 flex flex-col items-center">
          <ArrowDown className="h-3.5 w-3.5 text-primary" />
          <div className="h-4 w-px bg-gradient-to-b from-primary/80 to-primary/30" />
          <Badge
            variant="outline"
            className="my-0.5 border-primary/20 bg-card/90 px-2.5 py-0.5 text-[9px] text-muted-foreground"
          >
            STAGE 03: CONVERGENCE TO STORAGE
          </Badge>
          <div className="h-4 w-px bg-gradient-to-b from-primary/30 to-primary/80" />
          <ArrowDown className="-mt-1 h-3.5 w-3.5 text-primary" />
        </div>

        {/* ==================== STAGE 3: VERTICAL OUTRO (STORAGE LAYERS) ==================== */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="grid w-full grid-cols-1 gap-3.5 sm:grid-cols-2 sm:gap-4"
        >
          {/* Cache Storage Target */}
          <Card className="border-border/80 bg-card/70 shadow-sm backdrop-blur transition-all duration-200 hover:border-primary/40">
            <CardHeader className="border-b border-border/60 p-3 pb-2 sm:p-3.5 sm:pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xs font-bold text-primary sm:text-sm">
                  <Cpu className="h-4 w-4 shrink-0" />
                  In-Memory Cache Layer
                </CardTitle>
                <Badge
                  variant="outline"
                  className="shrink-0 border-primary/20 px-1.5 py-0 text-[9px] text-muted-foreground"
                >
                  VOLATILE TTL
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-2.5 text-[11px] text-muted-foreground sm:p-3.5 sm:pt-3">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">Room Metadata & Expired Timer</span>
              </div>
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">Ephemeral Session Map</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
                <span className="truncate font-medium text-foreground">
                  Zero Persistence Footprint
                </span>
              </div>
            </CardContent>
          </Card>

          {/* Ephemeral Datastore Target */}
          <Card className="border-border/80 bg-card/70 shadow-sm backdrop-blur transition-all duration-200 hover:border-primary/40">
            <CardHeader className="border-b border-border/60 p-3 pb-2 sm:p-3.5 sm:pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-xs font-bold text-primary sm:text-sm">
                  <Database className="h-4 w-4 shrink-0" />
                  Ephemeral Datastore
                </CardTitle>
                <Badge
                  variant="outline"
                  className="shrink-0 border-primary/20 px-1.5 py-0 text-[9px] text-muted-foreground"
                >
                  RELATIONAL
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 p-3 pt-2.5 text-[11px] text-muted-foreground sm:p-3.5 sm:pt-3">
              <div className="flex items-center gap-2">
                <Layers className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">Messages Table</span>
              </div>
              <div className="flex items-center gap-2">
                <Key className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">Cascading Foreign Key Eviction</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="h-3.5 w-3.5 shrink-0 text-primary/70" />
                <span className="truncate">
                  Encrypted Backups (60D Purge Sweep)
                </span>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </div>
  )
}