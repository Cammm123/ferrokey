import "server-only";
import { NextResponse } from "next/server";
import type { Result } from "./api";

/** First address in x-forwarded-for (set by Vercel), else a placeholder in dev. */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

export function respond(r: Result): NextResponse {
  return NextResponse.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

export async function jsonBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length") ?? 0) > 100_000) return null;
  return request.json().catch(() => null);
}
