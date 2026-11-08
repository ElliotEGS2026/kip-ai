import crypto from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";

export interface Guard { port: number; token: string }

const hosts = (g: Guard): string[] => [`127.0.0.1:${g.port}`, `localhost:${g.port}`];

/**
 * Blocks cross-site and DNS-rebinding access:
 *  - Host must be our loopback address (rebinding sends the attacker's hostname)
 *  - /api requires the per-run token (a foreign site can't read the page that carries it)
 *  - state-changing requests also need a matching Origin header (browsers set it; sites can't forge it)
 *    and a JSON content type (HTML forms can't send one)
 */
export function guard(g: Guard) {
  return async (req: FastifyRequest, reply: FastifyReply): Promise<void> => {
    if (!hosts(g).includes(String(req.headers.host ?? "").toLowerCase())) {
      return void reply.code(403).send({ error: "bad host" });
    }
    if (!req.url.startsWith("/api/")) return;
    const unsafe = !["GET", "HEAD"].includes(req.method);
    if (unsafe) {
      const origin = String(req.headers.origin ?? "");
      if (!hosts(g).map((h) => `http://${h}`).includes(origin)) return void reply.code(403).send({ error: "bad origin" });
      // JSON only: plain HTML forms can only send form/text content types
      if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
        return void reply.code(415).send({ error: "json only" });
      }
    }
    if (!tokenOk(String(req.headers["x-kip-token"] ?? ""), g.token)) {
      return void reply.code(403).send({ error: "bad token" });
    }
  };
}

export function tokenOk(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
