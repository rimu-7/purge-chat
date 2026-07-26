import { NextResponse } from "next/server";
import { getEncryptedBackup } from "@/lib/vanish";

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
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
