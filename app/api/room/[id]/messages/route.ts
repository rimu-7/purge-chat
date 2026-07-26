import { NextResponse } from "next/server";
import { getRoomMessages, postMessage } from "@/lib/vanish";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const msgs = await getRoomMessages(roomId);
    return NextResponse.json(msgs);
  } catch (error) {
    console.error("Failed to fetch messages:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const { senderId, senderName, content } = await req.json();

    if (!senderId || !senderName || !content || typeof content !== "string") {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const msg = await postMessage(roomId, senderId, senderName, content.trim());
    if (!msg) {
      return NextResponse.json({ error: "Room expired or not found" }, { status: 404 });
    }

    return NextResponse.json(msg);
  } catch (error) {
    console.error("Failed to post message:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
