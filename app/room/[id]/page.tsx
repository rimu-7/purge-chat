"use client"

import { useEffect, useState, useRef, use } from "react"
import { useRouter } from "next/navigation"
import { io, Socket } from "socket.io-client"
import axios from "axios"
import toast from "react-hot-toast"
import {
  Shield,
  ShieldCheck,
  Clock,
  Lock,
  Copy,
  Check,
  Send,
  Trash2,
  Download,
  Menu,
  AlertTriangle,
  ArrowLeft,
  Users,
  Terminal,
  Crown,
  LogOut,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { BubbleGroup, Bubble, BubbleContent } from "@/components/ui/bubble"
import { generateAnonymousName, generateId } from "@/lib/identity"
import { encryptPayload } from "@/lib/crypto"

interface MessageItem {
  id: string
  roomId: string
  senderId: string
  senderName: string
  content: string
  type?: "user" | "system"
  createdAt: string
}

function deduplicateMessages(msgs: MessageItem[]): MessageItem[] {
  const realIds = new Set<string>()
  const realUserContents = new Set<string>()

  for (const m of msgs) {
    if (m && m.id && !m.id.startsWith("temp-")) {
      realIds.add(m.id)
      if (m.senderId && m.content) {
        realUserContents.add(`${m.senderId}_${m.content}`)
      }
    }
  }

  const seen = new Set<string>()
  const result: MessageItem[] = []

  for (const m of msgs) {
    if (!m || !m.id) continue
    if (seen.has(m.id)) continue

    // Drop temporary optimistic message if real message with same content and sender exists
    if (m.id.startsWith("temp-") && realUserContents.has(`${m.senderId}_${m.content}`)) {
      continue
    }

    seen.add(m.id)
    result.push(m)
  }
  return result
}

export default function RoomPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: roomId } = use(params)
  const router = useRouter()

  // User identity state initialized lazily with sessionStorage isolation for multi-tab testing
  const [senderId] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    let sid = sessionStorage.getItem(`vanish_sender_id_${roomId}`)
    if (!sid) {
      sid = localStorage.getItem("vanish_sender_id") || generateId()
      sessionStorage.setItem(`vanish_sender_id_${roomId}`, sid)
    }
    return sid
  })

  const [senderName, setSenderName] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    let sname = sessionStorage.getItem(`vanish_sender_name_${roomId}`)
    if (!sname) {
      sname = localStorage.getItem("vanish_sender_name") || generateAnonymousName()
      sessionStorage.setItem(`vanish_sender_name_${roomId}`, sname)
    }
    return sname
  })

  const [secretKey] = useState<string>(() => {
    if (typeof window === "undefined") return ""
    let skey = sessionStorage.getItem(`secret_key_${roomId}`)
    if (!skey) {
      skey = generateId().substring(0, 24)
      sessionStorage.setItem(`secret_key_${roomId}`, skey)
    }
    return skey
  })

  // Room state
  const [room, setRoom] = useState<{
    id: string
    ownerId: string
    expiresAt: string
    isBackedUp: boolean
  } | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [inputContent, setInputContent] = useState("")
  const [isSending, setIsSending] = useState(false)
  const [isExpired, setIsExpired] = useState(false)
  const [timeLeftStr, setTimeLeftStr] = useState("Calculating...")

  // UI States
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedRoomId, setCopiedRoomId] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)
  const [backupResult, setBackupResult] = useState<{
    roomIdHash: string
    secretKey: string
  } | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false)
  const [isPurging, setIsPurging] = useState(false)

  // Join & Leave Confirmation States
  const [hasJoinedRoom, setHasJoinedRoom] = useState<boolean>(() => {
    if (typeof window === "undefined") return false
    return sessionStorage.getItem(`has_joined_room_${roomId}`) === "true"
  })
  const [isJoining, setIsJoining] = useState(false)
  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const socketRef = useRef<Socket | null>(null)
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }

  const isOwner = !!(room && senderId && room.ownerId === senderId)

  // Fetch initial room metadata and messages & broadcast join notification
  useEffect(() => {
    if (!senderId || !senderName) return

    let isMounted = true

    async function initRoom() {
      try {
        const { data: roomData } = await axios.get(`/api/room/${roomId}`)
        if (isMounted) setRoom(roomData)

        const { data: msgData } = await axios.get(
          `/api/room/${roomId}/messages`
        )
        if (isMounted) setMessages(deduplicateMessages(msgData))

        // Room metadata and initial message history fetched cleanly
        const joinKey = `joined_logged_${roomId}_${senderId}`
        sessionStorage.setItem(joinKey, "true")
      } catch (err: any) {
        if (err.response?.status === 404) {
          if (isMounted) setIsExpired(true)
          stopPolling()
        } else {
          console.error("Error loading room:", err)
        }
      }
    }

    initRoom()

    return () => {
      isMounted = false
    }
  }, [roomId, senderId, senderName])

  const senderNameRef = useRef(senderName)
  useEffect(() => {
    senderNameRef.current = senderName
  }, [senderName])

  // Real-time Socket.io Connection (Triggered after Join Confirmation)
  useEffect(() => {
    if (!roomId || !hasJoinedRoom) return

    // Initialize Socket.io connection if server is running Socket.io
    const socket = io({
      autoConnect: true,
      transports: ["websocket", "polling"],
      timeout: 3000,
    })

    socketRef.current = socket

    socket.emit("join-room", { roomId, senderName: senderNameRef.current })

    socket.on("message-received", (msg: MessageItem) => {
      setMessages((prev) => deduplicateMessages([...prev, msg]))
    })

    socket.on("backup-status-updated", () => {
      setRoom((prev) => (prev ? { ...prev, isBackedUp: true } : prev))
    })

    socket.on("room-destroyed", () => {
      setIsExpired(true)
      stopPolling()
    })

    return () => {
      socket.disconnect()
      stopPolling()
    }
  }, [roomId, hasJoinedRoom])

  // Countdown timer effect
  useEffect(() => {
    if (!room?.expiresAt) return

    const timer = setInterval(() => {
      const expires = new Date(room.expiresAt).getTime()
      const now = new Date().getTime()
      const diff = expires - now

      if (diff <= 0) {
        setIsExpired(true)
        setTimeLeftStr("00:00:00 - EXPIRED")
        stopPolling()
        clearInterval(timer)
      } else {
        const hours = Math.floor(diff / (1000 * 60 * 60))
        const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
        const secs = Math.floor((diff % (1000 * 60)) / 1000)
        setTimeLeftStr(
          `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`
        )
      }
    }, 1000)

    return () => clearInterval(timer)
  }, [room?.expiresAt])

  // Auto-scroll chat to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputContent.trim() || isSending || isExpired) return

    const content = inputContent.trim()
    setInputContent("")
    setIsSending(true)

    // ⚡ Optimistic UI Update: Display message in 0ms!
    const tempId =
      "temp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6)
    const optimisticMsg: MessageItem = {
      id: tempId,
      roomId,
      senderId,
      senderName,
      content,
      type: "user",
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => deduplicateMessages([...prev, optimisticMsg]))

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("send-message", {
          roomId,
          senderId,
          senderName,
          content,
        })
      } else {
        const { data: msg } = await axios.post(`/api/room/${roomId}/messages`, {
          senderId,
          senderName,
          content,
        })
        setMessages((prev) =>
          deduplicateMessages(prev.map((m) => (m.id === tempId ? msg : m)))
        )
      }
    } catch (err: any) {
      // Revert optimistic message if send failed
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      if (err.response?.status === 404) {
        setIsExpired(true)
        stopPolling()
      } else {
        console.error("Send failed:", err)
      }
    } finally {
      setIsSending(false)
    }
  }

  // Join Confirmation Handler
  const handleConfirmJoin = async () => {
    if (!senderName.trim() || isJoining) return
    setIsJoining(true)

    try {
      sessionStorage.setItem(`has_joined_room_${roomId}`, "true")
      sessionStorage.setItem(`vanish_sender_name_${roomId}`, senderName.trim())
      setHasJoinedRoom(true)

      if (socketRef.current?.connected) {
        socketRef.current.emit("join-room", {
          roomId,
          senderName: senderName.trim(),
        })
      }
    } catch (err) {
      console.error("Join error:", err)
    } finally {
      setIsJoining(false)
    }
  }

  // Leave Room Handler (Opens Confirmation Dialog)
  const handleLeaveRoom = () => {
    setConfirmLeaveOpen(true)
  }

  // Confirmed Leave Execution Handler
  const handleConfirmLeave = async () => {
    if (isLeaving) return
    setIsLeaving(true)

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("leave-room", { roomId, senderName })
        await new Promise((res) => setTimeout(res, 100))
      } else {
        await axios.post(`/api/room/${roomId}/activity`, {
          senderName,
          action: "leave",
        })
      }
      sessionStorage.removeItem(`has_joined_room_${roomId}`)
      sessionStorage.removeItem(`joined_logged_${roomId}_${senderId}`)
    } catch (err) {
      console.error("Leave error:", err)
    } finally {
      stopPolling()
      setIsLeaving(false)
      setConfirmLeaveOpen(false)
      router.push("/")
    }
  }

  // Owner-Only Non-Destructive Backup Execution
  const handleBackupRoom = async () => {
    if (!isOwner || isBackingUp || messages.length === 0) return
    setIsBackingUp(true)

    try {
      // 1. Client-Side Zero-Knowledge Encryption using Secret Key
      const userMessagesOnly = messages.filter((m) => m.type !== "system")
      const { encryptedData, iv } = await encryptPayload(
        userMessagesOnly,
        secretKey
      )

      // 2. Upload encrypted payload to TiDB MySQL via Axios
      const { data } = await axios.post(`/api/room/${roomId}/backup`, {
        senderId,
        encryptedData,
        iv,
      })

      setRoom((prev) => (prev ? { ...prev, isBackedUp: true } : prev))
      setBackupResult({
        roomIdHash: data.roomIdHash,
        secretKey,
      })
      setBackupDialogOpen(true)

      // Notify other participants live via socket and broadcast system backup notice
      if (socketRef.current?.connected) {
        socketRef.current.emit("trigger-backup-updated", {
          roomId,
          sysMsg: data.sysMsg,
        })
      }
    } catch (err: any) {
      console.error("Backup failed:", err)
      const msg = err.response?.data?.error || err.message || "Backup failed"
      alert(msg)
    } finally {
      setIsBackingUp(false)
    }
  }

  // Owner-Only Manual Purge Execution
  const handleConfirmPurge = async () => {
    if (!isOwner || isPurging) return
    setIsPurging(true)

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("trigger-purge", { roomId, senderId })
      } else {
        await axios.delete(`/api/room/${roomId}?senderId=${senderId}`)
        setIsExpired(true)
        stopPolling()
      }
    } catch (err: any) {
      console.error("Purge error:", err)
      const msg = err.response?.data?.error || err.message || "Purge failed"
      alert(msg)
    } finally {
      setIsPurging(false)
      setConfirmPurgeOpen(false)
    }
  }

  const copyToClipboard = (text: string, type: "key" | "room" | "hash") => {
    navigator.clipboard.writeText(text)
    if (type === "key") {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
      toast.success("Secret Backup Key copied!")
    } else if (type === "hash") {
      setCopiedHash(true)
      setTimeout(() => setCopiedHash(false), 2000)
      toast.success("Backup Hash copied!")
    } else {
      setCopiedRoomId(true)
      setTimeout(() => setCopiedRoomId(false), 2000)
      toast.success("Room ID copied to clipboard!")
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage(e)
    }
  }

  return (
    <div className="relative flex h-[100dvh] w-full flex-col overflow-hidden bg-background font-mono text-foreground">
      {/* CRT Scanlines Overlay */}
      <div className="crt-scanlines pointer-events-none fixed inset-0 z-50 opacity-15" />

      {/* Top Navbar */}
      <header className="z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card/90 px-4 backdrop-blur">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={handleLeaveRoom}
            className="h-8 w-8 text-rose-500 hover:bg-rose-500/15 hover:text-rose-400"
            title="Leave Room"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>

          <div className="flex items-center gap-2">
            <span className="glow-text flex items-center gap-1.5 text-sm font-bold tracking-wider text-primary">
              <span className="hidden sm:inline">PURGE-CHAT // </span>ROOM:{" "}
              {roomId}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => copyToClipboard(roomId, "room")}
            >
              {copiedRoomId ? (
                <Check className="h-3 w-3 text-emerald-400" />
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </Button>

            {isOwner && (
              <Badge
                variant="outline"
                className="gap-1 border-none px-1.5 py-0.5 text-[10px] text-primary"
              >
                <Crown className="h-3 w-3 text-primary" />
              </Badge>
            )}
          </div>
        </div>

        {/* Live Countdown, Leave Button & Mobile Sheet Trigger */}
        <div className="flex items-center gap-2">
          <Badge
            variant="outline"
            className="gap-1.5 border-primary/50 px-2 py-1 text-xs text-primary"
          >
            <Clock className="h-3.5 w-3.5 animate-pulse text-primary" />
            <span className="font-bold">{timeLeftStr}</span>
          </Badge>

          {/* Mobile Sheet Trigger for Room Info */}
          <Sheet>
            <SheetTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 border-border md:hidden"
                >
                  <Menu className="h-4 w-4" />
                </Button>
              }
            />
            <SheetContent
              side="top"
              className="border-border bg-card font-mono text-foreground"
            >
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2 text-sm text-primary">
                  <Shield className="h-4 w-4" /> Room Details & Actions
                </SheetTitle>
              </SheetHeader>
              <div className="space-y-4 py-4 text-xs">
                <div>
                  <span className="mb-1 block text-muted-foreground">
                    Your Alias:
                  </span>
                  <Input
                    value={senderName}
                    onChange={(e) => {
                      const newName = e.target.value
                      setSenderName(newName)
                      localStorage.setItem("vanish_sender_name", newName)
                      if (socketRef.current?.connected) {
                        socketRef.current.emit("update-alias", {
                          roomId,
                          senderName: newName,
                        })
                      }
                    }}
                    className="bg-background text-xs font-bold"
                  />
                </div>
                

                {isOwner && (
                  <div>
                    <span className="mb-1 block text-muted-foreground">
                      Secret Backup Key (AES-256):
                    </span>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={secretKey}
                        className="bg-background font-mono text-[11px]"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copyToClipboard(secretKey, "key")}
                      >
                        {copiedKey ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                  </div>
                )}

                <div className="space-y-2 pt-2">
                  <Button
                    onClick={handleLeaveRoom}
                    variant="outline"
                    className="w-full gap-2 border-rose-500/50 bg-rose-500/10 text-xs font-bold text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.25)] hover:border-rose-500 hover:bg-rose-500/20 hover:text-rose-300"
                  >
                    <LogOut className="h-3.5 w-3.5" /> LEAVE ROOM
                  </Button>

                  {isOwner ? (
                    <>
                      {room?.isBackedUp ? (
                        <Button
                          onClick={() => {
                            if (backupResult) setBackupDialogOpen(true)
                          }}
                          variant="outline"
                          className="w-full gap-2 border-emerald-500/60 bg-emerald-500/10 text-xs font-bold text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] hover:border-emerald-500 hover:bg-emerald-500/20"
                        >
                          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />{" "}
                          CHAT IS BACKED UP SECURELY
                        </Button>
                      ) : (
                        <Button
                          onClick={handleBackupRoom}
                          disabled={isBackingUp || messages.length === 0}
                          variant="outline"
                          className="w-full gap-2 border-primary text-xs font-bold text-primary hover:bg-primary/10"
                        >
                          <Lock className="h-3.5 w-3.5" />{" "}
                          {isBackingUp
                            ? "ENCRYPTING..."
                            : "ENCRYPT & BACKUP ROOM"}
                        </Button>
                      )}
                      <Button
                        onClick={() => setConfirmPurgeOpen(true)}
                        variant="ghost"
                        className="w-full gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" /> PURGE ROOM NOW
                      </Button>
                    </>
                  ) : (
                    <div className="rounded border border-border bg-background/50 p-3 text-center text-[11px] text-muted-foreground">
                      🔒 Only the room owner can backup or purge this session.
                    </div>
                  )}
                </div>
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </header>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop Sidebar */}
        <aside className="hidden w-72 shrink-0 flex-col justify-between border-r border-border bg-card/40 p-4 md:flex">
          <div className="space-y-6">
            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
                <Users className="h-3.5 w-3.5 text-primary" /> Active Session
              </h3>
              <div className="space-y-2 rounded border border-border bg-background p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Your Role:</span>
                  {isOwner ? (
                    <span className="flex items-center gap-1 font-bold text-primary">
                      <Crown className="h-3 w-3 text-primary" /> Owner
                    </span>
                  ) : (
                    <span className="text-foreground">Participant</span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="shrink-0 text-muted-foreground">
                    Your Alias:
                  </span>
                  <Input
                    value={senderName}
                    onChange={(e) => {
                      const newName = e.target.value
                      setSenderName(newName)
                      localStorage.setItem("vanish_sender_name", newName)
                      if (socketRef.current?.connected) {
                        socketRef.current.emit("update-alias", {
                          roomId,
                          senderName: newName,
                        })
                      }
                    }}
                    className="h-7 w-36 bg-background text-right text-xs font-bold text-primary transition-all focus:w-44"
                  />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Encryption:</span>
                  <span className="font-mono text-foreground">AES-256-GCM</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Backup Status:</span>
                  <span
                    className={
                      room?.isBackedUp
                        ? "font-bold text-emerald-400"
                        : "text-amber-400"
                    }
                  >
                    {room?.isBackedUp ? "Saved" : "Ephemeral"}
                  </span>
                </div>
              </div>
            </div>

            {isOwner && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-muted-foreground uppercase">
                  Secret Backup Key
                </label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={secretKey}
                    className="bg-background font-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(secretKey, "key")}
                  >
                    {copiedKey ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Required for zero-knowledge decryption.
                </p>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <Button
              onClick={handleLeaveRoom}
              variant="outline"
              className="w-full gap-2 border-rose-500/50 bg-rose-500/10 text-xs font-bold text-rose-400 shadow-[0_0_12px_rgba(244,63,94,0.25)] hover:border-rose-500 hover:bg-rose-500/20 hover:text-rose-300"
            >
              <LogOut className="h-3.5 w-3.5" /> LEAVE ROOM
            </Button>

            {isOwner ? (
              <>
                {room?.isBackedUp ? (
                  <Button
                    onClick={() => {
                      if (backupResult) setBackupDialogOpen(true)
                    }}
                    variant="outline"
                    className="w-full gap-2 border-emerald-500/60 bg-emerald-500/10 text-xs font-bold text-emerald-400 shadow-[0_0_12px_rgba(16,185,129,0.2)] hover:border-emerald-500 hover:bg-emerald-500/20"
                  >
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />{" "}
                    CHAT IS BACKED UP SECURELY
                  </Button>
                ) : (
                  <Button
                    onClick={handleBackupRoom}
                    disabled={isBackingUp || messages.length === 0}
                    variant="outline"
                    className="w-full gap-2 border-primary text-xs font-bold text-primary hover:bg-primary/10"
                  >
                    <Lock className="h-3.5 w-3.5" />{" "}
                    {isBackingUp ? "ENCRYPTING..." : "ENCRYPT & BACKUP ROOM"}
                  </Button>
                )}

                <Button
                  onClick={() => setConfirmPurgeOpen(true)}
                  variant="ghost"
                  className="w-full gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" /> PURGE NOW
                </Button>
              </>
            ) : (
              <div className="rounded border border-border bg-background/50 p-3 text-center text-[11px] text-muted-foreground">
                🔒 Owner controls (Backup & Purge) restricted to room creator.
              </div>
            )}
          </div>
        </aside>

        {/* Chat Feed */}
        <main className="relative flex flex-1 flex-col overflow-hidden bg-background/50">
          {/* Room Expired Overlay */}
          {isExpired && (
            <div className="absolute inset-0 z-40 flex flex-col items-center justify-center space-y-4 bg-background/95 p-6 text-center backdrop-blur">
              <div className="rounded-full border border-destructive/40 bg-destructive/10 p-4 text-destructive">
                <AlertTriangle className="h-10 w-10" />
              </div>
              <h2 className="text-2xl font-bold tracking-wide text-destructive">
                ROOM VANISHED
              </h2>
              <p className="max-w-sm text-xs text-muted-foreground">
                This room has reached its expiration timeout or was manually
                purged by the owner. All unencrypted message records in TiDB
                have been deleted.
              </p>
              <Button
                onClick={() => router.push("/")}
                variant="default"
                className="bg-primary text-xs font-bold text-primary-foreground"
              >
                RETURN HOME
              </Button>
            </div>
          )}

          {/* Messages List */}
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center space-y-2 text-center text-muted-foreground">
                <Terminal className="h-8 w-8 text-primary/40" />
                <p className="text-xs">No messages yet in room {roomId}.</p>
                <p className="text-[11px] text-muted-foreground">
                  Send a message below. Live chat continues seamlessly even if a
                  backup is created!
                </p>
              </div>
            ) : (
              <BubbleGroup className="space-y-3">
                {messages.map((msg, idx) => {
                  const itemKey = `${msg.id || "msg"}-${idx}`
                  // Render System Messages as Centered Terminal Pill Badges
                  if (msg.type === "system") {
                    return (
                      <div key={itemKey} className="my-2 flex justify-center">
                        <div className="inline-flex items-center gap-1.5 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[11px] text-primary shadow-xs">
                          <span>{msg.content}</span>
                        </div>
                      </div>
                    )
                  }

                  const isMe = msg.senderId === senderId
                  return (
                    <Bubble
                      key={itemKey}
                      align={isMe ? "end" : "start"}
                      variant={isMe ? "default" : "secondary"}
                      className="max-w-[85%] md:max-w-[65%]"
                    >
                      <div className="mb-0.5 flex items-center justify-between px-1 text-[10px] opacity-75">
                        <span className="font-bold">
                          {isMe ? "YOU" : msg.senderName}
                        </span>
                        <span>
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      <BubbleContent className="font-sans text-xs leading-relaxed">
                        {msg.content}
                      </BubbleContent>
                    </Bubble>
                  )
                })}
              </BubbleGroup>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Sticky Input Bar */}
          <form
            onSubmit={handleSendMessage}
            className="flex shrink-0 items-end gap-2 border-t border-border bg-card/90 p-3 backdrop-blur"
          >
            <Textarea
              value={inputContent}
              onChange={(e) => setInputContent(e.target.value)}
              onKeyDown={handleKeyDown}
              suppressHydrationWarning
              placeholder={
                isExpired
                  ? "Room vanished..."
                  : `Message as ${senderName}... (Enter to send, Shift+Enter for new line)`
              }
              disabled={isExpired}
              rows={1}
              className="max-h-[120px] min-h-[44px] resize-none bg-background py-3 font-mono text-xs focus-visible:ring-primary"
            />
            <Button
              type="submit"
              disabled={!inputContent.trim() || isSending || isExpired}
              className="h-11 shrink-0 cursor-pointer gap-1.5 self-end bg-primary px-5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-3.5 w-3.5" />{" "}
              <span className="hidden sm:inline">SEND</span>
            </Button>
          </form>
        </main>
      </div>

      {/* Backup Created Dialog */}
      <Dialog open={backupDialogOpen} onOpenChange={setBackupDialogOpen}>
        <DialogContent className="max-w-md border-border bg-card font-mono text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-primary">
              <Download className="h-5 w-5" /> Zero-Knowledge Backup Saved
            </DialogTitle>
            <DialogDescription className="text-xs">
              An encrypted AES-256-GCM snapshot has been saved to TiDB. You and
              all participants can continue chatting seamlessly until room
              expiration!
            </DialogDescription>
          </DialogHeader>

          {backupResult && (
            <div className="space-y-4 py-2 text-xs">
              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  BACKUP HASH (SHA-256):
                </label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={backupResult.roomIdHash}
                    className="bg-background font-mono text-[11px]"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(backupResult.roomIdHash, "hash")
                    }
                  >
                    {copiedHash ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-bold text-muted-foreground">
                  SECRET DECRYPTION KEY:
                </label>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={backupResult.secretKey}
                    className="bg-background font-mono text-[11px]"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() =>
                      copyToClipboard(backupResult.secretKey, "key")
                    }
                  >
                    {copiedKey ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
              </div>

              <Button
                onClick={() => setBackupDialogOpen(false)}
                className="mt-2 w-full bg-primary text-xs font-bold text-primary-foreground"
              >
                CONTINUE CHATTING
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Manual Purge Confirmation Dialog */}
      {/* Manual Purge Confirmation Dialog */}
      <Dialog open={confirmPurgeOpen} onOpenChange={setConfirmPurgeOpen}>
        <DialogContent className="max-w-md border-destructive/50 bg-card font-mono text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirm Manual Room Purge
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to permanently delete all messages and purge
              room <span className="font-bold text-primary">{roomId}</span> for
              all active participants?
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmPurgeOpen(false)}
              className="text-xs"
            >
              CANCEL
            </Button>
            <Button
              variant="destructive"
              onClick={handleConfirmPurge}
              disabled={isPurging}
              className="gap-1 text-xs font-bold"
            >
              {isPurging ? "PURGING..." : "YES, PURGE NOW"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Join Room Confirmation Dialog */}
      <Dialog open={!hasJoinedRoom && !isExpired && !!room}>
        <DialogContent className="max-w-md border-primary/50 bg-card font-mono text-foreground glow-box [&>button]:hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-primary glow-text">
              <Users className="h-5 w-5" /> JOIN SECRET CHAT ROOM
            </DialogTitle>
            <DialogDescription className="text-xs">
              You are entering encrypted room <span className="font-bold text-primary">{roomId}</span>. Please confirm your display alias to join the live session.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3 text-xs">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-muted-foreground">
                YOUR DISPLAY ALIAS:
              </label>
              <Input
                value={senderName}
                onChange={(e) => {
                  const newName = e.target.value
                  setSenderName(newName)
                  sessionStorage.setItem(`vanish_sender_name_${roomId}`, newName)
                  localStorage.setItem("vanish_sender_name", newName)
                }}
                className="bg-background font-mono text-xs font-bold text-primary"
                placeholder="Enter your alias..."
              />
            </div>

            <div className="space-y-1 rounded border border-border bg-background/60 p-3 text-[11px] text-muted-foreground">
              <div className="flex justify-between">
                <span>Session Security:</span>
                <span className="font-mono text-foreground">Zero-Knowledge AES-256</span>
              </div>
              <div className="flex justify-between">
                <span>Room Role:</span>
                <span className="font-bold text-primary">
                  {room && senderId && room.ownerId === senderId ? "Owner (Creator)" : "Invited Participant"}
                </span>
              </div>
            </div>

            <Button
              onClick={handleConfirmJoin}
              disabled={isJoining || !senderName.trim()}
              className="h-10 w-full cursor-pointer gap-2 bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90 glow-box"
            >
              <Send className="h-4 w-4" /> {isJoining ? "CONNECTING..." : "JOIN CHAT ROOM NOW"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Leave Room Confirmation Dialog */}
      <Dialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
        <DialogContent className="max-w-md border-rose-500/50 bg-card font-mono text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-500">
              <LogOut className="h-5 w-5" /> Leave Secret Chat Session?
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to leave room <span className="font-bold text-primary">{roomId}</span>? Unbacked messages in this session will vanish upon room expiration.
            </DialogDescription>
          </DialogHeader>

          <div className="flex justify-end gap-2 pt-4">
            <Button
              variant="outline"
              onClick={() => setConfirmLeaveOpen(false)}
              className="text-xs"
            >
              CANCEL
            </Button>
            <Button
              onClick={handleConfirmLeave}
              disabled={isLeaving}
              className="gap-1 border border-rose-500/50 bg-rose-500/20 text-xs font-bold text-rose-300 shadow-[0_0_12px_rgba(244,63,94,0.25)] hover:border-rose-500 hover:bg-rose-500/30 hover:text-rose-200"
            >
              <LogOut className="h-3.5 w-3.5" /> {isLeaving ? "LEAVING..." : "CONFIRM & LEAVE"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
