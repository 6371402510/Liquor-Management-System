import { useState, useEffect, useMemo } from 'react'
import React from 'react'
import {
  Banknote, Building2, Wallet, TrendingUp, Store, Warehouse,
  AlertCircle, Loader2, HandCoins, CircleDollarSign,
  BookOpen, ChevronLeft, ChevronRight, FileDown, Calendar,
  Printer, Minus, ZoomIn, Download, X, ChevronDown, ChevronUp,
  Filter, RotateCcw
} from 'lucide-react'
import clsx from 'clsx'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, isSameMonth } from 'date-fns'
import * as XLSX from 'xlsx'

// ─── Same Storage Keys as CashDeposit.jsx ───
const recordsKey = (cid) => `cashRecords_${cid}`
const loadRecords = (cid) => {
  try { return JSON.parse(localStorage.getItem(recordsKey(cid))) || {} }
  catch { return {} }
}

export default function CashBankReport() {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  // ─── Date Range Filter ───
  const today = format(new Date(), 'yyyy-MM-dd')
  const [filterMode, setFilterMode] = useState('month') // 'month' or 'custom'
  const [currentDate, setCurrentDate] = useState(new Date())
  const [dateFrom, setDateFrom] = useState(() => format(startOfMonth(new Date()), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(() => format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  const [records, setRecords] = useState({})

  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const monthLabel = format(currentDate, 'MMMM yyyy')

  // ─── Expanded Rows for Slips ───
  const [expandedRows, setExpandedRows] = useState([])
  const [imageModal, setImageModal] = useState(null)

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
    if (companyId) setRecords(loadRecords(companyId))
  }, [companyId])

  // ─── Close image modal on Escape ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && imageModal) setImageModal(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [imageModal])

  // ─── Get active date range ───
  const activeFrom = filterMode === 'month' ? format(monthStart, 'yyyy-MM-dd') : dateFrom
  const activeTo = filterMode === 'month' ? format(monthEnd, 'yyyy-MM-dd') : dateTo
  const activeLabel = filterMode === 'month'
    ? monthLabel
    : `${format(new Date(activeFrom + 'T00:00:00'), 'dd MMM yyyy')} — ${format(new Date(activeTo + 'T00:00:00'), 'dd MMM yyyy')}`

  // ─── Filter records for active range ───
  const rangeRecords = useMemo(() => {
    const filtered = {}
    Object.entries(records).forEach(([date, data]) => {
      if (date >= activeFrom && date <= activeTo) {
        filtered[date] = data
      }
    })
    return filtered
  }, [records, activeFrom, activeTo])

  // ─── All days in range ───
  const daysInRange = useMemo(() => {
    return eachDayOfInterval({
      start: new Date(activeFrom + 'T00:00:00'),
      end: new Date(activeTo + 'T00:00:00')
    })
  }, [activeFrom, activeTo])

  // ─── Range Totals ───
  const totals = useMemo(() => {
    const entries = Object.values(rangeRecords)
    return {
      totalOpening: entries.reduce((s, r) => s + (r.openingBalance || 0), 0),
      totalCounterCash: entries.reduce((s, r) => s + (r.counterCash || 0), 0),
      totalGodownCash: entries.reduce((s, r) => s + (r.godownCash || 0), 0),
      totalCashIn: entries.reduce((s, r) => s + (r.counterCash || 0) + (r.godownCash || 0), 0),
      totalBankDeposit: entries.reduce((s, r) => s + (r.bankDeposit || 0), 0),
      totalExpenses: entries.reduce((s, r) => s + (r.totalExpenses || 0), 0),
      totalClosing: entries.reduce((s, r) => s + (r.closingBalance || 0), 0),
      daysRecorded: entries.length,
      totalDays: daysInRange.length,
      totalSlips: entries.reduce((s, r) => s + (r.bankDeposits || []).filter(d => d.slip).length, 0),
    }
  }, [rangeRecords, daysInRange])

  // ─── Bank-wise Breakdown ───
  const bankBreakdown = useMemo(() => {
    const banks = {}
    Object.values(rangeRecords).forEach(rec => {
      (rec.bankDeposits || []).forEach(dep => {
        const key = dep.bankName || 'Unknown Bank'
        if (!banks[key]) banks[key] = { name: key, total: 0, count: 0, bankCount: 0, cdmCount: 0, slips: [] }
        banks[key].total += dep.amount
        banks[key].count += 1
        if (dep.method === 'bank') banks[key].bankCount += 1
        if (dep.method === 'cdm') banks[key].cdmCount += 1
        if (dep.slip) banks[key].slips.push({ ...dep.slip, date: rec.date || '', amount: dep.amount })
      })
    })
    return Object.values(banks).sort((a, b) => b.total - a.total)
  }, [rangeRecords])

  // ─── Expense Breakdown ───
  const expenseBreakdown = useMemo(() => {
    const cats = {}
    Object.values(rangeRecords).forEach(rec => {
      (rec.expenses || []).forEach(exp => {
        const desc = exp.description || 'Other'
        if (!cats[desc]) cats[desc] = { name: desc, total: 0, count: 0 }
        cats[desc].total += exp.amount
        cats[desc].count += 1
      })
    })
    return Object.values(cats).sort((a, b) => b.total - a.total)
  }, [rangeRecords])

  // ─── Daily Data ───
  const dailyData = useMemo(() => {
    return daysInRange.map(day => {
      const dateStr = format(day, 'yyyy-MM-dd')
      const rec = rangeRecords[dateStr]
      const dayName = format(day, 'EEE')
      const isWeekend = getDay(day) === 0 || getDay(day) === 6
      const deposits = rec?.bankDeposits || []
      const expenses = rec?.expenses || []
      const hasSlips = deposits.some(d => d.slip)

      return {
        date: dateStr,
        dayNum: format(day, 'dd'),
        dayName,
        isWeekend,
        hasData: !!rec,
        hasSlips,
        opening: rec?.openingBalance || 0,
        counter: rec?.counterCash || 0,
        godown: rec?.godownCash || 0,
        cashIn: (rec?.counterCash || 0) + (rec?.godownCash || 0),
        deposit: rec?.bankDeposit || 0,
        expenses: rec?.totalExpenses || 0,
        closing: rec?.closingBalance || 0,
        depositCount: deposits.length,
        expenseCount: expenses.length,
        deposits,
        expensesList: expenses,
        slipCount: deposits.filter(d => d.slip).length,
      }
    })
  }, [daysInRange, rangeRecords])

  // ─── Navigation ───
  const goPrev = () => {
    if (filterMode === 'month') {
      setCurrentDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() - 1); return d })
    }
  }
  const goNext = () => {
    if (filterMode === 'month') {
      setCurrentDate(prev => { const d = new Date(prev); d.setMonth(d.getMonth() + 1); return d })
    }
  }
  const goToday = () => {
    setCurrentDate(new Date())
    setDateFrom(format(startOfMonth(new Date()), 'yyyy-MM-dd'))
    setDateTo(format(endOfMonth(new Date()), 'yyyy-MM-dd'))
  }

  // ─── Toggle expanded row ───
  const toggleRow = (date) => {
    setExpandedRows(prev =>
      prev.includes(date) ? prev.filter(d => d !== date) : [...prev, date]
    )
  }

  // ─── Download slip ───
  const handleDownloadSlip = (slip) => {
    const link = document.createElement('a')
    link.href = slip.base64
    link.download = slip.name || 'bank-slip.png'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  // ─── Export to Excel ───
  const handleExport = () => {
    const wb = XLSX.utils.book_new()

    const dailyRows = dailyData.filter(d => d.hasData).map(d => ({
      'Date': d.date,
      'Day': d.dayName,
      'Opening ₹': d.opening,
      'Counter Cash ₹': d.counter,
      'Godown Cash ₹': d.godown,
      'Total Cash In ₹': d.cashIn,
      'Bank Deposit ₹': d.deposit,
      'No. of Deposits': d.depositCount,
      'Slips Attached': d.slipCount,
      'Cash Expenses ₹': d.expenses,
      'No. of Expenses': d.expenseCount,
      'Closing Balance ₹': d.closing,
    }))
    const ws1 = XLSX.utils.json_to_sheet(dailyRows)
    XLSX.utils.book_append_sheet(wb, ws1, 'Daily Summary')

    if (bankBreakdown.length > 0) {
      const bankRows = bankBreakdown.map(b => ({
        'Bank Name': b.name,
        'Total Deposited ₹': b.total,
        'No. of Deposits': b.count,
        'Bank Transfers': b.bankCount,
        'CDM Deposits': b.cdmCount,
        'Slips Attached': b.slips.length,
      }))
      const ws2 = XLSX.utils.json_to_sheet(bankRows)
      XLSX.utils.book_append_sheet(wb, ws2, 'Bank Breakdown')
    }

    if (expenseBreakdown.length > 0) {
      const expRows = expenseBreakdown.map(e => ({
        'Description': e.name,
        'Total Amount ₹': e.total,
        'No. of Entries': e.count,
      }))
      const ws3 = XLSX.utils.json_to_sheet(expRows)
      XLSX.utils.book_append_sheet(wb, ws3, 'Expense Breakdown')
    }

    XLSX.writeFile(wb, `Cash_Bank_Report_${companyName}_${activeFrom}_to_${activeTo}.xlsx`)
  }

  const handlePrint = () => window.print()

  // ─── Slip Thumbnail Component ───
  const SlipThumbnail = ({ slip, size = 'sm' }) => {
    if (!slip || !slip.base64) return null
    const isPdf = slip.name?.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      return (
        <button
          onClick={() => setImageModal(slip)}
          className="inline-flex items-center gap-1 px-2 py-1 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition-colors"
        >
          <ZoomIn className="w-3 h-3 text-blue-500" />
          <span className="text-[10px] text-blue-600 dark:text-blue-400 font-medium truncate max-w-[80px]">{slip.name}</span>
        </button>
      )
    }

    return (
      <button
        onClick={() => setImageModal(slip)}
        className={clsx(
          "relative rounded-lg overflow-hidden border-2 border-cyan-200 dark:border-cyan-800 hover:border-cyan-400 dark:hover:border-cyan-600 transition-all group shadow-sm hover:shadow-md cursor-pointer",
          size === 'sm' ? 'w-10 h-10' : 'w-14 h-14'
        )}
        title={slip.name || 'Bank Slip'}
      >
        <img src={slip.base64} alt="Slip" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
          <ZoomIn className="w-3 h-3 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
        </div>
      </button>
    )
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view reports.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* ═══════════════════════════════════════════════════
          IMAGE LIGHTBOX MODAL
          ═══════════════════════════════════════════════════ */}
      {imageModal && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-[100] p-4"
          onClick={() => setImageModal(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] w-full flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-sm text-white/80 font-medium truncate">📎 {imageModal.name || 'Bank Slip'}</span>
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
            <div className="flex-1 flex items-center justify-center bg-white dark:bg-gray-900 rounded-2xl overflow-hidden shadow-2xl border border-white/10">
              {imageModal.name?.toLowerCase().endsWith('.pdf') ? (
                <iframe src={imageModal.base64} className="w-full h-[80vh]" title="Bank Slip PDF" />
              ) : (
                <img src={imageModal.base64} alt="Bank Slip" className="max-w-full max-h-[80vh] object-contain" />
              )}
            </div>
            <p className="text-center text-white/40 text-xs mt-2">
              Press <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/60 text-[10px] font-mono">ESC</kbd> to close
            </p>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════
          HEADER
          ═══════════════════════════════════════════════════ */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 print:hidden">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">Monthly Cash & Bank Report</h2>
            <p className="text-xs text-gray-500">Cash flow, bank deposits & slip photos</p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Filter Mode Toggle */}
          <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200 dark:border-gray-700">
            <button
              onClick={() => setFilterMode('month')}
              className={clsx(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                filterMode === 'month'
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <Calendar className="w-3 h-3 inline mr-1" />Month
            </button>
            <button
              onClick={() => setFilterMode('custom')}
              className={clsx(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                filterMode === 'custom'
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 shadow-sm"
                  : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
              )}
            >
              <Filter className="w-3 h-3 inline mr-1" />Custom Range
            </button>
          </div>

          {filterMode === 'month' ? (
            <>
              <button onClick={goPrev} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="px-4 py-2 rounded-lg bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 min-w-[180px] text-center">
                <span className="text-sm font-bold text-gray-800 dark:text-gray-200">{monthLabel}</span>
              </div>
              <button onClick={goNext} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                <ChevronRight className="w-4 h-4" />
              </button>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="input-field text-xs py-1.5 w-[140px]"
              />
              <span className="text-gray-400 text-xs">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="input-field text-xs py-1.5 w-[140px]"
              />
              {dateFrom > dateTo && (
                <span className="text-[10px] text-red-500 font-medium">Invalid range!</span>
              )}
            </div>
          )}

          <button
            onClick={goToday}
            className={clsx(
              "text-xs px-3 py-1.5 rounded-lg font-medium border transition-colors",
              (filterMode === 'month' && isSameMonth(currentDate, new Date()) && dateFrom === format(startOfMonth(new Date()), 'yyyy-MM-dd'))
                ? "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700"
                : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700"
            )}
          >
            <RotateCcw className="w-3 h-3 inline mr-1" />Reset
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          SUMMARY CARDS
          ═══════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-3">
        <div className="card p-3 border-l-4 border-violet-500">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><Wallet className="w-3 h-3" /> Opening</div>
          <p className="text-base font-bold text-violet-600 dark:text-violet-400">₹{totals.totalOpening.toLocaleString()}</p>
        </div>
        <div className="card p-3 border-l-4 border-blue-500">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><Store className="w-3 h-3" /> Counter</div>
          <p className="text-base font-bold text-blue-600 dark:text-blue-400">₹{totals.totalCounterCash.toLocaleString()}</p>
        </div>
        <div className="card p-3 border-l-4 border-purple-500">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><Warehouse className="w-3 h-3" /> Godown</div>
          <p className="text-base font-bold text-purple-600 dark:text-purple-400">₹{totals.totalGodownCash.toLocaleString()}</p>
        </div>
        <div className="card p-3 border-l-4 border-emerald-500">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><TrendingUp className="w-3 h-3" /> Cash In</div>
          <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">₹{totals.totalCashIn.toLocaleString()}</p>
        </div>
        <div className="card p-3 border-l-4 border-cyan-500">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><Building2 className="w-3 h-3" /> Bank Dep.</div>
          <p className="text-base font-bold text-cyan-600 dark:text-cyan-400">₹{totals.totalBankDeposit.toLocaleString()}</p>
        </div>
        <div className="card p-3 border-l-4 border-orange-500">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><HandCoins className="w-3 h-3" /> Expenses</div>
          <p className="text-base font-bold text-orange-600 dark:text-orange-400">₹{totals.totalExpenses.toLocaleString()}</p>
        </div>
        <div className={clsx("card p-3 border-l-4", totals.totalClosing >= 0 ? "border-green-500" : "border-red-500")}>
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><CircleDollarSign className="w-3 h-3" /> Closing</div>
          <p className={clsx("text-base font-bold", totals.totalClosing >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
            ₹{Math.abs(totals.totalClosing).toLocaleString()}{totals.totalClosing < 0 ? ' Dr' : ''}
          </p>
        </div>
        <div className="card p-3 border-l-4 border-gray-400">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><Calendar className="w-3 h-3" /> Days</div>
          <p className="text-base font-bold text-gray-600 dark:text-gray-400">{totals.daysRecorded}<span className="text-xs font-normal text-gray-400">/{totals.totalDays}</span></p>
        </div>
        <div className="card p-3 border-l-4 border-pink-500">
          <div className="flex items-center gap-1.5 text-gray-500 text-[10px] mb-1"><ZoomIn className="w-3 h-3" /> Slips</div>
          <p className="text-base font-bold text-pink-600 dark:text-pink-400">{totals.totalSlips}</p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          CASH FLOW FORMULA
          ═══════════════════════════════════════ */}
      <div className="card p-4 bg-gradient-to-r from-slate-50 to-gray-50 dark:from-slate-800/50 dark:to-gray-800/30 border dark:border-slate-700 print:hidden">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-sm font-semibold text-gray-600 dark:text-gray-300">Cash Flow — {activeLabel}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm font-mono">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 font-semibold">
            <TrendingUp className="w-3 h-3" /> ₹{totals.totalCashIn.toLocaleString()}
          </span>
          <span className="text-gray-400 font-bold text-lg">−</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 font-semibold">
            <Building2 className="w-3 h-3" /> ₹{totals.totalBankDeposit.toLocaleString()}
          </span>
          <span className="text-gray-400 font-bold text-lg">−</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 font-semibold">
            <HandCoins className="w-3 h-3" /> ₹{totals.totalExpenses.toLocaleString()}
          </span>
          <span className="text-gray-400 font-bold text-lg">=</span>
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold">
            <Minus className="w-3 h-3" /> Net: ₹{(totals.totalCashIn - totals.totalBankDeposit - totals.totalExpenses).toLocaleString()}
          </span>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          BANK & EXPENSE BREAKDOWN
          ═════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Bank Deposit Breakdown with Slips */}
        <div className="card p-5 border dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-cyan-100 dark:bg-cyan-900/30">
              <Building2 className="w-4 h-4 text-cyan-600 dark:text-cyan-400" />
            </div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-200">Bank Deposit Breakdown</h3>
          </div>

          {bankBreakdown.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <Building2 className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No bank deposits in this period</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {bankBreakdown.map((bank, idx) => {
                  const pct = totals.totalBankDeposit > 0 ? (bank.total / totals.totalBankDeposit * 100) : 0
                  return (
                    <div key={idx} className="p-3 rounded-lg bg-cyan-50 dark:bg-cyan-900/10 border border-cyan-100 dark:border-cyan-900/30">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{bank.name}</span>
                        <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">₹{bank.total.toLocaleString()}</span>
                      </div>
                      <div className="w-full h-1.5 bg-cyan-100 dark:bg-cyan-900/30 rounded-full overflow-hidden mb-2">
                        <div className="h-full bg-cyan-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-gray-500 mb-2">
                        <span>{bank.count} deposits</span>
                        <span className="px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">Bank: {bank.bankCount}</span>
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400">CDM: {bank.cdmCount}</span>
                        <span className="ml-auto font-medium text-cyan-600 dark:text-cyan-400">{pct.toFixed(1)}%</span>
                      </div>

                      {/* ─── SLIP PHOTOS ─── */}
                      {bank.slips.length > 0 && (
                        <div className="pt-2 border-t border-cyan-100 dark:border-cyan-900/30">
                          <p className="text-[10px] text-gray-500 font-medium mb-1.5 uppercase tracking-wider">
                            📎 Attached Slips ({bank.slips.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {bank.slips.map((slip, sIdx) => (
                              <div key={sIdx} className="relative group">
                                <SlipThumbnail slip={slip} size="sm" />
                                <p className="text-[9px] text-gray-400 mt-0.5 max-w-[60px] truncate text-center">
                                  {slip.date.slice(-5)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-cyan-100 dark:border-cyan-900/30 flex justify-between items-center">
                <span className="text-xs text-gray-500">Total ({bankBreakdown.length} banks)</span>
                <span className="text-sm font-bold text-cyan-600 dark:text-cyan-400">₹{totals.totalBankDeposit.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>

        {/* Expense Breakdown */}
        <div className="card p-5 border dark:border-slate-700 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <div className="p-1.5 rounded-lg bg-orange-100 dark:bg-orange-900/30">
              <HandCoins className="w-4 h-4 text-orange-600 dark:text-orange-400" />
            </div>
            <h3 className="font-semibold text-gray-700 dark:text-gray-200">Expense Breakdown</h3>
          </div>

          {expenseBreakdown.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <HandCoins className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-xs">No cash expenses in this period</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
                {expenseBreakdown.map((exp, idx) => {
                  const pct = totals.totalExpenses > 0 ? (exp.total / totals.totalExpenses * 100) : 0
                  return (
                    <div key={idx} className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/10 border border-orange-100 dark:border-orange-900/30">
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate mr-2">{exp.name}</span>
                        <span className="text-sm font-bold text-orange-600 dark:text-orange-400 flex-shrink-0">₹{exp.total.toLocaleString()}</span>
                      </div>
                      <div className="w-full h-1.5 bg-orange-100 dark:bg-orange-900/30 rounded-full overflow-hidden mb-1.5">
                        <div className="h-full bg-orange-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                      <div className="flex items-center justify-between text-[10px] text-gray-500">
                        <span>{exp.count} entries</span>
                        <span className="font-medium text-orange-600 dark:text-orange-400">{pct.toFixed(1)}%</span>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div className="mt-3 pt-3 border-t border-orange-100 dark:border-orange-900/30 flex justify-between items-center">
                <span className="text-xs text-gray-500">Total ({expenseBreakdown.length} categories)</span>
                <span className="text-sm font-bold text-orange-600 dark:text-orange-400">₹{totals.totalExpenses.toLocaleString()}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════
          DAILY TABLE WITH EXPANDABLE SLIPS
          ═══════════════════════════════════════════════════ */}
      <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
        <div className="p-4 border-b dark:border-slate-700 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
            <Calendar className="w-4 h-4 text-indigo-500" />
            Daily Breakdown — {activeLabel}
          </h3>
          <div className="flex items-center gap-2 print:hidden">
            <button
              onClick={handleExport}
              disabled={totals.daysRecorded === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 disabled:opacity-40 transition-colors"
            >
              <FileDown className="w-3.5 h-3.5" /> Excel
            </button>
            <button
              onClick={handlePrint}
              disabled={totals.daysRecorded === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 disabled:opacity-40 transition-colors"
            >
              <Printer className="w-3.5 h-3.5" /> Print
            </button>
          </div>
        </div>

        {totals.daysRecorded === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <Calendar className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No records found for {activeLabel}</p>
            <p className="text-xs mt-1">Save daily records in Cash & Bank Deposit page first</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  <th className="p-3 text-left font-semibold text-gray-500 dark:text-gray-400 w-8"></th>
                  <th className="p-3 text-left font-semibold text-gray-500 dark:text-gray-400 sticky left-0 bg-slate-50 dark:bg-slate-800/50 z-10">Date</th>
                  <th className="p-3 text-right font-semibold text-violet-500">Opening ₹</th>
                  <th className="p-3 text-right font-semibold text-blue-500">Counter ₹</th>
                  <th className="p-3 text-right font-semibold text-purple-500">Godown ₹</th>
                  <th className="p-3 text-right font-semibold text-emerald-500">Cash In ₹</th>
                  <th className="p-3 text-right font-semibold text-cyan-500">Bank Dep. ₹</th>
                  <th className="p-3 text-center font-semibold text-pink-500">Slips</th>
                  <th className="p-3 text-right font-semibold text-orange-500">Expenses ₹</th>
                  <th className="p-3 text-right font-semibold text-gray-700 dark:text-gray-300">Closing ₹</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {dailyData.filter(d => d.hasData).map((row) => {
                  const isExpanded = expandedRows.includes(row.date)
                  return (
                    <React.Fragment key={row.date}>
                      <tr
                        className={clsx(
                          "hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors",
                          row.isWeekend && "bg-amber-50/30 dark:bg-amber-900/5"
                        )}
                      >
                        {/* Expand Button */}
                        <td className="p-2 text-center">
                          {(row.deposits.length > 0 || row.expensesList.length > 0) ? (
                            <button
                              onClick={() => toggleRow(row.date)}
                              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                            >
                              {isExpanded
                                ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" />
                                : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
                              }
                            </button>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>

                        {/* Date */}
                        <td className="p-3 font-medium text-gray-800 dark:text-gray-200 sticky left-0 bg-white dark:bg-gray-950 z-10 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-gray-400" />
                            <span>{row.date}</span>
                            <span className={clsx(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium",
                              row.isWeekend
                                ? "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400"
                                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
                            )}>
                              {row.dayName}
                            </span>
                          </div>
                        </td>

                        <td className="p-3 text-right text-violet-600 dark:text-violet-400">₹{row.opening.toLocaleString()}</td>
                        <td className="p-3 text-right text-blue-600 dark:text-blue-400">₹{row.counter.toLocaleString()}</td>
                        <td className="p-3 text-right text-purple-600 dark:text-purple-400">₹{row.godown.toLocaleString()}</td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400 font-medium">₹{row.cashIn.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">₹{row.deposit.toLocaleString()}</td>

                        {/* Slips Count with indicator */}
                        <td className="p-3 text-center">
                          {row.slipCount > 0 ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400 text-[10px] font-bold">
                              📎 {row.slipCount}
                            </span>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>

                        <td className="p-3 text-right text-orange-600 dark:text-orange-400">₹{row.expenses.toLocaleString()}</td>

                        <td className={clsx(
                          "p-3 text-right font-bold",
                          row.closing >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400"
                        )}>
                          ₹{Math.abs(row.closing).toLocaleString()}{row.closing < 0 ? ' Dr' : ''}
                        </td>
                      </tr>

                      {/* ─── EXPANDED ROW: Deposits + Slips + Expenses ─── */}
                      {isExpanded && (
                        <tr className="bg-slate-50/80 dark:bg-slate-800/30">
                          <td colSpan={10} className="p-0">
                            <div className="px-8 py-4 space-y-4">

                              {/* Deposits with Slips */}
                              {row.deposits.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase font-semibold text-cyan-500 tracking-wider mb-2">
                                    💳 Deposit Details ({row.deposits.length})
                                  </p>
                                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {row.deposits.map((dep) => (
                                      <div key={dep.id} className="p-3 rounded-lg bg-white dark:bg-gray-800 border border-cyan-100 dark:border-cyan-900/30 space-y-2">
                                        <div className="flex items-center justify-between">
                                          <span className="font-semibold text-cyan-600 dark:text-cyan-400">
                                            ₹{dep.amount.toLocaleString()}
                                          </span>
                                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 uppercase font-semibold">
                                            {dep.method === 'bank' ? 'Bank' : 'CDM'}
                                          </span>
                                        </div>
                                        {dep.bankName && (
                                          <p className="text-xs text-gray-600 dark:text-gray-400">{dep.bankName}</p>
                                        )}
                                        {dep.bankAccountNumber && (
                                          <p className="text-[11px] text-gray-500 dark:text-gray-500 font-mono">A/C: {dep.bankAccountNumber}</p>
                                        )}

                                        {/* ─── SLIP PHOTO ─── */}
                                        {dep.slip && (
                                          <div className="pt-2 border-t border-gray-100 dark:border-gray-700">
                                            <p className="text-[9px] text-gray-400 uppercase tracking-wider mb-1.5">📎 Bank Slip</p>
                                            <div className="flex items-center gap-3">
                                              <SlipThumbnail slip={dep.slip} size="md" />
                                              <div className="min-w-0">
                                                <p className="text-[10px] text-gray-500 truncate max-w-[120px]">{dep.slip.name}</p>
                                                <button
                                                  onClick={() => handleDownloadSlip(dep.slip)}
                                                  className="text-[10px] text-cyan-600 dark:text-cyan-400 hover:underline flex items-center gap-0.5 mt-0.5"
                                                >
                                                  <Download className="w-2.5 h-2.5" /> Download
                                                </button>
                                              </div>
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Expenses */}
                              {row.expensesList.length > 0 && (
                                <div>
                                  <p className="text-[10px] uppercase font-semibold text-orange-500 tracking-wider mb-2">
                                    💸 Expense Details ({row.expensesList.length})
                                  </p>
                                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                                    {row.expensesList.map((exp, idx) => (
                                      <div key={exp.id || idx} className="flex items-center justify-between px-3 py-2 rounded-lg bg-white dark:bg-gray-800 border border-orange-100 dark:border-orange-900/30">
                                        <span className="text-xs text-gray-600 dark:text-gray-400 truncate mr-2">{exp.description}</span>
                                        <span className="text-xs font-semibold text-orange-600 dark:text-orange-400 flex-shrink-0">₹{exp.amount.toLocaleString()}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Slips Gallery (if multiple) */}
                              {row.slipCount > 1 && (
                                <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                                  <p className="text-[10px] uppercase font-semibold text-pink-500 tracking-wider mb-2">
                                    🖼️ All Slips for {row.date} ({row.slipCount})
                                  </p>
                                  <div className="flex flex-wrap gap-3">
                                    {row.deposits.filter(d => d.slip).map((dep, idx) => (
                                      <div key={idx} className="text-center">
                                        <SlipThumbnail slip={dep.slip} size="md" />
                                        <p className="text-[9px] text-gray-400 mt-1">₹{dep.amount.toLocaleString()}</p>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  )
                })}
              </tbody>
              <tfoot className="bg-slate-100 dark:bg-slate-800/70 font-bold">
                <tr>
                  <td className="p-3"></td>
                  <td className="p-3 text-gray-700 dark:text-gray-300 sticky left-0 bg-slate-100 dark:bg-slate-800/70 z-10">
                    TOTAL ({totals.daysRecorded} days)
                  </td>
                  <td className="p-3 text-right text-violet-600 dark:text-violet-400">₹{totals.totalOpening.toLocaleString()}</td>
                  <td className="p-3 text-right text-blue-600 dark:text-blue-400">₹{totals.totalCounterCash.toLocaleString()}</td>
                  <td className="p-3 text-right text-purple-600 dark:text-purple-400">₹{totals.totalGodownCash.toLocaleString()}</td>
                  <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">₹{totals.totalCashIn.toLocaleString()}</td>
                  <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">₹{totals.totalBankDeposit.toLocaleString()}</td>
                  <td className="p-3 text-center text-pink-600 dark:text-pink-400">
                    {totals.totalSlips > 0 ? `📎 ${totals.totalSlips}` : '—'}
                  </td>
                  <td className="p-3 text-right text-orange-600 dark:text-orange-400">₹{totals.totalExpenses.toLocaleString()}</td>
                  <td className={clsx("p-3 text-right", totals.totalClosing >= 0 ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400")}>
                    ₹{Math.abs(totals.totalClosing).toLocaleString()}{totals.totalClosing < 0 ? ' Dr' : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════
          PRINT-ONLY HEADER
          ═══════════════════════════════════════════════════ */}
      <div className="hidden print:block mb-6">
        <div className="text-center border-b-2 border-black pb-4 mb-4">
          <h1 className="text-2xl font-bold">{companyName}</h1>
          <p className="text-lg font-semibold mt-1">Cash & Bank Report</p>
          <p className="text-sm text-gray-600">{activeLabel}</p>
        </div>
        <div className="grid grid-cols-4 gap-4 text-sm mb-4">
          <div><span className="text-gray-500">Cash In:</span> <strong>₹{totals.totalCashIn.toLocaleString()}</strong></div>
          <div><span className="text-gray-500">Bank Deposit:</span> <strong>₹{totals.totalBankDeposit.toLocaleString()}</strong></div>
          <div><span className="text-gray-500">Expenses:</span> <strong>₹{totals.totalExpenses.toLocaleString()}</strong></div>
          <div><span className="text-gray-500">Closing:</span> <strong>₹{Math.abs(totals.totalClosing).toLocaleString()}</strong></div>
        </div>
      </div>
    </div>
  )
}