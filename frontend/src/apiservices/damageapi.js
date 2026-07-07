// src/apiservices/damageapi.js

const API_BASE = import.meta.env.VITE_API_BASE

export const getDamages = async (companyId = null) => {
  const token = localStorage.getItem('token')

  const params = new URLSearchParams()
  if (companyId) params.append('company_id', companyId)

  const url = `${API_BASE}/damages/?${params.toString()}`

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to fetch damage records')
  return res.json()
}

export const createDamageRecord = async (damageData, imageFile = null) => {
  const token = localStorage.getItem('token')

  // If there is an image, use FormData
  if (imageFile) {
    const formData = new FormData();
    
    // Append all text fields to formData
    Object.keys(damageData).forEach(key => {
      if (damageData[key] !== null && damageData[key] !== undefined) {
        formData.append(key, damageData[key]);
      }
    });
    
    // Append the image file
    formData.append('image', imageFile);

    const res = await fetch(`${API_BASE}/damages/`, {
      method: 'POST',
      headers: {
        // DO NOT set 'Content-Type': 'application/json' here!
        // The browser sets it automatically with the correct boundary for FormData
        Authorization: `Bearer ${token}`,
      },
      body: formData,
    });

    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Failed to create damage record')
    return data
  }

  // Fallback to standard JSON if no image
  const res = await fetch(`${API_BASE}/damages/`, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(damageData),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to create damage record')
  return data
}
export const updateDamageRecord = async (id, damageData) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/damages/${id}`, {
    method: 'PUT',
    headers: {
      accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(damageData),
  })

  const data = await res.json()
  if (!res.ok) throw new Error(data.detail || 'Failed to update damage record')
  return data
}

export const deleteDamageRecord = async (id) => {
  const token = localStorage.getItem('token')

  const res = await fetch(`${API_BASE}/damages/${id}`, {
    method: 'DELETE',
    headers: {
      accept: 'application/json',
      Authorization: `Bearer ${token}`,
    },
  })

  if (!res.ok) throw new Error('Failed to delete damage record')
  return true
}