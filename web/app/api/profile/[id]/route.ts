import { readProfile } from "@/lib/server/api";
import { respond } from "@/lib/server/http";
import { getStore } from "@/lib/store";

export const dynamic = "force-dynamic";

/** Fetch a profile. Browsers re-check its signature and that its keys hash to this id. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  return respond(await readProfile(getStore(), (await params).id));
}
