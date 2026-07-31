import { useState, useEffect, useMemo } from 'react'
import {
  Store, Warehouse, TrendingUp, FileDown,
  Search, AlertCircle, Loader as Loader2, ChevronLeft, ChevronRight
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parse } from 'date-fns'

import { getCounterSales } from '../apiservices/sales-counter'
import { getGodownSales } from '../apiservices/godown-counter'

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

export default function ItemWiseSellReport() {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Month selector — defaults to current month
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'))

  // Raw sales data
  const [counterSales, setCounterSales] = useState([])
  const [godownSales, setGodownSales] = useState([])

  // Item search filter
  const [searchTerm, setSearchTerm] = useState('')

  // ─── Company change listener ───
  useEffect(() => {
    const sync = () => {
      const id = localStorage.getItem('selectedCompanyId') || null
      if (id !== companyId) setCompanyId(id)
    }
    window.addEventListener('storage', sync)
    const iv = setInterval(sync, 1000)
    return () => { window.removeEventListener('storage', sync); clearInterval(iv) }
  }, [companyId])

  // ─── Fetch both Counter & Godown sales for the selected month ───
  useEffect(() => {
    if (!companyId) return
    fetchAllData()
  }, [selectedMonth, companyId])

  const fetchAllData = async () => {
    setLoading(true)
    setError('')
    try {
      const m = parse(selectedMonth, 'yyyy-MM', new Date())
      const from = format(startOfMonth(m), 'yyyy-MM-dd')
      const to = format(endOfMonth(m), 'yyyy-MM-dd')

      const [cData, gData] = await Promise.all([
        getCounterSales(Number(companyId), from, to).catch(() => []),
        getGodownSales(Number(companyId), from, to).catch(() => []),
      ])

      setCounterSales(cData || [])
      setGodownSales(gData || [])
    } catch (err) {
      setError(err.message || 'Failed to load sales data')
    } finally {
      setLoading(false)
    }
  }

  // ─── Generate all days in the month ───
  const days = useMemo(() => {
    const m = parse(selectedMonth, 'yyyy-MM', new Date())
    return eachDayOfInterval({ start: startOfMonth(m), end: endOfMonth(m) })
  }, [selectedMonth])

  // ─── Build item × day matrices ───
  const { counterMatrix, godownMatrix, sumMatrix, allItems } = useMemo(() => {
    const buildMatrix = (sales) => {
      const mat = {}
      ;(sales || []).forEach(sale => {
        const dayKey = format(new Date(sale.created_at), 'yyyy-MM-dd')
        ;(sale.items || []).forEach(item => {
          const name = item.product_name || 'Unknown'
          if (!mat[name]) {
            mat[name] = {}
            days.forEach(d => { mat[name][format(d, 'yyyy-MM-dd')] = 0 })
          }
          if (mat[name][dayKey] !== undefined) {
            mat[name][dayKey] += item.quantity || 0
          }
        })
      })
      return mat
    }

    const cMat = buildMatrix(counterSales)
    const gMat = buildMatrix(godownSales)

    // Collect every unique item name from both sources
    const items = Array.from(new Set([...Object.keys(cMat), ...Object.keys(gMat)])).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )

    // Ensure every matrix has every item initialised to 0
    const ensure = (mat) => {
      items.forEach(name => {
        if (!mat[name]) {
          mat[name] = {}
          days.forEach(d => { mat[name][format(d, 'yyyy-MM-dd')] = 0 })
        }
      })
    }
    ensure(cMat)
    ensure(gMat)

    // Sum matrix
    const sMat = {}
    items.forEach(name => {
      sMat[name] = {}
      days.forEach(d => {
        const dk = format(d, 'yyyy-MM-dd')
        sMat[name][dk] = (cMat[name]?.[dk] || 0) + (gMat[name]?.[dk] || 0)
      })
    })

    return { counterMatrix: cMat, godownMatrix: gMat, sumMatrix: sMat, allItems: items }
  }, [counterSales, godownSales, days])

  // ─── Search filter ───
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return allItems
    const t = searchTerm.toLowerCase()
    return allItems.filter(n => n.toLowerCase().includes(t))
  }, [allItems, searchTerm])

  // ─── Helpers ───
  const rowTotal = (mat, name) =>
    days.reduce((s, d) => s + (mat[name]?.[format(d, 'yyyy-MM-dd')] || 0), 0)

  const colTotal = (mat, dk) =>
    filteredItems.reduce((s, n) => s + (mat[n]?.[dk] || 0), 0)

  const grandTotal = (mat) =>
    filteredItems.reduce((s, n) => s + rowTotal(mat, n), 0)

  // ─── Month navigation ───
  const shiftMonth = (delta) => {
    const m = parse(selectedMonth, 'yyyy-MM', new Date())
    m.setMonth(m.getMonth() + delta)
    setSelectedMonth(format(m, 'yyyy-MM'))
  }

  // ─── Export to Excel (3 sheets) ───
  const handleExport = async () => {
    if (filteredItems.length === 0) return alert('No data to export')

    const wb = XLSX.utils.book_new()

    const sections = [
      { label: 'Counter Sales', mat: counterMatrix },
      { label: 'Godown Sales', mat: godownMatrix },
      { label: 'Sum (Counter + Godown)', mat: sumMatrix },
    ]

    sections.forEach(({ label, mat }) => {
      const header = ['Item', ...days.map(d => format(d, 'dd/MM/yyyy')), 'Total']
      const rows = filteredItems.map(name => [
        name,
        ...days.map(d => mat[name]?.[format(d, 'yyyy-MM-dd')] || 0),
        rowTotal(mat, name),
      ])
      // Grand‑total row
      rows.push([
        'TOTAL',
        ...days.map(d => colTotal(mat, format(d, 'yyyy-MM-dd'))),
        grandTotal(mat),
      ])

      const ws = XLSX.utils.aoa_to_sheet([header, ...rows])
      ws['!cols'] = [{ wch: 28 }, ...days.map(() => ({ wch: 12 })), { wch: 10 }]
      XLSX.utils.book_append_sheet(wb, ws, label.slice(0, 31))
    })

    const fileName = `item_wise_sell_${selectedMonth}_${companyName}.xlsx`
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    if (isTauri()) {
      try {
        const fp = await save({ defaultPath: fileName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
        if (fp) await writeFile(fp, new Uint8Array(wbout))
      } catch {
        downloadAsBlob(wbout, fileName)
      }
    } else {
      downloadAsBlob(wbout, fileName)
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Guard — no company
  // ═══════════════════════════════════════════════════════════════
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view the item wise sell report.</p>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Reusable matrix table renderer
  // ═══════════════════════════════════════════════════════════════
  const renderMatrix = (title, mat, accentClass, Icon) => {
    const gt = grandTotal(mat)

    // Background tokens for sticky cells (must be explicit — no transparency)
    const bgEven = 'bg-white dark:bg-slate-900'
    const bgOdd = 'bg-gray-50 dark:bg-slate-800/60'
    const bgHead = 'bg-slate-50 dark:bg-slate-800'
    const bgFoot = 'bg-slate-100 dark:bg-slate-800'

    return (
      <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
        {/* Section header */}
        <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-900">
          <h3 className={clsx('font-semibold text-sm flex items-center gap-2', accentClass)}>
            <Icon className="w-4 h-4" />
            {title}
            <span className="text-[11px] font-normal text-gray-400 ml-1">
              {filteredItems.length} items · Grand Total: <span className="font-bold">{gt}</span> qty
            </span>
          </h3>
        </div>

        {/* Scrollable table */}
        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-[11px] border-collapse whitespace-nowrap">
            {/* ── Head ── */}
            <thead className={clsx('sticky top-0 z-20', bgHead)}>
              <tr>
                <th className={clsx('p-2.5 text-left font-semibold text-gray-600 dark:text-gray-400 sticky left-0 z-30 min-w-[210px] border-b border-r border-gray-200 dark:border-slate-700', bgHead)}>
                  Item Name
                </th>
                {days.map(d => {
                  const dk = format(d, 'yyyy-MM-dd')
                  const sun = d.getDay() === 0
                  return (
                    <th
                      key={dk}
                      className={clsx(
                        'p-1.5 text-center font-semibold border-b border-gray-200 dark:border-slate-700 min-w-[52px]',
                        sun
                          ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400'
                          : 'text-gray-500 dark:text-gray-400'
                      )}
                    >
                      <div className="text-[9px] leading-none mb-0.5">{format(d, 'EEE')}</div>
                      <div className="text-xs">{format(d, 'dd')}</div>
                    </th>
                  )
                })}
                <th className={clsx('p-2.5 text-center font-bold text-gray-700 dark:text-gray-300 sticky right-0 z-30 min-w-[64px] border-b border-l border-gray-200 dark:border-slate-700', bgHead)}>
                  Total
                </th>
              </tr>
            </thead>

            {/* ── Body ── */}
            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 2} className="text-center py-10 text-gray-400">
                    {searchTerm ? 'No items match your search' : 'No sales data for this month'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((name, idx) => {
                  const rt = rowTotal(mat, name)
                  const bg = idx % 2 === 0 ? bgEven : bgOdd
                  return (
                    <tr key={name} className={clsx('transition-colors hover:brightness-95 dark:hover:brightness-110', bg)}>
                      {/* Sticky item name */}
                      <td
                        className={clsx(
                          'p-2.5 font-medium text-gray-800 dark:text-gray-200 sticky left-0 z-10 border-r border-gray-100 dark:border-slate-700/50',
                          bg
                        )}
                      >
                        {name}
                      </td>
                      {/* Day cells */}
                      {days.map(d => {
                        const dk = format(d, 'yyyy-MM-dd')
                        const qty = mat[name]?.[dk] || 0
                        const sun = d.getDay() === 0
                        return (
                          <td
                            key={dk}
                            className={clsx(
                              'p-1.5 text-center border-b border-gray-50 dark:border-slate-800/40',
                              qty > 0
                                ? 'font-semibold text-gray-800 dark:text-gray-100'
                                : 'text-gray-300 dark:text-slate-700',
                              sun && 'bg-rose-50/40 dark:bg-rose-900/10'
                            )}
                          >
                            {qty > 0 ? qty : ''}
                          </td>
                        )
                      })}
                      {/* Sticky row total */}
                      <td
                        className={clsx(
                          'p-2.5 text-center font-bold sticky right-0 z-10 border-l border-gray-100 dark:border-slate-700/50',
                          rt > 0
                            ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/15'
                            : clsx('text-gray-300 dark:text-slate-700', bg)
                        )}
                      >
                        {rt > 0 ? rt : ''}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {/* ── Foot (column totals) ── */}
            {filteredItems.length > 0 && (
              <tfoot className={clsx('sticky bottom-0 z-20 border-t-2 border-slate-300 dark:border-slate-600', bgFoot)}>
                <tr className="font-bold text-[11px]">
                  <td className={clsx('p-2.5 text-gray-700 dark:text-gray-300 sticky left-0 z-30 border-r border-gray-200 dark:border-slate-700', bgFoot)}>
                    TOTAL
                  </td>
                  {days.map(d => {
                    const dk = format(d, 'yyyy-MM-dd')
                    const ct = colTotal(mat, dk)
                    const sun = d.getDay() === 0
                    return (
                      <td
                        key={dk}
                        className={clsx(
                          'p-1.5 text-center',
                          ct > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-300 dark:text-slate-700',
                          sun && 'bg-rose-50/30 dark:bg-rose-900/10'
                        )}
                      >
                        {ct > 0 ? ct : ''}
                      </td>
                    )
                  })}
                  <td className={clsx(
                    'p-2.5 text-center font-extrabold sticky right-0 z-30 border-l border-gray-200 dark:border-slate-700',
                    gt > 0
                      ? 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/25'
                      : clsx('text-gray-300 dark:text-slate-700', bgFoot)
                  )}>
                    {gt > 0 ? gt : ''}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Render
  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="space-y-5">

      {/* ── Page header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Item Wise Sell Report
          </h2>
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3 h-3 text-primary-500" />
            <span className="text-[11px] font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </span>
        </div>
        <button
          onClick={handleExport}
          disabled={loading || filteredItems.length === 0}
          className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-sm"
        >
          <FileDown className="w-4 h-4" /> Export Excel
        </button>
      </div>

      {/* ── Error banner ── */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ── Controls bar ── */}
      <div className="card p-4 border dark:border-slate-700 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">

          {/* Month picker with arrows */}
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] text-gray-500 mb-1 font-semibold uppercase tracking-wide">Month</label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => shiftMonth(-1)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Previous month"
              >
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={e => setSelectedMonth(e.target.value)}
                className="input-field text-sm flex-1"
              />
              <button
                onClick={() => shiftMonth(1)}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title="Next month"
              >
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-gray-500 mb-1 font-semibold uppercase tracking-wide">Search Item</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Type item name..."
                className="input-field text-sm pl-9 w-full"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs font-bold"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Quick stat badges */}
          <div className="flex gap-2.5 flex-shrink-0">
            <div className="text-center px-4 py-2 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 min-w-[72px]">
              <div className="text-[9px] text-blue-500 font-semibold uppercase tracking-wider">Items</div>
              <div className="text-lg font-extrabold text-blue-700 dark:text-blue-300 leading-tight">{filteredItems.length}</div>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 min-w-[72px]">
              <div className="text-[9px] text-amber-500 font-semibold uppercase tracking-wider">Days</div>
              <div className="text-lg font-extrabold text-amber-700 dark:text-amber-300 leading-tight">{days.length}</div>
            </div>
            <div className="text-center px-4 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 min-w-[72px]">
              <div className="text-[9px] text-emerald-500 font-semibold uppercase tracking-wider">Sum</div>
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 leading-tight">{grandTotal(sumMatrix)}</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Loading state ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">Loading sales data for {format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}…</p>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Counter */}
          {renderMatrix('Counter Sales', counterMatrix, 'text-blue-600 dark:text-blue-400', Store)}

          {/* Godown */}
          {renderMatrix('Godown Sales', godownMatrix, 'text-purple-600 dark:text-purple-400', Warehouse)}

          {/* Sum */}
          {renderMatrix('Sum (Counter + Godown)', sumMatrix, 'text-emerald-600 dark:text-emerald-400', TrendingUp)}
        </div>
      )}
    </div>
  )
}