const API_BASE = import.meta.env.VITE_API_BASE

export const getPurchases = async (companyId = null, skip = 0, limit = 100000) => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)
  params.append('skip', skip)
  params.append('limit', limit)

  const url = `${API_BASE}/purchases/?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to fetch purchases')
  return res.json()
}


export const createPurchase = async (purchaseData) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/purchases/`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(purchaseData),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save purchase')
  return data
}

export const getPurchaseItems = async (purchaseId) => {
  const token = localStorage.getItem('token')

  const res = await fetch(
    `${API_BASE}/purchases/${purchaseId}/items`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!res.ok) throw new Error('Failed to fetch purchase items')
  return res.json()
}

// Add this function to your existing purchasesapi.js

export async function updatePurchase(purchaseId, payload) {
  const token = localStorage.getItem('token')
  const res = await fetch(`${API_BASE}/purchases/${purchaseId}`, {  // ← FIXED: was API_BASE_URL
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Failed to update purchase')
  }
  return res.json()
}


// ─── CHECK INVOICE NUMBER EXISTS ───
export const checkInvoiceExists = async (invoiceNumber, companyId, excludePurchaseId = null) => {
  const token = localStorage.getItem('token')
  
  const params = new URLSearchParams()
  params.append('invoice_number', invoiceNumber)
  params.append('company_id', companyId)
  if (excludePurchaseId) params.append('exclude_purchase_id', excludePurchaseId)
  
  const url = `${API_BASE}/purchases/check-invoice/?${params.toString()}`
  
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  
  if (!res.ok) throw new Error('Failed to check invoice')
  const data = await res.json()
  return data.exists
}



export const getPurchasesReportData = async (companyId, dateFrom, dateTo) => {
  const token = localStorage.getItem('token')
  const params = new URLSearchParams()
  params.append('company_id', companyId)
  if (dateFrom) params.append('date_from', dateFrom)
  if (dateTo) params.append('date_to', dateTo)

  const res = await fetch(`${API_BASE}/purchases/report-data/?${params.toString()}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })
  if (!res.ok) throw new Error('Failed to fetch purchase report data')
  return res.json()
}
