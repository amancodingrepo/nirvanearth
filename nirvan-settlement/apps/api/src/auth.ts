import { createHmac, timingSafeEqual, createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { AppConfig } from "./config.ts";
import { HttpError } from "./config.ts";

interface SessionPayload {
  email: string;
  exp: number;
}

export function signSession(email: string, secret: string, ttlMs = 7 * 24 * 60 * 60 * 1000): string {
  const payload = Buffer.from(JSON.stringify({ email, exp: Date.now() + ttlMs } satisfies SessionPayload)).toString(
    "base64url",
  );
  const signature = createHmac("sha256", secret).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readSession(token: string | undefined, secret: string): SessionPayload | null {
  if (!token) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as SessionPayload;
  if (!parsed.email || parsed.exp < Date.now()) return null;
  return parsed;
}

export function passwordsMatch(input: string, expected: string): boolean {
  const left = createHash("sha256").update(input).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

export function actorFromRequest(request: FastifyRequest, config: AppConfig): string {
  const headerEmail = request.headers["x-actor-email"];
  if (typeof headerEmail === "string" && config.nodeEnv === "test") {
    return headerEmail.toLowerCase();
  }
  const token = request.cookies?.session;
  const session = readSession(token, config.sessionSecret);
  if (!session) throw new HttpError(401, "Sign in required.");
  return session.email.toLowerCase();
}

export function setSessionCookie(reply: FastifyReply, config: AppConfig, email: string): void {
  reply.setCookie("session", signSession(email, config.sessionSecret), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
  });
}
