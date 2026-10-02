"use client"

import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent, BubbleGroup } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet"
import { Textarea } from "@/components/ui/textarea"
import { encryptPayload } from "@/lib/crypto"
import { generateAnonymousName, generateId } from "@/lib/identity"
import axios from "axios"
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Clock,
  Copy,
  Crown,
  Dices,
  Download,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Send,
  Share2,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
} from "lucide-react"
import { useRouter } from "next/navigation"
import { use, useEffect, useRef, useState } from "react"
import toast from "react-hot-toast"
import { io, Socket } from "socket.io-client"

interface MessageItem {
  id: string
  roomId: string
  senderId: string
  senderName: string
  content: string
  type?: "user" | "system"
  createdAt: string
}

function mergeMessages(
  current: MessageItem[],
  incoming: MessageItem[]
): MessageItem[] {
  const incomingMap = new Map<string, MessageItem>()
  for (const m of incoming) {
    if (m && m.id) incomingMap.set(m.id, m)
  }

  // Preserve any pending optimistic messages that haven't been confirmed by the server yet
  const pendingOptimistic: MessageItem[] = []
  for (const cur of current) {
    if (cur.id.startsWith("temp-")) {
      const alreadyConfirmed = incoming.some(
        (inc) =>
          inc.senderId === cur.senderId &&
          inc.content === cur.content &&
          Math.abs(
            new Date(inc.createdAt).getTime() -
              new Date(cur.createdAt).getTime()
          ) < 30000
      )
      if (!alreadyConfirmed) {
        pendingOptimistic.push(cur)
      }
    }
  }

  const merged = [...Array.from(incomingMap.values()), ...pendingOptimistic]
  merged.sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  )

  // Stable reference check: if identical, do not create a new array reference to prevent re-renders & scroll jumps
  if (
    current.length === merged.length &&
    current.every(
      (m, idx) => m.id === merged[idx].id && m.content === merged[idx].content
    )
  ) {
    return current
  }

  return merged
}

