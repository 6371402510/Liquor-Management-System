const API_BASE = import.meta.env.VITE_API_BASE

export const getGodownProducts = async (companyId = null, search = '') => {
  const token = localStorage.getItem('token')
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (companyId) params.append('company_id', companyId)

  const res = await fetch(
    `${API_BASE}/api/godown/products?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )
  if (!res.ok) throw new Error('Failed to fetch Godown products')
  return res.json()
}

export const processGodownCheckout = async (saleData) => {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/api/godown/checkout`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(saleData),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Godown checkout failed')
  return data
}

export const getGodownSales = async (
  companyId = null,
  dateFrom = '',
  dateTo = ''
) => {
  const token = localStorage.getItem('token')
  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)
  if (dateFrom) params.append('date_from', dateFrom)
  if (dateTo) params.append('date_to', dateTo)

  const res = await fetch(
    `${API_BASE}/api/godown/sales?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )
  if (!res.ok) throw new Error('Failed to fetch godown sales')
  return res.json()
}

// ═══════════════════════════════════════════════════════════════
// NEW: Update an existing godown sale
// ═══════════════════════════════════════════════════════════════
export const updateGodownSale = async (saleId, saleData) => {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/api/godown/sales/${saleId}`, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(saleData),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to update godown sale')
  return data
}