// apiservices/mgrapi.js
const API_BASE = import.meta.env.VITE_API_BASE

export const getMGRReport = async (companyId, date = '') => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)
  if (date) params.append('date', date)

  const res = await fetch(`${API_BASE}/mgr/report?${params.toString()}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to fetch MGR report')
  }

  return res.json()
}

export const getMGRTracking = async (companyId, date = '') => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)
  if (date) params.append('date', date)

  const res = await fetch(`${API_BASE}/mgr/tracking?${params.toString()}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}))
    throw new Error(errorData.detail || 'Failed to fetch MGR tracking')
  }

  return res.json()
}