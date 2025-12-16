export async function readJsonOrText(response) {
  const contentType = response.headers.get('content-type') || ''
  const text = await response.text()

  if (!text) {
    return { data: null, text: '' }
  }

  // Prefer JSON when server says it's JSON, but also attempt JSON parse as fallback
  if (contentType.includes('application/json')) {
    try {
      return { data: JSON.parse(text), text }
    } catch {
      return { data: null, text }
    }
  }

  try {
    return { data: JSON.parse(text), text }
  } catch {
    return { data: null, text }
  }
}


