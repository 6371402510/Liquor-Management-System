import { useState, useEffect, useMemo } from 'react'
import {
  Banknote, Building2, Wallet, Plus, Trash2, TrendingUp,
  Store, Warehouse, AlertCircle, Loader as Loader2, Save,
  ChevronLeft, ChevronRight, HandCoins, CircleDollarSign,
  PiggyBank, BookOpen, Check, RefreshCw, FileDown, Edit3, Calendar,
  X, ZoomIn, Download  // ← ADD these imports
} from 'lucide-react'
import clsx from 'clsx'
import { format, subDays, addDays } from 'date-fns'
import * as XLSX from 'xlsx'
import { getCounterSales } from '../apiservices/sales-counter'
import { getGodownSales } from '../apiservices/godown-counter'
import { getExpenses } from '../apiservices/expensesapi'
import { getCashSummary } from '../apiservices/cashsummary'

// ─── LocalStorage Helpers ───
const recordsKey = (cid) => `cashRecords_${cid}`
const initBalKey = (cid) => `cashInitialBalance_${cid}`

const loadRecords = (cid) => {
  try { return JSON.parse(localStorage.getItem(recordsKey(cid))) || {} }
  catch { return {} }
}
const saveRecordsToStorage = (cid, recs) => {
  localStorage.setItem(recordsKey(cid), JSON.stringify(recs))
}
const loadInitBal = (cid) => Number(localStorage.getItem(initBalKey(cid))) || 0
const saveInitBal = (cid, val) => localStorage.setItem(initBalKey(cid), String(val))

