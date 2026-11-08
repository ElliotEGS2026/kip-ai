import fs from "node:fs";
import path from "node:path";
import { dataDir } from "../shared/paths.js";

/**
 * Read-only Microsoft 365 connection via OAuth2 device-code flow (plain fetch, no SDK).
 * STATUS: written against Microsoft's documented endpoints but NOT yet tested against a live account.
 * Scopes are read-only; Teams (Chat.Read) is intentionally not requested in v1.
 */
const SCOPES = "offline_access User.Read Calendars.Read Mail.Read";
const tokenFile = (): string => path.join(dataDir(), "ms-token.json");
const clientId = (): string => process.env.KIP_MS_CLIENT_ID ?? "";
const authority = (): string => `https://login.microsoftonline.com/${process.env.KIP_MS_TENANT || "common"}/oauth2/v2.0`;

export interface MsState {
  status: "not_configured" | "disconnected" | "pending" | "connected" | "error";
  userCode?: string;
  verificationUri?: string;
  message?: string;
}
let flow: MsState = { status: "disconnected" };

export function msStatus(): MsState {
  if (!clientId()) return { status: "not_configured", message: "Set KIP_MS_CLIENT_ID in .env (see README)." };
  if (fs.existsSync(tokenFile())) return { status: "connected" };
  return flow;
}

const form = (o: Record<string, string>): URLSearchParams => new URLSearchParams(o);

export async function startConnect(): Promise<MsState> {
  if (!clientId()) return msStatus();
  const r = await fetch(`${authority()}/devicecode`, { method: "POST", body: form({ client_id: clientId(), scope: SCOPES }) });
  const j = (await r.json()) as { user_code?: string; verification_uri?: string; device_code?: string; interval?: number; expires_in?: number; error_description?: string };
  if (!r.ok || !j.device_code) {
    flow = { status: "error", message: j.error_description?.split("\r")[0] ?? "Could not start sign-in" };
    return flow;
  }
  flow = { status: "pending", userCode: j.user_code, verificationUri: j.verification_uri };
  void poll(j.device_code, (j.interval ?? 5) * 1000, Date.now() + (j.expires_in ?? 900) * 1000);
  return flow;
}

async function poll(deviceCode: string, interval: number, deadline: number): Promise<void> {
  while (Date.now() < deadline && flow.status === "pending") {
    await new Promise((res) => setTimeout(res, interval));
    const r = await fetch(`${authority()}/token`, {
      method: "POST",
      body: form({ grant_type: "urn:ietf:params:oauth:grant-type:device_code", client_id: clientId(), device_code: deviceCode }),
    });
    const j = (await r.json()) as { refresh_token?: string; error?: string; error_description?: string };
    if (j.refresh_token) { save(j.refresh_token); flow = { status: "connected" }; return; }
    if (j.error === "authorization_pending") continue;
    if (j.error === "slow_down") { interval += 5000; continue; }
    flow = { status: "error", message: j.error_description?.split("\r")[0] ?? j.error ?? "Sign-in failed" };
    return;
  }
  if (flow.status === "pending") flow = { status: "error", message: "Sign-in timed out" };
}

function save(refresh: string): void {
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(tokenFile(), JSON.stringify({ refresh_token: refresh }), { mode: 0o600 });
}

export function disconnect(): void {
  fs.rmSync(tokenFile(), { force: true });
  flow = { status: "disconnected" };
}

export async function accessToken(): Promise<string> {
  const saved = JSON.parse(fs.readFileSync(tokenFile(), "utf8")) as { refresh_token: string };
  const r = await fetch(`${authority()}/token`, {
    method: "POST",
    body: form({ grant_type: "refresh_token", client_id: clientId(), refresh_token: saved.refresh_token, scope: SCOPES }),
  });
  const j = (await r.json()) as { access_token?: string; refresh_token?: string; error_description?: string };
  if (!j.access_token) throw new Error(`Microsoft sign-in expired: reconnect in Kip (${j.error_description?.split("\r")[0] ?? "no detail"})`);
  if (j.refresh_token) save(j.refresh_token);
  return j.access_token;
}

/** Read-only GET against Microsoft Graph. */
export async function graph<T>(pathAndQuery: string): Promise<T> {
  const token = await accessToken();
  const r = await fetch(`https://graph.microsoft.com/v1.0${pathAndQuery}`, {
    headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
  });
  if (!r.ok) throw new Error(`Microsoft Graph ${r.status} for ${pathAndQuery.split("?")[0]}`);
  return (await r.json()) as T;
}