function parseExpiresAt(val: string | Date | undefined | null): number {
  if (!val) return 0
  if (val instanceof Date) return val.getTime()
  if (typeof val === "number") return val
  let str = String(val).trim()
  if (!str) return 0
  // If the ISO string does not specify timezone or trailing Z, treat as UTC to avoid local timezone offset skew
  if (!str.endsWith("Z") && !/[+-]\d{2}(:\d{2})?$/.test(str)) {
    str = str.replace(" ", "T") + "Z"
  }
  const parsed = new Date(str).getTime()
  return isNaN(parsed) ? 0 : parsed
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
      sname =
        localStorage.getItem("vanish_sender_name") || generateAnonymousName()
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
    secretKey?: string | null
    expiresAt: string
    isBackedUp: boolean
  } | null>(null)
  const [messages, setMessages] = useState<MessageItem[]>([])
  const [inputContent, setInputContent] = useState("")
  const [isExpired, setIsExpired] = useState(false)
  const [isLoadingInitial, setIsLoadingInitial] = useState(true)
  const [timeLeftStr, setTimeLeftStr] = useState("Calculating...")

  // Canonical Room & Secret Key references
  const activeRoomId = room?.id || roomId
  const roomSecretKey = room?.secretKey || secretKey

  // UI States
  const [copiedKey, setCopiedKey] = useState(false)
  const [copiedRoomId, setCopiedRoomId] = useState(false)
  const [copiedLink, setCopiedLink] = useState(false)
  const [copiedHash, setCopiedHash] = useState(false)
  const [backupResult, setBackupResult] = useState<{
    roomIdHash: string
    secretKey: string
  } | null>(null)
  const [isBackingUp, setIsBackingUp] = useState(false)
  const [backupDialogOpen, setBackupDialogOpen] = useState(false)
  const [confirmPurgeOpen, setConfirmPurgeOpen] = useState(false)
  const [isPurging, setIsPurging] = useState(false)

  const [confirmLeaveOpen, setConfirmLeaveOpen] = useState(false)
  const [isLeaving, setIsLeaving] = useState(false)

  // Participant Approval & Join Request States
  const [isApproved, setIsApproved] = useState<boolean>(false)
  const [isJoinRequested, setIsJoinRequested] = useState<boolean>(false)
  const [isJoinRejected, setIsJoinRejected] = useState<boolean>(false)
  const [isSubmittingJoin, setIsSubmittingJoin] = useState<boolean>(false)
  const [pendingRequests, setPendingRequests] = useState<
    { senderId: string; senderName: string; createdAt: string }[]
  >([])

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const socketRef = useRef<Socket | null>(null)
  const pollingIntervalRef = useRef<number | null>(null)

  const stopPolling = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }
  }

  const isOwner = !!(room && senderId && room.ownerId === senderId)
  const inviteUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/room/${activeRoomId}`
      : ""

  const copyInviteLink = () => {
    if (typeof window === "undefined") return
    navigator.clipboard.writeText(inviteUrl)
    setCopiedLink(true)
    setTimeout(() => setCopiedLink(false), 2000)
    toast.success("Invite link copied to clipboard!", {
      id: "copy-invite-link",
    })
  }

  // Randomize alias to preserve zero-knowledge anonymity
  const handleRandomizeAlias = () => {
    const newAlias = generateAnonymousName()
    setSenderName(newAlias)
    localStorage.setItem("vanish_sender_name", newAlias)
    sessionStorage.setItem(`vanish_sender_name_${roomId}`, newAlias)
    toast.success(`Generated alias: ${newAlias}`, { id: "generate-alias" })
  }

  // Participant submits request to join the room
  const handleRequestJoin = async () => {
    if (!senderName.trim()) {
      toast.error("Please enter a display alias.", { id: "alias-empty" })
      return
    }
    setIsSubmittingJoin(true)
    const targetRoomId = room?.id || roomId
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("request-join", {
          roomId: targetRoomId,
          senderId,
          senderName: senderName.trim(),
        })
        setIsJoinRequested(true)
        setIsJoinRejected(false)
        toast.success("Join request sent to the room creator!", {
          id: "join-req-sent",
        })
      } else {
        const { data } = await axios.post(
          `/api/room/${targetRoomId}/join-request`,
          {
            senderId,
            senderName: senderName.trim(),
          }
        )
        if (data.alreadyApproved) {
          setIsApproved(true)
          setIsJoinRequested(false)
          toast.success("Access approved! Welcome to the room.", {
            id: "access-approved",
          })
          const { data: msgData } = await axios.get(
            `/api/room/${targetRoomId}/messages?senderId=${senderId}`,
            { headers: { "Cache-Control": "no-cache, no-store" } }
          )
          setMessages((prev) => mergeMessages(prev, msgData))
        } else {
          setIsJoinRequested(true)
          setIsJoinRejected(false)
          toast.success("Join request sent to the room creator!", {
            id: "join-req-sent",
          })
        }
      }
    } catch (err: unknown) {
      console.error("Failed to submit join request:", err)
      toast.error("Could not send join request. Please try again.", {
        id: "join-req-error",
      })
    } finally {
      setIsSubmittingJoin(false)
    }
  }

  // Host approves a participant's join request
  const handleApproveRequest = async (
    targetSenderId: string,
    targetName: string
  ) => {
    const targetRoomId = room?.id || roomId
    // ⚡ Optimistic UI update: remove immediately so host UI responds in 0ms
    setPendingRequests((prev) =>
      prev.filter((r) => r.senderId !== targetSenderId)
    )
    toast.success(`Approved entry for ${targetName}`, {
      id: `approve-${targetSenderId}`,
    })
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("approve-join-request", {
          roomId: targetRoomId,
          hostSenderId: senderId,
          targetSenderId,
        })
      } else {
        await axios.post(`/api/room/${targetRoomId}/join-requests`, {
          action: "approve",
          hostSenderId: senderId,
          targetSenderId,
        })
      }
    } catch (err: unknown) {
      console.error("Failed to approve request:", err)
      toast.error("Failed to approve join request.", {
        id: `approve-err-${targetSenderId}`,
      })
    }
  }

  // Host rejects a participant's join request
  const handleRejectRequest = async (
    targetSenderId: string,
    targetName: string
  ) => {
    const targetRoomId = room?.id || roomId
    // ⚡ Optimistic UI update: remove immediately so host UI responds in 0ms
    setPendingRequests((prev) =>
      prev.filter((r) => r.senderId !== targetSenderId)
    )
    toast(`Declined request from ${targetName}`, {
      id: `decline-${targetSenderId}`,
      icon: "ℹ️",
    })
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("reject-join-request", {
          roomId: targetRoomId,
          hostSenderId: senderId,
          targetSenderId,
        })
      } else {
        await axios.post(`/api/room/${targetRoomId}/join-requests`, {
          action: "reject",
          hostSenderId: senderId,
          targetSenderId,
        })
      }
    } catch (err: unknown) {
      console.error("Failed to reject request:", err)
      toast.error("Failed to reject join request.", {
        id: `reject-err-${targetSenderId}`,
      })
    }
  }

  // Fetch initial room metadata, join status, and messages
  useEffect(() => {
    if (!senderId || !senderName) return

    let isMounted = true

    async function initRoom() {
      try {
        const { data: roomData } = await axios.get(
          `/api/room/${roomId}?t=${Date.now()}`,
          { headers: { "Cache-Control": "no-cache, no-store" } }
        )
        if (isMounted) {
          setRoom(roomData)
          if (roomData.id && roomData.id !== roomId) {
            sessionStorage.setItem(`secret_key_${roomData.id}`, roomId)
            window.history.replaceState(null, "", `/room/${roomData.id}`)
          }
        }

        const targetId = roomData?.id || roomId

        // Check participant approval status
        const { data: statusData } = await axios.get(
          `/api/room/${targetId}/join-status?senderId=${senderId}&t=${Date.now()}`,
          { headers: { "Cache-Control": "no-cache, no-store" } }
        )

        const approved = !!(statusData.isOwner || statusData.isApproved)
        if (isMounted) {
          setIsApproved(approved)
          setIsJoinRequested(statusData.isPending || false)
        }

        if (approved) {
          sessionStorage.setItem(`has_joined_room_${targetId}`, "true")
          const { data: msgData } = await axios.get(
            `/api/room/${targetId}/messages?senderId=${senderId}&t=${Date.now()}`,
            { headers: { "Cache-Control": "no-cache, no-store" } }
          )
          if (isMounted) {
            setMessages((prev) => mergeMessages(prev, msgData))
          }
        }

        if (statusData.isOwner) {
          try {
            const { data: reqs } = await axios.get(
              `/api/room/${targetId}/join-requests?hostId=${senderId}&t=${Date.now()}`
            )
            if (isMounted && Array.isArray(reqs)) {
              setPendingRequests(reqs)
            }
          } catch {}
        }
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } } | null
        if (axiosErr?.response?.status === 404) {
          if (isMounted) {
            setIsExpired(true)
            setMessages([])
          }
          stopPolling()
        } else {
          console.error("Error loading room:", err)
        }
      } finally {
        if (isMounted) {
          setIsLoadingInitial(false)
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

  const isOwnerRef = useRef(isOwner)
  useEffect(() => {
    isOwnerRef.current = isOwner
  }, [isOwner])

  const isApprovedRef = useRef(isApproved)
  useEffect(() => {
    isApprovedRef.current = isApproved
  }, [isApproved])

  const isJoinRequestedRef = useRef(isJoinRequested)
  useEffect(() => {
    isJoinRequestedRef.current = isJoinRequested
  }, [isJoinRequested])

  const roomRef = useRef(room)
  useEffect(() => {
    roomRef.current = room
  }, [room])

  // 1. Stable Real-Time Socket Connection (Created once per room session, never disconnects on state changes)
  useEffect(() => {
    if (!roomId) return

    const socketUrl =
      process.env.NEXT_PUBLIC_SOCKET_URL ||
      (typeof window !== "undefined" ? window.location.origin : "")

    let socket: Socket | null = null

    try {
      socket = io(socketUrl, {
        autoConnect: true,
        transports: ["websocket", "polling"],
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelay: 500,
        timeout: 4000,
      })
      socketRef.current = socket

      const syncSocketRoom = () => {
        const activeRoomId = roomRef.current?.id || roomId
        // Always register user session channel for direct user notifications
        socket?.emit("register-session", {
          senderId,
          roomId: activeRoomId,
        })

        if (isApprovedRef.current || isOwnerRef.current) {
          socket?.emit("join-room", {
            roomId: activeRoomId,
            senderId,
            senderName: senderNameRef.current,
          })
          if (isOwnerRef.current) {
            socket?.emit("get-join-requests", {
              roomId: activeRoomId,
              hostSenderId: senderId,
            })
          }
        } else if (isJoinRequestedRef.current) {
          socket?.emit("request-join", {
            roomId: activeRoomId,
            senderId,
            senderName: senderNameRef.current,
          })
        }
      }

      socket.on("connect", () => {
        syncSocketRoom()
      })

      if (socket.connected) {
        syncSocketRoom()
      }

      socket.on("message-received", (msg: MessageItem) => {
        setMessages((prev) => {
          let replaced = false
          const updated = prev.map((m) => {
            if (
              !replaced &&
              m.id.startsWith("temp-") &&
              m.senderId === msg.senderId &&
              m.content === msg.content
            ) {
              replaced = true
              return msg
            }
            return m
          })
          if (replaced) return updated
          if (prev.some((m) => m.id === msg.id)) return prev
          return [...prev, msg]
        })
      })

      // When room creator approves entry for this user
      socket.on("join-approved", async () => {
        const activeRoomId = roomRef.current?.id || roomId
        if (isApprovedRef.current) return
        setIsApproved(true)
        setIsJoinRequested(false)
        setIsJoinRejected(false)
        sessionStorage.setItem(`has_joined_room_${activeRoomId}`, "true")
        toast.success("Room creator approved your join request! Welcome.", {
          id: "join-approved",
        })
        socket?.emit("join-room", {
          roomId: activeRoomId,
          senderId,
          senderName: senderNameRef.current,
        })
        try {
          const { data: msgData } = await axios.get(
            `/api/room/${activeRoomId}/messages?senderId=${senderId}&t=${Date.now()}`
          )
          setMessages((prev) => mergeMessages(prev, msgData))
        } catch {}
      })

      // When creator declines entry for this user
      socket.on("join-rejected", () => {
        setIsApproved(false)
        setIsJoinRequested(false)
        setIsJoinRejected(true)
        toast.error("Your join request was declined by the room creator.", {
          id: "join-rejected",
        })
      })

      socket.on("join-denied", () => {
        setIsApproved(false)
      })

      // Live join request notification for the room host
      socket.on(
        "join-request-received",
        (req: { senderId: string; senderName: string; createdAt: string }) => {
          setPendingRequests((prev) => {
            const filtered = prev.filter((r) => r.senderId !== req.senderId)
            return [...filtered, req]
          })
          toast(`🚨 ${req.senderName} requested entry to room!`, {
            id: `join-request-${req.senderId}`,
            icon: "👤",
            duration: 6000,
          })
        }
      )

      // Host or peers see a request handled
      socket.on(
        "join-request-handled",
        ({ targetSenderId }: { targetSenderId: string }) => {
          setPendingRequests((prev) =>
            prev.filter((r) => r.senderId !== targetSenderId)
          )
        }
      )

      // Host initial or refresh list
      socket.on(
        "join-requests-list",
        (
          list: { senderId: string; senderName: string; createdAt: string }[]
        ) => {
          if (Array.isArray(list)) {
            setPendingRequests(list)
          }
        }
      )

      socket.on("backup-status-updated", () => {
        setRoom((prev) => (prev ? { ...prev, isBackedUp: true } : prev))
      })

      socket.on(
        "room-destroyed",
        async (data?: { roomId?: string; reason?: string }) => {
          const currentId = roomRef.current?.id || roomId
          if (data?.roomId) {
            if (data.roomId !== currentId && data.roomId !== roomId) {
              return
            }
          }
          // Double-check with server before marking room as vanished
          // If the timer is still ticking and room exists, ignore spurious destroyed events
          try {
            const check = await axios.get(
              `/api/room/${currentId}?t=${Date.now()}`
            )
            if (check.data?.id) {
              // Room is actually still active in DB! Do not falsely expire.
              return
            }
          } catch (err: unknown) {
            const axiosErr = err as { response?: { status?: number } } | null
            if (axiosErr?.response?.status !== 404) {
              // Network blip, don't expire prematurely
              return
            }
          }
          setIsExpired(true)
          setMessages([])
          stopPolling()
        }
      )
    } catch (e) {
      console.error("Socket initialization error:", e)
    }

    return () => {
      if (socket) socket.disconnect()
    }
  }, [roomId, senderId])

  // 2. Reactively emit socket events when approval, ownership, or join request status updates
  useEffect(() => {
    const targetRoomId = room?.id || roomId
    if (!targetRoomId || !socketRef.current?.connected) return

    if (isApproved || isOwner) {
      socketRef.current.emit("join-room", {
        roomId: targetRoomId,
        senderId,
        senderName: senderNameRef.current,
      })
      if (isOwner) {
        socketRef.current.emit("get-join-requests", {
          roomId: targetRoomId,
          hostSenderId: senderId,
        })
      }
    } else if (isJoinRequested) {
      socketRef.current.emit("request-join", {
        roomId: targetRoomId,
        senderId,
        senderName: senderNameRef.current,
      })
    }
  }, [isApproved, isOwner, isJoinRequested, room?.id, roomId, senderId])

  // 3. Continuous Fail-Safe Sync Loop (Production-grade zero-refresh assurance)
  useEffect(() => {
    const targetRoomId = room?.id || roomId
    if (!targetRoomId) return

    const refreshMessages = async () => {
      if (!isApprovedRef.current && !isOwnerRef.current) return
      try {
        const currentTargetId = roomRef.current?.id || targetRoomId
        const { data } = await axios.get(
          `/api/room/${currentTargetId}/messages?senderId=${senderId}&t=${Date.now()}`,
          { headers: { "Cache-Control": "no-cache, no-store" } }
        )
        setMessages((prev) => mergeMessages(prev, data as MessageItem[]))
      } catch (err: unknown) {
        const axiosErr = err as { response?: { status?: number } } | null
        if (axiosErr?.response?.status === 404) {
          setIsExpired(true)
          setMessages([])
          stopPolling()
        }
      }
    }

    const refreshHostRequests = async () => {
      if (!isOwnerRef.current) return
      try {
        const currentTargetId = roomRef.current?.id || targetRoomId
        const { data: reqs } = await axios.get(
          `/api/room/${currentTargetId}/join-requests?hostId=${senderId}&t=${Date.now()}`
        )
        if (Array.isArray(reqs)) {
          setPendingRequests(reqs)
        }
      } catch {}
    }

    const refreshJoinStatus = async () => {
      if (
        isApprovedRef.current ||
        isOwnerRef.current ||
        !isJoinRequestedRef.current
      )
        return
      try {
        const currentTargetId = roomRef.current?.id || targetRoomId
        const { data: statusData } = await axios.get(
          `/api/room/${currentTargetId}/join-status?senderId=${senderId}&t=${Date.now()}`,
          { headers: { "Cache-Control": "no-cache, no-store" } }
        )
        if (statusData.isApproved) {
          if (isApprovedRef.current) return
          setIsApproved(true)
          setIsJoinRequested(false)
          setIsJoinRejected(false)
          sessionStorage.setItem(`has_joined_room_${currentTargetId}`, "true")
          toast.success("Room creator approved your join request! Welcome.", {
            id: "join-approved",
          })
          if (socketRef.current?.connected) {
            socketRef.current.emit("join-room", {
              roomId: currentTargetId,
              senderId,
              senderName: senderNameRef.current,
            })
          }
          void refreshMessages()
        }
      } catch {}
    }

    let isPolling = false
    const pollTimer = setInterval(async () => {
      if (isPolling) return
      isPolling = true
      try {
        if (isOwnerRef.current) {
          await refreshHostRequests()
        }
        if (!isApprovedRef.current && isJoinRequestedRef.current) {
          await refreshJoinStatus()
        }
      } finally {
        isPolling = false
      }
    }, 1200)

    pollingIntervalRef.current = pollTimer as unknown as number

    return () => {
      clearInterval(pollTimer)
    }
  }, [room?.id, roomId, senderId])

  // Countdown timer effect with server verification (never falsely marks room expired)
  useEffect(() => {
    if (!room?.expiresAt) return
    const targetRoomId = room.id || roomId

    let isVerifying = false

    const timer = setInterval(async () => {
      const expires = parseExpiresAt(room.expiresAt)
      if (expires <= 0) return

      const now = Date.now()
      const diff = expires - now

      if (diff <= 0) {
        setTimeLeftStr("00:00:00")
        if (isVerifying) return
        isVerifying = true
        try {
          // Verify with authoritative server before declaring room vanished
          const { data: serverRoom } = await axios.get(
            `/api/room/${targetRoomId}?t=${Date.now()}`
          )
          if (serverRoom?.expiresAt) {
            const serverExp = parseExpiresAt(serverRoom.expiresAt)
            if (serverExp > Date.now()) {
              // Server room is still active (client clock skew), update local state and keep room alive
              setRoom((prev) =>
                prev ? { ...prev, expiresAt: serverRoom.expiresAt } : prev
              )
              isVerifying = false
              return
            }
          }
          // Server returned room that is truly expired
          setIsExpired(true)
          setTimeLeftStr("00:00:00 - EXPIRED")
          setMessages([])
          stopPolling()
          clearInterval(timer)
          if (socketRef.current?.connected) {
            socketRef.current.emit("client-expired", { roomId: targetRoomId })
          }
        } catch (err: unknown) {
          const axiosErr = err as { response?: { status?: number } } | null
          if (axiosErr?.response?.status === 404) {
            setIsExpired(true)
            setTimeLeftStr("00:00:00 - EXPIRED")
            setMessages([])
            stopPolling()
            clearInterval(timer)
            if (socketRef.current?.connected) {
              socketRef.current.emit("client-expired", { roomId: targetRoomId })
            }
          }
        } finally {
          isVerifying = false
        }
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
  }, [room?.expiresAt, room?.id, roomId])

  const handleChatScroll = () => {
    const el = chatContainerRef.current
    if (!el) return
    const distanceToBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    isNearBottomRef.current = distanceToBottom < 80
  }

  // Auto-scroll chat to bottom only if user was already at bottom
  useEffect(() => {
    if (isNearBottomRef.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }
  }, [messages])

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputContent.trim() || isExpired) return

    const targetRoomId = room?.id || roomId
    const content = inputContent.trim()
    setInputContent("") // Instant clear for lightning-fast rapid fire!

    // ⚡ Optimistic UI Update: Display message in 0ms!
    const tempId =
      "temp-" + Date.now() + "-" + Math.random().toString(36).substring(2, 6)
    const optimisticMsg: MessageItem = {
      id: tempId,
      roomId: targetRoomId,
      senderId,
      senderName,
      content,
      type: "user",
      createdAt: new Date().toISOString(),
    }

    setMessages((prev) => [...prev, optimisticMsg])
    isNearBottomRef.current = true
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })

    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("send-message", {
          roomId: targetRoomId,
          senderId,
          senderName,
          content,
        })
      } else {
        const { data: msg } = await axios.post(
          `/api/room/${targetRoomId}/messages`,
          {
            senderId,
            senderName,
            content,
          }
        )
        setMessages((prev) => prev.map((m) => (m.id === tempId ? msg : m)))
      }
    } catch (err: unknown) {
      // Revert optimistic message if send failed
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
      const axiosErr = err as { response?: { status?: number } } | null
      if (axiosErr?.response?.status === 404) {
        setIsExpired(true)
        setMessages([])
        stopPolling()
      } else {
        console.error("Send failed:", err)
      }
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

    const targetRoomId = room?.id || roomId
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("leave-room", {
          roomId: targetRoomId,
          senderName,
        })
        await new Promise((res) => setTimeout(res, 100))
      } else {
        await axios.post(`/api/room/${targetRoomId}/activity`, {
          senderName,
          action: "leave",
        })
      }
      sessionStorage.removeItem(`has_joined_room_${targetRoomId}`)
      sessionStorage.removeItem(`joined_logged_${targetRoomId}_${senderId}`)
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

    const targetRoomId = room?.id || roomId
    try {
      // 1. Client-Side Zero-Knowledge Encryption using Secret Key
      const userMessagesOnly = messages.filter((m) => m.type !== "system")
      const { encryptedData, iv } = await encryptPayload(
        userMessagesOnly,
        roomSecretKey
      )

      // 2. Upload encrypted payload to TiDB MySQL via Axios
      const { data } = await axios.post(`/api/room/${targetRoomId}/backup`, {
        senderId,
        encryptedData,
        iv,
      })

      setRoom((prev) => (prev ? { ...prev, isBackedUp: true } : prev))
      setBackupResult({
        roomIdHash: data.roomIdHash,
        secretKey: roomSecretKey,
      })
      setBackupDialogOpen(true)

      // Notify other participants live via socket and broadcast system backup notice
      if (socketRef.current?.connected) {
        socketRef.current.emit("trigger-backup-updated", {
          roomId: targetRoomId,
          sysMsg: data.sysMsg,
        })
      }
    } catch (err: unknown) {
      console.error("Backup failed:", err)
      const axiosErr = err as {
        response?: { data?: { error?: string } }
        message?: string
      } | null
      const msg =
        axiosErr?.response?.data?.error || axiosErr?.message || "Backup failed"
      alert(msg)
    } finally {
      setIsBackingUp(false)
    }
  }

  // Owner-Only Manual Purge Execution
  const handleConfirmPurge = async () => {
    if (!isOwner || isPurging) return
    setIsPurging(true)

    const targetRoomId = room?.id || roomId
    try {
      if (socketRef.current?.connected) {
        socketRef.current.emit("trigger-purge", {
          roomId: targetRoomId,
          senderId,
        })
      } else {
        await axios.delete(`/api/room/${targetRoomId}?senderId=${senderId}`)
        setIsExpired(true)
        stopPolling()
      }
    } catch (err: unknown) {
      console.error("Purge error:", err)
      const axiosErr = err as {
        response?: { data?: { error?: string } }
        message?: string
      } | null
      const msg =
        axiosErr?.response?.data?.error || axiosErr?.message || "Purge failed"
      alert(msg)
    } finally {
      setIsPurging(false)
      setConfirmPurgeOpen(false)
    }
  }

  const copyToClipboard = (
    text: string,
    type: "key" | "room" | "hash" | "link"
  ) => {
    if (type === "link") {
      copyInviteLink()
      return
    }
    navigator.clipboard.writeText(text)
    if (type === "key") {
      setCopiedKey(true)
      setTimeout(() => setCopiedKey(false), 2000)
      toast.success("Secret Backup Key copied!", { id: "copy-backup-key" })
    } else if (type === "hash") {
      setCopiedHash(true)
      setTimeout(() => setCopiedHash(false), 2000)
      toast.success("Backup Hash copied!", { id: "copy-backup-hash" })
    } else {
      setCopiedRoomId(true)
      setTimeout(() => setCopiedRoomId(false), 2000)
      toast.success("Room ID copied to clipboard!", { id: "copy-room-id" })
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
            {isOwner && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 cursor-pointer gap-1.5 border-primary/40 bg-primary/10 px-2.5 text-xs font-bold text-primary shadow-[0_0_8px_rgba(34,197,94,0.15)] hover:border-primary hover:bg-primary/20 hover:text-primary-foreground"
                onClick={copyInviteLink}
                title="Copy Shareable Invite Link (Creator Only)"
              >
                {copiedLink ? (
                  <>
                    <Check className="h-3.5 w-3.5 text-emerald-400" />
                  </>
                ) : (
                  <>
                    <Share2 className="h-3.5 w-3.5" />
                  </>
                )}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 text-muted-foreground"
              onClick={() => copyToClipboard(activeRoomId, "room")}
              title="Copy Room ID"
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
                {/* Invite Participants Mobile (Creator Only) */}
                {isOwner ? (
                  <div className="space-y-2 rounded border border-primary/40 bg-primary/10 p-3">
                    <h3 className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase">
                      <Users className="h-3.5 w-3.5" /> Invite Participants
                    </h3>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        value={inviteUrl}
                        className="h-7 bg-background font-mono text-[10px] select-all"
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={copyInviteLink}
                        className="h-7 shrink-0 cursor-pointer gap-1 border-primary/40 text-[11px] font-bold text-primary hover:bg-primary/20"
                      >
                        {copiedLink ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Share2 className="h-3.5 w-3.5" />
                        )}
                        <span>{copiedLink ? "Copied" : "Copy"}</span>
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded border border-border bg-background/50 p-2.5 text-[11px] text-muted-foreground">
                    🔒 Only the room creator can invite new participants.
                  </div>
                )}

                {/* Host Pending Join Requests Mobile */}
                {isOwner && (
                  <div className="space-y-2 rounded border border-amber-500/40 bg-amber-500/10 p-3">
                    <div className="flex items-center justify-between">
                      <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase">
                        <Users className="h-3.5 w-3.5" /> Pending Requests
                      </h3>
                      <Badge
                        variant="outline"
                        className="border-amber-500/50 bg-amber-500/20 px-1.5 py-0 text-[10px] font-bold text-amber-300"
                      >
                        {pendingRequests.length}
                      </Badge>
                    </div>
                    {pendingRequests.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground">
                        No pending join requests.
                      </p>
                    ) : (
                      <div className="max-h-40 space-y-2 overflow-y-auto">
                        {pendingRequests.map((req) => (
                          <div
                            key={req.senderId}
                            className="flex items-center justify-between rounded border border-border bg-background p-2 text-xs"
                          >
                            <span className="max-w-[100px] truncate font-bold text-foreground">
                              {req.senderName}
                            </span>
                            <div className="flex shrink-0 gap-1.5">
                              <Button
                                size="sm"
                                onClick={() =>
                                  handleApproveRequest(
                                    req.senderId,
                                    req.senderName
                                  )
                                }
                                className="h-6 border border-emerald-500/40 bg-emerald-500/20 px-2 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/30"
                              >
                                Approve
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() =>
                                  handleRejectRequest(
                                    req.senderId,
                                    req.senderName
                                  )
                                }
                                className="h-6 border-rose-500/40 px-2 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20"
                              >
                                Decline
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

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
                          roomId: activeRoomId,
                          senderName: newName,
                        })
                      }
                    }}
                    className="bg-background text-xs font-bold"
                  />
                </div>

                {isOwner && (
                  <div className="space-y-2 rounded border border-border bg-background/50 p-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase">
                        <Lock className="h-3 w-3 text-amber-400" /> Secret
                        Backup Key
                      </span>
                      <span className="text-[9px] font-semibold tracking-wider text-amber-400/90 uppercase">
                        Backups Only
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        readOnly
                        type="password"
                        value={roomSecretKey}
                        className="bg-background font-mono text-[11px]"
                      />
                      <Button
                        size="icon"
                        variant="outline"
                        onClick={() => copyToClipboard(roomSecretKey, "key")}
                        title="Copy Secret Backup Key"
                      >
                        {copiedKey ? (
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    </div>
                    <p className="text-[10px] leading-tight text-muted-foreground">
                      Required only to restore encrypted backups on home page.
                    </p>
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
          <div className="space-y-4">
            {/* Invite Participants Card (Host Only) */}
            {isOwner ? (
              <div className="space-y-2 rounded border border-primary/40 bg-primary/10 p-3">
                <h3 className="flex items-center gap-1.5 text-xs font-bold text-primary uppercase">
                  <Users className="h-3.5 w-3.5" /> Invite Participants
                </h3>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Share this link or Room ID. Prospective joiners will require
                  your approval before gaining entry.
                </p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={inviteUrl}
                    className="h-7 bg-background font-mono text-[10px] select-all"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={copyInviteLink}
                    className="h-7 shrink-0 cursor-pointer gap-1 border-primary/40 text-[11px] font-bold text-primary hover:bg-primary/20"
                  >
                    {copiedLink ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Share2 className="h-3.5 w-3.5" />
                    )}
                    <span>{copiedLink ? "Copied" : "Copy"}</span>
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 rounded border border-border bg-background/50 p-3 text-xs">
                <div className="flex items-center gap-1.5 font-bold text-muted-foreground">
                  <Shield className="h-3.5 w-3.5 text-primary" /> Session
                  Security Policy
                </div>
                <p className="text-[10px] leading-snug text-muted-foreground">
                  Only the room creator can invite new participants and approve
                  incoming join requests.
                </p>
              </div>
            )}

            {/* Host Pending Requests Sidebar Panel */}
            {isOwner && (
              <div className="space-y-2 rounded border border-amber-500/40 bg-amber-500/10 p-3">
                <div className="flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase">
                    <Users className="h-3.5 w-3.5" /> Pending Requests
                  </h3>
                  <Badge
                    variant="outline"
                    className="border-amber-500/50 bg-amber-500/20 px-1.5 py-0 text-[10px] font-bold text-amber-300"
                  >
                    {pendingRequests.length}
                  </Badge>
                </div>

                {pendingRequests.length === 0 ? (
                  <p className="text-[10px] text-muted-foreground">
                    No pending join requests.
                  </p>
                ) : (
                  <div className="max-h-48 space-y-2 overflow-y-auto">
                    {pendingRequests.map((req) => (
                      <div
                        key={req.senderId}
                        className="flex flex-col gap-1.5 rounded border border-amber-500/30 bg-background/80 p-2 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="max-w-[120px] truncate font-bold text-foreground">
                            {req.senderName}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(req.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                        <div className="flex gap-1.5 pt-1">
                          <Button
                            size="sm"
                            onClick={() =>
                              handleApproveRequest(req.senderId, req.senderName)
                            }
                            className="h-6 flex-1 border border-emerald-500/40 bg-emerald-500/20 text-[10px] font-bold text-emerald-400 hover:bg-emerald-500/30"
                          >
                            <UserCheck className="mr-1 h-3 w-3" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              handleRejectRequest(req.senderId, req.senderName)
                            }
                            className="h-6 flex-1 border-rose-500/40 text-[10px] font-bold text-rose-400 hover:bg-rose-500/20"
                          >
                            <UserX className="mr-1 h-3 w-3" /> Decline
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div>
              <h3 className="mb-2 flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase">
                <Shield className="h-3.5 w-3.5 text-primary" /> Active Session
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
                          roomId: activeRoomId,
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
              <div className="space-y-2 rounded border border-border bg-background/50 p-3">
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-1 text-[11px] font-bold text-muted-foreground uppercase">
                    <Lock className="h-3 w-3 text-amber-400" /> Secret Backup
                    Key
                  </label>
                  <span className="text-[9px] font-semibold tracking-wider text-amber-400/90 uppercase">
                    Backups Only
                  </span>
                </div>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    type="password"
                    value={roomSecretKey}
                    className="bg-background font-mono text-xs"
                  />
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={() => copyToClipboard(roomSecretKey, "key")}
                    title="Copy Secret Backup Key"
                  >
                    {copiedKey ? (
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <p className="text-[10px] leading-tight text-muted-foreground">
                  Required only to restore encrypted backups on the home page.
                  Do not share as an invite link.
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

        {/* Main View: Gate Screen for Unapproved Visitors, or Live Chat for Approved/Owner */}
        {!isLoadingInitial && !isExpired && !isApproved && !isOwner ? (
          <main className="relative flex flex-1 flex-col items-center justify-center bg-background/50 p-4 sm:p-8">
            <div className="glow-box w-full max-w-lg space-y-6 rounded-xl border border-primary/50 bg-card/90 p-6 shadow-2xl backdrop-blur">
              <div className="space-y-2 text-center">
                <div className="inline-flex items-center justify-center rounded-full border border-primary/40 bg-primary/10 p-3 text-primary shadow-[0_0_15px_rgba(34,197,94,0.25)]">
                  <ShieldAlert className="h-8 w-8 animate-pulse text-primary" />
                </div>
                <h2 className="glow-text text-xl font-black tracking-wider text-primary">
                  HOST APPROVAL REQUIRED
                </h2>
                <p className="text-xs text-muted-foreground">
                  You are requesting entry to secret room{" "}
                  <span className="font-bold text-foreground">
                    {activeRoomId}
                  </span>
                  . The room creator must review and approve your session before
                  you can join.
                </p>
              </div>

              {/* Zero-Knowledge Real Name Privacy Advisory */}
              <div className="space-y-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-xs">
                <div className="flex items-center gap-2 font-bold text-amber-400">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                  <span>PRIVACY RECOMMENDATION: DO NOT USE YOUR REAL NAME</span>
                </div>
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  To protect your privacy and guarantee zero-knowledge
                  anonymity, we strongly recommend{" "}
                  <strong>NOT using your real name</strong> or identifiable
                  information. Change your alias to an anonymous moniker or
                  click <strong>Randomize</strong> below before submitting your
                  join request.
                </p>
              </div>

              {/* Current Status State View */}
              {isJoinRejected ? (
                <div className="space-y-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-center">
                  <div className="flex items-center justify-center gap-2 text-sm font-bold text-rose-400">
                    <UserX className="h-5 w-5" />
                    <span>ENTRY REQUEST DECLINED</span>
                  </div>
                  <p className="text-xs text-rose-300/80">
                    The room creator has declined your join request. You may
                    choose a new alias and request access again, or return home.
                  </p>
                  <div className="flex justify-center gap-2 pt-2">
                    <Button
                      onClick={() => {
                        setIsJoinRejected(false)
                        handleRandomizeAlias()
                      }}
                      className="gap-1.5 bg-rose-500 text-xs font-bold text-white hover:bg-rose-600"
                    >
                      <Dices className="h-4 w-4" /> Try Again with New Alias
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => router.push("/")}
                      className="border-border text-xs"
                    >
                      Return Home
                    </Button>
                  </div>
                </div>
              ) : isJoinRequested ? (
                <div className="space-y-4 rounded-lg border border-primary/30 bg-primary/5 p-6 text-center">
                  <div className="flex justify-center">
                    <div className="relative flex items-center justify-center">
                      <div className="absolute h-14 w-14 animate-ping rounded-full border-2 border-primary/30" />
                      <Loader2 className="h-8 w-8 animate-spin text-primary" />
                    </div>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold tracking-wide text-primary uppercase">
                      Awaiting Host Approval...
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      Your join request has been sent to the room creator.
                      Please keep this screen open while they review and approve
                      your entry.
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-2 rounded border border-border bg-background px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">
                      Requested Alias:
                    </span>
                    <span className="font-bold text-primary">{senderName}</span>
                  </div>
                  <div className="pt-2">
                    <Button
                      variant="outline"
                      onClick={() => router.push("/")}
                      className="border-rose-500/40 text-xs text-rose-400 hover:bg-rose-500/10"
                    >
                      Cancel Request & Return Home
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="flex items-center justify-between text-xs font-bold text-muted-foreground">
                      <span>CHOOSE ANONYMOUS ALIAS:</span>
                      <span className="text-[10px] text-primary/70">
                        Pseudonym Recommended
                      </span>
                    </label>
                    <div className="flex gap-2">
                      <Input
                        value={senderName}
                        onChange={(e) => {
                          const val = e.target.value
                          setSenderName(val)
                          localStorage.setItem("vanish_sender_name", val)
                        }}
                        placeholder="Enter anonymous pseudonym..."
                        className="bg-background text-xs font-bold text-foreground"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleRandomizeAlias}
                        className="shrink-0 gap-1.5 border-primary/40 text-xs font-bold text-primary hover:bg-primary/20"
                        title="Randomize Anonymous Alias"
                      >
                        <Dices className="h-4 w-4 text-primary" />
                        <span>Randomize</span>
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-2 pt-2">
                    <Button
                      onClick={handleRequestJoin}
                      disabled={isSubmittingJoin || !senderName.trim()}
                      className="glow-box h-11 w-full gap-2 bg-primary text-xs font-bold text-primary-foreground hover:bg-primary/90"
                    >
                      {isSubmittingJoin ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          <span>TRANSMITTING REQUEST...</span>
                        </>
                      ) : (
                        <>
                          <UserPlus className="h-4 w-4" />
                          <span>REQUEST ACCESS TO JOIN ROOM</span>
                        </>
                      )}
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => router.push("/")}
                      className="w-full text-xs text-muted-foreground hover:text-foreground"
                    >
                      Cancel & Return Home
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </main>
        ) : (
          <main className="relative flex flex-1 flex-col overflow-hidden bg-background/50">
            {/* Host Inbound Join Request Floating Banner */}
            {isOwner && pendingRequests.length > 0 && (
              <div className="sticky top-0 z-30 flex items-center justify-between border-b border-amber-500/50 bg-amber-950/90 px-4 py-2.5 shadow-lg backdrop-blur">
                <div className="flex items-center gap-2 text-xs">
                  <div className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                  </div>
                  <span className="font-bold text-amber-300">
                    {pendingRequests[0].senderName}
                  </span>
                  <span className="hidden text-[11px] text-muted-foreground sm:inline">
                    is requesting to join this secret session
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    onClick={() =>
                      handleApproveRequest(
                        pendingRequests[0].senderId,
                        pendingRequests[0].senderName
                      )
                    }
                    className="h-7 gap-1 bg-emerald-500 text-xs font-bold text-black shadow-[0_0_10px_rgba(16,185,129,0.3)] hover:bg-emerald-400"
                  >
                    <UserCheck className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleRejectRequest(
                        pendingRequests[0].senderId,
                        pendingRequests[0].senderName
                      )
                    }
                    className="h-7 gap-1 border-rose-500/50 text-xs font-bold text-rose-400 hover:bg-rose-500/20"
                  >
                    <UserX className="h-3.5 w-3.5" /> Decline
                  </Button>
                </div>
              </div>
            )}
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
            <div
              ref={chatContainerRef}
              onScroll={handleChatScroll}
              className="flex-1 space-y-3 overflow-y-auto p-4"
            >
              {isLoadingInitial ? (
                <div className="flex h-full animate-pulse flex-col items-center justify-center space-y-2 text-center text-muted-foreground">
                  <Terminal className="h-8 w-8 animate-spin text-primary/40" />
                  <p className="text-xs">Connecting to encrypted session...</p>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center space-y-2 text-center text-muted-foreground">
                  <Terminal className="h-8 w-8 text-primary/40" />
                  <p className="text-xs">
                    No messages yet in room {activeRoomId}.
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Send a message below. Live chat continues seamlessly even if
                    a backup is created!
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
                disabled={!inputContent.trim() || isExpired}
                className="h-11 shrink-0 cursor-pointer gap-1.5 self-end bg-primary px-5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
              >
                <Send className="h-3.5 w-3.5" />{" "}
                <span className="hidden sm:inline">SEND</span>
              </Button>
            </form>
          </main>
        )}
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
      <Dialog open={confirmPurgeOpen} onOpenChange={setConfirmPurgeOpen}>
        <DialogContent className="max-w-md border-destructive/50 bg-card font-mono text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-destructive">
              <AlertTriangle className="h-5 w-5" /> Confirm Manual Room Purge
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to permanently delete all messages and purge
              room{" "}
              <span className="font-bold text-primary">{activeRoomId}</span> for
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

      {/* Leave Room Confirmation Dialog */}
      <Dialog open={confirmLeaveOpen} onOpenChange={setConfirmLeaveOpen}>
        <DialogContent className="max-w-md border-rose-500/50 bg-card font-mono text-foreground">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base text-rose-500">
              <LogOut className="h-5 w-5" /> Leave Secret Chat Session?
            </DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to leave room{" "}
              <span className="font-bold text-primary">{activeRoomId}</span>?
              Unbacked messages in this session will vanish upon room
              expiration.
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
              <LogOut className="h-3.5 w-3.5" />{" "}
              {isLeaving ? "LEAVING..." : "CONFIRM & LEAVE"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
