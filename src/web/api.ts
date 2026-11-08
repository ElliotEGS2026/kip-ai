const token = (): string => document.querySelector<HTMLMetaElement>('meta[name="kip-token"]')?.content ?? "";

export async function api<T>(path: string, body?: unknown): Promise<T> {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-kip-token": token(), ...(body === undefined ? {} : { "content-type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`${r.status} ${((await r.json().catch(() => ({}))) as { error?: string }).error ?? ""}`.trim());
  return (await r.json()) as T;
}

export const today = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
