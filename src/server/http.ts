import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { User } from "@/domain/types";
import { ApiError, userById } from "./service";

export const USER_COOKIE = "vh_user";

/** Mock sign-in: the role switcher sets a cookie. Real build: company SSO (Entra ID or Google, TBC). */
export async function currentUser(): Promise<User> {
  const c = await cookies();
  return userById(c.get(USER_COOKIE)?.value);
}

export async function handle(fn: () => unknown | Promise<unknown>, init?: { status?: number }) {
  try {
    const data = await fn();
    return NextResponse.json(data, { status: init?.status ?? 200 });
  } catch (e) {
    if (e instanceof ApiError) {
      return NextResponse.json({ error: e.code, message: e.message, ...e.extra }, { status: e.status });
    }
    if (e instanceof ZodError) {
      return NextResponse.json(
        { error: "invalid", message: e.issues[0]?.message ?? "Invalid request", issues: e.issues.map((i) => ({ path: i.path.join("."), message: i.message })) },
        { status: 400 },
      );
    }
    console.error(e);
    return NextResponse.json({ error: "server_error", message: e instanceof Error ? e.message : "Unexpected error" }, { status: 500 });
  }
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, "invalid_json", "Body must be JSON");
  }
}
