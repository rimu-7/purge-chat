import { NextResponse } from "next/server";
import { getActiveRoom, checkParticipantAccess, getRoomJoinRequests } from "@/lib/vanish";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const url = new URL(req.url);
    const senderId = url.searchParams.get("senderId");

    if (!senderId) {
      return NextResponse.json({ error: "Sender ID required" }, { status: 400 });
    }

    const room = await getActiveRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: "Room expired or not found" }, { status: 404 });
    }

    const isOwner = room.ownerId === senderId;
    const isApproved = isOwner || (await checkParticipantAccess(room.id, senderId));

    let isPending = false;
    if (!isApproved) {
      const pendingList = await getRoomJoinRequests(room.id, room.ownerId);
      isPending = pendingList.some((r) => r.senderId === senderId);
    }

    return NextResponse.json(
      {
        roomId: room.id,
        isOwner,
        isApproved,
        isPending,
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      }
    );
  } catch (error) {
    console.error("Failed to check join status:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
