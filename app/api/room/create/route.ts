import { NextResponse } from "next/server";
import { createRoom } from "@/lib/vanish";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const durationMinutes = Number(body.durationMinutes) || 60; // Default 1 hour
    const ownerId = body.ownerId;
    const ownerAlias = body.ownerAlias;

    if (!ownerId || typeof ownerId !== "string") {
      return NextResponse.json(
        { error: "Owner ID is required" },
        { status: 400 }
      );
    }
    
    // Validate duration range (1 minute to 7 days)
    if (durationMinutes < 1 || durationMinutes > 10080) {
      return NextResponse.json(
        { error: "Invalid room duration" },
        { status: 400 }
      );
    }

    const result = await createRoom(durationMinutes, ownerId, ownerAlias);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to create room:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
