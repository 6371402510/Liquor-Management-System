import React, { useState, useEffect, useMemo } from 'react'
import {
  Loader as Loader2, Filter, RotateCcw, FileDown, Package, AlertCircle,
  ChevronDown, ChevronUp, ArrowUpDown, ArrowUp, ArrowDown,
  Search, Warehouse, Store, ArrowUpCircle, Calendar, Receipt,
  ChevronLeft, ChevronRight, BarChart3, Tag
} from 'lucide-react'
import clsx from 'clsx'
import { format } from 'date-fns'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

// Import API functions for Counter to Godown
import { getCounterToGodownTransfers } from '../apiservices/counterToGodownTransferApi'
import { getCounterToGodownTransferItems } from '../apiservices/counterToGodownTransferApi'

// ─── Sort direction helper ───
function getSortIcon(sortDir) {
  if (sortDir === 'asc') return <ArrowUp className="w-3 h-3" />
  if (sortDir === 'desc') return <ArrowDown className="w-3 h-3" />
  return <ArrowUpDown className="w-3 h-3 opacity-40" />
}

const ITEMS_PER_PAGE = 25
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

export default function CounterToGodownReport() {
  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  // ─── Data State ───
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedItems, setExpandedItems] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [loadingItems, setLoadingItems] = useState(false)

  // ─── Filter State ───
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterTransferNo, setFilterTransferNo] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')

  // ─── UI State ───
  const [showFilters, setShowFilters] = useState(true)
  const [activeTab, setActiveTab] = useState('detail')
  const [sortField, setSortField] = useState('transfer_date')
  const [sortDir, setSortDir] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)

  // ─── Listen for company changes ───
  useEffect(() => {
    const handleStorage = () => {
      const newId = localStorage.getItem('selectedCompanyId') || null
      if (newId !== companyId) {
        setCompanyId(newId)
      }
    }
    window.addEventListener('storage', handleStorage)
    const interval = setInterval(() => {
      const newId = localStorage.getItem('selectedCompanyId') || null
      if (newId !== companyId) {
        setCompanyId(newId)
      }
    }, 1000)
    return () => {
      window.removeEventListener('storage', handleStorage)
      clearInterval(interval)
    }
  }, [companyId])

  useEffect(() => {
    if (companyId) {
      fetchTransfers()
    } else {
      setTransfers([])
      setLoading(false)
    }
  }, [companyId])

  const fetchTransfers = async () => {
    setLoading(true)
    setError('')
    setExpandedItems({})
    setExpandedId(null)
    try {
      const data = await getCounterToGodownTransfers(Number(companyId))
      setTransfers(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load transfers')
    } finally {
      setLoading(false)
    }
  }

  const loadItems = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    try {
      setLoadingItems(true)
      if (!expandedItems[id]) {
        const data = await getCounterToGodownTransferItems(id)
        setExpandedItems(prev => ({ ...prev, [id]: data || [] }))
      }
      setExpandedId(id)
    } catch (err) {
      console.error('Failed to load transfer items')
    } finally {
      setLoadingItems(false)
    }
  }

  // ─── Fetch items when product filter is active ───
  useEffect(() => {
    if (!companyId || !filterProduct || transfers.length === 0) return

    let cancelled = false
    const fetchMissingItems = async () => {
      const promises = transfers
        .filter(t => !expandedItems[t.id])
        .map(async t => {
          try {
            const data = await getCounterToGodownTransferItems(t.id)
            return { id: t.id, data: data || [] }
          } catch {
            return null
          }
        })

      const results = await Promise.all(promises)
      if (cancelled) return

      setExpandedItems(prev => {
        const next = { ...prev }
        results.forEach(r => {
          if (r && r.data) next[r.id] = r.data
        })
        return next
      })
    }

    fetchMissingItems()
    return () => { cancelled = true }
  }, [filterProduct, transfers, companyId])

  // ─── Load all items for aggregation tab ───
  useEffect(() => {
    if (!companyId || activeTab !== 'byProduct' || transfers.length === 0) return

    const fetchAll = async () => {
      const missing = transfers.filter(t => !expandedItems[t.id])
      if (missing.length === 0) return

      const promises = missing.map(async t => {
        try {
          const data = await getCounterToGodownTransferItems(t.id)
          return { id: t.id, data: data || [] }
        } catch { return null }
      })
      const results = await Promise.all(promises)
      setExpandedItems(prev => {
        const next = { ...prev }
        results.forEach(r => { if (r && r.data) next[r.id] = r.data })
        return next
      })
    }
    fetchAll()
  }, [activeTab, transfers, companyId])

  // ─── Clear Filters ───
  const clearFilters = () => {
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterTransferNo('')
    setFilterProduct('')
    setFilterStatus('ALL')
    setCurrentPage(1)
  }

  const hasActiveFilters = filterDateFrom || filterDateTo || filterTransferNo || filterProduct || filterStatus !== 'ALL'

  // ─── Filtering Logic ───
  const filteredTransfers = useMemo(() => {
    return transfers.filter(t => {
      const tDate = t.transfer_date ? format(new Date(t.transfer_date), 'yyyy-MM-dd') : ''
      if (filterDateFrom && tDate < filterDateFrom) return false
      if (filterDateTo && tDate > filterDateTo) return false
      if (filterTransferNo && !(t.transfer_number || '').toLowerCase().includes(filterTransferNo.toLowerCase())) return false
      if (filterStatus !== 'ALL' && t.status !== filterStatus) return false
      if (filterProduct) {
        const tItems = expandedItems[t.id] || []
        if (tItems.length === 0) return false
        return tItems.some(item =>
          (item.product_name || '').toLowerCase().includes(filterProduct.toLowerCase())
        )
      }
      return true
    })
  }, [transfers, filterDateFrom, filterDateTo, filterTransferNo, filterProduct, filterStatus, expandedItems])

  // ─── Sorting ───
  const sortedTransfers = useMemo(() => {
    const sorted = [...filteredTransfers].sort((a, b) => {
      let valA, valB
      switch (sortField) {
        case 'transfer_date':
          valA = new Date(a.transfer_date || 0).getTime()
          valB = new Date(b.transfer_date || 0).getTime()
          break
        case 'transfer_number':
          valA = a.transfer_number || ''
          valB = b.transfer_number || ''
          return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
        default:
          valA = new Date(a.transfer_date || 0).getTime()
          valB = new Date(b.transfer_date || 0).getTime()
      }
      return sortDir === 'asc' ? valA - valB : valB - valA
    })
    return sorted
  }, [filteredTransfers, sortField, sortDir])

  // ─── Pagination ───
  const totalPages = Math.ceil(sortedTransfers.length / ITEMS_PER_PAGE)
  const paginatedTransfers = sortedTransfers.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('desc')
    }
  }

  // ─── Summary Statistics ───
  const summaryStats = useMemo(() => {
    const totalTransfers = filteredTransfers.length
    let totalItemsReturned = 0
    let uniqueProducts = new Set()

    Object.values(expandedItems).forEach(items => {
      items.forEach(item => {
        totalItemsReturned += item.quantity || 0
        if (item.product_id) uniqueProducts.add(item.product_id)
      })
    })

    const completedCount = filteredTransfers.filter(t => t.status === 'COMPLETED').length
    const todayTransfers = filteredTransfers.filter(t => {
      if (!t.transfer_date) return false
      return format(new Date(t.transfer_date), 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd')
    }).length

    return { totalTransfers, totalItemsReturned, uniqueProducts: uniqueProducts.size, completedCount, todayTransfers }
  }, [filteredTransfers, expandedItems])

  // ─── Aggregation: By Product ───
  const byProduct = useMemo(() => {
    const map = {}
    filteredTransfers.forEach(t => {
      const items = expandedItems[t.id] || []
      items.forEach(item => {
        const key = item.product_name || 'Unknown'
        if (!map[key]) map[key] = { name: key, count: 0, quantity: 0 }
        map[key].count++
        map[key].quantity += item.quantity || 0
      })
    })
    return Object.values(map).sort((a, b) => b.quantity - a.quantity)
  }, [filteredTransfers, expandedItems])

  // ─── Export to Excel ───
  const handleExportExcel = async () => {
    if (filteredTransfers.length === 0) {
      alert('No data to export')
      return
    }

    // ─── Fetch missing items first ───
    const missing = filteredTransfers.filter(t => !expandedItems[t.id])
    if (missing.length > 0) {
      const promises = missing.map(async t => {
        try {
          const data = await getCounterToGodownTransferItems(t.id)
          return { id: t.id, data: data || [] }
        } catch { return null }
      })
      const results = await Promise.all(promises)
      const updatedItems = { ...expandedItems }
      results.forEach(r => { if (r && r.data) updatedItems[r.id] = r.data })
      setExpandedItems(updatedItems)

      const wb = buildExcelWorkbook(filteredTransfers, updatedItems, byProduct)
      await saveWorkbook(wb)
      return
    }

    const wb = buildExcelWorkbook(filteredTransfers, expandedItems, byProduct)
    await saveWorkbook(wb)
  }

  const buildExcelWorkbook = (transfersList, itemsMap, productAgg) => {
    const wb = XLSX.utils.book_new()

    const summaryData = transfersList.map(t => ({
      'Return No.': t.transfer_number || '',
      'Date': t.transfer_date ? format(new Date(t.transfer_date), 'dd MMM yyyy hh:mm a') : '',
      'Notes': t.notes || '',
      'Status': t.status || '',
      'Items Count': (itemsMap[t.id] || []).length,
      'Total Qty': (itemsMap[t.id] || []).reduce((s, i) => s + (i.quantity || 0), 0)
    }))
    const ws1 = XLSX.utils.json_to_sheet(summaryData)
    ws1['!cols'] = [{ wch: 22 }, { wch: 22 }, { wch: 30 }, { wch: 12 }, { wch: 12 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws1, 'Return Summary')

    const itemData = []
    transfersList.forEach(t => {
      const items = itemsMap[t.id] || []
      if (items.length === 0) {
        itemData.push({
          'Return No.': t.transfer_number || '',
          'Date': t.transfer_date ? format(new Date(t.transfer_date), 'dd MMM yyyy') : '',
          'Product': '—',
          'Quantity': ''
        })
      } else {
        items.forEach(item => {
          itemData.push({
            'Return No.': t.transfer_number || '',
            'Date': t.transfer_date ? format(new Date(t.transfer_date), 'dd MMM yyyy') : '',
            'Product': item.product_name || '',
            'Quantity': item.quantity || 0
          })
        })
      }
    })
    const ws2 = XLSX.utils.json_to_sheet(itemData)
    ws2['!cols'] = [{ wch: 22 }, { wch: 14 }, { wch: 25 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Item Details')

    const productData = productAgg.map(p => ({
      'Product': p.name,
      'Times Returned': p.count,
      'Total Quantity': p.quantity
    }))
    const ws3 = XLSX.utils.json_to_sheet(productData)
    XLSX.utils.book_append_sheet(wb, ws3, 'By Product')

    return wb
  }

  const saveWorkbook = async (wb) => {
    const fileName = `Counter_To_Godown_Report_${companyName}_${new Date().toISOString().slice(0, 10)}.xlsx`
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
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view counter to godown return reports.</p>
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
              <ArrowUpCircle className="w-5 h-5 text-blue-500" />
              Counter to Godown Report
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {filteredTransfers.length} return(s) found
              {hasActiveFilters && ' (filtered)'}
            </p>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <Store className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{companyName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(s => !s)}
            className={clsx(
              "btn-secondary flex items-center gap-2 text-xs",
              showFilters && "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400"
            )}
          >
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filteredTransfers.length === 0}
            className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown className="w-3.5 h-3.5" /> Export
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Receipt className="w-4 h-4 text-blue-500" />
            <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Total Returns</span>
          </div>
          <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{summaryStats.totalTransfers}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Package className="w-4 h-4 text-purple-500" />
            <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Items Returned</span>
          </div>
          <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{summaryStats.totalItemsReturned.toLocaleString()}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Tag className="w-4 h-4 text-cyan-500" />
            <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Products Returned</span>
          </div>
          <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{summaryStats.uniqueProducts}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <Calendar className="w-4 h-4 text-green-500" />
            <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Today</span>
          </div>
          <p className="text-lg font-bold text-green-600 dark:text-green-400">{summaryStats.todayTransfers}</p>
        </div>
        <div className="card p-3 border dark:border-slate-700">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpCircle className="w-4 h-4 text-indigo-500" />
            <span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Completed</span>
          </div>
          <p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{summaryStats.completedCount}</p>
        </div>
      </div>

      {/* ─── Flow Info Bar ─── */}
      <div className="card p-3 border dark:border-slate-700 bg-gradient-to-r from-blue-50 via-purple-50 to-amber-50 dark:from-blue-900/10 dark:via-purple-900/10 dark:to-amber-900/10">
        <div className="flex items-center justify-center gap-4 text-xs">
          <div className="flex items-center gap-2">
            <Store className="w-4 h-4 text-blue-500" />
            <span className="font-semibold text-blue-600 dark:text-blue-400">Counter Stock</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-8 h-0.5 bg-blue-300 dark:bg-blue-700" />
            <ArrowUpCircle className="w-4 h-4 text-blue-500" />
            <div className="w-8 h-0.5 bg-blue-300 dark:bg-blue-700" />
          </div>
          <div className="flex items-center gap-2">
            <Warehouse className="w-4 h-4 text-amber-500" />
            <span className="font-semibold text-amber-600 dark:text-amber-400">Godown Stock</span>
          </div>
          <span className="text-gray-400 ml-4">Each return moves stock from Counter → Godown</span>
        </div>
      </div>

      {/* ─── Filter Section ─── */}
      {showFilters && (
        <div className="card p-4 border dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-500" /> Report Filters
            </h3>
            <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 font-medium transition-colors">
              <RotateCcw className="w-3 h-3" /> Clear All
            </button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Date From</label>
              <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setCurrentPage(1) }} className="input-field text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Date To</label>
              <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setCurrentPage(1) }} className="input-field text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Return No.</label>
              <input type="text" placeholder="Search..." value={filterTransferNo} onChange={e => { setFilterTransferNo(e.target.value); setCurrentPage(1) }} className="input-field text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Product Name</label>
              <input type="text" placeholder="Filter by product..." value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setCurrentPage(1) }} className="input-field text-xs" />
            </div>
            <div>
              <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Status</label>
              <select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1) }} className="input-field text-xs">
                <option value="ALL">All Statuses</option>
                <option value="COMPLETED">Completed</option>
                <option value="PENDING">Pending</option>
                <option value="CANCELLED">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide self-center mr-1">Quick:</span>
            {[
              { label: 'Today', from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Week', from: format(new Date(Date.now() - 6 * 86400000), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'Last Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM-dd'), to: format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd') },
            ].map(preset => (
              <button
                key={preset.label}
                type="button"
                onClick={() => { setFilterDateFrom(preset.from); setFilterDateTo(preset.to); setCurrentPage(1) }}
                className={clsx(
                  "text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors",
                  filterDateFrom === preset.from && filterDateTo === preset.to
                    ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                    : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                )}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Tab Navigation ─── */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {[
            { id: 'detail', label: 'Return Detail', icon: Receipt },
            { id: 'byProduct', label: 'By Product', icon: Package },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={clsx(
                "flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors",
                activeTab === tab.id
                  ? "border-blue-500 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600"
              )}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Tab Content ─── */}
      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
        </div>
      ) : filteredTransfers.length === 0 ? (
        <div className="card p-10 text-center border dark:border-slate-700">
          <ArrowUpCircle className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400 dark:text-gray-500">
            {hasActiveFilters ? 'No returns match the selected filters' : 'No counter to godown returns recorded yet'}
          </p>
        </div>
      ) : (
        <>
          {/* ─── Detail Tab ─── */}
          {activeTab === 'detail' && (
            <div className="space-y-3">
              <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
                        <th className="p-2.5 text-left font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('transfer_number')}>
                          <div className="flex items-center gap-1">Return No. {getSortIcon(sortField === 'transfer_number' ? sortDir : '')}</div>
                        </th>
                        <th className="p-2.5 text-left font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors" onClick={() => handleSort('transfer_date')}>
                          <div className="flex items-center gap-1">Date {getSortIcon(sortField === 'transfer_date' ? sortDir : '')}</div>
                        </th>
                        <th className="p-2.5 text-left font-semibold">Notes</th>
                        <th className="p-2.5 text-center font-semibold">Direction</th>
                        <th className="p-2.5 text-center font-semibold">Status</th>
                        <th className="p-2.5 text-center font-semibold">Items</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                      {paginatedTransfers.map(t => (
                        <React.Fragment key={t.id}>
                          <tr className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                            <td className="p-2.5 font-mono font-semibold text-blue-600 dark:text-blue-400">{t.transfer_number}</td>
                            <td className="p-2.5 text-gray-600 dark:text-gray-400">
                              {t.transfer_date
                                ? format(new Date(t.transfer_date), 'dd MMM yyyy, hh:mm a')
                                : '—'
                              }
                            </td>
                            <td className="p-2.5 text-gray-500 max-w-[200px] truncate">{t.notes || '—'}</td>
                            <td className="p-2.5 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <Store className="w-3 h-3 text-blue-500" />
                                <ArrowUpCircle className="w-3 h-3 text-purple-500" />
                                <Warehouse className="w-3 h-3 text-amber-500" />
                              </div>
                            </td>
                            <td className="p-2.5 text-center">
                              <span className={clsx(
                                "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
                                t.status === 'COMPLETED' ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" :
                                t.status === 'PENDING' ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400" :
                                "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                              )}>
                                {t.status}
                              </span>
                            </td>
                            <td className="p-2.5 text-center">
                              <button
                                onClick={() => loadItems(t.id)}
                                disabled={loadingItems}
                                className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50"
                              >
                                {loadingItems && expandedId !== t.id
                                  ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  : expandedId === t.id
                                    ? <ChevronUp className="w-3.5 h-3.5" />
                                    : <ChevronDown className="w-3.5 h-3.5" />
                                }
                              </button>
                            </td>
                          </tr>

                          {expandedId === t.id && expandedItems[t.id] && (
                            <tr className="bg-blue-50/20 dark:bg-blue-900/10">
                              <td colSpan={6} className="px-6 py-3">
                                <div className="bg-white dark:bg-gray-900 rounded-lg border border-blue-200 dark:border-blue-800 overflow-hidden">
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="text-blue-600 dark:text-blue-400 border-b border-blue-100 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                                        <th className="text-left py-2 px-3 font-medium">#</th>
                                        <th className="text-left py-2 px-3 font-medium">Product Name</th>
                                        <th className="text-center py-2 px-3 font-medium">From</th>
                                        <th className="text-center py-2 px-3 font-medium"></th>
                                        <th className="text-center py-2 px-3 font-medium">To</th>
                                        <th className="text-right py-2 px-3 font-medium">Qty Returned</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {expandedItems[t.id].map((item, idx) => (
                                        <tr key={item.id} className="border-b border-gray-50 dark:border-gray-800/50 hover:bg-blue-50/20 dark:hover:bg-blue-900/10">
                                          <td className="py-2 px-3 text-gray-400">{idx + 1}</td>
                                          <td className="py-2 px-3 font-medium text-gray-800 dark:text-gray-200">{item.product_name}</td>
                                          <td className="py-2 px-3 text-center">
                                            <span className="inline-flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                                              <Store className="w-3 h-3" /> Counter
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-center text-purple-500">
                                            <ArrowUpCircle className="w-3.5 h-3.5 mx-auto" />
                                          </td>
                                          <td className="py-2 px-3 text-center">
                                            <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400 font-medium">
                                              <Warehouse className="w-3 h-3" /> Godown
                                            </span>
                                          </td>
                                          <td className="py-2 px-3 text-right font-bold text-blue-700 dark:text-blue-300 text-sm">
                                            {item.quantity}
                                          </td>
                                        </tr>
                                      ))}
                                      <tr className="bg-blue-50/50 dark:bg-blue-900/20 font-semibold">
                                        <td colSpan={5} className="py-2 px-3 text-right text-gray-600 dark:text-gray-300">Total Items Returned</td>
                                        <td className="py-2 px-3 text-right text-blue-700 dark:text-blue-300">
                                          {expandedItems[t.id].reduce((s, i) => s + (i.quantity || 0), 0)}
                                        </td>
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedTransfers.length)} of {sortedTransfers.length}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      let pageNum
                      if (totalPages <= 5) pageNum = i + 1
                      else if (currentPage <= 3) pageNum = i + 1
                      else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i
                      else pageNum = currentPage - 2 + i

                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={clsx(
                            "w-8 h-8 rounded-lg text-xs font-medium transition-colors",
                            currentPage === pageNum
                              ? "bg-blue-500 text-white"
                              : "border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800"
                          )}
                        >
                          {pageNum}
                        </button>
                      )
                    })}
                    <button
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                      className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── By Product Tab ─── */}
          {activeTab === 'byProduct' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
                      <th className="p-3 text-left font-semibold">#</th>
                      <th className="p-3 text-left font-semibold">Product Name</th>
                      <th className="p-3 text-center font-semibold">Times Returned</th>
                      <th className="p-3 text-center font-semibold text-blue-600">Total Qty (Counter → Godown)</th>
                      <th className="p-3 text-right font-semibold">% of Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                    {byProduct.map((p, i) => {
                      const totalAllQty = byProduct.reduce((s, x) => s + x.quantity, 0)
                      const pct = totalAllQty > 0 ? (p.quantity / totalAllQty * 100) : 0
                      return (
                        <tr key={i} className="hover:bg-blue-50/30 dark:hover:bg-blue-900/10 transition-colors">
                          <td className="p-3 text-gray-400">{i + 1}</td>
                          <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{p.name}</td>
                          <td className="p-3 text-center">
                            <span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">{p.count}</span>
                          </td>
                          <td className="p-3 text-center font-bold text-blue-700 dark:text-blue-300">{p.quantity}</td>
                          <td className="p-3 text-right">
                            <div className="flex items-center gap-2 justify-end">
                              <div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} />
                              </div>
                              <span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600">
                    <tr className="font-bold">
                      <td colSpan={2} className="p-3 text-right text-gray-700 dark:text-gray-300">Total</td>
                      <td className="p-3 text-center">{byProduct.reduce((s, p) => s + p.count, 0)}</td>
                      <td className="p-3 text-center text-blue-700 dark:text-blue-300">{byProduct.reduce((s, p) => s + p.quantity, 0)}</td>
                      <td className="p-3 text-right text-[10px] text-gray-400">100%</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}