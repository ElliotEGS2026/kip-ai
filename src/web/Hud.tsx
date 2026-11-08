import { useEffect, useState } from "react";
import { pad } from "../shared/dates";
import { api } from "./api";

interface Ms { status: string; userCode?: string; verificationUri?: string; message?: string }

/** Microsoft sign-in control in the header (device-code flow, read-only). */
export function Connect() {
  const [ms, setMs] = useState<Ms>({ status: "…" });
  const refresh = () => api<Ms>("/api/ms/status").then(setMs).catch(() => undefined);
  useEffect(() => { void refresh(); const t = setInterval(() => { void refresh(); }, 4000); return () => clearInterval(t); }, []);
  if (ms.status === "connected") return <button className="ghost" onClick={() => api<Ms>("/api/ms/disconnect", {}).then(setMs)}>Microsoft ✔ Disconnect</button>;
  if (ms.status === "pending") return <span className="muted small">Go to <a href={ms.verificationUri} target="_blank" rel="noreferrer noopener">{ms.verificationUri}</a> and enter <b>{ms.userCode}</b></span>;
  if (ms.status === "not_configured") return <span className="muted small" title={ms.message}>Microsoft: set KIP_MS_CLIENT_ID</span>;
  return <button className="ghost" onClick={() => api<Ms>("/api/ms/connect", {}).then(setMs)}>Connect Microsoft{ms.status === "error" ? ` (${ms.message})` : ""}</button>;
}

export function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  return <div className="clock"><b>{pad(now.getHours())}:{pad(now.getMinutes())}:{pad(now.getSeconds())}</b><span>{now.toDateString()}</span></div>;
}

/** Core reactor. `progress` is 0..1 for the arc. */
export function Core({ label, sub, progress, mini, onClick }: { label?: string; sub?: string; progress: number; mini?: boolean; onClick?: () => void }) {
  const C = 2 * Math.PI * 118;
  return (
    <button className={`core ${mini ? "mini" : ""}`} onClick={onClick} disabled={!onClick} aria-label={`${label ?? ""} ${sub ?? ""}`.trim()}>
      <svg viewBox="0 0 280 280" aria-hidden="true">
        <circle className="ring r1" cx="140" cy="140" r="134" />
        <circle className="ring r2" cx="140" cy="140" r="104" />
        <circle className="ring r3" cx="140" cy="140" r="84" />
        <circle className="arc-bg" cx="140" cy="140" r="118" />
        <circle className="arc" cx="140" cy="140" r="118" strokeDasharray={C} strokeDashoffset={C * (1 - progress)} />
      </svg>
      {!mini && <span className="core-text"><small>{sub}</small><strong>{label}</strong></span>}
      {mini && <span className="core-text"><strong>{sub}</strong></span>}
    </button>
  );
}
