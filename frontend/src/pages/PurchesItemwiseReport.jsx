import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Warehouse, Store, TrendingUp, FileDown,
  Search, AlertCircle, Loader as Loader2, ChevronLeft, ChevronRight
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { format, startOfMonth, endOfMonth, eachDayOfInterval, parse } from 'date-fns'

import { getPurchases, getPurchaseItems } from '../apiservices/purchasesapi'

// ─── Normalize item fields ───
function normalizeItem(item) {
  // Try every alias, then fall back to computed
  let total_bottles = Number(
    item.total_bottles ?? item.totalBottles ??
    item.qty_bottles ?? item.qtyBottles
  ) || 0

  const qty_cases = Number(item.qty_cases ?? item.qtyCases) || 0
  const bottles_per_case = Number(item.bottles_per_case ?? item.bottlesPerCase) || 0

  // ✅ If DB stored 0, compute from cases × bottles_per_case
 if (total_bottles === 0) {
  if (qty_cases > 0 && bottles_per_case > 0) {
    total_bottles = qty_cases * bottles_per_case
  } else if (Number(item.qty_bottles ?? item.qtyBottles) > 0) {
    total_bottles = Number(item.qty_bottles ?? item.qtyBottles)
  }
}

  const purchase_rate_per_unit = Number(item.purchase_rate_per_unit ?? item.purchaseRatePerUnit) || 0
  const stored_total_cost = Number(item.total_cost) || 0

  let total_cost
  if (purchase_rate_per_unit > 0 && total_bottles > 0) {
    total_cost = total_bottles * purchase_rate_per_unit
  } else if (stored_total_cost > 0) {
    total_cost = stored_total_cost
  } else {
    total_cost = 0
  }

  return {
    id: item.id,
    purchase_id: item.purchase_id,
    product_name: item.product_name ?? item.name ?? '',
    brand: item.brand ?? '',
    category: item.category ?? '',
    bottle_size: item.bottle_size ?? '',
    traditional_name: item.traditional_name ?? '',
    bottles_per_case: bottles_per_case,
    mrp: Number(item.mrp) || 0,
    unit_cost: Number(item.unit_cost ?? item.purchaseRate) || 0,
    purchase_rate_per_unit: purchase_rate_per_unit,
    selling_rate: Number(item.selling_rate ?? item.sellingRate) || 0,
    qty_cases: qty_cases,
    qty_bottles: Number(item.qty_bottles ?? item.qtyBottles) || 0,
    total_bottles: total_bottles,   // ✅ computed fallback
    qty_bulk_liters: Number(item.qty_bulk_liters ?? item.qtyBulkLiters) || 0,
    qty_lp_liters: Number(item.qty_lp_liters ?? item.qtyLPLiters) || 0,
    total_cost: total_cost,
  }
}

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

