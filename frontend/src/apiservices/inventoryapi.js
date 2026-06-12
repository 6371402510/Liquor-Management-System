const API_BASE = import.meta.env.VITE_API_BASE

export const getProducts = async (companyId = null) => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)

  const url = `${API_BASE}/products/?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to fetch products')
  return res.json()
}

export const createProduct = async (productData) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/products/`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(productData),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to create product')
  return data
}

export const updateProduct = async (id, productData) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(productData),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to update product')
  return data
}

export const deleteProduct = async (id) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to delete product')
  return true
}

// ─── UPDATED: Now accepts companyId parameter ───
export const searchProducts = async (query, companyId = null) => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  params.append('q', query)
  if (companyId) params.append('company_id', companyId)

  const res = await fetch(
    `${API_BASE}/products/search/?${params.toString()}`,
    {
      method: 'GET',
      headers: {
        accept: 'application/json',
        Authorization: `Bearer ${token}`,
      },
    }
  )

  if (!res.ok) throw new Error('Failed to search products')
  return res.json()
}

export const getProductById = async (id) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/products/${id}`, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to fetch product')
  return res.json()
}