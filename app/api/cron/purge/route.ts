import { NextResponse } from "next/server";
import { runVanishPurgeSweep } from "@/lib/vanish";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const result = await runVanishPurgeSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Purge sweep failed:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
