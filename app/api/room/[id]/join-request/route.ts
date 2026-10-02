import { NextResponse } from "next/server";
import { requestToJoinRoom } from "@/lib/vanish";

export const dynamic = "force-dynamic";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const { senderId, senderName } = await req.json();

    if (!senderId) {
      return NextResponse.json({ error: "Sender ID required" }, { status: 400 });
    }

    const result = await requestToJoinRoom(roomId, senderId, senderName);
    if (!result.room) {
      return NextResponse.json({ error: "Room expired or not found" }, { status: 404 });
    }

    // Broadcast real-time join request only to room creator's private user channel
    const io = (globalThis as unknown as { __purge_io?: { to: (r: string) => { emit: (e: string, d: unknown) => void } } }).__purge_io;
    if (io && !result.alreadyApproved && result.room.ownerId) {
      const payload = {
        senderId,
        senderName: senderName?.trim() || "Anonymous Participant",
        createdAt: new Date().toISOString(),
      };
      io.to(`user:${result.room.ownerId}`).emit("join-request-received", payload);
    }

    return NextResponse.json({
      success: true,
      alreadyApproved: result.alreadyApproved,
      roomId: result.room.id,
    });
  } catch (error) {
    console.error("Failed to submit join request:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
