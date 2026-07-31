import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { Wine, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { Sun, Moon } from 'lucide-react'
import clsx from 'clsx'
import vichaarLogo from "../assets/vichaar.png"

// ─── License API ───────────────────────────────────────────
import {
  getLicenseStatus,
  initializeLicense,
  activateLicense,
} from '../apiservices/license'

// ─── Helpers ───────────────────────────────────────────────
const fmtDate = (d) => {
  try {
    return new Date(d + 'T00:00:00').toLocaleDateString('en-IN', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  } catch { return d }
}

const calcDaysLeft = (endDateStr) => {
  if (!endDateStr) return null
  const end = new Date(endDateStr + 'T00:00:00')
  const today = new Date(); today.setHours(0, 0, 0, 0)
  return Math.ceil((end - today) / 86400000)
}

// ═══════════════════════════════════════════════════════════
export default function Login() {
  const [mode, setMode] = useState('login')
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

  // ─── License state ──────────────────────────────────────
  const [license, setLicense] = useState(null)
  const [licenseLoading, setLicenseLoading] = useState(true)
  const [daysLeft, setDaysLeft] = useState(null)

  // ─── Activation modal state ─────────────────────────────
  const [showActivateModal, setShowActivateModal] = useState(false)
  const [licenseKey, setLicenseKey] = useState('')
  const [activating, setActivating] = useState(false)
  const [activateError, setActivateError] = useState('')
  const [activateSuccess, setActivateSuccess] = useState('')

  // ─── Fetch license on mount ─────────────────────────────
  const fetchLicense = useCallback(async () => {
    setLicenseLoading(true)
    try {
      const data = await getLicenseStatus()
      setLicense(data)
      setDaysLeft(calcDaysLeft(data?.end_date))
    } catch {
      setLicense(null)
      setDaysLeft(null)
    } finally {
      setLicenseLoading(false)
    }
  }, [])

  useEffect(() => { fetchLicense() }, [fetchLicense])

  // ─── Re-calc days every hour ────────────────────────────
  useEffect(() => {
    if (daysLeft === null) return
    const t = setInterval(() => {
      setDaysLeft(calcDaysLeft(license?.end_date))
    }, 3600000)
    return () => clearInterval(t)
  }, [license, daysLeft])

  // ─── Derived flags ──────────────────────────────────────
  const isExpired = daysLeft !== null && daysLeft < 0
  const isWarning = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7
  const isTrial = license?.token?.startsWith('TRIAL')

  // ─── Activate handler ───────────────────────────────────
  const handleActivate = async () => {
    const key = licenseKey.trim()
    if (!key) return
    setActivating(true)
    setActivateError('')
    setActivateSuccess('')
    try {
      const result = await activateLicense(key)
      setActivateSuccess(
        `License activated! Valid until ${fmtDate(result.end_date)}`
      )
      setLicenseKey('')
      setTimeout(() => {
        fetchLicense()
        setShowActivateModal(false)
      }, 1800)
    } catch (err) {
      setActivateError(err.message || 'Activation failed. Check your key.')
    } finally {
      setActivating(false)
    }
  }

  // ─── Manual trial init (fallback if signup init failed) ─
  const handleInitTrial = async () => {
    setLicenseLoading(true)
    try {
      await initializeLicense()
      await fetchLicense()
    } catch (err) {
      setError(err.message || 'Failed to initialize trial')
    } finally {
      setLicenseLoading(false)
    }
  }

  // ─── Form submit ────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)

    try {
      if (mode === 'login') {
        // Block login if license is expired
        if (isExpired) {
          setError(
            'Your software license has expired. Please activate a new license to continue.'
          )
          setLoading(false)
          return
        }

        const { error, data } = await signIn(email, password)

        if (error) {
          setError(error.message)
        } else if (data) {
          const role = data.role?.toUpperCase()

          if (role === 'ADMIN') {
            navigate('/admin-dashboard')
          } else if (role === 'MANAGER') {
            data.company_id
              ? navigate(`/dashboard/${data.company_id}`)
              : setError('Your account is not assigned to any store.')
          } else if (role === 'SALESMAN') {
            data.company_id
              ? navigate('/pos')
              : setError('Your account is not assigned to any store.')
          } else {
            navigate('/')
          }
        }
      } else {
        // ─── SIGNUP ────────────────────────────────────────
        const { error, message } = await signUp(name, email, password)
        if (error) {
          setError(error.message)
        } else {
          // Initialize 7-day trial license after admin creation
          try {
            await initializeLicense()
          } catch (err) {
            console.warn('[Login] Trial init after signup failed:', err)
          }
          setSuccess(message || 'Admin account created! You can now sign in.')
          setMode('login')
          setPassword('')
          setName('')
          fetchLicense() // refresh so the trial days show immediately
        }
      }
    } catch {
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

  // ─── Open activation modal ──────────────────────────────
  const openActivateModal = () => {
    setActivateError('')
    setActivateSuccess('')
    setLicenseKey('')
    setShowActivateModal(true)
  }

  // ═══════════════════════════════════════════════════════════
  //  RENDER
  // ═══════════════════════════════════════════════════════════
  return (
    <>
      <div className="min-h-screen flex bg-gray-50 dark:bg-gray-950">

        {/* ════════════ LEFT PANEL — Branding ════════════ */}
        <div className="hidden lg:flex lg:w-1/2 relative bg-gray-900 flex-col items-center justify-center p-12 overflow-hidden">
          {/* Background blobs */}
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-20 left-20 w-72 h-72 rounded-full bg-amber-500 blur-3xl" />
            <div className="absolute bottom-20 right-20 w-96 h-96 rounded-full bg-blue-600 blur-3xl" />
          </div>

          <div className="relative z-10 text-center w-full max-w-md">
            {/* Logo */}
            <div className="w-[100px] h-[100px] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-2xl overflow-hidden">
              <img src={vichaarLogo} alt="Vichaar" className="w-full h-full object-cover" />
            </div>

            {/* Title */}
            <h1 className="text-4xl font-bold text-green-500 mb-3">
              VICHAAR <span className="text-yellow-400">BEVTRAC</span>
            </h1>
            <p className="text-lg italic font-semibold bg-gradient-to-r from-yellow-400 via-orange-400 to-pink-500 bg-clip-text text-transparent">
              SMART INVENTORY &amp; ACCOUNTING SOFTWARE
            </p>
            <p className="text-lg font-medium bg-gradient-to-r from-cyan-400 via-blue-400 to-purple-500 bg-clip-text text-transparent">
              EXCLUSIVELY FOR ODISHA IMFL OFF SHOPS
            </p>
            <p className="text-lg font-semibold bg-gradient-to-r from-green-400 via-emerald-400 to-lime-400 bg-clip-text text-transparent mb-10">
              MANAGE | MONITOR | GROW YOUR BUSINESS
            </p>

            {/* Feature grid */}
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

            {/* ─── LICENSE SECTION ──────────────────────────── */}
            <div className="mt-6 rounded-xl bg-white/10 border border-white/20 overflow-hidden">
              {licenseLoading ? (
                <div className="flex items-center justify-center gap-2 px-6 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-yellow-400" />
                  <p className="text-gray-300 text-sm">Checking license…</p>
                </div>
              ) : license ? (
                <div className="px-5 py-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-gray-300 text-sm">Software License</p>
                    {isTrial && (
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400 font-bold tracking-wider">
                        TRIAL
                      </span>
                    )}
                  </div>

                  <div className="flex items-end justify-center gap-2 mb-1">
                    <span
                      className={clsx(
                        'text-4xl font-extrabold leading-none',
                        isExpired
                          ? 'text-red-400'
                          : isWarning
                            ? 'text-orange-400'
                            : 'text-yellow-400'
                      )}
                    >
                      {Math.abs(daysLeft)}
                    </span>
                    {isExpired && (
                      <span className="text-red-400/60 text-sm font-semibold mb-1">−</span>
                    )}
                  </div>

                  <p
                    className={clsx(
                      'text-sm font-medium',
                      isExpired
                        ? 'text-red-400'
                        : isWarning
                          ? 'text-orange-300'
                          : daysLeft === 0
                            ? 'text-red-300'
                            : 'text-white'
                    )}
                  >
                    {isExpired
                      ? 'Days Expired'
                      : daysLeft === 0
                        ? 'Expires Today!'
                        : 'Days Remaining'}
                  </p>

                  {license.start_date && license.end_date && (
                    <p className="text-gray-500 text-[10px] mt-1.5 tracking-wide">
                      {fmtDate(license.start_date)} — {fmtDate(license.end_date)}
                    </p>
                  )}
                </div>
              ) : (
                <div className="px-5 py-4 text-center">
                  <p className="text-gray-300 text-sm">Software License</p>
                  <p className="text-gray-500 text-xs mt-1">No active license found</p>
                </div>
              )}
            </div>

            {/* ─── ACTIVATE / INIT BUTTON ───────────────────── */}
            {license ? (
              <button
                onClick={openActivateModal}
                className={clsx(
                  'mt-3 w-full py-2.5 rounded-xl text-sm font-semibold transition-all',
                  isExpired
                    ? 'bg-red-500/20 border border-red-400/50 text-red-300 hover:bg-red-500/30 animate-pulse'
                    : 'bg-white/5 border border-white/10 text-gray-400 hover:bg-white/10 hover:text-white'
                )}
              >
                {isExpired
                  ? '⚠  Activate License to Continue'
                  : '🔑  Activate License Key'}
              </button>
            ) : !licenseLoading ? (
              <button
                onClick={handleInitTrial}
                className="mt-3 w-full py-2.5 rounded-xl bg-amber-500/20 border border-amber-400/40 text-amber-300 text-sm font-semibold hover:bg-amber-500/30 transition-all"
              >
                🚀  Initialize Trial License
              </button>
            ) : null}

            {/* ─── Developer info ───────────────────────────── */}
            <p className="text-left mt-5 text-white text-sm">Developed &amp; Marketed By:</p>
            <div className="mt-2 px-6 py-4 rounded-xl bg-white/10 border border-white/20 text-center">
              <p className="text-[20px] text-green-500 font-bold">VICHAARLAB</p>
              <p className="mt-1 text-white text-sm">
                Support: <span className="text-[#EA4335]">support@vichaarlab.com</span>
              </p>
              <p className="mt-1 text-white text-sm">
                Help Line: <span className="text-yellow-400">0674 3185541, 90909 72227</span>
              </p>
              <p className="mt-1 text-white text-sm">
                Address:{' '}
                <span className="font-semibold bg-gradient-to-r from-green-400 via-emerald-400 to-lime-400 bg-clip-text text-transparent">
                  Nandan Vihar, Patia, Bhubaneswar-24
                </span>
              </p>
            </div>
          </div>
        </div>

        {/* ════════════ RIGHT PANEL — Form ════════════ */}
        <div className="flex-1 flex flex-col items-center justify-center p-6 lg:p-12">
          {/* Theme toggle */}
          <div className="absolute top-4 right-4">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </button>
          </div>

          <div className="w-full max-w-sm">
            {/* Mobile logo */}
            <div className="flex justify-center mb-8 lg:hidden">
              <div className="w-[100px] h-[100px] rounded-2xl overflow-hidden">
                <img src={vichaarLogo} alt="Vichaar" className="w-full h-full object-cover" />
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
              {mode === 'login' ? 'Welcome back' : 'Create Admin Account'}
            </h2>
            <p className="text-gray-500 dark:text-gray-400 text-sm mb-8">
              {mode === 'login'
                ? 'Sign in to your store account'
                : 'Register your business account'}
            </p>

            {/* ── License expired banner (right panel) ── */}
            {isExpired && !licenseLoading && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 mb-5">
                <AlertCircle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-600 dark:text-red-400">
                    License Expired
                  </p>
                  <p className="text-xs text-red-500 dark:text-red-400 mt-0.5">
                    Your software license expired {Math.abs(daysLeft)} day(s) ago. Please
                    activate a valid license key to continue.
                  </p>
                  <button
                    onClick={openActivateModal}
                    className="mt-2 text-xs font-semibold text-red-700 dark:text-red-300 underline underline-offset-2 hover:no-underline"
                  >
                    Activate License →
                  </button>
                </div>
              </div>
            )}

            {/* ── License warning banner (≤ 7 days) ── */}
            {isWarning && !isExpired && !licenseLoading && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-5">
                <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                    License Expiring Soon
                  </p>
                  <p className="text-xs text-amber-500 dark:text-amber-400 mt-0.5">
                    {daysLeft === 0
                      ? 'Your license expires today!'
                      : `Only ${daysLeft} day(s) remaining.`}{' '}
                    Activate a new key to avoid disruption.
                  </p>
                  <button
                    onClick={openActivateModal}
                    className="mt-2 text-xs font-semibold text-amber-700 dark:text-amber-300 underline underline-offset-2 hover:no-underline"
                  >
                    Activate License →
                  </button>
                </div>
              </div>
            )}

            {/* ── Mobile: compact license bar ── */}
            <div className="lg:hidden mb-5">
              {!licenseLoading && license && (
                <div
                  className={clsx(
                    'flex items-center justify-between px-3 py-2 rounded-lg border text-xs font-medium',
                    isExpired
                      ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
                      : isWarning
                        ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400'
                        : 'bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  )}
                >
                  <span>
                    {isTrial ? 'Trial · ' : 'License · '}
                    {isExpired
                      ? `Expired ${Math.abs(daysLeft)}d ago`
                      : daysLeft === 0
                        ? 'Expires today'
                        : `${daysLeft}d left`}
                  </span>
                  <button
                    onClick={openActivateModal}
                    className="font-semibold underline underline-offset-2"
                  >
                    Activate
                  </button>
                </div>
              )}
            </div>

            {/* ── Error ── */}
            {error && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 mb-5">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* ── Success ── */}
            {success && (
              <div className="flex items-center gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800 mb-5">
                <p className="text-sm text-emerald-600 dark:text-emerald-400">{success}</p>
              </div>
            )}

            {/* ── Form ── */}
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
                disabled={loading || isExpired}
                className={clsx(
                  'btn-primary w-full justify-center py-2.5 mt-2',
                  isExpired && 'opacity-40 cursor-not-allowed'
                )}
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                {loading
                  ? 'Please wait…'
                  : mode === 'login'
                    ? isExpired
                      ? 'License Expired — Cannot Sign In'
                      : 'Sign In'
                    : 'Create Admin Account'}
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

      {/* ═══════════════════════════════════════════════════════
          ACTIVATION MODAL — fixed overlay, outside the flex
          ═══════════════════════════════════════════════════════ */}
      {showActivateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-0.5">Activate License</h3>
            <p className="text-gray-400 text-xs mb-5">
              Enter your license key to activate or extend your subscription.
            </p>

            {activateError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-900/30 border border-red-800/50 mb-4">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
                <p className="text-xs text-red-400">{activateError}</p>
              </div>
            )}

            {activateSuccess && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-900/30 border border-emerald-800/50 mb-4">
                <span className="text-emerald-400 text-sm">✓</span>
                <p className="text-xs text-emerald-400">{activateSuccess}</p>
              </div>
            )}

            <div className="mb-5">
              <label className="block text-xs font-medium text-gray-400 mb-1.5">
                License Key
              </label>
              <input
                type="text"
                value={licenseKey}
                onChange={e => setLicenseKey(e.target.value.toUpperCase())}
                placeholder="XXXX-XXXX-XXXX-XXXX"
                className="w-full px-3.5 py-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder-gray-600 text-sm font-mono tracking-widest focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-colors"
                disabled={activating}
                autoFocus
              />
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setShowActivateModal(false)}
                className="flex-1 py-2.5 rounded-lg border border-white/10 text-gray-400 text-sm font-medium hover:bg-white/5 transition-colors disabled:opacity-40"
                disabled={activating}
              >
                Cancel
              </button>
              <button
                onClick={handleActivate}
                disabled={activating || !licenseKey.trim()}
                className="flex-1 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
              >
                {activating && <Loader2 className="w-4 h-4 animate-spin" />}
                {activating ? 'Activating…' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}