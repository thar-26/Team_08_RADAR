import { createHmac } from "node:crypto";
import { NextResponse } from "next/server";
import { auth } from "@/auth";

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** Short-lived (10 min) HS256 token that tells the Python API who is signed in.
 *  Signed with AUTH_SECRET, which only the website and the API know. */
export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ token: null }, { status: 401 });
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(JSON.stringify({ sub: email.toLowerCase(), name: session.user?.name ?? "", aud: "radar-api", iat: now, exp: now + 600 }));
  const sig = createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${header}.${payload}`).digest("base64url");
  return NextResponse.json({ token: `${header}.${payload}.${sig}`, exp: now + 600 }, { headers: { "Cache-Control": "no-store" } });
}
