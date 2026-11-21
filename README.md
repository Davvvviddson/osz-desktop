# OSz Personal Proxy (Cloudflare Workers)

This is an **optional, self-hosted compatibility proxy** for the OSz Browser. Cloudflare's Workers Free plan currently includes 100,000 requests/day, subject to CPU and other plan limits. This is not a shared public proxy: deploy your own Worker and keep your access token private.

## Deploy for free

1. Create a free Cloudflare account and install Node.js on a computer.
2. In a terminal, run `npm install -g wrangler`.
3. From this `proxy` folder, run `wrangler login`.
4. Set a long random access token: `wrangler secret put PX_ACCESS_TOKEN` and paste the token when prompted.
5. Deploy: `wrangler deploy`.
6. Copy the Worker URL shown by Wrangler (usually `https://osz-personal-proxy.<account>.workers.dev`).
7. In OSz, open Browser → Proxy setup. Paste the Worker URL and the same token, then save.
8. Choose Proxy mode and enter a website address.

The included `wrangler.toml` is the deployment configuration. Do not publish your token or commit it into source code.

## What it can and cannot do

- Fetches public HTTP/HTTPS pages through your Worker and removes selected anti-embedding response headers so the returned page can render in the OSz frame.
- Rewrites ordinary HTML links and form destinations to continue through the Worker. Static assets generally load directly from their original host.
- Preview mode can retrieve a page title, description, and Open Graph image when the Worker is configured.
- This starter implementation supports GET and HEAD only. Sites requiring POST-heavy flows, complex cookies, service workers, WebSockets, DRM, protected streaming, or strict origin-bound JavaScript may fail.
- It does not bypass authentication, paywalls, DRM, CAPTCHAs, or access controls. Respect each website's terms and permissions.
- Removing frame/security headers changes the way the site is presented in your personal browser. Use only for sites you are authorized to access and embed.

## Security notes

The Worker requires `PX_ACCESS_TOKEN`, rejects requests without the matching token, and blocks common localhost/private-network targets. Treat this as a personal tool, not a public proxy service. Rotate the token if it is exposed. Cloudflare's free limits can change; check the official limits before relying on it for heavy use.
