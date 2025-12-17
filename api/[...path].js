export const config = {
  api: {
    bodyParser: false, // we must stream uploads (multipart) through
  },
};

export default async function handler(req, res) {
  // Handle CORS preflight at the edge (prevents upstream 405 on OPTIONS).
  if (req.method === "OPTIONS") {
    const origin = req.headers.origin || "*";
    res.statusCode = 200;
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      req.headers["access-control-request-headers"] || "content-type,x-admin-key"
    );
    res.end();
    return;
  }

  const vmIp = process.env.VM_IP;
  const secret = process.env.PROXY_SHARED_SECRET;

  if (!vmIp || !secret) {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Proxy is not configured (missing VM_IP or PROXY_SHARED_SECRET)" }));
    return;
  }

  // Join path segments (Vercel gives [...path] as array)
  const parts = req.query?.path;
  const joined = Array.isArray(parts) ? parts.join("/") : (parts || "");

  // Preserve query string (?a=b) from original request URL
  const originalUrl = req.url || "";
  const qsIdx = originalUrl.indexOf("?");
  const qs = qsIdx >= 0 ? originalUrl.slice(qsIdx) : "";

  const targetUrl = `http://${vmIp}:5002/${joined}${qs}`;

  // Forward almost all headers, but enforce our secret and avoid host mismatches.
  const headers = { ...req.headers };
  delete headers.host;
  delete headers["content-length"]; // let fetch compute it when possible
  headers["x-proxy-secret"] = secret;

  try {
    const upstream = await fetch(targetUrl, {
      method: req.method,
      headers,
      // Stream the request body through (needed for multipart uploads)
      body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
      // Node.js fetch requires duplex when streaming a request body
      duplex: "half",
    });

    res.statusCode = upstream.status;

    // Copy response headers (skip some hop-by-hop headers)
    upstream.headers.forEach((value, key) => {
      const k = key.toLowerCase();
      if (k === "transfer-encoding" || k === "connection" || k === "content-encoding") return;
      res.setHeader(key, value);
    });

    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (e) {
    res.statusCode = 502;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "Upstream request failed", detail: String(e) }));
  }
}


