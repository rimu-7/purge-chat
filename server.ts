try {
  process.loadEnvFile();
} catch {}

import { createServer } from "http";
import { parse } from "url";
import next from "next";
import { Server } from "socket.io";
import { postMessage, getActiveRoom, purgeRoom, postSystemMessage } from "./lib/vanish";

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

  io.on("connection", (socket) => {
    socket.on("join-room", async ({ roomId, senderName }) => {
      const room = await getActiveRoom(roomId);
      if (!room) {
        socket.emit("room-destroyed", { reason: "Room expired" });
        return;
      }
      socket.join(roomId);

      const name = senderName?.trim() || "Anonymous Participant";
      const isAlreadyJoined = socket.data.joinedRoomId === roomId;

      // Store socket session data for disconnect/leave handling
      socket.data.roomId = roomId;
      socket.data.senderName = name;
      socket.data.joinedRoomId = roomId;
      socket.data.leftHandled = false;

      if (!isAlreadyJoined) {
        // Post system join message and broadcast live to everyone in room
        const sysMsg = await postSystemMessage(roomId, `👋 ${name} joined the chat`);
        if (sysMsg) {
          io.to(roomId).emit("message-received", sysMsg);
        }
      }
    });

    socket.on("leave-room", async ({ roomId, senderName }) => {
      const targetRoomId = roomId || socket.data.roomId;
      const name = senderName?.trim() || socket.data.senderName || "Anonymous Participant";

      if (targetRoomId && !socket.data.leftHandled) {
        socket.data.leftHandled = true;
        delete socket.data.joinedRoomId;

        const room = await getActiveRoom(targetRoomId);
        if (room) {
          const sysMsg = await postSystemMessage(targetRoomId, `🚪 ${name} left the chat`);
          if (sysMsg) {
            io.to(targetRoomId).emit("message-received", sysMsg);
          }
        }
        socket.leave(targetRoomId);
      }
    });

    socket.on("disconnect", async () => {
      const { roomId, senderName, leftHandled, joinedRoomId } = socket.data || {};
      if (roomId && senderName && joinedRoomId && !leftHandled) {
        socket.data.leftHandled = true;
        delete socket.data.joinedRoomId;

        const room = await getActiveRoom(roomId);
        if (room) {
          const sysMsg = await postSystemMessage(roomId, `🚪 ${senderName} left the chat`);
          if (sysMsg) {
            io.to(roomId).emit("message-received", sysMsg);
          }
        }
      }
    });

    socket.on("update-alias", ({ senderName }) => {
      if (senderName?.trim()) {
        socket.data.senderName = senderName.trim();
      }
    });

    socket.on("send-message", async ({ roomId, senderId, senderName, content }) => {
      const room = await getActiveRoom(roomId);
      if (!room) {
        io.to(roomId).emit("room-destroyed", { reason: "Room expired" });
        return;
      }

      const msg = await postMessage(roomId, senderId, senderName, content);
      if (msg) {
        io.to(roomId).emit("message-received", msg);
      } else {
        io.to(roomId).emit("room-destroyed", { reason: "Room expired" });
      }
    });

    socket.on("trigger-backup-updated", async ({ roomId, sysMsg }) => {
      io.to(roomId).emit("backup-status-updated", { isBackedUp: true });
      if (sysMsg) {
        io.to(roomId).emit("message-received", sysMsg);
      } else {
        const sys = await postSystemMessage(roomId, "🛡️ CHAT IS BACKED UP SECURELY");
        if (sys) {
          io.to(roomId).emit("message-received", sys);
        }
      }
    });

    socket.on("trigger-purge", async ({ roomId, senderId }) => {
      try {
        await purgeRoom(roomId, senderId);
        io.to(roomId).emit("room-destroyed", { reason: "Manual purge by owner" });
      } catch (err) {
        socket.emit("error-message", { message: (err as Error).message });
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`> Ready on http://${hostname}:${port}`);
  });
});
