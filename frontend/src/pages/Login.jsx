import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wine, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Sun, Moon } from 'lucide-react'
import vichaarLogo from "../assets/vichaar.png";

export default function Login() {
  const [mode, setMode] = useState('login') // 'login' | 'signup'
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const { signIn, signUp } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const [daysLeft, setDaysLeft] = useState(365)

  useEffect(() => {
  const startDate = new Date("2026-06-19") // starting date

  const updateCountdown = () => {
    const today = new Date()

    const diffTime = today - startDate
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    // 365 -> 364 -> ... -> 0 -> -1 -> -2
    setDaysLeft(365 - diffDays)
  }

  updateCountdown()

  const timer = setInterval(updateCountdown, 86400000) // every day

  return () => clearInterval(timer)
}, [])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error, data } = await signIn(email, password)

        if (error) {
          setError(error.message)
        } else if (data) {
          const role = data.role?.toUpperCase() // Safe uppercase comparison

          // ─── ROLE BASED REDIRECTION ───
          if (role === 'ADMIN') {
            // Admin goes to the main Owner Dashboard
            navigate('/admin-dashboard')
          } else if (role === 'MANAGER') {
            // ✅ Manager goes directly to their assigned company dashboard
            if (data.company_id) {
              navigate(`/dashboard/${data.company_id}`)
            } else {
              setError("Your account is not assigned to any store.")
            }
          } else if (role === 'SALESMAN') {
            // Salesman goes to POS screen of their assigned store
            if (data.company_id) {
              navigate(`/pos`)
            } else {
              setError("Your account is not assigned to any store.")
            }
          } else {
            navigate('/')
          }
        }
      } else {
        // ─── SIGNUP (Creates Admin Account) ───
        const { error, message } = await signUp(name, email, password)
        if (error) {
          setError(error.message)
        } else {
          setSuccess(message || 'Admin account created! You can now sign in.')
          setMode('login')
          setPassword('')
          setName('')
        }
      }
    } catch (err) {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  const switchMode = () => {
    setMode(m => m === 'login' ? 'signup' : 'login')
    setError('')
    setSuccess('')
  }

  return (
    <div className="min-h-screen flex bg-gray-50 dark:bg-gray-950">
      {/* Left panel - branding */}
      <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 flex-col items-center justify-center p-12 overflow-hidden">
        <div className="absolute inset-0 opacity-10">
          <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-amber-500 blur-3xl" />
          <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-blue-600 blur-3xl" />
        </div>

        <div className="relative z-10 text-center">
         <div className="w-[100px] h-[100px] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-amber-500/0 overflow-hidden">
            <img
              src={vichaarLogo}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          <h1 className="text-4xl font-bold text-green-500 mb-3">
  VICHAAR <span className="text-yellow-400">BEVTRAC</span>
</h1>

<p className="text-lg italic font-semibold bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-500 bg-clip-text text-transparent">
  SMART INVENTORY & ACCOUNTING SOFTWARE
</p>

<p className="text-lg font-medium bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
  EXCLUSIVELY FOR ODISHA IMFL OFF SHOPS
</p>

<p className="text-lg font-semibold bg-gradient-to-r from-green-400 via-emerald-400 to-lime-400 bg-clip-text text-transparent mb-10">
  MANAGE | MONITOR | GROW YOUR BUSINESS
</p>

          <div className="grid grid-cols-2 gap-4 text-left">
            {[
              { label: 'POS Billing', desc: 'Fast checkout with barcode' },
              { label: 'Invoices', desc: 'Compliant tax invoices' },
              { label: 'Inventory Management', desc: 'Real-time stock tracking' },
              { label: 'Purchase Management', desc: 'Detailed sales analytics' },
              { label: 'Management Dashboard', desc: 'Daily sales analytics' },
              { label: 'Employee Management', desc: 'Manage staff and permissions' },
            ].map(f => (
              <div key={f.label} className="bg-white/5 rounded-xl p-4 border border-white/10">
                <p className="text-white font-medium text-sm">{f.label}</p>
                <p className="text-gray-400 text-xs mt-0.5">{f.desc}</p>
              </div>
            ))}
          </div>
<div className="mt-6 px-14 py-1 rounded-xl bg-white/10 border border-white/20 text-center flex ">
  <p className="text-gray-300 pt-2 text-sm">
    Software License
  </p>

  <p className={`text-2xl font-bold   px-4 ${
    daysLeft < 0 
      ? "text-red-400" 
      : "text-yellow-400"
  }`}>
    {daysLeft}
  </p>

  <p className="text-white pt-2 text-sm">
    {daysLeft < 0 
      ? "Days Expired" 
      : "Days Remaining"}
  </p>
</div>
<p  className="text-left mt-[10px] text-white">Devloped & Marketed By : </p>
<div className="mt-3 px-6 py-4 rounded-xl bg-white/10 border border-white/20 text-center">
  
  
  <p  className="text-[20px] text-green-500">VICHAARLAB </p>
  <p className="mt-[2px] text-white">
  Support: <span className="text-[#EA4335]">support@vichaarlab.com</span>
</p>
  <p  className="mt-[2px] text-white ">Help Line: <span className="text-yellow-400">0674 3185541, 90909 72227</span></p>
  <p  className="mt-[2px] text-white "> Adress:  <span className=" font-semibold bg-gradient-to-r from-green-400 via-emerald-400 to-lime-400 bg-clip-text text-transparent mb-10">Nanadan Vihar, Patia, Bhubaneswar-24</span></p>



</div>
          
        </div>
      </div>

      {/* Right panel - form */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
        <div className="absolute top-4 right-4">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
          </button>
        </div>

        <div className="w-full max-w-sm">
          <div className="flex justify-center mb-8 lg:hidden">
            <div className="w-[100px] h-[100px] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl shadow-amber-500/0 overflow-hidden">
            <img
              src={vichaarLogo}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
            {mode === 'login' ? 'Welcome back' : 'Create Admin Account'}
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
            {mode === 'login' ? 'Sign in to your store account' : 'Register your business account'}
          </p>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 mb-5">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 mb-5">
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="John Doe"
                  className="input-field"
                />
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Email address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="admin@store.com"
                className="input-field"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1.5">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  minLength={6}
                  className="input-field pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full justify-center py-2.5 mt-2"
            >
              {loading && <Loader2 className="w-4 h-4 animate-spin" />}
              {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Admin Account'}
            </button>
          </form>

          <p className="mt-5 text-center text-sm text-gray-500 dark:text-gray-400">
            {mode === 'login' ? "Don't have an account? " : 'Already have an account? '}
            <button
              onClick={switchMode}
              className="text-primary-600 dark:text-primary-400 font-medium hover:underline"
            >
              {mode === 'login' ? 'Create one' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}