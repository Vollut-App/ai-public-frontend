const STORAGE_KEY = 'admin_access_key'

export function getAdminKey() {
  try {
    return localStorage.getItem(STORAGE_KEY) || ''
  } catch {
    return ''
  }
}

export function setAdminKey(key) {
  try {
    if (!key) localStorage.removeItem(STORAGE_KEY)
    else localStorage.setItem(STORAGE_KEY, key)
  } catch {
    // ignore
  }
}

export function withAdminKeyHeaders(headers = {}) {
  const key = getAdminKey()
  if (!key) return headers
  return { ...headers, 'X-Admin-Key': key }
}


