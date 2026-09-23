const API_BASE = import.meta.env.VITE_API_BASE

export const getCompanyTransfers = async (companyId = null) => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)

  const url = `${API_BASE}/company-transfers/?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to fetch company transfers')
  return res.json()
}

export const createCompanyTransfer = async (transferData) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/company-transfers/`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(transferData),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save company transfer')
  return data
}

export const getCompanyTransfer = async (transferId) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/company-transfers/${transferId}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to fetch company transfer')
  return res.json()
}

export const getCompanyTransferItems = async (transferId) => {
  const token = localStorage.getItem('token')

  const res = await fetch(
    `${API_BASE}/company-transfers/${transferId}/items`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!res.ok) throw new Error('Failed to fetch company transfer items')
  return res.json()
}