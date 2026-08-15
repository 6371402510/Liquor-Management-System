// ═══════════════════════════════════════════════════════
// License API Service
// ═══════════════════════════════════════════════════════

// ✅ Changed from VITE_API_URL to VITE_API_BASE — matches your other API files
const API_BASE = import.meta.env.VITE_API_BASE

const headers = () => {
  const h = { 'Content-Type': 'application/json' }
  const t = localStorage.getItem('token')
  if (t) h['Authorization'] = `Bearer ${t}`
  return h
}

export const getLicenseStatus = async () => {
  try {
    const res = await fetch(`${API_BASE}/license/status`, { headers: headers() })
    if (res.status === 404) return null
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.json()
  } catch (err) {
    console.error('[License] getLicenseStatus failed:', err)
    return null
  }
}

export const initializeLicense = async () => {
  const res = await fetch(`${API_BASE}/license/initialize`, {
    method: 'POST',
    headers: headers(),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || 'Failed to initialize license')
  return body
}

export const activateLicense = async (token) => {
  const res = await fetch(`${API_BASE}/license/activate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ token }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.detail || 'Activation failed')
  return body
}