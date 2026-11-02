import { createDrop } from "@/lib/server/api";
import { clientIp, jsonBody, respond } from "@/lib/server/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Store a locked message. Body: { blob, deleteHash, ttlDays }. Returns { id, expiresAt }. */
export async function POST(request: Request) {
  return respond(await createDrop(getStore(), await jsonBody(request), clientIp(request), Date.now()));
}
