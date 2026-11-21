/**
 * OSz personal web compatibility proxy for Cloudflare Workers.
 * Deploy your own copy. Set PX_ACCESS_TOKEN as a Worker secret.
 * This is not an anonymity service and must not be used to bypass logins,
 * DRM, paywalls, or a site's access controls.
 */
const BLOCKED_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"]);

function validateTarget(raw) {
  let target;
  try { target = new URL(raw); } catch { throw new Error("Invalid target URL"); }
  if (!["http:", "https:"].includes(target.protocol)) throw new Error("Only HTTP and HTTPS are supported");
  if (target.username || target.password) throw new Error("URLs containing credentials are blocked");
  const host = target.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (BLOCKED_HOSTS.has(host) || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new Error("Local and private network targets are blocked");
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || /^(fc|fd|fe80):/i.test(host)) throw new Error("Private IP targets are blocked");
  return target;
}

function proxyUrl(requestUrl, targetUrl) {
  const out = new URL(requestUrl);
  out.search = "";
  out.searchParams.set("url", targetUrl);
  const token = new URL(requestUrl).searchParams.get("token");
  if (token) out.searchParams.set("token", token);
  return out.toString();
}

function htmlProxyResponse(response, target, requestUrl) {
  const proxyBase = new URL(requestUrl).origin + new URL(requestUrl).pathname;
  const rewrite = (value) => {
    if (!value || value.startsWith("#") || /^(data:|javascript:|mailto:|tel:)/i.test(value)) return value;
    try {
      const absolute = new URL(value, target).href;
      return proxyUrl(requestUrl, absolute);
    } catch { return value; }
  };
  class LinkRewriter {
    element(element) {
      const href = element.getAttribute("href");
      if (href) element.setAttribute("href", rewrite(href));
      const action = element.getAttribute("action");
      if (action) element.setAttribute("action", rewrite(action));
    }
  }
  const rewriter = new HTMLRewriter()
    .on("a", new LinkRewriter())
    .on("form", new LinkRewriter())
    .on("head", { element(element) { element.prepend(`<base href="${target.href.replace(/&/g, "&amp;").replace(/"/g, "&quot;")}">`, { html: true }); } });
  const headers = new Headers(response.headers);
  headers.delete("content-security-policy");
  headers.delete("content-security-policy-report-only");
  headers.delete("x-frame-options");
  headers.delete("cross-origin-embedder-policy");
  headers.delete("cross-origin-opener-policy");
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Cache-Control", "no-store");
  return new Response(rewriter.transform(response).body, { status: response.status, statusText: response.statusText, headers });
}

function extractMeta(html, target) {
  const get = (patterns) => {
    for (const pattern of patterns) { const m = html.match(pattern); if (m?.[1]) return m[1].replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/<[^>]*>/g, "").trim(); }
    return "";
  };
  const title = get([/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)/i, /<title[^>]*>([\s\S]*?)<\/title>/i]);
  const description = get([/<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)/i, /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)/i]);
  let image = get([/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']*)/i]);
  try { if (image) image = new URL(image, target).href; } catch { image = ""; }
  return { title: title || target.hostname, description, image, url: target.href };
}

export default {
  async fetch(request, env) {
    const incoming = new URL(request.url);
    if (request.method === "GET" && incoming.pathname === "/health") return Response.json({ ok: true, service: "OSz Proxy" });
    if (!env.PX_ACCESS_TOKEN) return new Response("Proxy is not configured: set PX_ACCESS_TOKEN as a Worker secret.", { status: 503 });
    if (incoming.searchParams.get("token") !== env.PX_ACCESS_TOKEN) return new Response("Unauthorized", { status: 401 });
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Only GET and HEAD are supported by this starter proxy.", { status: 405 });
    let target;
    try { target = validateTarget(incoming.searchParams.get("url") || ""); }
    catch (error) { return new Response(error.message, { status: 400 }); }
    try {
      const upstream = await fetch(target.href, {
        method: request.method,
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (compatible; OSzPersonalBrowser/1.0)",
          "Accept": request.headers.get("Accept") || "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": request.headers.get("Accept-Language") || "en-US,en;q=0.8"
        }
      });
      if (incoming.searchParams.get("preview") === "1") {
        const type = upstream.headers.get("content-type") || "";
        if (!type.includes("text/html")) return Response.json({ title: target.hostname, description: "This destination did not return an HTML page.", image: "", url: target.href });
        const html = (await upstream.text()).slice(0, 1_000_000);
        return Response.json(extractMeta(html, target), { headers: { "Cache-Control": "no-store" } });
      }
      const type = upstream.headers.get("content-type") || "";
      if (type.includes("text/html") && request.method !== "HEAD") return htmlProxyResponse(upstream, target, request.url);
      const headers = new Headers(upstream.headers);
      headers.delete("content-security-policy"); headers.delete("content-security-policy-report-only"); headers.delete("x-frame-options");
      headers.set("Cache-Control", "no-store");
      return new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers });
    } catch (error) {
      return new Response(`Upstream request failed: ${error.message}`, { status: 502 });
    }
  }
};
