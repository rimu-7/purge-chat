import { NextResponse } from "next/server";
import { createEncryptedBackup } from "@/lib/vanish";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: roomId } = await params;
    const { senderId, encryptedData, iv } = await req.json();

    if (!senderId || !encryptedData || !iv) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const { roomIdHash, sysMsg } = await createEncryptedBackup(roomId, senderId, encryptedData, iv);
    return NextResponse.json({ success: true, roomIdHash, sysMsg });
  } catch (error) {
    console.error("Failed to backup room:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 403 });
  }
}
