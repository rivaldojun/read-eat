import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { SESSION_COOKIE, expectedSessionToken } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

async function login(formData: FormData) {
  "use server";
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/") || "/";
  const expected = process.env.APP_PASSWORD;

  if (!expected || password !== expected) {
    redirect(`/login?error=1&next=${encodeURIComponent(next)}`);
  }

  const token = await expectedSessionToken(expected);
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect(next.startsWith("/") ? next : "/");
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">FutuRole Growth Copilot</CardTitle>
          <CardDescription>
            Internal tool — enter the access password.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={login} className="flex flex-col gap-4">
            <input type="hidden" name="next" value={next ?? "/"} />
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoFocus
                required
              />
            </div>
            {error ? (
              <p className="text-destructive text-sm">Incorrect password.</p>
            ) : null}
            <Button type="submit" className="w-full">
              Sign in
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
