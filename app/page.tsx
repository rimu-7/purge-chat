"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import { Shield, Clock, Lock, Key, ArrowRight, Terminal, FileText, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { decryptPayload } from "@/lib/crypto";
import { generateId, generateAnonymousName } from "@/lib/identity";
import { exportToPDF, exportToText, DecryptedMessage } from "@/lib/export";
import { Footer } from "@/components/footer";

export default function HomePage() {
  const router = useRouter();
  const [duration, setDuration] = useState<number>(60); // minutes
  const [roomIdInput, setRoomIdInput] = useState<string>("");
  const [isCreating, setIsCreating] = useState(false);

  // Lazy state initializers to prevent React 19 cascading render warnings
  const [senderId] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    let sid = localStorage.getItem("vanish_sender_id");
    if (!sid) {
      sid = generateId();
      localStorage.setItem("vanish_sender_id", sid);
    }
    return sid;
  });

  const [senderName, setSenderName] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    let sname = localStorage.getItem("vanish_sender_name");
    if (!sname) {
      sname = generateAnonymousName();
      localStorage.setItem("vanish_sender_name", sname);
    }
    return sname;
  });

  // Restore backup state
  const [backupHash, setBackupHash] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [isRestoring, setIsRestoring] = useState(false);
  const [restoredMessages, setRestoredMessages] = useState<DecryptedMessage[] | null>(null);
  const [restoreError, setRestoreError] = useState("");

  const handleCreateRoom = async () => {
    if (!senderId || isCreating) return;
    setIsCreating(true);
    try {
      const { data } = await axios.post("/api/room/create", {
        durationMinutes: duration,
        ownerId: senderId,
        ownerAlias: senderName,
      });
      if (data.room?.id) {
        // Save secret key locally for this room
        sessionStorage.setItem(`secret_key_${data.room.id}`, data.secretKey);
        const targetUrl = `/room/${data.room.id}`;
        router.push(targetUrl);
      }
    } catch (err) {
      console.error("Failed to create room:", err);
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Robust Mobile Join Handler:
   * Handles pasting full URLs or raw Room IDs.
   */
  const handleJoinRoom = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const raw = roomIdInput.trim();
    if (!raw) return;

    let cleanId = raw;
    if (cleanId.includes("/room/")) {
      cleanId = cleanId.split("/room/")[1].split("?")[0].split("#")[0].trim();
    } else if (cleanId.startsWith("http://") || cleanId.startsWith("https://")) {
      try {
        const url = new URL(cleanId);
        const parts = url.pathname.split("/").filter(Boolean);
        cleanId = parts[parts.length - 1] || cleanId;
      } catch {
        // Fallback
      }
    }

    cleanId = cleanId.replace(/^\/+|\/+$/g, "");

    if (!cleanId) return;

    const targetPath = `/room/${cleanId}`;
    router.push(targetPath);
    setTimeout(() => {
      if (window.location.pathname !== targetPath) {
        window.location.href = targetPath;
      }
    }, 100);
  };

  const handleRestoreBackup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!backupHash.trim() || !secretKey.trim()) return;

    setIsRestoring(true);
    setRestoreError("");
    setRestoredMessages(null);

    try {
      const { data } = await axios.get(`/api/backup/${backupHash.trim()}`);
      const decrypted = await decryptPayload<DecryptedMessage[]>(
        data.encryptedData,
        data.iv,
        secretKey.trim()
      );

      setRestoredMessages(decrypted);
    } catch (err: any) {
      console.error("Restore failed:", err);
      const msg = err.response?.data?.error || err.message || "Failed to decrypt backup";
      setRestoreError(msg);
    } finally {
      setIsRestoring(false);
    }
  };

  return (
    <div className="relative min-h-svh w-full bg-background text-foreground flex flex-col items-center justify-between font-mono overflow-x-hidden">
      {/* CRT Scanline Overlay Effect */}
      <div className="crt-scanlines fixed inset-0 z-50 pointer-events-none opacity-20" />

      <main className="w-full flex-1 flex flex-col items-center justify-center p-4 md:p-8">
        {/* Header / Hero */}
        <div className="max-w-3xl w-full text-center space-y-4 mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/40 bg-card/60 text-xs text-primary glow-box">
            <Terminal className="w-3.5 h-3.5" />
            <span>EPHEMERAL ZERO-KNOWLEDGE CHAT</span>
          </div>

          <h1 className="text-3xl md:text-5xl font-bold tracking-tight text-primary glow-text">
            PURGE-CHAT
          </h1>

          <p className="text-sm md:text-base text-muted-foreground max-w-xl mx-auto">
            Ultra lightweight real-time chat with instant auto-vanish timeout, zero-knowledge AES-256 client encryption, and zero persistent logs.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2 text-xs text-muted-foreground">
            <Badge variant="outline" className="border-border gap-1 text-primary">
              <Lock className="w-3 h-3 text-primary" /> AES-256-GCM Zero-Knowledge
            </Badge>
            <Badge variant="outline" className="border-border gap-1 text-primary">
              <Clock className="w-3 h-3 text-primary" /> Auto-Vanish Lifespan
            </Badge>
            <Badge variant="outline" className="border-border gap-1 text-primary">
              <Shield className="w-3 h-3 text-primary" /> End-to-End Private
            </Badge>
          </div>
        </div>

        {/* Main Grid */}
        <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Create Room Card */}
          <Card className="border-border bg-card/80 backdrop-blur">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <Shield className="w-5 h-5" /> Create Secret Room
              </CardTitle>
              <CardDescription className="text-xs">
                Select room lifespan. Once expired, all message history is permanently purged.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Your Alias
                </label>
                <Input
                  value={senderName}
                  onChange={(e) => {
                    setSenderName(e.target.value);
                    localStorage.setItem("vanish_sender_name", e.target.value);
                  }}
                  className="font-mono text-xs bg-background"
                />
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Expiration Duration
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "10 Mins", value: 10 },
                    { label: "1 Hour", value: 60 },
                    { label: "24 Hours", value: 1440 },
                  ].map((item) => (
                    <Button
                      key={item.value}
                      type="button"
                      variant={duration === item.value ? "default" : "outline"}
                      className="text-xs py-2 h-auto"
                      onClick={() => setDuration(item.value)}
                    >
                      {item.label}
                    </Button>
                  ))}
                </div>
              </div>

              <Button
                onClick={handleCreateRoom}
                disabled={isCreating}
                suppressHydrationWarning
                className="w-full text-xs font-bold gap-2 py-3 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {isCreating ? (
                  "INITIALIZING ROOM..."
                ) : (
                  <>
                    CREATE ANONYMOUS ROOM <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Join Existing Room Card */}
          <Card className="border-border bg-card/80 backdrop-blur flex flex-col justify-between">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <Key className="w-5 h-5" /> Join Secret Room
              </CardTitle>
              <CardDescription className="text-xs">
                Paste a Room ID or room link to enter.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-semibold text-muted-foreground uppercase">
                    Room Identifier or Link
                  </label>
                  <Input
                    placeholder="e.g. xK92mA_19xL02mZq"
                    value={roomIdInput}
                    onChange={(e) => setRoomIdInput(e.target.value)}
                    className="font-mono text-xs bg-background"
                  />
                </div>

                <Button
                  type="submit"
                  onClick={() => handleJoinRoom()}
                  disabled={!roomIdInput.trim()}
                  variant="secondary"
                  className="w-full text-xs font-bold gap-2 py-3 cursor-pointer"
                >
                  JOIN ROOM <ArrowRight className="w-4 h-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>

        {/* Zero-Knowledge Backup Restore Section */}
        <div className="max-w-4xl w-full mt-6">
          <Card className="border-border bg-card/60 backdrop-blur">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2 text-primary">
                <Lock className="w-4 h-4" /> Restore Encrypted Zero-Knowledge Backup
              </CardTitle>
              <CardDescription className="text-xs">
                Decrypt an offline backup blob using your secret backup key in-browser. The server cannot read your messages.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <form onSubmit={handleRestoreBackup} className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <Input
                  placeholder="Backup Hash (SHA-256)"
                  value={backupHash}
                  onChange={(e) => setBackupHash(e.target.value)}
                  className="font-mono text-xs bg-background"
                />
                <Input
                  placeholder="Secret Backup Key (AES-256)"
                  type="password"
                  value={secretKey}
                  onChange={(e) => setSecretKey(e.target.value)}
                  className="font-mono text-xs bg-background"
                />
                <Button
                  type="submit"
                  disabled={isRestoring || !backupHash.trim() || !secretKey.trim()}
                  variant="outline"
                  className="text-xs font-bold gap-1 border-primary/50 text-primary hover:bg-primary/10"
                >
                  {isRestoring ? "DECRYPTING..." : "DECRYPT & RESTORE"}
                </Button>
              </form>

              {restoreError && (
                <div className="p-3 border border-destructive/50 bg-destructive/10 text-destructive text-xs rounded">
                  ⚠️ {restoreError}
                </div>
              )}

              {restoredMessages && (
                <div className="mt-4 p-4 border border-primary/40 bg-background/90 rounded text-xs space-y-4">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 pb-2 border-b border-border">
                    <div className="flex items-center gap-2 font-bold text-primary">
                      <Shield className="w-4 h-4 text-primary" /> DECRYPTED BACKUP PAYLOAD
                      <Badge variant="outline" className="text-[10px] border-primary/50">
                        {restoredMessages.length} Messages
                      </Badge>
                    </div>

                    {/* Download PDF & Text Action Buttons */}
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        onClick={() => exportToPDF(backupHash, restoredMessages)}
                        className="text-xs bg-primary text-primary-foreground hover:bg-primary/90 font-bold gap-1.5 h-8 px-3"
                      >
                        <Download className="w-3.5 h-3.5" /> DOWNLOAD PDF REPORT
                      </Button>

                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => exportToText(backupHash, restoredMessages)}
                        className="text-xs border-border text-foreground hover:bg-card font-bold gap-1.5 h-8 px-3"
                      >
                        <FileText className="w-3.5 h-3.5" /> EXPORT TXT
                      </Button>
                    </div>
                  </div>

                  <div className="max-h-64 overflow-y-auto space-y-2 pr-2">
                    {restoredMessages.map((msg: DecryptedMessage, idx: number) => (
                      <div key={idx} className="p-3 border border-border bg-card rounded text-xs">
                        <div className="flex justify-between text-[11px] text-muted-foreground mb-1">
                          <span className="font-bold text-primary">{msg.senderName || "Unknown"}</span>
                          <span>{new Date(msg.createdAt).toLocaleString()}</span>
                        </div>
                        <p className="text-foreground whitespace-pre-wrap">{msg.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Footer */}
      <Footer />
    </div>
  );
}
