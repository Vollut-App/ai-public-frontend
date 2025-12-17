/**
 * Vercel Serverless Function proxy (single entry point).
 *
 * This exists because dynamic catch-all filenames (like api/[...path].js)
 * are not reliably routed for plain Vercel Functions in non-Next projects.
 *
 * vercel.json rewrites:
 *   /api/<anything>  ->  /api/proxy?path=<anything>
 *
 * Env vars:
 * - BACKEND_ORIGIN (e.g. http://34.88.175.10:5002)
 * - PROXY_SHARED_SECRET (optional)
 */
export default async function handler(req, res) {
  const backendOrigin = (process.env.BACKEND_ORIGIN || '').trim() || 'http://34.88.175.10:5002'
  const proxySecret = (
    process.env.PROXY_SHARED_SECRET ||
    process.env.PROXY_SECRET ||
    process.env.X_PROXY_SECRET ||
    ''
  ).trim()

  // CORS
  const origin = req.headers?.origin || '*'
  res.setHeader('access-control-allow-origin', origin)
  res.setHeader('vary', 'Origin')
  res.setHeader('access-control-allow-methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
  res.setHeader(
    'access-control-allow-headers',
    (req.headers?.['access-control-request-headers'] || 'content-type, x-admin-key').toString()
  )
  res.setHeader('access-control-max-age', '86400')
  if (String(req.method || '').toUpperCase() === 'OPTIONS') {
    res.statusCode = 204
    res.end()
    return
  }

  // Determine forward path from rewrite query parameter
  const incomingUrl = new URL(req.url, 'http://localhost')
  const pathParam = (incomingUrl.searchParams.get('path') || '').trim()
  const forwardPath = '/' + pathParam.replace(/^\/+/, '')

  const targetUrl = new URL(backendOrigin)
  targetUrl.pathname = forwardPath === '/' ? '/' : forwardPath
  // preserve original query string from the incoming request EXCEPT `path`
  incomingUrl.searchParams.delete('path')
  targetUrl.search = incomingUrl.searchParams.toString()

  // Debug headers for easy inspection in Network tab
  res.setHeader('x-proxy-target', targetUrl.toString())
  res.setHeader('x-proxy-secret-sent', proxySecret ? '1' : '0')

  // Guard against proxy loops
  try {
    const targetHost = new URL(backendOrigin).host
    const incomingHost = (req.headers?.host || '').toString()
    if (targetHost && incomingHost && targetHost === incomingHost) {
      res.statusCode = 500
      res.setHeader('content-type', 'application/json; charset=utf-8')
      res.end(
        JSON.stringify({
          error: 'Proxy misconfiguration',
          message:
            'BACKEND_ORIGIN points to the same host as this Vercel deployment, causing a proxy loop. Set BACKEND_ORIGIN to your backend server (e.g. http://<ip>:5002).',
          backend_origin: backendOrigin,
          incoming_host: incomingHost,
        })
      )
      return
    }
  } catch {
    // ignore
  }

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
    res.setHeader('x-proxy-error', 'fetch_failed')
    res.statusCode = 502
    res.setHeader('content-type', 'application/json; charset=utf-8')
    res.end(JSON.stringify({ error: 'Bad Gateway', details: String(err?.message || err) }))
    return
  }

  res.setHeader('x-proxy-upstream-status', String(upstreamResponse.status))
  res.statusCode = upstreamResponse.status
  upstreamResponse.headers.forEach((value, key) => {
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


