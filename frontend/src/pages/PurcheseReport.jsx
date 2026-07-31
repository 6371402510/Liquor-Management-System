import { useState, useEffect, useMemo, useCallback,Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import {
  Loader as Loader2, ChevronDown, ChevronUp, Filter, RotateCcw,
  FileDown, Package, AlertCircle, Calendar, TrendingUp, ShoppingBag,
  BarChart3, Truck, Building2, Search, X, ChevronLeft, ChevronRight,
  ArrowUpDown, ArrowUp, ArrowDown, Eye, Receipt, Store,Warehouse  // ─── ADDED STORE
} from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

// Import API functions
import { getPurchases, getPurchaseItems } from '../apiservices/purchasesapi'
import { getSuppliers } from '../apiservices/supplierapi'

// ─── Helper: Normalize API response field names ───
// ─── Helper: Normalize API response field names ───
function normalizeItem(item) {
  const total_bottles = Number(item.total_bottles ?? item.totalBottles ?? item.qty_bottles ?? item.qtyBottles) || 0
  const purchase_rate_per_unit = Number(item.purchase_rate_per_unit ?? item.purchaseRatePerUnit) || 0
  const stored_total_cost = Number(item.total_cost) || 0

  // ─── CALCULATE: Total Cost = Bottle Quantity × Purchase Rate Per Unit ───
  let total_cost
  if (purchase_rate_per_unit > 0 && total_bottles > 0) {
    total_cost = total_bottles * purchase_rate_per_unit
  } else if (stored_total_cost > 0) {
    total_cost = stored_total_cost  // Fallback for old records
  } else {
    total_cost = 0
  }

  return {
    id: item.id,
    purchase_id: item.purchase_id,
    product_name: item.product_name ?? item.name ?? '',
    brand: item.brand ?? '',
    category: item.category ?? '',
    barcode: item.barcode ?? '',
    bottle_size: item.bottle_size ?? '',
    traditional_name: item.traditional_name ?? '',
    bottles_per_case: Number(item.bottles_per_case ?? item.bottlesPerCase) || 0,
    mrp: Number(item.mrp) || 0,
    unit_cost: Number(item.unit_cost ?? item.purchaseRate) || 0,
    purchase_rate_per_unit: purchase_rate_per_unit,
    selling_rate: Number(item.selling_rate ?? item.sellingRate) || 0,
    qty_cases: Number(item.qty_cases ?? item.qtyCases) || 0,
    qty_bottles: Number(item.qty_bottles ?? item.qtyBottles) || 0,
    total_bottles: total_bottles,
    qty_bulk_liters: Number(item.qty_bulk_liters ?? item.qtyBulkLiters) || 0,
    qty_lp_liters: Number(item.qty_lp_liters ?? item.qtyLPLiters) || 0,
    opening_stock: Number(item.opening_stock ?? item.openingStock) || 0,
    min_stock: Number(item.min_stock ?? item.minStock) || 0,
    total_cost: total_cost,  // ← CALCULATED: bottles × rate_per_unit
  }
}

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

export default function PurchaseReport() {
  const { user } = useAuth()

  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  // ─── Data State ───
  const [purchases, setPurchases] = useState([])
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedItems, setExpandedItems] = useState({})
  const [expandedId, setExpandedId] = useState(null)
  const [loadingItems, setLoadingItems] = useState(false)

  // ─── Filter State ───
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterSupplier, setFilterSupplier] = useState('')
  const [filterInvoice, setFilterInvoice] = useState('')
  const [filterProduct, setFilterProduct] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus] = useState('ALL')
  const [filterVehicle, setFilterVehicle] = useState('')
  const [filterMinAmount, setFilterMinAmount] = useState('')
  const [filterMaxAmount, setFilterMaxAmount] = useState('')
  const [filterStockDest, setFilterStockDest] = useState('ALL')

  // ─── UI State ───
  const [showFilters, setShowFilters] = useState(true)
  const [activeTab, setActiveTab] = useState('detail') // detail, bySupplier, byCategory, byBrand, byProduct
  const [sortField, setSortField] = useState('billing_date')
  const [sortDir, setSortDir] = useState('desc')
  const [currentPage, setCurrentPage] = useState(1)

  // ─── Fetch Data ───
  useEffect(() => {
    if (companyId) {
      fetchPurchases()
      fetchSuppliers()
    }
  }, [companyId])

  const fetchPurchases = async () => {
    setLoading(true)
    setError('')
    try {
      // ─── PASS COMPANY ID ───
      const data = await getPurchases(Number(companyId))
      setPurchases(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load purchases')
    } finally {
      setLoading(false)
    }
  }

  const fetchSuppliers = async () => {
    try {
      // ─── PASS COMPANY ID (Assuming getSuppliers accepts it similarly) ───
      const data = await getSuppliers(Number(companyId))
      setSuppliers(data || [])
    } catch (err) {
      console.error('Failed to load suppliers')
    }
  }

  // ─── Load Items for a Purchase ───
  const loadItems = async (id) => {
    if (expandedId === id) {
      setExpandedId(null)
      return
    }
    try {
      setLoadingItems(true)
      if (!expandedItems[id]) {
        const data = await getPurchaseItems(id)
        const normalized = (data || []).map(normalizeItem)
        setExpandedItems(prev => ({ ...prev, [id]: normalized }))
      }
      setExpandedId(id)
    } catch (err) {
      console.error('Failed to load items')
    } finally {
      setLoadingItems(false)
    }
  }

  // ─── Fetch items for all purchases when item-level filters are active ───
  useEffect(() => {
    const hasItemFilter = filterProduct || filterBrand || filterCategory
    if (!hasItemFilter || purchases.length === 0) return

    let cancelled = false
    const fetchMissingItems = async () => {
      const promises = purchases
        .filter(p => !expandedItems[p.id])
        .map(async p => {
          try {
            const data = await getPurchaseItems(p.id)
            return { id: p.id, data: (data || []).map(normalizeItem) }
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
        if (JSON.stringify(next) !== JSON.stringify(prev)) return next
        return prev
      })
    }

    fetchMissingItems()
    return () => { cancelled = true }
  }, [filterProduct, filterBrand, filterCategory, purchases])

  // ─── Clear All Filters ───
  const clearFilters = () => {
    setFilterDateFrom('')
    setFilterDateTo('')
    setFilterSupplier('')
    setFilterInvoice('')
    setFilterProduct('')
    setFilterBrand('')
    setFilterCategory('')
    setFilterStatus('ALL')
    setFilterVehicle('')
    setFilterMinAmount('')
    setFilterStockDest('ALL') // ← ADD THIS
    setFilterMaxAmount('')
    setCurrentPage(1)
  }

  const hasActiveFilters = filterDateFrom || filterDateTo || filterSupplier ||
    filterInvoice || filterProduct || filterBrand || filterCategory ||
    filterStatus !== 'ALL' || filterVehicle || filterMinAmount || filterMaxAmount
    filterStockDest !== 'ALL' // ← ADD THIS

  // ─── Filtering Logic ───
  const filteredPurchases = useMemo(() => {
    return purchases.filter(p => {
      const pDate = p.billing_date || p.purchase_date || ''
      if (filterDateFrom && pDate < filterDateFrom) return false
      if (filterDateTo && pDate > filterDateTo) return false
      if (filterSupplier && String(p.supplier_id) !== filterSupplier) return false
      if (filterInvoice && !(p.invoice_number || '').toLowerCase().includes(filterInvoice.toLowerCase())) return false
      if (filterStatus !== 'ALL' && p.status !== filterStatus) return false
      if (filterVehicle && !(p.vehicle_number || '').toLowerCase().includes(filterVehicle.toLowerCase())) return false
      const amt = Number(p.total_amount) || 0
      if (filterMinAmount && amt < Number(filterMinAmount)) return false
      if (filterMaxAmount && amt > Number(filterMaxAmount)) return false
      if (filterStockDest !== 'ALL' && (p.stock_destination || 'GODOWN') !== filterStockDest) return false

      const hasItemFilter = filterProduct || filterBrand || filterCategory
      if (hasItemFilter) {
        const pItems = expandedItems[p.id] || []
        if (pItems.length === 0) return false
        return pItems.some(item => {
          const matchProduct = !filterProduct || (item.product_name || '').toLowerCase().includes(filterProduct.toLowerCase())
          const matchCategory = !filterCategory || (item.category || '').toLowerCase().includes(filterCategory.toLowerCase())
          const matchBrand = !filterBrand || (item.brand || '').toLowerCase().includes(filterBrand.toLowerCase())
          return matchProduct && matchCategory && matchBrand
        })
      }

      return true
    })
  }, [purchases, filterDateFrom, filterDateTo, filterSupplier, filterInvoice,
    filterProduct, filterBrand, filterCategory, filterStatus, filterVehicle,
    filterMinAmount, filterMaxAmount,filterStockDest, expandedItems])

  // ─── Sorting ───
  const sortedPurchases = useMemo(() => {
    const sorted = [...filteredPurchases].sort((a, b) => {
      let valA, valB
      switch (sortField) {
        case 'billing_date': valA = a.billing_date || a.purchase_date || ''; valB = b.billing_date || b.purchase_date || ''; break
        case 'invoice_number': valA = a.invoice_number || ''; valB = b.invoice_number || ''; break
        case 'supplier_name': valA = a.supplier_name || ''; valB = b.supplier_name || ''; break
        case 'total_amount': valA = Number(a.total_amount) || 0; valB = Number(b.total_amount) || 0; break
        case 'subtotal': valA = Number(a.subtotal) || 0; valB = Number(b.subtotal) || 0; break
        case 'vat_amount': valA = Number(a.vat_amount) || 0; valB = Number(b.vat_amount) || 0; break
        default: valA = a.billing_date || a.purchase_date || ''; valB = b.billing_date || b.purchase_date || ''
      }
      if (typeof valA === 'string') {
        const cmp = valA.localeCompare(valB)
        return sortDir === 'asc' ? cmp : -cmp
      }
      return sortDir === 'asc' ? valA - valB : valB - valA
    })
    return sorted
  }, [filteredPurchases, sortField, sortDir])

  // ─── Pagination ───
  const totalPages = Math.ceil(sortedPurchases.length / ITEMS_PER_PAGE)
  const paginatedPurchases = sortedPurchases.slice(
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
  const totalPurchases = filteredPurchases.length
  const totalAmount = filteredPurchases.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)
  const totalSubtotal = filteredPurchases.reduce((s, p) => s + (Number(p.subtotal) || 0), 0)
  const totalVat = filteredPurchases.reduce((s, p) => s + (Number(p.vat_amount) || 0), 0)
  const totalCess = filteredPurchases.reduce((s, p) => s + (Number(p.cess_amount) || 0), 0)
  const totalSpecial = filteredPurchases.reduce((s, p) => s + (Number(p.special_amount) || 0), 0)
  const totalTcs = filteredPurchases.reduce((s, p) => s + (Number(p.tcs_amount) || 0), 0)
  const uniqueSuppliers = new Set(filteredPurchases.map(p => p.supplier_id).filter(Boolean)).size
  const receivedCount = filteredPurchases.filter(p => p.status === 'RECEIVED').length
  const returnCount = filteredPurchases.filter(p => p.status === 'RETURN').length

  // ← ADD: Counter vs Godown breakdown
  const godownPurchases = filteredPurchases.filter(p => (p.stock_destination || 'GODOWN') === 'GODOWN')
  const counterPurchases = filteredPurchases.filter(p => (p.stock_destination || 'GODOWN') === 'COUNTER')
  const godownAmount = godownPurchases.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)
  const counterAmount = counterPurchases.reduce((s, p) => s + (Number(p.total_amount) || 0), 0)
  const godownCount = godownPurchases.length
  const counterCount = counterPurchases.length

  let totalBottles = 0, totalCases = 0, totalBulkLiters = 0, itemCostSum = 0
  Object.values(expandedItems).forEach(items => {
    items.forEach(item => {
      totalBottles += item.total_bottles || 0
      totalCases += item.qty_cases || 0
      totalBulkLiters += item.qty_bulk_liters || 0
      itemCostSum += item.total_cost || 0
    })
  })

  return {
    totalPurchases, totalAmount, totalSubtotal, totalVat, totalCess, totalSpecial, totalTcs,
    uniqueSuppliers, receivedCount, returnCount, totalBottles, totalCases, totalBulkLiters, itemCostSum,
    godownCount, godownAmount, counterCount, counterAmount // ← ADD
  }
}, [filteredPurchases, expandedItems])

  // ─── Aggregation: By Supplier ───
  const bySupplier = useMemo(() => {
    const map = {}
    filteredPurchases.forEach(p => {
      const key = p.supplier_name || 'Unknown'
      if (!map[key]) map[key] = { name: key, count: 0, subtotal: 0, vat: 0, cess: 0, special: 0, tcs: 0, total: 0 }
      map[key].count++; map[key].subtotal += Number(p.subtotal) || 0; map[key].vat += Number(p.vat_amount) || 0
      map[key].cess += Number(p.cess_amount) || 0; map[key].special += Number(p.special_amount) || 0
      map[key].tcs += Number(p.tcs_amount) || 0; map[key].total += Number(p.total_amount) || 0
    })
    return Object.values(map).sort((a, b) => b.total - a.total)
  }, [filteredPurchases])

  // ─── Aggregation: By Category ───
  const byCategory = useMemo(() => {
    const map = {}
    filteredPurchases.forEach(p => {
      (expandedItems[p.id] || []).forEach(item => {
        const key = item.category || 'Uncategorized'
        if (!map[key]) map[key] = { name: key, count: 0, bottles: 0, cases: 0, cost: 0, bulkLiters: 0 }
        map[key].count++; map[key].bottles += item.total_bottles || 0; map[key].cases += item.qty_cases || 0
        map[key].cost += item.total_cost || 0; map[key].bulkLiters += item.qty_bulk_liters || 0
      })
    })
    return Object.values(map).sort((a, b) => b.cost - a.cost)
  }, [filteredPurchases, expandedItems])

  // ─── Aggregation: By Brand ───
  const byBrand = useMemo(() => {
    const map = {}
    filteredPurchases.forEach(p => {
      (expandedItems[p.id] || []).forEach(item => {
        const key = item.brand || 'Unknown Brand'
        if (!map[key]) map[key] = { name: key, count: 0, bottles: 0, cases: 0, cost: 0, bulkLiters: 0 }
        map[key].count++; map[key].bottles += item.total_bottles || 0; map[key].cases += item.qty_cases || 0
        map[key].cost += item.total_cost || 0; map[key].bulkLiters += item.qty_bulk_liters || 0
      })
    })
    return Object.values(map).sort((a, b) => b.cost - a.cost)
  }, [filteredPurchases, expandedItems])

  // ─── Aggregation: By Product ───
  const byProduct = useMemo(() => {
    const map = {}
    filteredPurchases.forEach(p => {
      (expandedItems[p.id] || []).forEach(item => {
        const key = `${item.product_name}|${item.bottle_size}|${item.brand}`
        if (!map[key]) map[key] = { name: item.product_name || 'Unknown', brand: item.brand || '', category: item.category || '', bottle_size: item.bottle_size || '', mrp: item.mrp, count: 0, bottles: 0, cases: 0, cost: 0, bulkLiters: 0, lpLiters: 0 }
        map[key].count++; map[key].bottles += item.total_bottles || 0; map[key].cases += item.qty_cases || 0
        map[key].cost += item.total_cost || 0; map[key].bulkLiters += item.qty_bulk_liters || 0; map[key].lpLiters += item.qty_lp_liters || 0
      })
    })
    return Object.values(map).sort((a, b) => b.cost - a.cost)
  }, [filteredPurchases, expandedItems])

  // ─── Load all items for aggregation tabs ───
  useEffect(() => {
    if ((activeTab === 'byCategory' || activeTab === 'byBrand' || activeTab === 'byProduct') && purchases.length > 0) {
      const fetchAll = async () => {
        const missing = purchases.filter(p => !expandedItems[p.id])
        if (missing.length === 0) return
        const promises = missing.map(async p => {
          try { const data = await getPurchaseItems(p.id); return { id: p.id, data: (data || []).map(normalizeItem) } } catch { return null }
        })
        const results = await Promise.all(promises)
        setExpandedItems(prev => { const next = { ...prev }; results.forEach(r => { if (r && r.data) next[r.id] = r.data }); return next })
      }
      fetchAll()
    }
  }, [activeTab, purchases])

  // ─── Export to Excel ───
  const handleExportExcel = async () => {
  if (filteredPurchases.length === 0) { alert('No data to export'); return }

  const wb = XLSX.utils.book_new()

  // ─── Sheet 1: Purchase Summary ───
  const summaryData = filteredPurchases.map(p => ({
    'Invoice No.': p.invoice_number || '',
    'Billing Date': p.billing_date || p.purchase_date || '',
    'Invoice Date': p.invoice_date || '',
    'Supplier': p.supplier_name || '',
    'Stock To': p.stock_destination || 'GODOWN', // ← ADD THIS
    'Transport Pass': p.notes || '',
    'Vehicle Number': p.vehicle_number || '',
    'Subtotal': Number(p.subtotal) || 0,
    'VAT Amount': Number(p.vat_amount) || 0,
    'CESS Amount': Number(p.cess_amount) || 0,
    'Special Amount': Number(p.special_amount) || 0,
    'TCS Amount': Number(p.tcs_amount) || 0,
    'Total Amount': Number(p.total_amount) || 0,
    'Status': p.status || '',
  }))
  const ws1 = XLSX.utils.json_to_sheet(summaryData)
  XLSX.utils.book_append_sheet(wb, ws1, 'Purchase Summary')

  // ─── Sheet 2: Item Details ───
  const itemData = []
  filteredPurchases.forEach(p => {
    const items = expandedItems[p.id] || []
    if (items.length === 0) {
      itemData.push({
        'Invoice No.': p.invoice_number || '',
        'Billing Date': p.billing_date || p.purchase_date || '',
        'Supplier': p.supplier_name || '',
        'Stock To': p.stock_destination || 'GODOWN', // ← ADD THIS
        'Product': '—',
      })
    } else {
      items.forEach(item => {
        itemData.push({
          'Invoice No.': p.invoice_number || '',
          'Billing Date': p.billing_date || p.purchase_date || '',
          'Supplier': p.supplier_name || '',
          'Product': item.product_name || '',
          'Brand': item.brand || '',
          'Category': item.category || '',
          'Bottle Size': item.bottle_size || '',
          'Cases': item.qty_cases || 0,
          'Total Bottles': item.total_bottles || 0,
          'Bulk Liters': item.qty_bulk_liters || 0,
          'MRP': item.mrp || 0,
          'Rate/Case': item.unit_cost || 0,
          'Rate/Unit': item.purchase_rate_per_unit || 0,
          'Total Cost': item.total_cost || 0,
        })
      })
    }
  })
  const ws2 = XLSX.utils.json_to_sheet(itemData)
  XLSX.utils.book_append_sheet(wb, ws2, 'Item Details')

  // ─── Sheet 3: By Supplier ───
  const supplierData = bySupplier.map(s => ({
    'Supplier': s.name,
    'No. of Purchases': s.count,
    'Subtotal': s.subtotal,
    'VAT': s.vat,
    'CESS': s.cess,
    'Special': s.special,
    'TCS': s.tcs,
    'Total Amount': s.total,
  }))
  const ws3 = XLSX.utils.json_to_sheet(supplierData)
  XLSX.utils.book_append_sheet(wb, ws3, 'By Supplier')

  // ─── Sheet 4: By Product ───
  const productData = byProduct.map(p => ({
    'Product': p.name,
    'Brand': p.brand,
    'Category': p.category,
    'Bottle Size': p.bottle_size,
    'MRP': p.mrp,
    'Times Purchased': p.count,
    'Total Cases': p.cases,
    'Total Bottles': p.bottles,
    'Bulk Liters': p.bulkLiters,
    'L.P. Liters': p.lpLiters,
    'Total Cost': p.cost,
  }))
  const ws4 = XLSX.utils.json_to_sheet(productData)
  XLSX.utils.book_append_sheet(wb, ws4, 'By Product')

  // ─── Save File ───
  const dateLabel = filterDateFrom && filterDateTo
    ? `_${filterDateFrom}_to_${filterDateTo}`
    : `_${new Date().toISOString().slice(0, 10)}`

  const fileName = `Purchase_Report${dateLabel}.xlsx`
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

const handleExportExcelFull = async () => {
  const missing = filteredPurchases.filter(p => !expandedItems[p.id])
  if (missing.length > 0) {
    const promises = missing.map(async p => {
      try {
        const data = await getPurchaseItems(p.id)
        return { id: p.id, data: (data || []).map(normalizeItem) }
      } catch { return null }
    })
    const results = await Promise.all(promises)
    setExpandedItems(prev => {
      const next = { ...prev }
      results.forEach(r => { if (r && r.data) next[r.id] = r.data })
      return next
    })
    // Wait for state to update, then export
    setTimeout(() => handleExportExcel(), 500)
  } else {
    handleExportExcel()
  }
}
  // ─── GUARD: NO COMPANY SELECTED ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view purchase reports.</p>
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
              <Receipt className="w-5 h-5 text-blue-500" />
              Purchase Report
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {filteredPurchases.length} purchase(s) found
              {hasActiveFilters && ' (filtered)'}
            </p>
          </div>
          {/* ─── COMPANY BADGE ─── */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(s => !s)}
            className={clsx("btn-secondary flex items-center gap-2 text-xs", showFilters && "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400")}
          >
            <Filter className="w-3.5 h-3.5" /> Filters
          </button>
          <button
            type="button"
            onClick={handleExportExcelFull}
            disabled={filteredPurchases.length === 0}
            className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <FileDown className="w-3.5 h-3.5" /> Export Excel
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

      {/* ─── Summary Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><ShoppingBag className="w-4 h-4 text-blue-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Purchases</span></div>
    <p className="text-lg font-bold text-gray-800 dark:text-gray-100">{summaryStats.totalPurchases}</p>
  </div>
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><TrendingUp className="w-4 h-4 text-green-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Total Amount</span></div>
    <p className="text-lg font-bold text-green-600 dark:text-green-400">₹{summaryStats.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
  </div>
  {/* ← ADD: Godown Card */}
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><Warehouse className="w-4 h-4 text-amber-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Godown</span></div>
    <p className="text-base font-bold text-amber-600 dark:text-amber-400">{summaryStats.godownCount}</p>
    <p className="text-[10px] text-gray-400">₹{summaryStats.godownAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
  </div>
  {/* ← ADD: Counter Card */}
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><Store className="w-4 h-4 text-violet-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Counter</span></div>
    <p className="text-base font-bold text-violet-600 dark:text-violet-400">{summaryStats.counterCount}</p>
    <p className="text-[10px] text-gray-400">₹{summaryStats.counterAmount.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</p>
  </div>
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><BarChart3 className="w-4 h-4 text-orange-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Subtotal</span></div>
    <p className="text-lg font-bold text-orange-600 dark:text-orange-400">₹{summaryStats.totalSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
  </div>
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><Building2 className="w-4 h-4 text-purple-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Suppliers</span></div>
    <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{summaryStats.uniqueSuppliers}</p>
  </div>
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-cyan-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Bottles</span></div>
    <p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">{summaryStats.totalBottles.toLocaleString()}</p>
  </div>
  <div className="card p-3 border dark:border-slate-700">
    <div className="flex items-center gap-2 mb-1"><Truck className="w-4 h-4 text-amber-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">VAT+TCS</span></div>
    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">₹{(summaryStats.totalVat + summaryStats.totalCess + summaryStats.totalSpecial + summaryStats.totalTcs).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
  </div>
</div>

      {/* ─── Tax Breakdown Bar ─── */}
      <div className="card p-3 border dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="font-semibold text-gray-600 dark:text-gray-300">Tax Breakdown:</span>
          <span className="text-gray-500 dark:text-gray-400">VAT: <span className="font-semibold text-orange-600 dark:text-orange-400">₹{summaryStats.totalVat.toFixed(2)}</span></span>
          <span className="text-gray-500 dark:text-gray-400">CESS: <span className="font-semibold text-blue-600 dark:text-blue-400">₹{summaryStats.totalCess.toFixed(2)}</span></span>
          <span className="text-gray-500 dark:text-gray-400">Special: <span className="font-semibold text-purple-600 dark:text-purple-400">₹{summaryStats.totalSpecial.toFixed(2)}</span></span>
          <span className="text-gray-500 dark:text-gray-400">TCS: <span className="font-semibold text-amber-600 dark:text-amber-400">₹{summaryStats.totalTcs.toFixed(2)}</span></span>
          <span className="ml-auto text-gray-400">Received: <span className="font-semibold text-green-600">{summaryStats.receivedCount}</span> | Returns: <span className="font-semibold text-red-600">{summaryStats.returnCount}</span></span>
        </div>
      </div>

      {/* ─── Filter Section ─── */}
      {showFilters && (
        <div className="card p-4 border dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><Filter className="w-4 h-4 text-blue-500" /> Report Filters</h3>
            <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 font-medium transition-colors"><RotateCcw className="w-3 h-3" /> Clear All</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Date From</label><input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Date To</label><input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Supplier</label><select value={filterSupplier} onChange={e => { setFilterSupplier(e.target.value); setCurrentPage(1) }} className="input-field text-xs"><option value="">All Suppliers</option>{suppliers.map(s => (<option key={s.id} value={s.id}>{s.name}</option>))}</select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Invoice No.</label><input type="text" placeholder="Search invoice..." value={filterInvoice} onChange={e => { setFilterInvoice(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            
            <div>
  <label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Stock To</label>
  <select value={filterStockDest} onChange={e => { setFilterStockDest(e.target.value); setCurrentPage(1) }} className="input-field text-xs">
    <option value="ALL">All (Counter + Godown)</option>
    <option value="GODOWN">Godown Only</option>
    <option value="COUNTER">Counter Only</option>
  </select>
</div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Status</label><select value={filterStatus} onChange={e => { setFilterStatus(e.target.value); setCurrentPage(1) }} className="input-field text-xs"><option value="ALL">All Status</option><option value="RECEIVED">Received</option><option value="RETURN">Return</option></select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Product Name</label><input type="text" placeholder="Filter by product..." value={filterProduct} onChange={e => { setFilterProduct(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Brand</label><input type="text" placeholder="Filter by brand..." value={filterBrand} onChange={e => { setFilterBrand(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Category</label><input type="text" placeholder="Filter by category..." value={filterCategory} onChange={e => { setFilterCategory(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Vehicle No.</label><input type="text" placeholder="e.g. MH12AB1234" value={filterVehicle} onChange={e => { setFilterVehicle(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Min Amount ₹</label><input type="number" placeholder="0" value={filterMinAmount} onChange={e => { setFilterMinAmount(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide self-center mr-1">Quick:</span>
            {[
              { label: 'Today', from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'Last Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM-dd'), to: format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd') },
              { label: 'Last 7 Days', from: format(new Date(Date.now() - 6 * 86400000), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'Last 30 Days', from: format(new Date(Date.now() - 29 * 86400000), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
              { label: 'This Year', from: `${new Date().getFullYear()}-01-01`, to: format(new Date(), 'yyyy-MM-dd') },
            ].map(preset => (
              <button key={preset.label} type="button" onClick={() => { setFilterDateFrom(preset.from); setFilterDateTo(preset.to); setCurrentPage(1) }} className={clsx("text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors", filterDateFrom === preset.from && filterDateTo === preset.to ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300" : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700")}>{preset.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Tab Navigation ─── */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {[{ id: 'detail', label: 'Purchase Detail', icon: Receipt },{ id: 'bySupplier', label: 'By Supplier', icon: Building2 },{ id: 'byCategory', label: 'By Category', icon: BarChart3 },{ id: 'byBrand', label: 'By Brand', icon: Package },{ id: 'byProduct', label: 'By Product', icon: ShoppingBag }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={clsx("flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors", activeTab === tab.id ? "border-blue-500 text-blue-600 dark:text-blue-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600")}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Tab Content ─── */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
      ) : filteredPurchases.length === 0 ? (
        <div className="card p-10 text-center border dark:border-slate-700"><Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" /><p className="text-sm text-gray-400 dark:text-gray-500">{hasActiveFilters ? 'No purchases match the selected filters' : 'No purchases recorded yet'}</p></div>
      ) : (
        <>
          {/* ─── Detail Tab ─── */}
          {activeTab === 'detail' && (
            <div className="space-y-3">
              <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs">
                <thead>
  <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
    <th className="p-2.5 text-left font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50" onClick={() => handleSort('invoice_number')}><div className="flex items-center gap-1">Invoice {getSortIcon(sortField === 'invoice_number' ? sortDir : '')}</div></th>
    <th className="p-2.5 text-left font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50" onClick={() => handleSort('billing_date')}><div className="flex items-center gap-1">Date {getSortIcon(sortField === 'billing_date' ? sortDir : '')}</div></th>
    <th className="p-2.5 text-left font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50" onClick={() => handleSort('supplier_name')}><div className="flex items-center gap-1">Supplier {getSortIcon(sortField === 'supplier_name' ? sortDir : '')}</div></th>
    {/* ← ADD: Stock To Header */}
    <th className="p-2.5 text-center font-semibold">Stock To</th>
    <th className="p-2.5 text-center font-semibold">Vehicle</th>
    <th className="p-2.5 text-right font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50" onClick={() => handleSort('subtotal')}><div className="flex items-center justify-end gap-1">Subtotal {getSortIcon(sortField === 'subtotal' ? sortDir : '')}</div></th>
    <th className="p-2.5 text-right font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50" onClick={() => handleSort('vat_amount')}><div className="flex items-center justify-end gap-1">VAT {getSortIcon(sortField === 'vat_amount' ? sortDir : '')}</div></th>
    <th className="p-2.5 text-right font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50" onClick={() => handleSort('total_amount')}><div className="flex items-center justify-end gap-1">Total {getSortIcon(sortField === 'total_amount' ? sortDir : '')}</div></th>
    <th className="p-2.5 text-center font-semibold">Status</th>
    <th className="p-2.5 text-center font-semibold">Items</th>
  </tr>
</thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {paginatedPurchases.map(p => (
                    <Fragment key={p.id}>
                      <tr className={clsx("hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors", p.status === 'RETURN' && "bg-red-50/30 dark:bg-red-900/10")}>
                        <td className="p-2.5"><div className="font-mono font-semibold text-gray-800 dark:text-gray-200">{p.invoice_number}</div>{p.invoice_date && <div className="text-[10px] text-gray-400">Inv: {format(new Date(p.invoice_date + 'T00:00:00'), 'dd MMM yy')}</div>}</td>
                        <td className="p-2.5 text-gray-600 dark:text-gray-400">{p.billing_date ? format(new Date(p.billing_date + 'T00:00:00'), 'dd MMM yyyy') : p.purchase_date ? format(new Date(p.purchase_date + 'T00:00:00'), 'dd MMM yyyy') : '—'}</td>
                        <td className="p-2.5"><div className="font-medium text-gray-800 dark:text-gray-200">{p.supplier_name || '—'}</div>{p.notes && <div className="text-[10px] text-gray-400">Pass: {p.notes}</div>}</td>
                        {/* ← ADD: Stock To Cell */}
<td className="p-2.5 text-center">
  <span className={clsx(
    "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold",
    (p.stock_destination || 'GODOWN') === 'COUNTER'
      ? "bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 border border-violet-200 dark:border-violet-800"
      : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 border border-amber-200 dark:border-amber-800"
  )}>
    {(p.stock_destination || 'GODOWN') === 'COUNTER'
      ? <><Store className="w-3 h-3" /> Counter</>
      : <><Warehouse className="w-3 h-3" /> Godown</>
    }
  </span>
</td>
                        <td className="p-2.5 text-center text-gray-500 text-[11px]">{p.vehicle_number || '—'}</td>
                        <td className="p-2.5 text-right font-medium">₹{Number(p.subtotal).toFixed(2)}</td>
                        <td className="p-2.5 text-right text-gray-500">₹{Number(p.vat_amount).toFixed(2)}</td>
                        <td className="p-2.5 text-right font-bold text-blue-700 dark:text-blue-300">₹{Number(p.total_amount).toFixed(2)}</td>
                        <td className="p-2.5 text-center"><span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", p.status === 'RETURN' ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400")}>{p.status}</span></td>
                        <td className="p-2.5 text-center"><button onClick={() => loadItems(p.id)} disabled={loadingItems} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors disabled:opacity-50">{loadingItems && expandedId !== p.id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : expandedId === p.id ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}</button></td>
                      </tr>
                      {expandedId === p.id && expandedItems[p.id] && (
                        <tr key={`${p.id}-items`} className="bg-gray-50/50 dark:bg-gray-800/20"><td colSpan={10} className="px-6 py-3"><table className="w-full text-xs"><thead><tr className="text-gray-400 border-b border-gray-200 dark:border-gray-700"><th className="text-left py-1.5 font-medium w-6">#</th><th className="text-left py-1.5 font-medium">Product</th><th className="text-center py-1.5 font-medium w-16">Size</th><th className="text-center py-1.5 font-medium w-12">MRP</th><th className="text-center py-1.5 font-medium w-14">Cases</th><th className="text-center py-1.5 font-medium w-16 font-bold text-green-500">Bottles</th><th className="text-center py-1.5 font-medium w-14">Bulk L</th><th className="text-right py-1.5 font-medium w-18 text-orange-500">Rate/Case</th><th className="text-right py-1.5 font-medium w-18 text-green-500">Rate/Unit</th><th className="text-right py-1.5 font-medium w-20">Total</th></tr></thead>
                          <tbody>{expandedItems[p.id].map((item, idx) => { const cases = item.qty_cases || 0; const totalBtls = item.total_bottles || 0; const ratePerCase = item.unit_cost || 0; const ratePerUnit = item.purchase_rate_per_unit > 0 ? item.purchase_rate_per_unit : (totalBtls > 0 ? (ratePerCase * cases) / totalBtls : 0); return (<tr key={item.id} className="border-b border-gray-100 dark:border-gray-800/50 hover:bg-white/50 dark:hover:bg-gray-800/30"><td className="py-1.5 text-gray-400">{idx + 1}</td><td className="py-1.5"><span className="font-medium text-gray-800 dark:text-gray-200">{item.product_name}</span>{item.traditional_name && <span className="text-gray-400 ml-1">· {item.traditional_name}</span>}{item.brand && <div className="text-[10px] text-gray-400">{item.brand}</div>}</td><td className="text-center py-1.5 text-gray-500">{item.bottle_size || '-'}</td><td className="text-center py-1.5">₹{item.mrp}</td><td className="text-center py-1.5 font-medium">{cases || '-'}</td><td className="text-center py-1.5 font-bold text-green-600 dark:text-green-400">{totalBtls || '-'}</td><td className="text-center py-1.5 text-gray-500">{item.qty_bulk_liters || '-'}</td><td className="text-right py-1.5 font-semibold text-orange-600 dark:text-orange-400">₹{ratePerCase.toFixed(2)}</td><td className="text-right py-1.5 font-semibold text-green-600 dark:text-green-400">₹{ratePerUnit.toFixed(2)}</td><td className="text-right py-1.5 font-medium text-blue-700 dark:text-blue-300">₹{item.total_cost.toFixed(2)}</td></tr>) })}<tr className="bg-slate-100/50 dark:bg-slate-800/50 font-semibold"><td colSpan={4} className="py-1.5 text-right text-gray-500">Item Total</td><td className="py-1.5 text-center">{expandedItems[p.id].reduce((s, i) => s + (i.qty_cases || 0), 0)}</td><td className="py-1.5 text-center text-green-600">{expandedItems[p.id].reduce((s, i) => s + (i.total_bottles || 0), 0)}</td><td className="py-1.5 text-center">{expandedItems[p.id].reduce((s, i) => s + (i.qty_bulk_liters || 0), 0).toFixed(1)}</td><td colSpan={2}></td><td className="py-1.5 text-right text-blue-700 dark:text-blue-300">₹{expandedItems[p.id].reduce((s, i) => s + (i.total_cost || 0), 0).toFixed(2)}</td></tr></tbody></table></td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody></table></div></div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedPurchases.length)} of {sortedPurchases.length}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pageNum; if (totalPages <= 5) pageNum = i + 1; else if (currentPage <= 3) pageNum = i + 1; else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i; else pageNum = currentPage - 2 + i; return (<button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={clsx("w-8 h-8 rounded-lg text-xs font-medium transition-colors", currentPage === pageNum ? "bg-blue-500 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800")}>{pageNum}</button>) })}
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── By Supplier Tab ─── */}
          {activeTab === 'bySupplier' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50"><th className="p-3 text-left font-semibold">#</th><th className="p-3 text-left font-semibold">Supplier</th><th className="p-3 text-center font-semibold">Purchases</th><th className="p-3 text-right font-semibold">Subtotal</th><th className="p-3 text-right font-semibold">VAT</th><th className="p-3 text-right font-semibold">CESS</th><th className="p-3 text-right font-semibold">Special</th><th className="p-3 text-right font-semibold">TCS</th><th className="p-3 text-right font-semibold">Total</th><th className="p-3 text-right font-semibold">%</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">{bySupplier.map((s, i) => { const pct = summaryStats.totalAmount > 0 ? (s.total / summaryStats.totalAmount * 100) : 0; return (<tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30"><td className="p-3 text-gray-400">{i + 1}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">{s.name}</td><td className="p-3 text-center"><span className="bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-full font-semibold">{s.count}</span></td><td className="p-3 text-right">₹{s.subtotal.toFixed(2)}</td><td className="p-3 text-right text-gray-500">₹{s.vat.toFixed(2)}</td><td className="p-3 text-right text-gray-500">₹{s.cess.toFixed(2)}</td><td className="p-3 text-right text-gray-500">₹{s.special.toFixed(2)}</td><td className="p-3 text-right text-gray-500">₹{s.tcs.toFixed(2)}</td><td className="p-3 text-right font-bold text-blue-700 dark:text-blue-300">₹{s.total.toFixed(2)}</td><td className="p-3 text-right"><div className="flex items-center gap-2 justify-end"><div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-blue-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span></div></td></tr>) })}</tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600"><tr className="font-bold"><td colSpan={2} className="p-3 text-right text-gray-700 dark:text-gray-300">Grand Total</td><td className="p-3 text-center">{summaryStats.totalPurchases}</td><td className="p-3 text-right">₹{summaryStats.totalSubtotal.toFixed(2)}</td><td className="p-3 text-right">₹{summaryStats.totalVat.toFixed(2)}</td><td className="p-3 text-right">₹{summaryStats.totalCess.toFixed(2)}</td><td className="p-3 text-right">₹{summaryStats.totalSpecial.toFixed(2)}</td><td className="p-3 text-right">₹{summaryStats.totalTcs.toFixed(2)}</td><td className="p-3 text-right text-blue-700 dark:text-blue-300">₹{summaryStats.totalAmount.toFixed(2)}</td><td className="p-3 text-right text-[10px] text-gray-400">100%</td></tr></tfoot></table></div></div>
          )}

          {/* ─── By Category Tab ─── */}
          {activeTab === 'byCategory' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50"><th className="p-3 text-left font-semibold">#</th><th className="p-3 text-left font-semibold">Category</th><th className="p-3 text-center font-semibold">Items</th><th className="p-3 text-center font-semibold">Cases</th><th className="p-3 text-center font-semibold text-green-600">Bottles</th><th className="p-3 text-center font-semibold">Bulk L</th><th className="p-3 text-right font-semibold text-blue-600">Total Cost</th><th className="p-3 text-right font-semibold">%</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">{byCategory.map((c, i) => { const pct = summaryStats.itemCostSum > 0 ? (c.cost / summaryStats.itemCostSum * 100) : 0; return (<tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30"><td className="p-3 text-gray-400">{i + 1}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">{c.name}</td><td className="p-3 text-center"><span className="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-semibold">{c.count}</span></td><td className="p-3 text-center">{c.cases}</td><td className="p-3 text-center font-bold text-green-600 dark:text-green-400">{c.bottles}</td><td className="p-3 text-center text-gray-500">{c.bulkLiters.toFixed(1)}</td><td className="p-3 text-right font-bold text-blue-700 dark:text-blue-300">₹{c.cost.toFixed(2)}</td><td className="p-3 text-right"><div className="flex items-center gap-2 justify-end"><div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span></div></td></tr>) })}</tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600"><tr className="font-bold"><td colSpan={2} className="p-3 text-right text-gray-700 dark:text-gray-300">Total</td><td className="p-3 text-center">{byCategory.reduce((s, c) => s + c.count, 0)}</td><td className="p-3 text-center">{byCategory.reduce((s, c) => s + c.cases, 0)}</td><td className="p-3 text-center text-green-600">{byCategory.reduce((s, c) => s + c.bottles, 0)}</td><td className="p-3 text-center">{byCategory.reduce((s, c) => s + c.bulkLiters, 0).toFixed(1)}</td><td className="p-3 text-right text-blue-700 dark:text-blue-300">₹{byCategory.reduce((s, c) => s + c.cost, 0).toFixed(2)}</td><td className="p-3 text-right text-[10px] text-gray-400">100%</td></tr></tfoot></table></div></div>
          )}

          {/* ─── By Brand Tab ─── */}
          {activeTab === 'byBrand' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50"><th className="p-3 text-left font-semibold">#</th><th className="p-3 text-left font-semibold">Brand</th><th className="p-3 text-center font-semibold">Items</th><th className="p-3 text-center font-semibold">Cases</th><th className="p-3 text-center font-semibold text-green-600">Bottles</th><th className="p-3 text-center font-semibold">Bulk L</th><th className="p-3 text-right font-semibold text-blue-600">Total Cost</th><th className="p-3 text-right font-semibold">%</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">{byBrand.map((b, i) => { const pct = summaryStats.itemCostSum > 0 ? (b.cost / summaryStats.itemCostSum * 100) : 0; return (<tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30"><td className="p-3 text-gray-400">{i + 1}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">{b.name}</td><td className="p-3 text-center"><span className="bg-cyan-50 dark:bg-cyan-900/20 text-cyan-600 dark:text-cyan-400 px-2 py-0.5 rounded-full font-semibold">{b.count}</span></td><td className="p-3 text-center">{b.cases}</td><td className="p-3 text-center font-bold text-green-600 dark:text-green-400">{b.bottles}</td><td className="p-3 text-center text-gray-500">{b.bulkLiters.toFixed(1)}</td><td className="p-3 text-right font-bold text-blue-700 dark:text-blue-300">₹{b.cost.toFixed(2)}</td><td className="p-3 text-right"><div className="flex items-center gap-2 justify-end"><div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-cyan-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span></div></td></tr>) })}</tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600"><tr className="font-bold"><td colSpan={2} className="p-3 text-right text-gray-700 dark:text-gray-300">Total</td><td className="p-3 text-center">{byBrand.reduce((s, b) => s + b.count, 0)}</td><td className="p-3 text-center">{byBrand.reduce((s, b) => s + b.cases, 0)}</td><td className="p-3 text-center text-green-600">{byBrand.reduce((s, b) => s + b.bottles, 0)}</td><td className="p-3 text-center">{byBrand.reduce((s, b) => s + b.bulkLiters, 0).toFixed(1)}</td><td className="p-3 text-right text-blue-700 dark:text-blue-300">₹{byBrand.reduce((s, b) => s + b.cost, 0).toFixed(2)}</td><td className="p-3 text-right text-[10px] text-gray-400">100%</td></tr></tfoot></table></div></div>
          )}

          {/* ─── By Product Tab ─── */}
          {activeTab === 'byProduct' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50"><th className="p-3 text-left font-semibold">#</th><th className="p-3 text-left font-semibold">Product</th><th className="p-3 text-left font-semibold">Brand</th><th className="p-3 text-center font-semibold">Size</th><th className="p-3 text-center font-semibold">MRP</th><th className="p-3 text-center font-semibold">Times</th><th className="p-3 text-center font-semibold">Cases</th><th className="p-3 text-center font-semibold text-green-600">Bottles</th><th className="p-3 text-center font-semibold">Bulk L</th><th className="p-3 text-center font-semibold">LP L</th><th className="p-3 text-right font-semibold text-blue-600">Total Cost</th><th className="p-3 text-right font-semibold">%</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">{byProduct.map((p, i) => { const pct = summaryStats.itemCostSum > 0 ? (p.cost / summaryStats.itemCostSum * 100) : 0; return (<tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30"><td className="p-3 text-gray-400">{i + 1}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">{p.name}</td><td className="p-3 text-gray-500 dark:text-gray-400">{p.brand || '-'}</td><td className="p-3 text-center text-gray-500">{p.bottle_size || '-'}</td><td className="p-3 text-center">₹{p.mrp}</td><td className="p-3 text-center"><span className="bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 rounded-full font-semibold">{p.count}</span></td><td className="p-3 text-center">{p.cases}</td><td className="p-3 text-center font-bold text-green-600 dark:text-green-400">{p.bottles}</td><td className="p-3 text-center text-gray-500">{p.bulkLiters.toFixed(1)}</td><td className="p-3 text-center text-gray-500">{p.lpLiters.toFixed(1)}</td><td className="p-3 text-right font-bold text-blue-700 dark:text-blue-300">₹{p.cost.toFixed(2)}</td><td className="p-3 text-right"><div className="flex items-center gap-2 justify-end"><div className="w-16 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span></div></td></tr>) })}</tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600"><tr className="font-bold"><td colSpan={2} className="p-3 text-right text-gray-700 dark:text-gray-300">Total</td><td colSpan={2}></td><td></td><td className="p-3 text-center">{byProduct.reduce((s, p) => s + p.count, 0)}</td><td className="p-3 text-center">{byProduct.reduce((s, p) => s + p.cases, 0)}</td><td className="p-3 text-center text-green-600">{byProduct.reduce((s, p) => s + p.bottles, 0)}</td><td className="p-3 text-center">{byProduct.reduce((s, p) => s + p.bulkLiters, 0).toFixed(1)}</td><td className="p-3 text-center">{byProduct.reduce((s, p) => s + p.lpLiters, 0).toFixed(1)}</td><td className="p-3 text-right text-blue-700 dark:text-blue-300">₹{byProduct.reduce((s, p) => s + p.cost, 0).toFixed(2)}</td><td className="p-3 text-right text-[10px] text-gray-400">100%</td></tr></tfoot></table></div></div>
          )}
        </>
      )}
    </div>
  )
}