export default function CashDeposit() {
  // ─── Company ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  // ─── Date ───
  const today = format(new Date(), 'yyyy-MM-dd')
  const [selectedDate, setSelectedDate] = useState(today)
  const [loading, setLoading] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  // ─── Cash Sales & Expenses from API ───
  const [counterCash, setCounterCash] = useState(0)
  const [godownCash, setGodownCash] = useState(0)
  const [apiExpenses, setApiExpenses] = useState([])

  // ─── Cash Summary from API ───
  const [previousCounterCash, setPreviousCounterCash] = useState(0)
  const [previousGodownCash, setPreviousGodownCash] = useState(0)
  const [previousCashExpenses, setPreviousCashExpenses] = useState(0)

  // ─── Deposit Form State ───
  const [depositMethod, setDepositMethod] = useState('bank')
  const [bankNameInput, setBankNameInput] = useState('')
  const [depositAmountInput, setDepositAmountInput] = useState('')
  const [bankSlipInput, setBankSlipInput] = useState(null)
  const [bankAccountNumberInput, setBankAccountNumberInput] = useState('')

  // ─── Persisted Records ───
  const [records, setRecords] = useState(() => loadRecords(companyId))
  const [initialBalance, setInitialBalance] = useState(() => loadInitBal(companyId))

  // ─── UI State ───
  const [saved, setSaved] = useState(false)
  const [showInitBalModal, setShowInitBalModal] = useState(false)
  const [tempInitBal, setTempInitBal] = useState('')
  const [expandedRow, setExpandedRow] = useState(null)

  // ═══════════════════════════════════════════════════════════════
  // NEW: Image Lightbox State
  // ═══════════════════════════════════════════════════════════════
  const [imageModal, setImageModal] = useState(null) // { base64, name }

  // ─── Listen for company changes ───
  useEffect(() => {
    const check = () => {
      const newId = localStorage.getItem('selectedCompanyId') || null
      if (newId !== companyId) setCompanyId(newId)
    }
    window.addEventListener('storage', check)
    const iv = setInterval(check, 1000)
    return () => { window.removeEventListener('storage', check); clearInterval(iv) }
  }, [companyId])

  useEffect(() => {
    if (!companyId) return
    setRecords(loadRecords(companyId))
    setInitialBalance(loadInitBal(companyId))
  }, [companyId])

  // ─── Fetch cash sales & expenses ───
  useEffect(() => {
    if (!companyId) return
    fetchCashData()
  }, [selectedDate, companyId])

  // ─── Close image modal on Escape key ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && imageModal) {
        setImageModal(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [imageModal])

  const fetchCashData = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true)
    try {
      const [counterData, godownData, expenseData, cashSummary] = await Promise.all([
        getCounterSales(Number(companyId), selectedDate, selectedDate),
        getGodownSales(Number(companyId), selectedDate, selectedDate),
        getExpenses(Number(companyId), selectedDate, selectedDate),
        getCashSummary(Number(companyId), selectedDate)
      ])
      setPreviousCounterCash(
        Number(cashSummary?.previous_counter_cash) || 0
      )

      setPreviousGodownCash(
        Number(cashSummary?.previous_godown_cash) || 0
      )

      setPreviousCashExpenses(
        Number(cashSummary?.previous_cash_expenses) || 0
      )
      const cc = (counterData || []).filter(s => s.payment_mode === 'CASH').reduce((s, r) => s + (r.total_amount || 0), 0)
      const gc = (godownData || []).filter(s => s.payment_mode === 'CASH').reduce((s, r) => s + (r.total_amount || 0), 0)
      setCounterCash(cc)
      setGodownCash(gc)

      const cashExps = (expenseData || [])
        .filter(e => e.payment_method === 'CASH')
        .map(e => ({
          id: e.id,
          description: e.description || e.category?.replace(/_/g, ' ') || 'Expense',
          amount: Number(e.amount) || 0,
          employee_name: e.employee_name || null
        }))
      setApiExpenses(cashExps)

    } catch (err) {
      console.error('Failed to fetch cash data', err)
      setCounterCash(0)
      setGodownCash(0)
      setApiExpenses([])

      setPreviousCounterCash(0)
      setPreviousGodownCash(0)
      setPreviousCashExpenses(0)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  // ─── Load saved record when date changes ───
  useEffect(() => {
    const rec = records[selectedDate]
    if (rec) {
      setSaved(true)
    } else {
      setSaved(false)
    }
    setExpandedRow(null)

    setDepositAmountInput('')
    setBankAccountNumberInput('')
    setDepositMethod('bank')
    setBankNameInput('')
    setBankSlipInput(null)
  }, [selectedDate, records])

  // ─── Opening Balance ───
  // const openingBalance = useMemo(() => {
  //   const sorted = Object.keys(records).sort()
  //   const earlier = sorted.filter(d => d < selectedDate)
  //   if (earlier.length === 0) return initialBalance
  //   const lastDate = earlier[earlier.length - 1]
  //   return records[lastDate]?.closingBalance ?? initialBalance
  // }, [selectedDate, records, initialBalance])

  const openingBalance = previousCounterCash + previousGodownCash - previousCashExpenses

  // ─── Derived Calculations ───
  const bankDeposits = records[selectedDate]?.bankDeposits || []
  const bankDeposit = bankDeposits.reduce((s, d) => s + d.amount, 0)
  const totalCashSale = counterCash + godownCash
  const totalExpenses = apiExpenses.reduce((s, e) => s + e.amount, 0)
  const closingBalance = openingBalance + totalCashSale - bankDeposit - totalExpenses

  // ─── File Upload Handler ───
  const handleFileUpload = (e) => {
    const file = e.target.files[0]
    if (!file) return

    if (file.size > 1048576) {
      alert("File size cannot exceed 1MB")
      e.target.value = ""
      return
    }

    const reader = new FileReader()
    reader.onloadend = () => {
      setBankSlipInput({
        name: file.name,
        base64: reader.result
      })
    }
    reader.readAsDataURL(file)
  }

  // ═══════════════════════════════════════════════════════════════
  // NEW: Download slip image
  // ═══════════════════════════════════════════════════════════════
  const handleDownloadSlip = (slip) => {
    const link = document.createElement('a')
    link.href = slip.base64
    link.download = slip.name || 'bank-slip.png'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ─── Add Deposit Entry ───
  const handleAddDeposit = () => {
    const amount = Number(depositAmountInput) || 0
    if (amount <= 0) return

    const newDeposit = {
      id: Date.now(),
      method: depositMethod,
      bankName: bankNameInput,
      bankAccountNumber: bankAccountNumberInput,
      amount: amount,
      slip: bankSlipInput
    }

    const existingRecord = records[selectedDate] || {}
    const existingDeposits = existingRecord.bankDeposits || []
    const updatedDeposits = [...existingDeposits, newDeposit]
    const totalDepositAmount = updatedDeposits.reduce((s, d) => s + d.amount, 0)

    const newRecordData = {
      ...existingRecord,
      counterCash,
      godownCash,
      bankDeposits: updatedDeposits,
      bankDeposit: totalDepositAmount,
      expenses: apiExpenses,
      totalExpenses,
      openingBalance,
      closingBalance: openingBalance + totalCashSale - totalDepositAmount - totalExpenses,
      savedAt: new Date().toISOString()
    }

    const newRecords = { ...records, [selectedDate]: newRecordData }
    setRecords(newRecords)
    saveRecordsToStorage(companyId, newRecords)

    setDepositAmountInput('')
    setBankAccountNumberInput('')
    setDepositMethod('bank')
    setBankNameInput('')
    setBankSlipInput(null)
    setSaved(true)
  }

  // ─── Delete Deposit Entry ───
  const handleDeleteDeposit = (depId) => {
    const existingRecord = records[selectedDate] || {}
    const existingDeposits = existingRecord.bankDeposits || []
    const updatedDeposits = existingDeposits.filter(d => d.id !== depId)
    const totalDepositAmount = updatedDeposits.reduce((s, d) => s + d.amount, 0)

    const newRecordData = {
      ...existingRecord,
      bankDeposits: updatedDeposits,
      bankDeposit: totalDepositAmount,
      closingBalance: openingBalance + totalCashSale - totalDepositAmount - totalExpenses,
      savedAt: new Date().toISOString()
    }

    const newRecords = { ...records, [selectedDate]: newRecordData }
    setRecords(newRecords)
    saveRecordsToStorage(companyId, newRecords)
  }

  // ─── Save Main Record Snapshot ───
  const handleSave = () => {
    const existingRecord = records[selectedDate] || {}
    const existingDeposits = existingRecord.bankDeposits || []

    const newRecords = {
      ...records,
      [selectedDate]: {
        ...existingRecord,
        counterCash,
        godownCash,
        bankDeposits: existingDeposits,
        bankDeposit: existingDeposits.reduce((s, d) => s + d.amount, 0),
        expenses: apiExpenses,
        totalExpenses,
        openingBalance,
        closingBalance,
        savedAt: new Date().toISOString()
      }
    }
    setRecords(newRecords)
    saveRecordsToStorage(companyId, newRecords)
    setSaved(true)
  }

  // ─── Initial Balance ───
  const handleSaveInitBal = () => {
    const val = Number(tempInitBal) || 0
    setInitialBalance(val)
    saveInitBal(companyId, val)
    setShowInitBalModal(false)
    setTempInitBal('')
  }

  // ─── Date Navigation ───
  const goPrev = () => setSelectedDate(format(subDays(new Date(selectedDate + 'T00:00:00'), 1), 'yyyy-MM-dd'))
  const goNext = () => setSelectedDate(format(addDays(new Date(selectedDate + 'T00:00:00'), 1), 'yyyy-MM-dd'))
  const goToday = () => setSelectedDate(today)

  // ─── History ───
  const historyData = useMemo(() => {
    return Object.entries(records)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 60)
      .map(([date, rec]) => ({ date, ...rec }))
  }, [records])

  // ─── Export ───
  const handleExport = () => {
    if (historyData.length === 0) return
    const exportRows = historyData.map(r => ({
      'Date': r.date,
      'Opening ₹': r.openingBalance || 0,
      'Counter Cash ₹': r.counterCash || 0,
      'Godown Cash ₹': r.godownCash || 0,
      'Total Cash In ₹': (r.counterCash || 0) + (r.godownCash || 0),
      'Bank Deposit ₹': r.bankDeposit || 0,
      'Expenses ₹': r.totalExpenses || 0,
      'Closing Balance ₹': r.closingBalance || 0,
    }))
    const ws = XLSX.utils.json_to_sheet(exportRows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Cash Book')
    XLSX.writeFile(wb, `cash_book_${companyName}_${today}.xlsx`)
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to manage cash deposits.</p>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // NEW: Bank Slip Thumbnail Component
  // ═══════════════════════════════════════════════════════════════
  const SlipThumbnail = ({ slip, size = 'sm' }) => {
    if (!slip || !slip.base64) return null
    const isPdf = slip.name?.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      return (
        <button
          onClick={() => setImageModal(slip)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors group"
        >
          <ZoomIn className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" />
          <span className="text-xs text-blue-600 dark:text-blue-400 font-medium truncate max-w-[120px]">{slip.name}</span>
        </button>
      )
    }

    return (
      <button
        onClick={() => setImageModal(slip)}
        className={clsx(
          "relative rounded-lg overflow-hidden border-2 border-cyan-200 dark:border-cyan-800 hover:border-cyan-400 dark:hover:border-cyan-600 transition-all group shadow-sm hover:shadow-md cursor-pointer",
          size === 'sm' ? 'w-12 h-12' : 'w-16 h-16'
        )}
        title="Click to view full size"
      >
        <img
          src={slip.base64}
          alt="Bank Slip"
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <ZoomIn className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    )
  }

  return (
    <div className="space-y-6">

      {/* ═══════════════════════════════════════════════════════════════
          NEW: Image Lightbox Modal
          ═══════════════════════════════════════════════════════════════ */}
      {imageModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
          onClick={() => setImageModal(null)}
        >
          <div
            className="relative max-w-4xl max-h-[90vh] w-full flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Bar */}
            <div className="flex items-center justify-between mb-3 px-1">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-sm text-white/80 font-medium truncate">
                  📎 {imageModal.name || 'Bank Slip'}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => handleDownloadSlip(imageModal)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white text-xs font-medium transition-colors border border-white/20"
                >
                  <Download className="w-3.5 h-3.5" /> Download
                </button>
                <button
                  onClick={() => setImageModal(null)}
                  className="p-1.5 rounded-lg bg-white/10 hover:bg-red-500/80 text-white transition-colors border border-white/20"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Image Container */}
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              {imageModal.name?.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={imageModal.base64}
                  className="w-full h-[80vh]"
                  title="Bank Slip PDF"
                />
              ) : (
                <img
                  src={imageModal.base64}
                  alt="Bank Slip Full View"
                  className="max-w-full max-h-[80vh] object-contain"
                />
              )}
            </div>

            {/* Footer hint */}
            <p className="text-center text-white/40 text-xs mt-2">
              Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[10px] font-mono">ESC</kbd> to close • Click outside to close
            </p>
          </div>
        </div>
      )}

      {/* HEADER */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
            <PiggyBank className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Cash & Bank Deposit</h2>
            <p className="text-xs text-gray-500">Daily cash management • Counter + Godown</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button onClick={goPrev} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="input-field text-sm text-center w-40" />
          <button onClick={goNext} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={goToday} className={clsx("text-xs px-3 py-2 rounded-lg font-medium border transition-colors", selectedDate === today ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700" : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700")}>
            Today
          </button>
        </div>
      </div>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-7 gap-4">
        <div className="card p-4 border-l-4 border-violet-500 relative group">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Wallet className="w-3.5 h-3.5" /> Opening Balance</div>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-violet-400 mt-1" /> : <p className="text-xl font-bold text-violet-600 dark:text-violet-400">₹{openingBalance.toLocaleString()}</p>}
          <button onClick={() => { setShowInitBalModal(true); setTempInitBal(String(initialBalance)) }} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-violet-100 dark:hover:bg-violet-900/30" title="Set initial balance">
            <Edit3 className="w-3 h-3 text-violet-400" />
          </button>
        </div>
        <div className="card p-4 border-l-4 border-blue-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Store className="w-3.5 h-3.5" /> Counter Cash</div>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-blue-400 mt-1" /> : <p className="text-xl font-bold text-blue-600 dark:text-blue-400">₹{counterCash.toLocaleString()}</p>}
        </div>
        <div className="card p-4 border-l-4 border-purple-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Warehouse className="w-3.5 h-3.5" /> Godown Cash</div>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-purple-400 mt-1" /> : <p className="text-xl font-bold text-purple-600 dark:text-purple-400">₹{godownCash.toLocaleString()}</p>}
        </div>
        <div className="card p-4 border-l-4 border-emerald-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" /> Total Cash In</div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{totalCashSale.toLocaleString()}</p>
        </div>
        <div className="card p-4 border-l-4 border-cyan-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Building2 className="w-3.5 h-3.5" /> Bank Deposit</div>
          <p className="text-xl font-bold text-cyan-600 dark:text-cyan-400">₹{bankDeposit.toLocaleString()}</p>
        </div>
        <div className="card p-4 border-l-4 border-orange-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><HandCoins className="w-3.5 h-3.5" /> Cash Expenses</div>
          {loading ? <Loader2 className="w-5 h-5 animate-spin text-orange-400 mt-1" /> : <p className="text-xl font-bold text-orange-600 dark:text-orange-400">₹{totalExpenses.toLocaleString()}</p>}
        </div>
        <div className={clsx("card p-4 border-l-4", closingBalance >= 0 ? "border-green-500" : "border-red-500")}>
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><CircleDollarSign className="w-3.5 h-3.5" /> Closing Balance</div>
          <p className={clsx("text-xl font-bold", closingBalance >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
            ₹{Math.abs(closingBalance).toLocaleString()}{closingBalance < 0 ? ' (Dr)' : ''}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">→ Next day opening</p>
        </div>
      </div>

      {/* FORMULA VISUALIZATION */}
      <div className="card p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-gray-800/30 border dark:border-slate-700">
        <div className="flex items-center gap-2 mb-3">
          <BookOpen className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Cash Flow Calculation</span>
          <button onClick={() => fetchCashData(true)} disabled={refreshing} className="ml-auto flex items-center gap-1 text-xs text-blue-500 hover:text-blue-700 dark:hover:text-blue-300 disabled:opacity-50">
            <RefreshCw className={clsx("w-3.5 h-3.5", refreshing && "animate-spin")} /> Refresh Data
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-mono">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-semibold"><Wallet className="w-3 h-3" /> ₹{openingBalance.toLocaleString()}</span>
          <span className="text-gray-400 font-bold text-lg">+</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold"><TrendingUp className="w-3 h-3" /> ₹{totalCashSale.toLocaleString()}</span>
          <span className="text-gray-400 font-bold text-lg">−</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 font-semibold"><Building2 className="w-3 h-3" /> ₹{bankDeposit.toLocaleString()}</span>
          <span className="text-gray-400 font-bold text-lg">−</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-semibold"><HandCoins className="w-3 h-3" /> ₹{totalExpenses.toLocaleString()}</span>
          <span className="text-gray-400 font-bold text-lg">=</span>
          <span className={clsx("inline-flex items-center gap-1 px-3 py-1.5 rounded-md font-bold text-base", closingBalance >= 0 ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300")}>
            <CircleDollarSign className="w-3.5 h-3.5" /> ₹{Math.abs(closingBalance).toLocaleString()}{closingBalance < 0 ? ' (Dr)' : ''}
          </span>
        </div>
      </div>

      {/* BANK DEPOSIT & EXPENSES ENTRY */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bank Deposits */}
        <div className="card p-5 border dark:border-slate-700 shadow-sm">
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-900/30"><Building2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" /></div>
            Bank Deposits
          </h3>

          {/* List of added deposits */}
          {bankDeposits.map((dep) => (
            <div
              key={dep.id}
              className="p-2.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-100 dark:border-cyan-900/40"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                  <span className="text-sm font-bold text-cyan-700 dark:text-cyan-300 whitespace-nowrap">
                    ₹{dep.amount.toLocaleString()}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-200 dark:bg-cyan-800 text-cyan-800 dark:text-cyan-200 uppercase font-semibold">
                    {dep.method === 'bank' ? 'Bank' : 'CDM'}
                  </span>
                  {dep.bankName && (
                    <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
                      {dep.bankName}
                    </span>
                  )}
                  {dep.bankAccountNumber && (
                    <span className="text-[11px] text-gray-500 dark:text-gray-500 font-mono bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">
                      A/C: {dep.bankAccountNumber}
                    </span>
                  )}
                  {/* ← UPDATED: Use SlipThumbnail component */}
                  {dep.slip && <SlipThumbnail slip={dep.slip} size="sm" />}
                </div>
                <button
                  onClick={() => handleDeleteDeposit(dep.id)}
                  className="text-gray-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Form to add new deposit */}
          <div className={clsx("space-y-3 pt-4", bankDeposits.length > 0 && "border-t dark:border-gray-700")}>
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">Add New Deposit</p>

            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Deposit Method</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="radio" name="depositMethod" value="bank" checked={depositMethod === 'bank'} onChange={(e) => setDepositMethod(e.target.value)} className="text-cyan-600 focus:ring-cyan-500" />
                  Deposit through Bank
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                  <input type="radio" name="depositMethod" value="cdm" checked={depositMethod === 'cdm'} onChange={(e) => setDepositMethod(e.target.value)} className="text-cyan-600 focus:ring-cyan-500" />
                  Cash Deposit Machine
                </label>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">
                  {depositMethod === 'bank' ? 'Deposit Bank Name' : 'CDM Bank Name'}
                </label>
                <input
                  type="text"
                  value={bankNameInput}
                  onChange={e => setBankNameInput(e.target.value)}
                  placeholder={depositMethod === 'bank' ? "Enter bank name" : "Enter CDM bank name"}
                  className="input-field text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Bank Account Number</label>
                <input
                  type="text"
                  value={bankAccountNumberInput}
                  onChange={e => setBankAccountNumberInput(e.target.value)}
                  placeholder="Enter account number"
                  className="input-field text-sm font-mono"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1.5">Deposit Amount (₹)</label>
                <input
                  type="number"
                  value={depositAmountInput}
                  onChange={e => setDepositAmountInput(e.target.value)}
                  placeholder="Enter amount deposited"
                  className="input-field text-sm"
                  min="0"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5">Upload Bank Slip</label>
              <input
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                className="block w-full text-xs text-gray-500 
                  file:mr-4 file:py-2 file:px-4 
                  file:rounded-lg file:border-0 
                  file:text-sm file:font-semibold 
                  file:bg-cyan-50 file:text-cyan-700 
                  hover:file:bg-cyan-100 
                  dark:file:bg-cyan-900/30 dark:file:text-cyan-400 
                  dark:hover:file:bg-cyan-900/50"
              />
              {bankSlipInput && (
                <div className="flex items-center gap-3 mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
                  <SlipThumbnail slip={bankSlipInput} size="sm" />
                  <span className="text-xs text-gray-500 truncate">{bankSlipInput.name}</span>
                </div>
              )}
            </div>

            <button
              onClick={handleAddDeposit}
              disabled={!depositAmountInput || Number(depositAmountInput) <= 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-cyan-600 text-white hover:bg-cyan-700 transition-colors text-sm font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4" /> Add Deposit Entry
            </button>
          </div>
        </div>

        {/* Cash Expenses */}
        <div className="card p-5 border dark:border-slate-700 shadow-sm">
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30"><HandCoins className="w-4 h-4 text-orange-600 dark:text-orange-400" /></div>
            Cash Expenses
          </h3>

          <div className="mb-3 p-2.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 text-[11px] text-blue-600 dark:text-blue-400 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            <span>Expenses are pulled automatically from the <strong>Expenses</strong> page. Only <strong>CASH</strong> payments are deducted here.</span>
          </div>

          {loading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
          ) : apiExpenses.length > 0 ? (
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              {apiExpenses.map((exp, idx) => (
                <div key={exp.id || idx} className="flex items-center justify-between p-2.5 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-full bg-orange-200 dark:bg-orange-800/50 flex items-center justify-center text-[10px] font-bold text-orange-700 dark:text-orange-300 flex-shrink-0">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm text-gray-700 dark:text-gray-300 truncate">{exp.description}</p>
                      {exp.employee_name && <p className="text-[10px] text-gray-400">Emp: {exp.employee_name}</p>}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-orange-600 dark:text-orange-400 flex-shrink-0 ml-2">₹{exp.amount.toLocaleString()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-gray-400 dark:text-gray-600">
              <HandCoins className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-xs">No CASH expenses found for this date</p>
            </div>
          )}

          {apiExpenses.length > 0 && (
            <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex justify-between items-center">
              <span className="text-xs text-gray-500 font-medium">Total Cash Expenses ({apiExpenses.length} items)</span>
              <span className="text-sm font-bold text-orange-600 dark:text-orange-400">₹{totalExpenses.toLocaleString()}</span>
            </div>
          )}
        </div>
      </div>

      {/* SAVE BUTTON */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400">
          {saved && records[selectedDate] && (
            <span className="flex items-center gap-1 text-green-600 dark:text-green-400">
              <Check className="w-3.5 h-3.5" /> Last saved: {new Date(records[selectedDate].savedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
        <button onClick={handleSave} disabled={loading} className={clsx("flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium text-sm transition-all shadow-sm", saved ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-800 hover:bg-green-200 dark:hover:bg-green-900/50" : "bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md")}>
          {saved ? <><Check className="w-4 h-4" /> Saved — Click to Update</> : <><Save className="w-4 h-4" /> Save Record</>}
        </button>
      </div>

      {/* CASH BOOK HISTORY */}
      <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
        <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center">
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><BookOpen className="w-4 h-4 text-blue-500" /> Cash Book History</h3>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">{historyData.length} records</span>
            <button onClick={handleExport} disabled={historyData.length === 0} className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-40 transition-colors">
              <FileDown className="w-3.5 h-3.5" /> Export
            </button>
          </div>
        </div>

        {historyData.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <BookOpen className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No records yet</p>
            <p className="text-xs mt-1">Save today's record to start building your cash book</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3 text-left font-semibold text-gray-500 dark:text-gray-400">Date</th>
                  <th className="p-3 text-right font-semibold text-violet-500">Opening ₹</th>
                  <th className="p-3 text-right font-semibold text-blue-500">Counter ₹</th>
                  <th className="p-3 text-right font-semibold text-purple-500">Godown ₹</th>
                  <th className="p-3 text-right font-semibold text-emerald-500">Cash In ₹</th>
                  <th className="p-3 text-right font-semibold text-cyan-500">Deposit ₹</th>
                  <th className="p-3 text-right font-semibold text-orange-500">Expense ₹</th>
                  <th className="p-3 text-right font-semibold text-gray-700 dark:text-gray-300">Closing ₹</th>
                  <th className="p-3 text-center font-semibold text-gray-400 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {historyData.map((row) => {
                  const cashIn = (row.counterCash || 0) + (row.godownCash || 0)
                  const isExpanded = expandedRow === row.date
                  return (
                    <>
                      <tr key={row.date} className={clsx("hover:bg-gray-50/50 dark:hover:bg-gray-800/30 cursor-pointer transition-colors", row.date === selectedDate && "bg-blue-50/50 dark:bg-blue-900/10")} onClick={() => setSelectedDate(row.date)}>
                        <td className="p-3 font-medium text-gray-800 dark:text-gray-200"><div className="flex items-center gap-1.5"><Calendar className="w-3 h-3 text-gray-400" />{row.date}</div></td>
                        <td className="p-3 text-right text-violet-600 dark:text-violet-400">₹{(row.openingBalance || 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-blue-600 dark:text-blue-400">₹{(row.counterCash || 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-purple-600 dark:text-purple-400">₹{(row.godownCash || 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">₹{cashIn.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">₹{(row.bankDeposit || 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-orange-600 dark:text-orange-400">₹{(row.totalExpenses || 0).toLocaleString()}</td>
                        <td className={clsx("p-3 text-right font-bold", (row.closingBalance || 0) >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>₹{Math.abs(row.closingBalance || 0).toLocaleString()}{(row.closingBalance || 0) < 0 ? ' (Dr)' : ''}</td>
                        <td className="p-3 text-center">
                          {(row.expenses?.length > 0 || row.bankDeposits?.length > 0) && (
                            <button onClick={(e) => { e.stopPropagation(); setExpandedRow(isExpanded ? null : row.date) }} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors">
                              <ChevronRight className={clsx("w-3.5 h-3.5 transition-transform", isExpanded && "rotate-90")} />
                            </button>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${row.date}-exp`} className="bg-slate-50/50 dark:bg-slate-800/20">
                          <td colSpan={9} className="p-0">
                            <div className="px-8 py-3 space-y-3">
                              {row.bankDeposits?.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase font-semibold text-cyan-500 tracking-wider mb-2">Deposit Details</p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                                    {row.bankDeposits.map((dep) => (
                                      <div key={dep.id} className="flex flex-col gap-1.5 px-2.5 py-2 rounded bg-white dark:bg-gray-800 border border-cyan-100 dark:border-cyan-900/30 text-xs">
                                        <span className="font-semibold text-cyan-600 dark:text-cyan-400">₹{dep.amount.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">({dep.method === 'bank' ? 'Bank' : 'CDM'})</span></span>
                                        {dep.bankName && <span className="text-gray-500 dark:text-gray-400">{dep.bankName}</span>}
                                        {dep.bankAccountNumber && <span className="text-gray-500 dark:text-gray-400 font-mono text-[11px]">A/C: {dep.bankAccountNumber}</span>}
                                        {/* ← NEW: Show slip in history too */}
                                        {dep.slip && <SlipThumbnail slip={dep.slip} size="sm" />}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {row.expenses?.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase font-semibold text-orange-500 tracking-wider mb-2">Expense Details</p>
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {row.expenses.map((exp, idx) => (
                                      <div key={exp.id || idx} className="flex items-center justify-between px-2.5 py-1.5 rounded bg-white dark:bg-gray-800 border border-orange-100 dark:border-orange-900/30 text-xs">
                                        <span className="text-gray-600 dark:text-gray-400 truncate mr-2">{exp.description}</span>
                                        <span className="font-semibold text-orange-600 dark:text-orange-400 flex-shrink-0">₹{exp.amount.toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* INITIAL BALANCE MODAL */}
      {showInitBalModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowInitBalModal(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-100 dark:bg-violet-900/30"><Wallet className="w-5 h-5 text-violet-600 dark:text-violet-400" /></div>
              <div>
                <h3 className="text-lg font-bold text-gray-900 dark:text-gray-100">Set Initial Opening Balance</h3>
                <p className="text-xs text-gray-500">Used when no previous day's closing balance exists</p>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 mb-4">
              <p className="text-xs text-amber-700 dark:text-amber-300">⚠️ Changing this will affect the opening balance of all days that don't have a prior saved record. Already saved records won't be affected.</p>
            </div>
            <label className="block text-xs text-gray-500 mb-1.5">Initial Cash Balance (₹)</label>
            <input type="number" value={tempInitBal} onChange={e => setTempInitBal(e.target.value)} placeholder="Enter opening cash balance" className="input-field text-sm mb-5" autoFocus onKeyDown={e => e.key === 'Enter' && handleSaveInitBal()} />
            <div className="flex gap-3 justify-end">
              <button onClick={() => setShowInitBalModal(false)} className="px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">Cancel</button>
              <button onClick={handleSaveInitBal} className="px-4 py-2 rounded-lg bg-violet-600 text-white text-sm hover:bg-violet-700 transition-colors shadow-sm">Save Balance</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
