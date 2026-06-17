import { useState, useEffect, useMemo } from 'react'
import {
  Loader as Loader2, Filter, RotateCcw, FileDown, Package, AlertCircle,
  ArrowUpDown, ArrowUp, ArrowDown, Landmark, Calculator, FileCheck,
  Search, ChevronLeft, ChevronRight, Store
} from 'lucide-react'
import clsx from 'clsx'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

// Import API functions
import { getProducts } from '../apiservices/inventoryapi'
import { getPurchases, getPurchaseItems } from '../apiservices/purchasesapi'
import { getStockTransfers, getStockTransferItems } from '../apiservices/stockTransferapi'

// ─── Constants ───
const CATEGORIES = ['WHISKY', 'RUM', 'VODKA', 'GIN', 'BEER', 'WINE', 'BRANDY', 'OTHER']

// ─── Helpers ───
function getSortIcon(sortDir) {
  if (sortDir === 'asc') return <ArrowUp className="w-3 h-3" />
  if (sortDir === 'desc') return <ArrowDown className="w-3 h-3" />
  return <ArrowUpDown className="w-3 h-3 opacity-40" />
}

function calculateLPLiters(bottles, bottleSizeStr) {
  const sizeInMl = parseInt(bottleSizeStr) || 0
  return (Number(bottles) || 0) * sizeInMl / 1000
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
export default function ExciseReport() {
  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  // ─── Data State ───
  const [products, setProducts] = useState([])
  const [purchases, setPurchases] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState('')

  // ─── Aggregated Maps ───
  const [purchaseQtyMap, setPurchaseQtyMap] = useState({})
  const [transferQtyMap, setTransferQtyMap] = useState({})

  // ─── Filter State ───
  const [filterDateFrom, setFilterDateFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'))
  const [filterDateTo, setFilterDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [filterCategory, setFilterCategory] = useState('ALL')
  const [search, setSearch] = useState('')

  // ─── UI State ───
  const [showFilters, setShowFilters] = useState(true)
  const [sortField, setSortField] = useState('slNo')
  const [sortDir, setSortDir] = useState('asc')
  const [currentPage, setCurrentPage] = useState(1)
  const ITEMS_PER_PAGE = 50

  // ─── Listen for company changes ───
  useEffect(() => {
    const handleStorage = () => {
      const newId = localStorage.getItem('selectedCompanyId') || null
      if (newId !== companyId) setCompanyId(newId)
    }
    window.addEventListener('storage', handleStorage)
    const interval = setInterval(() => {
      const newId = localStorage.getItem('selectedCompanyId') || null
      if (newId !== companyId) setCompanyId(newId)
    }, 1000)
    return () => {
      window.removeEventListener('storage', handleStorage)
      clearInterval(interval)
    }
  }, [companyId])

  // ─── 1. Initial Data Fetch (company-scoped) ───
  useEffect(() => {
    if (!companyId) {
      setProducts([])
      setPurchases([])
      setTransfers([])
      setPurchaseQtyMap({})
      setTransferQtyMap({})
      setLoading(false)
      return
    }
    fetchInitialData()
  }, [companyId])

  const fetchInitialData = async () => {
    setLoading(true)
    setError('')
    setPurchaseQtyMap({})
    setTransferQtyMap({})
    try {
      const [productData, purchaseData, transferData] = await Promise.all([
        getProducts(Number(companyId)),
        getPurchases(Number(companyId)),
        getStockTransfers(Number(companyId))
      ])
      setProducts(productData || [])
      setPurchases(purchaseData || [])
      setTransfers(transferData || [])
    } catch (err) {
      setError(err.message || 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  // ─── 2. Fetch Items & Calculate Maps when Date Range Changes ───
  useEffect(() => {
    if (!companyId) return
    if (purchases.length === 0 && transfers.length === 0) return

    calculateAggregatedQuantities()
  }, [filterDateFrom, filterDateTo, purchases, transfers, companyId])

  const calculateAggregatedQuantities = async () => {
    setCalculating(true)
    try {
      // Filter purchases by date range
      const filteredPurchases = purchases.filter(p => {
        const pDate = p.billing_date || p.purchase_date || ''
        return pDate >= filterDateFrom && pDate <= filterDateTo
      })

      // Filter transfers by date range
      const filteredTransfers = transfers.filter(t => {
        const tDate = t.transfer_date ? format(new Date(t.transfer_date), 'yyyy-MM-dd') : ''
        return tDate >= filterDateFrom && tDate <= filterDateTo
      })

      // Fetch items in parallel — pass companyId
      const [purchaseItemsArrays, transferItemsArrays] = await Promise.all([
        Promise.all(filteredPurchases.map(p =>
          getPurchaseItems(p.id, Number(companyId)).catch(() => [])
        )),
        Promise.all(filteredTransfers.map(t =>
          getStockTransferItems(t.id, Number(companyId)).catch(() => [])
        ))
      ])

      // Aggregate Purchase Qty by product_id
      const pMap = {}
      purchaseItemsArrays.flat().forEach(item => {
        const pid = item.product_id
        if (!pid) return
        if (!pMap[pid]) pMap[pid] = 0
        pMap[pid] += Number(item.total_bottles ?? item.totalBottles) || 0
      })

      // Aggregate Transfer Qty by product_id
      const tMap = {}
      transferItemsArrays.flat().forEach(item => {
        const pid = item.product_id
        if (!pid) return
        if (!tMap[pid]) tMap[pid] = 0
        tMap[pid] += Number(item.quantity) || 0
      })

      setPurchaseQtyMap(pMap)
      setTransferQtyMap(tMap)
    } catch (err) {
      console.error('Error calculating quantities', err)
    } finally {
      setCalculating(false)
    }
  }

  // ─── Clear Filters ───
  const clearFilters = () => {
    setFilterDateFrom(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'))
    setFilterDateTo(format(new Date(), 'yyyy-MM-dd'))
    setSearch('')
    setFilterCategory('ALL')
    setCurrentPage(1)
  }

  const hasActiveFilters = search || filterCategory !== 'ALL'

  // ─── 3. Generate Report Data ───
  const reportData = useMemo(() => {
    let slNo = 0
    return products
      .filter(p => {
        const q = search.toLowerCase()
        const matchSearch = !q || (p.name || '').toLowerCase().includes(q) || (p.brand || '').toLowerCase().includes(q)
        const matchCat = filterCategory === 'ALL' || p.category === filterCategory
        return matchSearch && matchCat
      })
      .map(p => {
        const opening = Number(p.opening_stock) || 0
        const purchaseQty = purchaseQtyMap[p.id] || 0
        const transferIn = transferQtyMap[p.id] || 0
        const totalAvailable = opening + purchaseQty + transferIn
        const closing = Number(p.current_stock) || 0
        const breakage = Number(p.damage_stock) || 0
        const transferOut = 0

        const salesQty = Math.max(0, totalAvailable - closing - breakage - transferOut)

        slNo++
        return {
          slNo,
          id: p.id,
          brandName: p.name || '',
          size: p.bottle_size || '-',
          opening,
          purchaseQty,
          transferIn,
          totalAvailable,
          salesQty,
          breakage,
          transferOut,
          closing,
          lpLiters: calculateLPLiters(closing, p.bottle_size),
          category: p.category
        }
      })
  }, [products, purchaseQtyMap, transferQtyMap, search, filterCategory])

  // ─── Sorting ───
  const sortedData = useMemo(() => {
    return [...reportData].sort((a, b) => {
      let valA = a[sortField], valB = b[sortField]
      if (typeof valA === 'string') return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      return sortDir === 'asc' ? valA - valB : valB - valA
    })
  }, [reportData, sortField, sortDir])

  // ─── Pagination ───
  const totalPages = Math.ceil(sortedData.length / ITEMS_PER_PAGE)
  const paginatedData = sortedData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE)
  const handleSort = (field) => {
    if (sortField === field) setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    else { setSortField(field); setSortDir('asc') }
  }

  // ─── Summary Stats ───
  const totals = useMemo(() => {
    return reportData.reduce((acc, row) => {
      acc.opening += row.opening
      acc.purchaseQty += row.purchaseQty
      acc.transferIn += row.transferIn
      acc.totalAvailable += row.totalAvailable
      acc.salesQty += row.salesQty
      acc.breakage += row.breakage
      acc.transferOut += row.transferOut
      acc.closing += row.closing
      acc.lpLiters += row.lpLiters
      return acc
    }, { opening: 0, purchaseQty: 0, transferIn: 0, totalAvailable: 0, salesQty: 0, breakage: 0, transferOut: 0, closing: 0, lpLiters: 0 })
  }, [reportData])

  // ─── Export to Excel ───
  // ─── Export to Excel ───
  const handleExportExcel = async () => {
    if (sortedData.length === 0) return alert('No data to export')

    const exportData = sortedData.map(row => ({
      'Sl No': row.slNo,
      'Brand Name': row.brandName,
      'Size': row.size,
      'Opening Stock': row.opening,
      'Purchase Qty': row.purchaseQty,
      'Transfer In': row.transferIn,
      'Total Available': row.totalAvailable,
      'Sales Qty': row.salesQty,
      'Breakage': row.breakage,
      'Transfer Out': row.transferOut,
      'Closing Stock': row.closing,
      'Closing LP Liters': row.lpLiters.toFixed(3)
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    ws['!cols'] = [
      { wch: 6 }, { wch: 25 }, { wch: 10 }, { wch: 14 }, { wch: 14 },
      { wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 10 }, { wch: 14 },
      { wch: 14 }, { wch: 16 }
    ]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Excise Movement')

    // ─── Save File (Tauri + Browser) ───
    const fileName = `Excise_Movement_${companyName}_${filterDateFrom}_to_${filterDateTo}.xlsx`
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

  // ─── GUARD: NO COMPANY SELECTED ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view the excise stock movement report.</p>
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
              <Landmark className="w-5 h-5 text-indigo-500" />
              Excise Stock Movement Report
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Period: {filterDateFrom ? format(new Date(filterDateFrom), 'dd MMM yyyy') : '...'} to {filterDateTo ? format(new Date(filterDateTo), 'dd MMM yyyy') : '...'}
            </p>
          </div>
          {/* ─── COMPANY BADGE ─── */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => setShowFilters(s => !s)} className={clsx("btn-secondary flex items-center gap-2 text-xs", showFilters && "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 text-indigo-700")}>
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
          <button type="button" onClick={handleExportExcel} className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2 text-xs">
            <FileDown className="w-3.5 h-3.5" /> Export Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-blue-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Total Products</span></div>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{reportData.length}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1"><FileCheck className="w-4 h-4 text-green-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Total Purchased</span></div>
          <p className="text-lg font-bold text-green-600">{totals.purchaseQty.toLocaleString()}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1"><Calculator className="w-4 h-4 text-orange-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Total Sales (Est.)</span></div>
          <p className="text-lg font-bold text-orange-600">{totals.salesQty.toLocaleString()}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-cyan-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Closing Stock</span></div>
          <p className="text-lg font-bold text-cyan-600">{totals.closing.toLocaleString()}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1"><Landmark className="w-4 h-4 text-indigo-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Closing LP Liters</span></div>
          <p className="text-lg font-bold text-indigo-600">{totals.lpLiters.toFixed(3)}</p>
        </div>
      </div>

      {/* ─── Filters ─── */}
      {showFilters && (
        <div className="card p-4 border dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><Filter className="w-4 h-4 text-indigo-500" /> Filters</h3>
            <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium"><RotateCcw className="w-3 h-3" /> Clear</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Period From</label><input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Period To</label><input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Category</label><select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} className="input-field text-xs"><option value="ALL">All</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Search Product</label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Name or Brand..." value={search} onChange={e => setSearch(e.target.value)} className="input-field text-xs pl-8" /></div></div>
          </div>

          {/* Quick Date Presets */}
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide self-center mr-1">Quick:</span>
            {[
              { label: 'This Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'Last Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM-dd'), to: format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd') },
              { label: 'This Quarter', from: format(new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Year', from: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'Last Year', from: format(new Date(new Date().getFullYear() - 1, 0, 1), 'yyyy-MM-dd'), to: format(new Date(new Date().getFullYear() - 1, 11, 31), 'yyyy-MM-dd') },
            ].map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => { setFilterDateFrom(preset.from); setFilterDateTo(preset.to) }}
                className={clsx(
                  "text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors",
                  filterDateFrom === preset.from && filterDateTo === preset.to
                    ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-md border border-blue-100 dark:border-blue-800">
            <p className="text-[10px] text-blue-600 dark:text-blue-400"><strong>Note:</strong> "Purchase Qty" and "Transfer In" are dynamically fetched based on the selected date period. Sales are auto-estimated to balance the stock equation.</p>
          </div>
        </div>
      )}

      {/* ─── Main Excise Table ─── */}
      <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
        {calculating && (
          <div className="w-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs text-center py-1.5 font-medium flex items-center justify-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" /> Calculating quantities for selected period...
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50">
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="p-3 text-left font-semibold cursor-pointer" onClick={() => handleSort('slNo')}>Sl No {getSortIcon(sortField === 'slNo' ? sortDir : '')}</th>
                <th className="p-3 text-left font-semibold cursor-pointer" onClick={() => handleSort('brandName')}>Brand Name {getSortIcon(sortField === 'brandName' ? sortDir : '')}</th>
                <th className="p-3 text-center font-semibold cursor-pointer" onClick={() => handleSort('size')}>Size {getSortIcon(sortField === 'size' ? sortDir : '')}</th>
                <th className="p-3 text-right font-semibold cursor-pointer" onClick={() => handleSort('opening')}>Opening Stock {getSortIcon(sortField === 'opening' ? sortDir : '')}</th>
                <th className="p-3 text-right font-semibold cursor-pointer text-green-600" onClick={() => handleSort('purchaseQty')}>Purchase Qty {getSortIcon(sortField === 'purchaseQty' ? sortDir : '')}</th>
                <th className="p-3 text-right font-semibold text-blue-600">Transfer In</th>
                <th className="p-3 text-right font-semibold cursor-pointer bg-slate-100 dark:bg-slate-800" onClick={() => handleSort('totalAvailable')}>Total Available {getSortIcon(sortField === 'totalAvailable' ? sortDir : '')}</th>
                <th className="p-3 text-right font-semibold cursor-pointer text-orange-600" onClick={() => handleSort('salesQty')}>Sales Qty {getSortIcon(sortField === 'salesQty' ? sortDir : '')}</th>
                <th className="p-3 text-right font-semibold text-red-600">Breakage</th>
                <th className="p-3 text-right font-semibold text-blue-600">Transfer Out</th>
                <th className="p-3 text-right font-semibold cursor-pointer text-indigo-600" onClick={() => handleSort('closing')}>Closing Stock {getSortIcon(sortField === 'closing' ? sortDir : '')}</th>
                <th className="p-3 text-right font-semibold text-purple-600 bg-slate-100 dark:bg-slate-800">LP Liters</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={12} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
              ) : paginatedData.length === 0 ? (
                <tr><td colSpan={12} className="text-center py-10 text-sm text-gray-400">No data found</td></tr>
              ) : (
                paginatedData.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                    <td className="p-3 text-gray-500 font-mono">{row.slNo}</td>
                    <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{row.brandName}</td>
                    <td className="p-3 text-center text-gray-500">{row.size}</td>
                    <td className="p-3 text-right font-medium">{row.opening.toLocaleString()}</td>
                    <td className="p-3 text-right font-semibold text-green-600 dark:text-green-400">{row.purchaseQty.toLocaleString()}</td>
                    <td className="p-3 text-right font-semibold text-blue-500">{row.transferIn.toLocaleString()}</td>
                    <td className="p-3 text-right font-bold bg-slate-50 dark:bg-slate-800/50">{row.totalAvailable.toLocaleString()}</td>
                    <td className="p-3 text-right font-semibold text-orange-600 dark:text-orange-400">{row.salesQty.toLocaleString()}</td>
                    <td className="p-3 text-right text-red-500">{row.breakage}</td>
                    <td className="p-3 text-right text-gray-400">{row.transferOut}</td>
                    <td className="p-3 text-right font-bold text-indigo-700 dark:text-indigo-400">{row.closing.toLocaleString()}</td>
                    <td className="p-3 text-right font-semibold text-purple-600 bg-slate-50 dark:bg-slate-800/50">{row.lpLiters.toFixed(3)}</td>
                  </tr>
                ))
              )}
            </tbody>
            {/* ─── Totals Footer ─── */}
            {!loading && paginatedData.length > 0 && (
              <tfoot className="bg-slate-100 dark:bg-slate-800 border-t-2 border-slate-300 dark:border-slate-600">
                <tr className="font-bold text-xs">
                  <td colSpan={3} className="p-3 text-right text-gray-700 dark:text-gray-200">TOTAL</td>
                  <td className="p-3 text-right">{totals.opening.toLocaleString()}</td>
                  <td className="p-3 text-right text-green-600">{totals.purchaseQty.toLocaleString()}</td>
                  <td className="p-3 text-right text-blue-500">{totals.transferIn.toLocaleString()}</td>
                  <td className="p-3 text-right bg-slate-200 dark:bg-slate-700">{totals.totalAvailable.toLocaleString()}</td>
                  <td className="p-3 text-right text-orange-600">{totals.salesQty.toLocaleString()}</td>
                  <td className="p-3 text-right text-red-500">{totals.breakage}</td>
                  <td className="p-3 text-right">{totals.transferOut}</td>
                  <td className="p-3 text-right text-indigo-700 dark:text-indigo-400">{totals.closing.toLocaleString()}</td>
                  <td className="p-3 text-right text-purple-600 bg-slate-200 dark:bg-slate-700">{totals.lpLiters.toFixed(3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* ─── Pagination ─── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-2">
          <p className="text-xs text-gray-500">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedData.length)} of {sortedData.length}</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs font-medium px-2">Page {currentPage} of {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      )}
    </div>
  )
}