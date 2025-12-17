/**
 * Vercel Serverless Function proxy.
 *
 * Forwards any request from /api/* -> {BACKEND_ORIGIN}/*
 * - Preserves method/query/body (including multipart/form-data uploads)
 * - Injects X-Proxy-Secret from env var PROXY_SHARED_SECRET (if set)
 *
 * Configure on Vercel:
 * - BACKEND_ORIGIN = http://34.88.175.10:5002   (or your backend)
 * - PROXY_SHARED_SECRET = <shared secret expected by backend proxy check>
 */
export default async function handler(req, res) {
  const backendOrigin = (process.env.BACKEND_ORIGIN || '').trim() || 'http://34.88.175.10:5002'
  const proxySecret = (process.env.PROXY_SHARED_SECRET || '').trim()

  // req.url includes the full path starting with /api/...
  const incomingUrl = new URL(req.url, 'http://localhost')
  const forwardPath = incomingUrl.pathname.replace(/^\/api(?=\/|$)/, '') || '/'
  const targetUrl = new URL(backendOrigin)
  targetUrl.pathname = forwardPath
  targetUrl.search = incomingUrl.search

  const bodyBuffer = await readRawBody(req)

  const headers = sanitizeHeaders(req.headers)
  if (proxySecret) headers['x-proxy-secret'] = proxySecret

  let upstreamResponse
  try {
    upstreamResponse = await fetch(targetUrl.toString(), {
      method: req.method,
      headers,
      body: shouldHaveBody(req.method) ? bodyBuffer : undefined,
      redirect: 'manual',
    })
  } catch (err) {
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Bad Gateway', details: String(err?.message || err) }))
    return
  }

  res.statusCode = upstreamResponse.status
  upstreamResponse.headers.forEach((value, key) => {
    // Avoid setting hop-by-hop headers
    if (key.toLowerCase() === 'transfer-encoding') return
    res.setHeader(key, value)
  })

  const buf = Buffer.from(await upstreamResponse.arrayBuffer())
  res.end(buf)
}

function shouldHaveBody(method) {
  return !['GET', 'HEAD'].includes(String(method || '').toUpperCase())
}

function sanitizeHeaders(incoming) {
  const out = {}
  for (const [k, v] of Object.entries(incoming || {})) {
    if (!v) continue
    const key = String(k).toLowerCase()
    // Drop hop-by-hop / origin-specific headers
    if (
      key === 'host' ||
      key === 'connection' ||
      key === 'content-length' ||
      key === 'accept-encoding' ||
      key === 'x-forwarded-for' ||
      key === 'x-forwarded-host' ||
      key === 'x-forwarded-proto'
    ) {
      continue
    }
    out[key] = Array.isArray(v) ? v.join(',') : String(v)
  }
  return out
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    req.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}


