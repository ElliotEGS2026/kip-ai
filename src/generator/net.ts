/** fetch with timeout and an error message that names the host (undici's default is just "fetch failed"). */
export async function fetchT(url: string, init: RequestInit = {}, ms = 10000): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(ms), headers: { "User-Agent": "Kip/0.1 (personal briefing)", ...init.headers } });
  } catch (e) {
    const cause = (e as { cause?: { code?: string } }).cause?.code ?? ((e as Error).name === "TimeoutError" ? "timeout" : "network error");
    throw new Error(`could not reach ${new URL(url).hostname} (${cause})`);
  }
}

/** A link counts as working if the server answers and it isn't 404/410/5xx (403/405 = bot blocking, page exists). */
export async function linkAlive(url: string): Promise<boolean> {
  for (const method of ["HEAD", "GET"]) {
    try {
      const r = await fetchT(url, { method, redirect: "follow" }, 8000);
      if (r.status < 500 && r.status !== 404 && r.status !== 410) return true;
      if (method === "GET") return false;
    } catch { if (method === "GET") return false; }
  }
  return false;
}
