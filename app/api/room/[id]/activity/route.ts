import { NextResponse } from "next/server";
import { postSystemMessage, getActiveRoom } from "@/lib/vanish";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const { senderName, action } = await req.json();

    const room = await getActiveRoom(roomId);
    if (!room) {
      return NextResponse.json({ error: "Room expired or not found" }, { status: 404 });
    }

    const name = senderName?.trim() || "Anonymous Participant";

    if (action === "join") {
      const msg = await postSystemMessage(roomId, `👋 ${name} joined the chat`);
      return NextResponse.json(msg);
    } else if (action === "leave") {
      const msg = await postSystemMessage(roomId, `🚪 ${name} left the chat`);
      return NextResponse.json(msg);
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error) {
    console.error("Activity log error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
