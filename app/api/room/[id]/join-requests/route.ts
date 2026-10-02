import { NextResponse } from "next/server";
import { getRoomJoinRequests, approveJoinRequest, rejectJoinRequest, getActiveRoom } from "@/lib/vanish";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const url = new URL(req.url);
    const hostId = url.searchParams.get("hostId");

    if (!hostId) {
      return NextResponse.json({ error: "Host ID required" }, { status: 400 });
    }

    const requests = await getRoomJoinRequests(roomId, hostId);
    return NextResponse.json(requests, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    });
  } catch (error) {
    console.error("Failed to fetch join requests:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const { action, hostSenderId, targetSenderId } = await req.json();

    if (!hostSenderId || !targetSenderId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const room = await getActiveRoom(roomId);
    const canonicalId = room?.id || roomId;
    const ownerId = room?.ownerId;

    const io = (globalThis as unknown as { __purge_io?: { to: (r: string) => { emit: (e: string, d: unknown) => void } } }).__purge_io;

    if (action === "approve") {
      await approveJoinRequest(roomId, hostSenderId, targetSenderId);
      if (io) {
        io.to(`user:${targetSenderId}`).emit("join-approved", { roomId: canonicalId });
        if (ownerId) {
          io.to(`user:${ownerId}`).emit("join-request-handled", {
            targetSenderId,
            status: "approved",
          });
        }
      }
      return NextResponse.json({ success: true, action: "approve" });
    } else if (action === "reject") {
      await rejectJoinRequest(roomId, hostSenderId, targetSenderId);
      if (io) {
        io.to(`user:${targetSenderId}`).emit("join-rejected", { roomId: canonicalId });
        if (ownerId) {
          io.to(`user:${ownerId}`).emit("join-request-handled", {
            targetSenderId,
            status: "rejected",
          });
        }
      }
      return NextResponse.json({ success: true, action: "reject" });
    } else {
      return NextResponse.json({ error: "Invalid action. Must be 'approve' or 'reject'" }, { status: 400 });
    }
  } catch (error) {
    console.error("Failed to process join request action:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
