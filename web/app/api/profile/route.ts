import { saveProfile } from "@/lib/server/api";
import { clientIp, jsonBody, respond } from "@/lib/server/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Publish or update a signed profile. Body: { profile }. */
export async function PUT(request: Request) {
  return respond(await saveProfile(getStore(), await jsonBody(request), clientIp(request), Date.now()));
}
