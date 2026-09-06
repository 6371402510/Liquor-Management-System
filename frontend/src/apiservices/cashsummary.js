const API_BASE = import.meta.env.VITE_API_BASE

export const getCashSummary = async (
  companyId = null,
  selectedDate = ''
) => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()

  if (companyId) {
    params.append('company_id', companyId)
  }

  if (selectedDate) {
    params.append('selected_date', selectedDate)
  }

  const res = await fetch(
    `${API_BASE}/cash/summary?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )

  const data = await res.json()

  if (!res.ok) {
    throw new Error(
      data.detail || 'Failed to fetch cash summary'
    )
  }

  return data
}