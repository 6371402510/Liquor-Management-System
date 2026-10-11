const API_BASE = import.meta.env.VITE_API_BASE

export const getPosProducts = async (companyId = null, search = '') => {
  const token = localStorage.getItem('token')
  const params = new URLSearchParams()
  if (search) params.append('search', search)
  if (companyId) params.append('company_id', companyId)

  const res = await fetch(
    `${API_BASE}/sales/pos-products/?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )
  if (!res.ok) throw new Error('Failed to fetch POS products')
  return res.json()
}

export const processCheckout = async (saleData) => {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/sales/`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(saleData),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Checkout failed')
  return data
}

export const getCounterSales = async (
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
    `${API_BASE}/sales/?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )
  if (!res.ok) throw new Error('Failed to fetch counter sales')
  return res.json()
}

// ═══════════════════════════════════════════════════════════════
// NEW: Update an existing counter sale
// ═══════════════════════════════════════════════════════════════
export const updateSale = async (saleId, saleData) => {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/sales/${saleId}`, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(saleData),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to update sale')
  return data
}

export const updateProductMrp = async (productId, companyId, newMrp) => {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/sales/update-mrp`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      product_id: productId,
      company_id: companyId,
      new_mrp: newMrp,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to update MRP')
  return data
}


export const extractSaleItems = (sale) =>
  sale?.items || sale?.sale_items || sale?.lines || []

export const deleteSale = async (saleId) => {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/sales/${saleId}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to delete sale')
  return data
}