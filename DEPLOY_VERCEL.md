# Vercel deploy notes (fixing 403 on `/api/*`)

This frontend is a Vite + React SPA. On Vercel:

- Static app routes should rewrite to `index.html` (handled in `vercel.json`)
- API calls from the browser go to `/api/...`
- `/api/...` is implemented as a **Vercel Serverless Function** at `api/[...path].js` which proxies requests to the backend and can inject auth headers.

## Required Vercel Environment Variables

Set these in your Vercel project settings (Production + Preview if needed):

- `BACKEND_ORIGIN`
  - Example: `http://34.88.175.10:5002`
- `PROXY_SHARED_SECRET`
  - The shared secret expected by the backend (forwarded as request header `X-Proxy-Secret`)

## Critical Vercel project setting

Make sure your Vercel project **Root Directory** is set to `ai-public-frontend/`.
If it’s set to the repo root, Vercel won’t see `ai-public-frontend/api/*` as serverless functions and `/api/...` won’t hit your proxy.

## Quick sanity checks

After redeploy:

- Open `/api/ping`
  - Expected: `{"ok":true,...}` (proves Vercel functions are running)
- Open `/api/v1/health`
  - Expected: backend health JSON (proves proxy -> backend works)

## How the proxy maps paths

Incoming:

- `/api/v1/extract`

Forwarded to backend as:

- `/v1/extract`

(It strips the leading `/api` prefix, matching the local Vite dev proxy behavior.)


