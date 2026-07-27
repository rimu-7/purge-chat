import { NextResponse } from "next/server";
import { getEncryptedBackup } from "@/lib/vanish";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ hash: string }> }
) {
  try {
    const { hash } = await params;
    const backup = await getEncryptedBackup(hash);
    if (!backup) {
      return NextResponse.json({ error: "Backup not found or expired" }, { status: 404 });
    }
    return NextResponse.json(backup);
  } catch (error) {
    console.error("Failed to fetch backup:", error);
    const message = error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
