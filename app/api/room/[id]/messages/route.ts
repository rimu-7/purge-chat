import { NextResponse } from "next/server";
import { getRoomMessages, postMessage, checkParticipantAccess } from "@/lib/vanish";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const url = new URL(req.url);
    const senderId = url.searchParams.get("senderId");

    if (senderId) {
      const hasAccess = await checkParticipantAccess(roomId, senderId);
      if (!hasAccess) {
        return NextResponse.json(
          { error: "Access denied: Room creator approval required." },
          { status: 403 }
        );
      }
    }

    const msgs = await getRoomMessages(roomId, senderId || undefined);
    return NextResponse.json(msgs, {
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0",
      },
    });
  } catch (error) {
    console.error("Failed to fetch messages:", error);
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
    const { senderId, senderName, content } = await req.json();

    if (!senderId || !senderName || !content || typeof content !== "string") {
      return NextResponse.json({ error: "Invalid parameters" }, { status: 400 });
    }

    const hasAccess = await checkParticipantAccess(roomId, senderId);
    if (!hasAccess) {
      return NextResponse.json(
        { error: "Access denied: Room creator approval required." },
        { status: 403 }
      );
    }

    const msg = await postMessage(roomId, senderId, senderName, content.trim());
    if (!msg) {
      return NextResponse.json({ error: "Room expired or not found" }, { status: 404 });
    }

    return NextResponse.json(msg);
  } catch (error) {
    console.error("Failed to post message:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
