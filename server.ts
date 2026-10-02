try {
  process.loadEnvFile();
} catch {}

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import {
  postMessage,
  getActiveRoom,
  purgeRoom,
  postSystemMessage,
  checkParticipantAccess,
  requestToJoinRoom,
  approveJoinRequest,
  rejectJoinRequest,
  getRoomJoinRequests,
} from "./lib/vanish";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url!, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*",
    },
  });

  // Attach io to globalThis so API routes can emit real-time events synchronously
  (globalThis as unknown as { __purge_io: Server }).__purge_io = io;

  io.on("connection", (socket) => {
    socket.on("register-session", ({ senderId }) => {
      if (senderId) {
        socket.join(`user:${senderId}`);
      }
    });

    socket.on("join-room", async ({ roomId, senderId, senderName }) => {
      const room = await getActiveRoom(roomId);
      if (!room) {
        socket.emit("room-destroyed", { roomId, reason: "Room expired" });
        return;
      }
      const canonicalRoomId = room.id;

      // Always join user private channel for targeted signals (approvals/denials)
      if (senderId) {
        socket.join(`user:${senderId}`);
      }

      // Check participant access approval (room owner is always approved)
      const isAllowed = senderId
        ? await checkParticipantAccess(canonicalRoomId, senderId)
        : false;

      if (!isAllowed) {
        socket.emit("join-denied", {
          reason: "Creator approval required",
          roomId: canonicalRoomId,
        });
        return;
      }

      socket.join(canonicalRoomId);
      if (roomId && roomId !== canonicalRoomId) {
        socket.join(roomId);
      }

      const name = senderName?.trim() || "Anonymous Participant";
      const isAlreadyJoined = socket.data.joinedRoomId === canonicalRoomId;

      // Store socket session data for disconnect/leave handling
      socket.data.roomId = canonicalRoomId;
      socket.data.senderId = senderId;
      socket.data.senderName = name;
      socket.data.joinedRoomId = canonicalRoomId;
      socket.data.leftHandled = false;

      if (!isAlreadyJoined) {
        // Post system join message and broadcast live to everyone in room
        const sysMsg = await postSystemMessage(
          canonicalRoomId,
          `👋 ${name} joined the chat`
        );
        if (sysMsg) {
          io.to(canonicalRoomId).emit("message-received", sysMsg);
          if (roomId && roomId !== canonicalRoomId) {
            io.to(roomId).emit("message-received", sysMsg);
          }
        }
      }
    });

    socket.on("request-join", async ({ roomId, senderId, senderName }) => {
      try {
        if (!roomId || !senderId) return;
        const room = await getActiveRoom(roomId);
        if (!room) {
          socket.emit("room-destroyed", { roomId, reason: "Room expired" });
          return;
        }
        const canonicalRoomId = room.id;
        socket.join(`user:${senderId}`);

        const res = await requestToJoinRoom(
          canonicalRoomId,
          senderId,
          senderName
        );
        if (res.alreadyApproved) {
          socket.emit("join-approved", { roomId: canonicalRoomId });
          return;
        }

        const payload = {
          senderId,
          senderName: senderName?.trim() || "Anonymous Participant",
          createdAt: new Date().toISOString(),
        };

        // Broadcast only to the room creator's private channel
        if (room.ownerId) {
          io.to(`user:${room.ownerId}`).emit("join-request-received", payload);
        }
        socket.emit("join-request-pending", payload);
      } catch (err: unknown) {
        socket.emit("error-message", { message: (err as Error).message });
      }
    });

    socket.on("get-join-requests", async ({ roomId, hostSenderId }) => {
      if (!roomId || !hostSenderId) return;
      const requests = await getRoomJoinRequests(roomId, hostSenderId);
      socket.emit("join-requests-list", requests);
    });

    socket.on(
      "approve-join-request",
      async ({ roomId, hostSenderId, targetSenderId }) => {
        try {
          if (!roomId || !hostSenderId || !targetSenderId) return;
          const success = await approveJoinRequest(
            roomId,
            hostSenderId,
            targetSenderId
          );
          if (success) {
            const room = await getActiveRoom(roomId);
            const canonicalRoomId = room ? room.id : roomId;
            // Notify the approved participant in their private room
            io.to(`user:${targetSenderId}`).emit("join-approved", {
              roomId: canonicalRoomId,
            });
            // Update only the host's pending requests list
            if (room?.ownerId) {
              io.to(`user:${room.ownerId}`).emit("join-request-handled", {
                targetSenderId,
                status: "approved",
              });
            }
          }
        } catch (err: unknown) {
          socket.emit("error-message", { message: (err as Error).message });
        }
      }
    );

    socket.on(
      "reject-join-request",
      async ({ roomId, hostSenderId, targetSenderId }) => {
        try {
          if (!roomId || !hostSenderId || !targetSenderId) return;
          const success = await rejectJoinRequest(
            roomId,
            hostSenderId,
            targetSenderId
          );
          if (success) {
            const room = await getActiveRoom(roomId);
            const canonicalRoomId = room ? room.id : roomId;
            // Notify the rejected user
            io.to(`user:${targetSenderId}`).emit("join-rejected", {
              roomId: canonicalRoomId,
            });
            // Update only the host's pending requests list
            if (room?.ownerId) {
              io.to(`user:${room.ownerId}`).emit("join-request-handled", {
                targetSenderId,
                status: "rejected",
              });
            }
          }
        } catch (err: unknown) {
          socket.emit("error-message", { message: (err as Error).message });
        }
      }
    );

    socket.on("leave-room", async ({ roomId, senderName }) => {
      const targetRoomId = roomId || socket.data.roomId;
      const name =
        senderName?.trim() ||
        socket.data.senderName ||
        "Anonymous Participant";

      if (targetRoomId && !socket.data.leftHandled) {
        socket.data.leftHandled = true;
        delete socket.data.joinedRoomId;

        const room = await getActiveRoom(targetRoomId);
        if (room) {
          const canonicalRoomId = room.id;
          const sysMsg = await postSystemMessage(
            canonicalRoomId,
            `🚪 ${name} left the chat`
          );
          if (sysMsg) {
            io.to(canonicalRoomId).emit("message-received", sysMsg);
          }
          socket.leave(canonicalRoomId);
        }
      }
    });

    socket.on("disconnect", async () => {
      const { roomId, senderName, leftHandled, joinedRoomId } =
        socket.data || {};
      if (roomId && senderName && joinedRoomId && !leftHandled) {
        socket.data.leftHandled = true;
        delete socket.data.joinedRoomId;

        const room = await getActiveRoom(roomId);
        if (room) {
          const canonicalRoomId = room.id;
          const sysMsg = await postSystemMessage(
            canonicalRoomId,
            `🚪 ${senderName} left the chat`
          );
          if (sysMsg) {
            io.to(canonicalRoomId).emit("message-received", sysMsg);
          }
        }
      }
    });

    socket.on("update-alias", ({ senderName }) => {
      if (senderName?.trim()) {
        socket.data.senderName = senderName.trim();
      }
    });

    socket.on(
      "send-message",
      async ({ roomId, senderId, senderName, content }) => {
        if (!roomId || !content?.trim()) return;

        const room = await getActiveRoom(roomId);
        if (!room) {
          socket.emit("room-destroyed", { roomId, reason: "Room expired" });
          return;
        }
        const canonicalRoomId = room.id;

        const isAllowed = senderId
          ? await checkParticipantAccess(canonicalRoomId, senderId)
          : false;
        if (!isAllowed) {
          socket.emit("join-denied", {
            reason: "Approval required to send messages",
          });
          return;
        }

        const msg = await postMessage(
          canonicalRoomId,
          senderId,
          senderName,
          content.trim()
        );
        if (msg) {
          io.to(canonicalRoomId).emit("message-received", msg);
        } else {
          io.to(canonicalRoomId).emit("room-destroyed", {
            roomId: canonicalRoomId,
            reason: "Room expired",
          });
        }
      }
    );

    socket.on("client-expired", async ({ roomId }) => {
      if (!roomId) return;
      const room = await getActiveRoom(roomId);
      if (!room) {
        io.to(roomId).emit("room-destroyed", { roomId, reason: "Room expired" });
      }
    });

    socket.on("trigger-backup-updated", async ({ roomId, sysMsg }) => {
      const room = await getActiveRoom(roomId);
      const canonicalRoomId = room?.id || roomId;
      io.to(canonicalRoomId).emit("backup-status-updated", { isBackedUp: true });
      if (sysMsg) {
        io.to(canonicalRoomId).emit("message-received", sysMsg);
      } else {
        const sys = await postSystemMessage(canonicalRoomId, "🛡️ CHAT IS BACKED UP SECURELY");
        if (sys) {
          io.to(canonicalRoomId).emit("message-received", sys);
        }
      }
    });

    socket.on("trigger-purge", async ({ roomId, senderId }) => {
      try {
        const room = await getActiveRoom(roomId);
        const canonicalRoomId = room?.id || roomId;
        await purgeRoom(canonicalRoomId, senderId);
        io.to(canonicalRoomId).emit("room-destroyed", {
          roomId: canonicalRoomId,
          reason: "Manual purge by owner",
        });
      } catch (err) {
        socket.emit("error-message", { message: (err as Error).message });
      }
    });
  });

  // Real-time automatic room expiration sweeper (checks every 5000ms)
  setInterval(async () => {
    try {
      const roomIds = Array.from(io.sockets.adapter.rooms.keys());
      for (const roomId of roomIds) {
        // Skip individual socket connection IDs and private user notification channels
        if (io.sockets.sockets.has(roomId) || roomId.startsWith("user:")) continue;

        // Only check valid room ID / secret key token formats
        if (!/^[a-zA-Z0-9_-]{16,64}$/.test(roomId)) continue;

        const room = await getActiveRoom(roomId);
        if (!room) {
          io.to(roomId).emit("room-destroyed", { roomId, reason: "Room expired" });
          io.in(roomId).socketsLeave(roomId);
        }
      }
    } catch (err) {
      console.error("Room expiration background sweeper error:", err);
    }
  }, 5000);

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});

