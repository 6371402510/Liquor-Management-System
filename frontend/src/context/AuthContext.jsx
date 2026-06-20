import { createContext, useContext, useState, useEffect } from 'react'

const AuthContext = createContext({})
const API_BASE = import.meta.env.VITE_API_BASE

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = localStorage.getItem('token')
    const userData = localStorage.getItem('user')

    if (token && userData) {
      try {
        const parsedUser = JSON.parse(userData)
        
        // ─── FIX: Fallback for Salesman/Manager missing companies array ───
        if (
          parsedUser.role !== "ADMIN" && 
          parsedUser.company_id && 
          (!parsedUser.companies || parsedUser.companies.length === 0)
        ) {
          parsedUser.companies = [{ id: parsedUser.company_id, company_name: "My Store" }]
          localStorage.setItem('user', JSON.stringify(parsedUser))
        }

        // ─── FIX: Auto-set ALL company keys on page refresh ───
        if (
          parsedUser.role !== "ADMIN" && 
          parsedUser.company_id && 
          !localStorage.getItem('selectedCompanyId')
        ) {
          const compName = parsedUser.companies?.[0]?.company_name || "My Store"
          
          localStorage.setItem('selectedCompany', JSON.stringify({ id: parsedUser.company_id, company_name: compName }))
          localStorage.setItem('selectedCompanyId', String(parsedUser.company_id)) // POS.jsx looks for this
          localStorage.setItem('selectedCompanyName', compName)                 // POS.jsx looks for this
        }

        setUser(parsedUser)
      } catch {
        localStorage.clear()
      }
    }

    setLoading(false)
  }, [])

  // LOGIN
  const signIn = async (email, password) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      })

      const data = await res.json()

      if (!res.ok) {
        return { error: { message: data.detail || 'Login failed' } }
      }

      const loggedInUser = data.user

      // ─── FIX: Fallback for Salesman/Manager missing companies array ───
      if (
        loggedInUser.role !== "ADMIN" && 
        loggedInUser.company_id && 
        (!loggedInUser.companies || loggedInUser.companies.length === 0)
      ) {
        loggedInUser.companies = [{ id: loggedInUser.company_id, company_name: "My Store" }]
      }

      // ─── FIX: Auto-set ALL company keys for Manager/Salesman ───
      if (loggedInUser.role !== "ADMIN" && loggedInUser.company_id) {
        const compName = loggedInUser.companies?.[0]?.company_name || "My Store"
        
        localStorage.setItem('selectedCompany', JSON.stringify({ id: loggedInUser.company_id, company_name: compName }))
        localStorage.setItem('selectedCompanyId', String(loggedInUser.company_id)) // POS.jsx looks for this
        localStorage.setItem('selectedCompanyName', compName)                 // POS.jsx looks for this
      }
      // Note: ADMIN does NOT get auto-set here

      localStorage.setItem('token', data.access_token)
      localStorage.setItem('user', JSON.stringify(loggedInUser))
      setUser(loggedInUser)

      return { error: null, data: loggedInUser }
    } catch (err) {
      return { error: { message: 'Network error.' } }
    }
  }

  // SIGNUP
  const signUp = async (name, email, password) => {
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: 'POST',
        headers: {
          accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name,
          email,
          password,
          role: 'ADMIN',
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        if (res.status === 422 && Array.isArray(data.detail)) {
          const messages = data.detail.map((d) => d.msg).join(', ')
          return { error: { message: messages } }
        }

        return { error: { message: data.detail || 'Registration failed' } }
      }

      return {
        error: null,
        message: data.message || 'Account created successfully!',
      }
    } catch (err) {
      return { error: { message: 'Network error.' } }
    }
  }

  // SIGNOUT
  const signOut = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('selectedCompany')
    localStorage.removeItem('selectedCompanyId')   // Clear this too
    localStorage.removeItem('selectedCompanyName')  // Clear this too
    setUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ user, loading, signIn, signUp, signOut }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)