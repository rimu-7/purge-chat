import { NextResponse } from "next/server";
import { getActiveRoom, purgeRoom } from "@/lib/vanish";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const room = await getActiveRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: "Room expired or not found" }, { status: 404 });
    }
    return NextResponse.json(room);
  } catch (error) {
    console.error("Failed to fetch room:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
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

    await purgeRoom(roomId, senderId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to purge room:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