export default function ItemWisePurchaseReport() {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [loading, setLoading] = useState(false)
  const [loadingProgress, setLoadingProgress] = useState('')
  const [error, setError] = useState('')

  // Month selector
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM-dd').slice(0, 7))

  // Items with _date attached directly
  const [godownItems, setGodownItems] = useState([])
  const [counterItems, setCounterItems] = useState([])

  // Item search
  const [searchTerm, setSearchTerm] = useState('')

  // Value display mode
  const [valueMode, setValueMode] = useState('bottles')

  

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

  // ─── Generate all days in the month ───
  const days = useMemo(() => {
    const m = parse(selectedMonth, 'yyyy-MM', new Date())
    return eachDayOfInterval({ start: startOfMonth(m), end: endOfMonth(m) })
  }, [selectedMonth])

  // ─── Fetch purchases & items ───
  useEffect(() => {
    if (!companyId) return
    fetchAllData()
  }, [selectedMonth, companyId])


  const fetchAllData = async () => {
  setLoading(true)
  setError('')
  setGodownItems([])
  setCounterItems([])
  try {
    const m = parse(selectedMonth, 'yyyy-MM', new Date())
    const from = format(startOfMonth(m), 'yyyy-MM-dd')
    const to = format(endOfMonth(m), 'yyyy-MM-dd')

    console.log('=== FETCH DEBUG ===')
    console.log('companyId:', companyId, 'from:', from, 'to:', to)

    const allPurchases = await getPurchases(Number(companyId))
    console.log('allPurchases raw:', allPurchases)

    const purchaseList = Array.isArray(allPurchases)
      ? allPurchases
      : (allPurchases?.results || allPurchases?.data || [])
    console.log('purchaseList length:', purchaseList.length)
    console.log('purchaseList sample:', purchaseList[0])

    const monthPurchases = purchaseList.filter(p => {
      const raw = p.billing_date || p.purchase_date
      if (!raw) return false
      const pDate = typeof raw === 'string' ? raw.slice(0, 10) : format(new Date(raw), 'yyyy-MM-dd')
      return pDate >= from && pDate <= to
    })
    console.log('monthPurchases length:', monthPurchases.length)

    setLoadingProgress(`Found ${monthPurchases.length} purchase(s). Loading items…`)

    const gItems = []
    const cItems = []

    for (let i = 0; i < monthPurchases.length; i++) {
      const p = monthPurchases[i]
      const dest = (p.stock_destination || 'GODOWN').toUpperCase()

      const rawDate = p.billing_date || p.purchase_date || ''
      const pDate = typeof rawDate === 'string'
        ? rawDate.slice(0, 10)
        : format(new Date(rawDate), 'yyyy-MM-dd')

      setLoadingProgress(`Loading items ${i + 1}/${monthPurchases.length}…`)

      try {
        const rawItems = await getPurchaseItems(p.id)
        console.log(`Purchase ${p.id} items raw:`, rawItems)

        const items = (rawItems || []).map(normalizeItem).map(item => ({
          ...item,
          _date: pDate,
        }))
        console.log(`Purchase ${p.id} normalized items:`, items)

        if (dest === 'COUNTER') cItems.push(...items)
        else gItems.push(...items)
      } catch (err) {
        console.warn(`Failed to load items for purchase ${p.id}:`, err)
      }
    }

    console.log('gItems:', gItems)
    console.log('cItems:', cItems)

    setGodownItems(gItems)
    setCounterItems(cItems)
    setLoadingProgress('')
  } catch (err) {
    console.error('fetchAllData error:', err)
    setError(err.message || 'Failed to load purchase data')
  } finally {
    setLoading(false)
    setLoadingProgress('')
  }
}

//   const fetchAllData = async () => {
//     setLoading(true)
//     setError('')
//     setGodownItems([])
//     setCounterItems([])
//     try {
//       const m = parse(selectedMonth, 'yyyy-MM', new Date())
//       const from = format(startOfMonth(m), 'yyyy-MM-dd')
//       const to = format(endOfMonth(m), 'yyyy-MM-dd')

//       const allPurchases = await getPurchases(Number(companyId))
//       const purchaseList = Array.isArray(allPurchases) ? allPurchases : (allPurchases?.results || allPurchases?.data || [])

//       // Filter by selected month
//       const monthPurchases = purchaseList.filter(p => {
//   const raw = p.billing_date || p.purchase_date
//   if (!raw) return false
//   // Force to yyyy-MM-dd string regardless of what the API returns
//   const pDate = typeof raw === 'string' ? raw.slice(0, 10) : format(new Date(raw), 'yyyy-MM-dd')
//   return pDate >= from && pDate <= to
// })

//       setLoadingProgress(`Found ${monthPurchases.length} purchase(s). Loading items…`)

//       const gItems = []
//       const cItems = []

//       for (let i = 0; i < monthPurchases.length; i++) {
//   const p = monthPurchases[i]
//   const dest = (p.stock_destination || 'GODOWN').toUpperCase()

//   // ✅ Always a plain yyyy-MM-dd string
//   const rawDate = p.billing_date || p.purchase_date || ''
//   const pDate = typeof rawDate === 'string'
//     ? rawDate.slice(0, 10)
//     : format(new Date(rawDate), 'yyyy-MM-dd')

//   setLoadingProgress(`Loading items ${i + 1}/${monthPurchases.length}…`)

//   try {
//     const rawItems = await getPurchaseItems(p.id)
//     const items = (rawItems || []).map(normalizeItem).map(item => ({
//       ...item,
//       _date: pDate,
//     }))

//     if (dest === 'COUNTER') cItems.push(...items)
//     else gItems.push(...items)
//   } catch (err) {
//     console.warn(`Failed to load items for purchase ${p.id}:`, err)
//   }
// }

//       setGodownItems(gItems)
//       setCounterItems(cItems)
//       setLoadingProgress('')
//     } catch (err) {
//       setError(err.message || 'Failed to load purchase data')
//     } finally {
//       setLoading(false)
//       setLoadingProgress('')
//     }
//   }

  // ─── Build matrix from items (uses item._date, no purchaseMap needed) ───
  const buildMatrix = useCallback((items) => {
    const mat = {}
    items.forEach(item => {
      const name = item.product_name || 'Unknown'
      if (!mat[name]) {
        mat[name] = {}
        days.forEach(d => { mat[name][format(d, 'yyyy-MM-dd')] = { bottles: 0, cases: 0, cost: 0 } })
      }

      // ✅ Use _date attached during fetch — no .find() needed
      let dayKey = null
if (item._date) {
  try {
    // Handles both "2024-01-15" and Date objects safely
    const d = item._date instanceof Date
      ? item._date
      : new Date(String(item._date).slice(0, 10) + 'T00:00:00')
    if (!isNaN(d.getTime())) dayKey = format(d, 'yyyy-MM-dd')
  } catch { /* skip */ }
}

      if (dayKey && mat[name][dayKey] !== undefined) {
        mat[name][dayKey].bottles += item.total_bottles || 0
        mat[name][dayKey].cases += item.qty_cases || 0
        mat[name][dayKey].cost += item.total_cost || 0
      }
    })
    return mat
  }, [days])

  // ─── Build all three matrices ───
  const { godownMatrix, counterMatrix, sumMatrix, allItems } = useMemo(() => {
    const gMat = buildMatrix(godownItems)
    const cMat = buildMatrix(counterItems)

    const items = Array.from(new Set([...Object.keys(gMat), ...Object.keys(cMat)])).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    )

    // Ensure every matrix has every item
    const ensure = (mat) => {
      items.forEach(name => {
        if (!mat[name]) {
          mat[name] = {}
          days.forEach(d => { mat[name][format(d, 'yyyy-MM-dd')] = { bottles: 0, cases: 0, cost: 0 } })
        }
      })
    }
    ensure(gMat)
    ensure(cMat)

    // Sum matrix
    const sMat = {}
    items.forEach(name => {
      sMat[name] = {}
      days.forEach(d => {
        const dk = format(d, 'yyyy-MM-dd')
        sMat[name][dk] = {
          bottles: (gMat[name]?.[dk]?.bottles || 0) + (cMat[name]?.[dk]?.bottles || 0),
          cases: (gMat[name]?.[dk]?.cases || 0) + (cMat[name]?.[dk]?.cases || 0),
          cost: (gMat[name]?.[dk]?.cost || 0) + (cMat[name]?.[dk]?.cost || 0),
        }
      })
    })

    return { godownMatrix: gMat, counterMatrix: cMat, sumMatrix: sMat, allItems: items }
  }, [godownItems, counterItems, days, buildMatrix])

  // ─── Search filter ───
  const filteredItems = useMemo(() => {
    if (!searchTerm.trim()) return allItems
    const t = searchTerm.toLowerCase()
    return allItems.filter(n => n.toLowerCase().includes(t))
  }, [allItems, searchTerm])

  // ─── Helpers ───
  const rowTotal = (mat, name, field = 'bottles') =>
    days.reduce((s, d) => s + (mat[name]?.[format(d, 'yyyy-MM-dd')]?.[field] || 0), 0)

  const colTotal = (mat, dk, field = 'bottles') =>
    filteredItems.reduce((s, n) => s + (mat[n]?.[dk]?.[field] || 0), 0)

  const grandTotal = (mat, field = 'bottles') =>
    filteredItems.reduce((s, n) => s + rowTotal(mat, n, field), 0)

  // ─── Month navigation ───
  const shiftMonth = (delta) => {
    const m = parse(selectedMonth, 'yyyy-MM', new Date())
    m.setMonth(m.getMonth() + delta)
    setSelectedMonth(format(m, 'yyyy-MM'))
  }

  // ─── Export to Excel ───
  const handleExport = async () => {
    if (filteredItems.length === 0) return alert('No data to export')

    const wb = XLSX.utils.book_new()
    const sections = [
      { label: 'Godown Purchases', mat: godownMatrix },
      { label: 'Counter Purchases', mat: counterMatrix },
      { label: 'Sum (Godown + Counter)', mat: sumMatrix },
    ]

    sections.forEach(({ label, mat }) => {
      // Bottles sheet
      const bHeader = ['Item', ...days.map(d => format(d, 'dd/MM/yyyy')), 'Total Bottles']
      const bRows = filteredItems.map(name => [
        name,
        ...days.map(d => mat[name]?.[format(d, 'yyyy-MM-dd')]?.bottles || 0),
        rowTotal(mat, name, 'bottles'),
      ])
      bRows.push(['TOTAL', ...days.map(d => colTotal(mat, format(d, 'yyyy-MM-dd'), 'bottles')), grandTotal(mat, 'bottles')])
      const ws1 = XLSX.utils.aoa_to_sheet([bHeader, ...bRows])
      ws1['!cols'] = [{ wch: 28 }, ...days.map(() => ({ wch: 12 })), { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, ws1, `${label.slice(0, 25)}-Bottles`)

      // Cost sheet
      const cHeader = ['Item', ...days.map(d => format(d, 'dd/MM/yyyy')), 'Total Cost']
      const cRows = filteredItems.map(name => [
        name,
        ...days.map(d => mat[name]?.[format(d, 'yyyy-MM-dd')]?.cost || 0),
        rowTotal(mat, name, 'cost'),
      ])
      cRows.push(['TOTAL', ...days.map(d => colTotal(mat, format(d, 'yyyy-MM-dd'), 'cost')), grandTotal(mat, 'cost')])
      const ws2 = XLSX.utils.aoa_to_sheet([cHeader, ...cRows])
      ws2['!cols'] = [{ wch: 28 }, ...days.map(() => ({ wch: 12 })), { wch: 14 }]
      XLSX.utils.book_append_sheet(wb, ws2, `${label.slice(0, 25)}-Cost`)
    })

    const fileName = `item_wise_purchase_${selectedMonth}_${companyName}.xlsx`
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    if (isTauri()) {
      try {
        const fp = await save({ defaultPath: fileName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
        if (fp) await writeFile(fp, new Uint8Array(wbout))
      } catch { downloadAsBlob(wbout, fileName) }
    } else {
      downloadAsBlob(wbout, fileName)
    }
  }

  // ─── Guard: no company ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view the item wise purchase report.</p>
      </div>
    )
  }

  // ═══════════════════════════════════════════════════════════════
  // Reusable matrix table renderer
  // ═══════════════════════════════════════════════════════════════
  const renderMatrix = (title, mat, accentClass, Icon) => {
    const field = valueMode === 'cost' ? 'cost' : 'bottles'
    const gt = grandTotal(mat, field)
    const isCost = valueMode === 'cost'

    const bgEven = 'bg-white dark:bg-slate-900'
    const bgOdd = 'bg-gray-50 dark:bg-slate-800/60'
    const bgHead = 'bg-slate-50 dark:bg-slate-800'
    const bgFoot = 'bg-slate-100 dark:bg-slate-800'

    const fmtVal = (v) => {
      if (v === 0 || v == null) return ''
      return isCost ? `₹${Number(v).toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : v
    }

    return (
      <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
        <div className="px-4 py-3 border-b dark:border-slate-700 flex items-center justify-between bg-white dark:bg-slate-900">
          <h3 className={clsx('font-semibold text-sm flex items-center gap-2', accentClass)}>
            <Icon className="w-4 h-4" />
            {title}
            <span className="text-[11px] font-normal text-gray-400 ml-1">
              {filteredItems.length} items · Grand Total:{' '}
              <span className="font-bold">
                {isCost ? '₹' : ''}{gt.toLocaleString('en-IN')}
              </span>
              <span className="text-gray-500 ml-0.5">{isCost ? '' : ' btls'}</span>
            </span>
          </h3>
        </div>

        <div className="overflow-x-auto max-h-[520px] overflow-y-auto">
          <table className="w-full text-[11px] border-collapse whitespace-nowrap">
            <thead className={clsx('sticky top-0 z-20', bgHead)}>
              <tr>
                <th className={clsx('p-2.5 text-left font-semibold text-gray-600 dark:text-gray-400 sticky left-0 z-30 min-w-[210px] border-b border-r border-gray-200 dark:border-slate-700', bgHead)}>
                  Item Name
                </th>
                {days.map(d => {
                  const dk = format(d, 'yyyy-MM-dd')
                  const sun = d.getDay() === 0
                  return (
                    <th key={dk} className={clsx(
                      'p-1.5 text-center font-semibold border-b border-gray-200 dark:border-slate-700 min-w-[56px]',
                      sun ? 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400' : 'text-gray-500 dark:text-gray-400'
                    )}>
                      <div className="text-[9px] leading-none mb-0.5">{format(d, 'EEE')}</div>
                      <div className="text-xs">{format(d, 'dd')}</div>
                    </th>
                  )
                })}
                <th className={clsx('p-2.5 text-center font-bold text-gray-700 dark:text-gray-300 sticky right-0 z-30 min-w-[72px] border-b border-l border-gray-200 dark:border-slate-700', bgHead)}>
                  {isCost ? 'Total ₹' : 'Total'}
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-100 dark:divide-gray-800/60">
              {filteredItems.length === 0 ? (
                <tr>
                  <td colSpan={days.length + 2} className="text-center py-10 text-gray-400">
                    {searchTerm ? 'No items match your search' : 'No purchase data for this month'}
                  </td>
                </tr>
              ) : (
                filteredItems.map((name, idx) => {
                  const rt = rowTotal(mat, name, field)
                  const bg = idx % 2 === 0 ? bgEven : bgOdd
                  return (
                    <tr key={name} className={clsx('transition-colors hover:brightness-95 dark:hover:brightness-110', bg)}>
                      <td className={clsx('p-2.5 font-medium text-gray-800 dark:text-gray-200 sticky left-0 z-10 border-r border-gray-100 dark:border-slate-700/50', bg)}>
                        {name}
                      </td>
                      {days.map(d => {
                        const dk = format(d, 'yyyy-MM-dd')
                        const val = mat[name]?.[dk]?.[field] || 0
                        const sun = d.getDay() === 0
                        return (
                          <td key={dk} className={clsx(
                            'p-1.5 text-center border-b border-gray-50 dark:border-slate-800/40',
                            val > 0
                              ? isCost ? 'font-semibold text-orange-700 dark:text-orange-400' : 'font-semibold text-gray-800 dark:text-gray-100'
                              : 'text-gray-300 dark:text-slate-700',
                            sun && 'bg-rose-50/40 dark:bg-rose-900/10'
                          )}>
                            {fmtVal(val)}
                          </td>
                        )
                      })}
                      <td className={clsx(
                        'p-2.5 text-center font-bold sticky right-0 z-10 border-l border-gray-100 dark:border-slate-700/50',
                        rt > 0
                          ? isCost ? 'text-orange-600 dark:text-orange-400 bg-orange-50/80 dark:bg-orange-900/15' : 'text-emerald-600 dark:text-emerald-400 bg-emerald-50/80 dark:bg-emerald-900/15'
                          : clsx('text-gray-300 dark:text-slate-700', bg)
                      )}>
                        {fmtVal(rt)}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>

            {filteredItems.length > 0 && (
              <tfoot className={clsx('sticky bottom-0 z-20 border-t-2 border-slate-300 dark:border-slate-600', bgFoot)}>
                <tr className="font-bold text-[11px]">
                  <td className={clsx('p-2.5 text-gray-700 dark:text-gray-300 sticky left-0 z-30 border-r border-gray-200 dark:border-slate-700', bgFoot)}>TOTAL</td>
                  {days.map(d => {
                    const dk = format(d, 'yyyy-MM-dd')
                    const ct = colTotal(mat, dk, field)
                    const sun = d.getDay() === 0
                    return (
                      <td key={dk} className={clsx(
                        'p-1.5 text-center',
                        ct > 0
                          ? isCost ? 'text-orange-600 dark:text-orange-400' : 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-300 dark:text-slate-700',
                        sun && 'bg-rose-50/30 dark:bg-rose-900/10'
                      )}>
                        {fmtVal(ct)}
                      </td>
                    )
                  })}
                  <td className={clsx(
                    'p-2.5 text-center font-extrabold sticky right-0 z-30 border-l border-gray-200 dark:border-slate-700',
                    gt > 0
                      ? isCost ? 'text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-900/25' : 'text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-900/25'
                      : clsx('text-gray-300 dark:text-slate-700', bgFoot)
                  )}>
                    {fmtVal(gt)}
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

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" />
            Item Wise Purchase Report
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

      {/* ── Error ── */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ── Controls ── */}
      <div className="card p-4 border dark:border-slate-700 shadow-sm">
        <div className="flex flex-col md:flex-row gap-4 items-start md:items-end">

          {/* Month picker */}
          <div className="flex-1 min-w-[240px]">
            <label className="block text-[11px] text-gray-500 mb-1 font-semibold uppercase tracking-wide">Month</label>
            <div className="flex items-center gap-1.5">
              <button onClick={() => shiftMonth(-1)} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Previous month">
                <ChevronLeft className="w-4 h-4 text-gray-500" />
              </button>
              <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="input-field text-sm flex-1" />
              <button onClick={() => shiftMonth(1)} className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors" title="Next month">
                <ChevronRight className="w-4 h-4 text-gray-500" />
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[11px] text-gray-500 mb-1 font-semibold uppercase tracking-wide">Search Item</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Type item name..." className="input-field text-sm pl-9 w-full" />
              {searchTerm && (
                <button onClick={() => setSearchTerm('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 text-xs font-bold">✕</button>
              )}
            </div>
          </div>

          {/* Value toggle */}
          <div className="flex-shrink-0">
            <label className="block text-[11px] text-gray-500 mb-1 font-semibold uppercase tracking-wide">Show Value</label>
            <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button onClick={() => setValueMode('bottles')} className={clsx('px-3.5 py-2 text-xs font-semibold transition-colors', valueMode === 'bottles' ? 'bg-blue-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700')}>
                Bottles
              </button>
              <button onClick={() => setValueMode('cost')} className={clsx('px-3.5 py-2 text-xs font-semibold transition-colors border-l border-gray-200 dark:border-gray-700', valueMode === 'cost' ? 'bg-orange-500 text-white' : 'bg-white dark:bg-gray-800 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700')}>
                Cost ₹
              </button>
            </div>
          </div>

          {/* Stat badges */}
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
              <div className="text-lg font-extrabold text-emerald-700 dark:text-emerald-300 leading-tight">
                {valueMode === 'cost' ? '₹' : ''}{grandTotal(sumMatrix, valueMode === 'cost' ? 'cost' : 'bottles').toLocaleString('en-IN')}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Loading ── */}
      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 space-y-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          <p className="text-sm text-gray-500">
            {loadingProgress || `Loading purchase data for ${format(parse(selectedMonth, 'yyyy-MM', new Date()), 'MMMM yyyy')}…`}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {renderMatrix('Godown Purchases', godownMatrix, 'text-amber-600 dark:text-amber-400', Warehouse)}
          {renderMatrix('Counter Purchases', counterMatrix, 'text-violet-600 dark:text-violet-400', Store)}
          {renderMatrix('Sum (Godown + Counter)', sumMatrix, 'text-emerald-600 dark:text-emerald-400', TrendingUp)}
        </div>
      )}
    </div>
  )
}