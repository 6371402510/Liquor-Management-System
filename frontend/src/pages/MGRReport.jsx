// pages/MGRReport.jsx
import { useState, useEffect, useMemo } from 'react'
import {
  Loader as Loader2, Target, TrendingUp, TrendingDown, Calendar,
  Award, AlertCircle, ChevronLeft, ChevronRight, FileDown,
  BarChart3, Package, Store, RefreshCw, Info
} from 'lucide-react'
import { format, subMonths } from 'date-fns'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { useAuth } from '../context/AuthContext'
import { getMGRReport } from '../apiservices/mgrapi'

const isTauri = () => '__TAURI_INTERNALS__' in window

const downloadAsBlob = (data, fileName) => {
  const blob = new Blob([data], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = fileName
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export default function MGRReport() {
  const { user } = useAuth()
  const [companyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reportData, setReportData] = useState(null)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [activeTab, setActiveTab] = useState('overview')

  // ─── Fetch Data ───
  useEffect(() => {
    if (companyId) {
      fetchReport()
    }
  }, [companyId, selectedDate])

  const fetchReport = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getMGRReport(Number(companyId), selectedDate)
      setReportData(data)
    } catch (err) {
      setError(err.message || 'Failed to load MGR report')
    } finally {
      setLoading(false)
    }
  }

  // ─── Month Navigation ───
  const navigateMonth = (direction) => {
    const current = new Date(selectedDate)
    const newDate = direction === 'prev'
      ? subMonths(current, 1)
      : new Date(current.getFullYear(), current.getMonth() + 1, 1)
    
    // Don't go beyond current month
    const now = new Date()
    if (newDate > now) return
    
    setSelectedDate(format(newDate, 'yyyy-MM-dd'))
  }

  const isCurrentMonth = useMemo(() => {
    const selected = new Date(selectedDate)
    const now = new Date()
    return selected.getMonth() === now.getMonth() && selected.getFullYear() === now.getFullYear()
  }, [selectedDate])

  // ─── Export to Excel ───
  const handleExportExcel = async () => {
    if (!reportData) return

    const wb = XLSX.utils.book_new()

    // Sheet 1: Summary
    const summaryData = [{
      'Company': reportData.company_name,
      'Month': reportData.current_month,
      'Base Target': reportData.stats.base_target,
      'Carryover from Previous': reportData.stats.carryover,
      'Total Target': reportData.stats.total_target,
      'Achieved': reportData.stats.achieved,
      'Remaining': reportData.stats.remaining,
      'Achievement %': reportData.stats.percentage,
      'Days Left': reportData.stats.days_left,
      'Daily Target Needed': reportData.stats.daily_target_needed,
      'Total MGer(All Time)': reportData.stats.total_mgr_all_time,
      'Purchase Count': reportData.stats.purchase_count,
    }]
    const ws1 = XLSX.utils.json_to_sheet(summaryData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

    // Sheet 2: Monthly History
    const historyData = reportData.monthly_history.map(h => ({
      'Month': h.month,
      'Base Target': h.base_target,
      'Carryover': h.carryover,
      'Total Target': h.total_target,
      'Achieved': h.achieved,
      'Remaining': h.remaining,
      'Achievement %': h.percentage,
    }))
    const ws2 = XLSX.utils.json_to_sheet(historyData)
    XLSX.utils.book_append_sheet(wb, ws2, 'Monthly History')

    // Sheet 3: Purchase Breakdown
    const purchaseData = reportData.purchase_breakdown.map(p => ({
      'Invoice No.': p.invoice_number,
      'Billing Date': p.billing_date || '',
      'Supplier': p.supplier_name || '',
      'MGER Value': p.mgr_value,
      'Created At': p.created_at ? format(new Date(p.created_at), 'dd MMM yyyy HH:mm') : '',
    }))
    const ws3 = XLSX.utils.json_to_sheet(purchaseData)
    XLSX.utils.book_append_sheet(wb, ws3, 'Purchase Breakdown')

    // Save
    const fileName = `MGR_Report_${selectedDate}.xlsx`
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    if (isTauri()) {
      try {
        const filePath = await save({
          defaultPath: fileName,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }],
        })
        if (filePath) {
          await writeFile(filePath, new Uint8Array(wbout))
        }
      } catch (err) {
        console.error('Tauri export error:', err)
        downloadAsBlob(wbout, fileName)
      }
    } else {
      downloadAsBlob(wbout, fileName)
    }
  }

  // ─── GUARD: NO COMPANY ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view MGER reports.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header ─── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
              <Target className="w-5 h-5 text-emerald-500" />
              MGER Report
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Monthly Government Revenue tracking with carryover
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Month Navigation */}
          <div className="flex items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-1">
            <button
              onClick={() => navigateMonth('prev')}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-500" />
            </button>
            <span className="text-xs font-semibold px-2 text-gray-700 dark:text-gray-200 min-w-[100px] text-center">
              {format(new Date(selectedDate), 'MMM yyyy')}
            </span>
            <button
              onClick={() => navigateMonth('next')}
              disabled={isCurrentMonth}
              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <ChevronRight className="w-4 h-4 text-gray-500" />
            </button>
          </div>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="btn-secondary flex items-center gap-2 text-xs"
          >
            <RefreshCw className={clsx("w-3.5 h-3.5", loading && "animate-spin")} />
            Refresh
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!reportData}
            className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 text-xs disabled:opacity-50"
          >
            <FileDown className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>

      {/* ─── Error ─── */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
        </div>
      ) : reportData ? (
        <>
          {/* ─── Summary Cards ─── */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
            {/* Base Target */}
            <div className="card p-3 border dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-4 h-4 text-blue-500" />
                <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Base Target</span>
              </div>
              <p className="text-lg font-bold text-gray-800 dark:text-gray-100">
                ₹{reportData.stats.base_target.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Carryover */}
            <div className="card p-3 border dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-purple-500" />
                <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Carryover</span>
              </div>
              <p className="text-lg font-bold text-purple-600 dark:text-purple-400">
                ₹{reportData.stats.carryover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
              {reportData.stats.carryover > 0 && (
                <p className="text-[10px] text-purple-500 flex items-center gap-1 mt-0.5">
                  <Info className="w-2.5 h-2.5" /> From previous month
                </p>
              )}
            </div>

            {/* Total Target */}
            <div className="card p-3 border dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <BarChart3 className="w-4 h-4 text-indigo-500" />
                <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Total Target</span>
              </div>
              <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">
                ₹{reportData.stats.total_target.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Achieved */}
            <div className="card p-3 border dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <Award className="w-4 h-4 text-emerald-500" />
                <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Achieved</span>
              </div>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">
                ₹{reportData.stats.achieved.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Remaining */}
            <div className="card p-3 border dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <TrendingDown className="w-4 h-4 text-amber-500" />
                <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Remaining</span>
              </div>
              <p className="text-lg font-bold text-amber-600 dark:text-amber-400">
                ₹{reportData.stats.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </p>
            </div>

            {/* Achievement % */}
            <div className="card p-3 border dark:border-slate-700">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-cyan-500" />
                <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Achievement</span>
              </div>
              <p className={clsx(
                "text-lg font-bold",
                reportData.stats.percentage >= 100 ? "text-green-600 dark:text-green-400" :
                reportData.stats.percentage >= 50 ? "text-amber-600 dark:text-amber-400" :
                "text-red-600 dark:text-red-400"
              )}>
                {reportData.stats.percentage.toFixed(2)}%
              </p>
            </div>
          </div>

          {/* ─── Progress Bar ─── */}
          <div className="card p-4 border dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                MGER Achievement Progress
              </span>
              <span className="text-xs text-gray-500">
                {reportData.current_month}
              </span>
            </div>
            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
              <div
                className={clsx(
                  "h-full rounded-full transition-all duration-500",
                  reportData.stats.percentage >= 100 ? "bg-gradient-to-r from-green-400 to-green-600" :
                  reportData.stats.percentage >= 50 ? "bg-gradient-to-r from-amber-400 to-amber-600" :
                  "bg-gradient-to-r from-red-400 to-red-600"
                )}
                style={{ width: `${Math.min(100, reportData.stats.percentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between mt-2 text-[10px] text-gray-500">
              <span>₹0</span>
              <span>₹{reportData.stats.total_target.toLocaleString('en-IN')}</span>
            </div>
            {isCurrentMonth && reportData.stats.days_left > 0 && (
              <div className="flex items-center gap-4 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                <div className="flex items-center gap-1.5 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">Days left:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{reportData.stats.days_left}</span>
                </div>
                <div className="flex items-center gap-1.5 text-xs">
                  <Target className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">Daily needed:</span>
                  <span className="font-semibold text-amber-600 dark:text-amber-400">
                    ₹{reportData.stats.daily_target_needed.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="flex items-center gap-1.5 text-xs ml-auto">
                  <Package className="w-3.5 h-3.5 text-gray-400" />
                  <span className="text-gray-500">Purchases:</span>
                  <span className="font-semibold text-gray-700 dark:text-gray-200">{reportData.stats.purchase_count}</span>
                </div>
              </div>
            )}
          </div>

          {/* ─── Tab Navigation ─── */}
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="flex gap-1 overflow-x-auto -mb-px">
              {[
                { id: 'overview', label: 'Monthly History', icon: BarChart3 },
                { id: 'breakdown', label: 'Purchase Breakdown', icon: Package },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={clsx(
                    "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors",
                    activeTab === tab.id
                      ? "border-emerald-500 text-emerald-600 dark:text-emerald-400"
                      : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
                  )}
                >
                  <tab.icon className="w-3.5 h-3.5" />
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
                MONTHLY HISTORY TAB
            ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'overview' && (
  <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
            <th className="p-3 text-left font-semibold">Month</th>
            <th className="p-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">Total Target</th>
            <th className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">Achieved</th>
            <th className="p-3 text-right font-semibold text-amber-600 dark:text-amber-400">Remaining</th>
            <th className="p-3 text-right font-semibold text-purple-600 dark:text-purple-400">Carryover</th>
            <th className="p-3 text-right font-semibold">Base Target</th>
            <th className="p-3 text-right font-semibold">Achievement %</th>
            <th className="p-3 text-center font-semibold w-32">Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
          {reportData.monthly_history.map((h, idx) => (
            <tr
              key={h.month}
              className={clsx(
                "hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors",
                idx === 0 && "bg-emerald-50/30 dark:bg-emerald-900/10"
              )}
            >
              <td className="p-3 font-medium text-gray-800 dark:text-gray-200">
                {h.month}
                {idx === 0 && (
                  <span className="ml-2 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 font-semibold">
                    CURRENT
                  </span>
                )}
              </td>
              <td className="p-3 text-right font-semibold text-indigo-600 dark:text-indigo-400">
                ₹{h.total_target.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
                ₹{h.achieved.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="p-3 text-right font-semibold text-amber-600 dark:text-amber-400">
                ₹{h.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="p-3 text-right">
                {h.carryover !== 0
                  ? (
                    <span className={clsx(
                      "font-medium",
                      h.carryover > 0 ? "text-purple-600 dark:text-purple-400" : "text-green-600 dark:text-green-400"
                    )}>
                      ₹{h.carryover.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                    </span>
                  )
                  : <span className="text-gray-300 dark:text-gray-600">—</span>
                }
              </td>
              <td className="p-3 text-right text-gray-500 dark:text-gray-400">
                ₹{h.base_target.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </td>
              <td className="p-3 text-right">
                <span className={clsx(
                  "font-bold",
                  h.percentage >= 100 ? "text-green-600 dark:text-green-400" :
                  h.percentage >= 50 ? "text-amber-600 dark:text-amber-400" :
                  "text-red-600 dark:text-red-400"
                )}>
                  {h.percentage.toFixed(2)}%
                </span>
              </td>
              <td className="p-3">
                <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                  <div
                    className={clsx(
                      "h-full rounded-full transition-all",
                      h.percentage >= 100 ? "bg-green-500" :
                      h.percentage >= 50 ? "bg-amber-500" :
                      "bg-red-500"
                    )}
                    style={{ width: `${Math.min(100, h.percentage)}%` }}
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>

        {/* Totals */}
        <tfoot>
          <tr className="bg-slate-100 dark:bg-slate-800/60 font-bold border-t-2 border-slate-200 dark:border-slate-600">
            <td className="p-3 text-gray-800 dark:text-gray-200">TOTAL</td>
            <td className="p-3 text-right text-indigo-600 dark:text-indigo-400">
              ₹{reportData.monthly_history.reduce((s, h) => s + h.total_target, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </td>
            <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">
              ₹{reportData.monthly_history.reduce((s, h) => s + h.achieved, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </td>
            <td className="p-3 text-right text-amber-600 dark:text-amber-400">
              ₹{reportData.monthly_history.reduce((s, h) => s + h.remaining, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </td>
            <td className="p-3 text-right text-purple-600 dark:text-purple-400">
              ₹{reportData.monthly_history.reduce((s, h) => s + h.carryover, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </td>
            <td className="p-3 text-right">
              ₹{reportData.monthly_history.reduce((s, h) => s + h.base_target, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </td>
            <td className="p-3 text-right">
              {(() => {
                const totalT = reportData.monthly_history.reduce((s, h) => s + h.total_target, 0)
                const totalA = reportData.monthly_history.reduce((s, h) => s + h.achieved, 0)
                const pct = totalT > 0 ? (totalA / totalT * 100) : 0
                return (
                  <span className={clsx(
                    "font-bold",
                    pct >= 100 ? "text-green-600 dark:text-green-400" :
                    pct >= 50 ? "text-amber-600 dark:text-amber-400" :
                    "text-red-600 dark:text-red-400"
                  )}>
                    {pct.toFixed(2)}%
                  </span>
                )
              })()}
            </td>
            <td className="p-3"></td>
          </tr>
        </tfoot>
      </table>
    </div>
  </div>
)}

          {/* ═══════════════════════════════════════════════════════════════
                PURCHASE BREAKDOWN TAB
            ═══════════════════════════════════════════════════════════════ */}
          {activeTab === 'breakdown' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
              {reportData.purchase_breakdown.length === 0 ? (
                <div className="p-10 text-center">
                  <Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">No purchases with MGER value this month</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
                        <th className="p-3 text-left font-semibold">#</th>
                        <th className="p-3 text-left font-semibold">Invoice No.</th>
                        <th className="p-3 text-left font-semibold">Billing Date</th>
                        <th className="p-3 text-left font-semibold">Supplier</th>
                        <th className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">MGER Value</th>
                        <th className="p-3 text-right font-semibold">Cumulative</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {reportData.purchase_breakdown.map((p, idx) => {
  // ✅ Since list is descending, add this row + all OLDER rows (idx onwards)
  const cumulative = reportData.purchase_breakdown
    .slice(idx)
    .reduce((s, x) => s + x.mgr_value, 0)
  
  return (
    <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
      <td className="p-3 text-gray-400">{idx + 1}</td>
      <td className="p-3 font-mono font-semibold text-gray-800 dark:text-gray-200">{p.invoice_number}</td>
      <td className="p-3 text-gray-600 dark:text-gray-400">
        {p.billing_date ? format(new Date(p.billing_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}
      </td>
      <td className="p-3 text-gray-600 dark:text-gray-400">{p.supplier_name || '—'}</td>
      <td className="p-3 text-right font-semibold text-emerald-600 dark:text-emerald-400">
        ₹{p.mgr_value.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </td>
      <td className="p-3 text-right text-gray-500">
        ₹{cumulative.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
      </td>
    </tr>
  )
})}
                    </tbody>
                    <tfoot>
                      <tr className="bg-slate-100 dark:bg-slate-800/60 font-bold border-t-2 border-slate-200 dark:border-slate-600">
                        <td className="p-3 text-gray-800 dark:text-gray-200" colSpan={4}>TOTAL</td>
                        <td className="p-3 text-right text-emerald-600 dark:text-emerald-400">
                          ₹{reportData.purchase_breakdown.reduce((s, p) => s + p.mgr_value, 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="p-3"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}