import { burnDrop, readDrop } from "@/lib/server/api";
import { jsonBody, respond } from "@/lib/server/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/** Fetch a locked message by id. */
export async function GET(_request: Request, { params }: Ctx) {
  return respond(await readDrop(getStore(), (await params).id, Date.now()));
}

/** Burn after reading. Body: { token } (only the recipient can know it). */
export async function DELETE(request: Request, { params }: Ctx) {
  return respond(await burnDrop(getStore(), (await params).id, await jsonBody(request)));
}
