import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth";

export async function GET(req: Request) {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  return NextResponse.redirect(new URL("/login", req.url));
}
