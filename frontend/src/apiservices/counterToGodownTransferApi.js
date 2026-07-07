const API_BASE = import.meta.env.VITE_API_BASE

export const getCounterToGodownTransfers = async (companyId = null) => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)

  const url = `${API_BASE}/counter-to-godown-transfers/?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to fetch transfers')
  return res.json()
}

export const createCounterToGodownTransfer = async (transferData) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/counter-to-godown-transfers/`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(transferData),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to save transfer')
  return data
}

export const getCounterToGodownTransferItems = async (transferId) => {
  const token = localStorage.getItem('token')

  const res = await fetch(
    `${API_BASE}/counter-to-godown-transfers/${transferId}/items`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!res.ok) throw new Error('Failed to fetch transfer items')
  return res.json()
}