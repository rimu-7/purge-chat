import { NextResponse } from "next/server";
import { runVanishPurgeSweep } from "@/lib/vanish";

export async function GET() {
  try {
    const result = await runVanishPurgeSweep();
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error("Purge sweep failed:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
