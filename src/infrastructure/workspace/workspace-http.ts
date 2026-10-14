export function workspaceHeaders(source?: Headers): Headers {
  const headers = new Headers(source);
  headers.set("cache-control", "private, no-store, max-age=0");
  headers.set("pragma", "no-cache");
  headers.set("expires", "0");
  headers.set("vary", "Cookie, Origin");
  return headers;
}

export function trustedWorkspaceMutation(request: Request, appOrigin: string | undefined): boolean {
  try {
    if (!appOrigin || request.method !== "POST") return false;
    const origin = new URL(appOrigin);
    return ["https:", "http:"].includes(origin.protocol)
      // Match the configured public origin, as other mutation routes do.
      // Next's request URL can contain an internal proxy/localhost hostname.
      && origin.origin === appOrigin
      && request.headers.get("origin") === appOrigin
      && [null, "same-origin"].includes(request.headers.get("sec-fetch-site"));
  } catch { return false; }
}
