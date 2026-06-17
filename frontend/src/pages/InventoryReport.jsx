import { useState, useEffect, useMemo } from 'react'
import {
  Loader as Loader2, Filter, RotateCcw, FileDown, Package, AlertCircle,
  BarChart3, TrendingDown, TrendingUp, Clock3, ShieldAlert, Warehouse,
  Store, ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown,
  Search, Layers, Tag, DollarSign, Box
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

// Import API function
import { getProducts } from '../apiservices/inventoryapi'

// ─── Constants ───
const CATEGORIES = ['WHISKY', 'RUM', 'VODKA', 'GIN', 'BEER', 'WINE', 'BRANDY', 'OTHER']
const PRODUCT_TYPES = ['IMFL', 'BEER', 'WINE', 'COUNTRY LIQUOR']

// ─── Stock Classification Helper ───
function classifyProduct(p) {
  const stock = p.current_stock || 0
  const reorder = p.reorder_level || 0
  const maxStock = p.maximum_stock || 0

  if (stock <= 0) return 'Out of Stock'
  if (stock <= reorder) return 'Low Stock'
  if (maxStock > 0 ? stock > maxStock : stock > reorder * 3) return 'Dead Stock'
  if (stock > reorder * 2) return 'Slow Moving'
  return 'Fast Moving'
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

export default function InventoryReport() {
  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  // ─── Data State ───
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ─── Filter State ───
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [subCategoryFilter, setSubCategoryFilter] = useState('ALL')
  const [brandFilter, setBrandFilter] = useState('ALL')
  const [typeFilter, setTypeFilter] = useState('ALL')
  const [stockStatusFilter, setStockStatusFilter] = useState('ALL')
  const [priceMin, setPriceMin] = useState('')
  const [priceMax, setPriceMax] = useState('')
  const [expiryFrom, setExpiryFrom] = useState('')
  const [expiryTo, setExpiryTo] = useState('')

  // ─── UI State ───
  const [showFilters, setShowFilters] = useState(true)
  const [activeTab, setActiveTab] = useState('detail')
  const [sortField, setSortField] = useState('name')
  const [sortDir, setSortDir] = useState('asc')
  const [currentPage, setCurrentPage] = useState(1)

  // ─── Dynamic Dropdowns ───
  const [availableBrands, setAvailableBrands] = useState([])
  const [availableSubCategories, setAvailableSubCategories] = useState([])

  useEffect(() => {
    if (companyId) fetchProducts()
  }, [companyId])

  const fetchProducts = async () => {
    setLoading(true)
    setError('')
    try {
      // ─── PASS COMPANY ID ───
      const data = await getProducts(Number(companyId))
      setProducts(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  // ─── Extract unique Brands and Sub-categories ───
  useEffect(() => {
    const brands = [...new Set(products.map(p => p.brand).filter(Boolean))].sort()
    setAvailableBrands(brands)

    const subCats = [...new Set(products.map(p => p.sub_category).filter(Boolean))].sort()
    setAvailableSubCategories(subCats)
  }, [products])

  // ─── Clear All Filters ───
  const clearFilters = () => {
    setSearch('')
    setCategoryFilter('ALL')
    setSubCategoryFilter('ALL')
    setBrandFilter('ALL')
    setTypeFilter('ALL')
    setStockStatusFilter('ALL')
    setPriceMin('')
    setPriceMax('')
    setExpiryFrom('')
    setExpiryTo('')
    setCurrentPage(1)
  }

  const hasActiveFilters = search || categoryFilter !== 'ALL' || subCategoryFilter !== 'ALL' ||
    brandFilter !== 'ALL' || typeFilter !== 'ALL' || stockStatusFilter !== 'ALL' ||
    priceMin || priceMax || expiryFrom || expiryTo

  // ─── Filtering Logic ───
  const filteredProducts = useMemo(() => {
    return products.filter(p => {
      const q = search.toLowerCase()
      if (q && !(
        (p.name || '').toLowerCase().includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.barcode || '').includes(q) ||
        (p.item_code || '').toLowerCase().includes(q)
      )) return false

      if (categoryFilter !== 'ALL' && p.category !== categoryFilter) return false
      if (subCategoryFilter !== 'ALL' && p.sub_category !== subCategoryFilter) return false
      if (brandFilter !== 'ALL' && p.brand !== brandFilter) return false
      if (typeFilter !== 'ALL' && p.product_type !== typeFilter) return false
      if (stockStatusFilter !== 'ALL' && classifyProduct(p) !== stockStatusFilter) return false

      const price = Number(p.sale_price) || 0
      if (priceMin && price < Number(priceMin)) return false
      if (priceMax && price > Number(priceMax)) return false

      const expDate = p.expiry_date || ''
      if (expiryFrom && expDate < expiryFrom) return false
      if (expiryTo && expDate > expiryTo) return false

      return true
    })
  }, [products, search, categoryFilter, subCategoryFilter, brandFilter, typeFilter, stockStatusFilter, priceMin, priceMax, expiryFrom, expiryTo])

  // ─── Sorting ───
  const sortedProducts = useMemo(() => {
    const sorted = [...filteredProducts].sort((a, b) => {
      let valA = a[sortField]
      let valB = b[sortField]

      if (typeof valA === 'string') {
        valA = valA.toLowerCase()
        valB = (valB || '').toLowerCase()
        return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA)
      }
      valA = Number(valA) || 0
      valB = Number(valB) || 0
      return sortDir === 'asc' ? valA - valB : valB - valA
    })
    return sorted
  }, [filteredProducts, sortField, sortDir])

  // ─── Pagination ───
  const totalPages = Math.ceil(sortedProducts.length / ITEMS_PER_PAGE)
  const paginatedProducts = sortedProducts.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

  // ─── Summary Statistics ───
      const summaryStats = useMemo(() => {
    const totalProducts = filteredProducts.length
    const totalStock = filteredProducts.reduce((s, p) => s + (Number(p.current_stock) || 0), 0)
    const godownStock = filteredProducts.reduce((s, p) => s + (Number(p.godown_stock) || 0), 0)
    const counterStock = filteredProducts.reduce((s, p) => s + (Number(p.counter_stock) || 0), 0)
    const damageStock = filteredProducts.reduce((s, p) => s + (Number(p.damage_stock) || 0), 0)
    
    // ─── Cost Value = Bottles × Purchase Rate Per Unit ───
    const totalValue = filteredProducts.reduce((s, p) => {
      const rate = Number(p.purchase_rate) || 0
      return s + ((Number(p.current_stock) || 0) * rate)
    }, 0)

    const totalRetailValue = filteredProducts.reduce((s, p) => {
      return s + ((Number(p.current_stock) || 0) * (Number(p.sale_price) || 0))
    }, 0)

    const stockStatusCounts = filteredProducts.reduce((acc, p) => {
      const status = classifyProduct(p)
      acc[status] = (acc[status] || 0) + 1
      return acc
    }, {})

    return {
      totalProducts, totalStock, godownStock, counterStock, damageStock,
      totalValue, totalRetailValue, stockStatusCounts
    }
  }, [filteredProducts])
  // ─── Aggregation: By Category ───
    const byCategory = useMemo(() => {
    const map = {}
    filteredProducts.forEach(p => {
      const key = p.category || 'Uncategorized'
      if (!map[key]) map[key] = { name: key, count: 0, stock: 0, godown: 0, counter: 0, value: 0, retailValue: 0 }
      map[key].count++
      map[key].stock += Number(p.current_stock) || 0
      map[key].godown += Number(p.godown_stock) || 0
      map[key].counter += Number(p.counter_stock) || 0
      // ─── Cost Value = Bottles × Purchase Rate Per Unit ───
      const rate = Number(p.purchase_rate) || 0
      map[key].value += (Number(p.current_stock) || 0) * rate
      map[key].retailValue += (Number(p.current_stock) || 0) * (Number(p.sale_price) || 0)
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [filteredProducts])
  // ─── Aggregation: By Brand ───
     const byBrand = useMemo(() => {
    const map = {}
    filteredProducts.forEach(p => {
      const key = p.brand || 'Unknown Brand'
      if (!map[key]) map[key] = { name: key, category: p.category || '', count: 0, stock: 0, value: 0, retailValue: 0 }
      map[key].count++
      map[key].stock += Number(p.current_stock) || 0
      // ─── Cost Value = Bottles × Purchase Rate Per Unit ───
      const rate = Number(p.purchase_rate) || 0
      map[key].value += (Number(p.current_stock) || 0) * rate
      map[key].retailValue += (Number(p.current_stock) || 0) * (Number(p.sale_price) || 0)
    })
    return Object.values(map).sort((a, b) => b.value - a.value)
  }, [filteredProducts])
  // ─── Aggregation: By Stock Status ───
    const byStockStatus = useMemo(() => {
    const map = {}
    const statusConfig = {
      'Out of Stock': { color: 'red', icon: AlertCircle },
      'Low Stock': { color: 'amber', icon: TrendingDown },
      'Dead Stock': { color: 'purple', icon: Box },
      'Slow Moving': { color: 'orange', icon: Clock3 },
      'Fast Moving': { color: 'green', icon: TrendingUp },
    }
    
    filteredProducts.forEach(p => {
      const key = classifyProduct(p)
      if (!map[key]) map[key] = { name: key, count: 0, stock: 0, value: 0, retailValue: 0, config: statusConfig[key] || {} }
      map[key].count++
      map[key].stock += Number(p.current_stock) || 0
      // ─── Cost Value = Bottles × Purchase Rate Per Unit ───
      const rate = Number(p.purchase_rate) || 0
      map[key].value += (Number(p.current_stock) || 0) * rate
      map[key].retailValue += (Number(p.current_stock) || 0) * (Number(p.sale_price) || 0)
    })
    
    const order = ['Out of Stock', 'Low Stock', 'Fast Moving', 'Slow Moving', 'Dead Stock']
    return order.filter(k => map[k]).map(k => map[k])
  }, [filteredProducts])
  // ─── Export to Excel ───
     // ─── Export to Excel ───
  const handleExportExcel = async () => {
    if (filteredProducts.length === 0) { alert('No data to export'); return }

    const wb = XLSX.utils.book_new()

    const detailData = filteredProducts.map(p => {
      const rate = Number(p.purchase_rate) || 0
      return {
        'Item Code': p.item_code || '', 'Barcode': p.barcode || '', 'Product Name': p.name || '', 'Brand': p.brand || '',
        'Category': p.category || '', 'Sub Category': p.sub_category || '', 'Type': p.product_type || '', 'Size': p.bottle_size || '',
        'Traditional Name': p.traditional_name || '', 'Btls/Case': p.bottles_per_case || 0,
        'MRP': Number(p.mrp) || 0, 'Sale Price': Number(p.sale_price) || 0, 'Purchase Rate/Unit': rate,
        'Godown Stock': Number(p.godown_stock) || 0, 'Counter Stock': Number(p.counter_stock) || 0, 'Total Stock': Number(p.current_stock) || 0,
        'Cost Value (Stock × Rate)': (Number(p.current_stock) || 0) * rate,
        'Status': classifyProduct(p),
      }
    })
    const ws1 = XLSX.utils.json_to_sheet(detailData)
    XLSX.utils.book_append_sheet(wb, ws1, 'Inventory Detail')

    const catData = byCategory.map(c => ({ 'Category': c.name, 'Products': c.count, 'Godown': c.godown, 'Counter': c.counter, 'Total Stock': c.stock, 'Cost Value': c.value.toFixed(2), 'Retail Value': c.retailValue.toFixed(2) }))
    const ws2 = XLSX.utils.json_to_sheet(catData)
    XLSX.utils.book_append_sheet(wb, ws2, 'By Category')

    const brandData = byBrand.map(b => ({ 'Brand': b.name, 'Category': b.category, 'Products': b.count, 'Total Stock': b.stock, 'Cost Value': b.value.toFixed(2), 'Retail Value': b.retailValue.toFixed(2) }))
    const ws3 = XLSX.utils.json_to_sheet(brandData)
    XLSX.utils.book_append_sheet(wb, ws3, 'By Brand')

    // ─── Save File (Tauri + Browser) ───
    const fileName = `Inventory_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
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
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view inventory reports.</p>
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
              <Layers className="w-5 h-5 text-purple-500" />
              Inventory Report
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {filteredProducts.length} product(s) found
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
          <button type="button" onClick={() => setShowFilters(s => !s)} className={clsx("btn-secondary flex items-center gap-2 text-xs", showFilters && "bg-purple-50 dark:bg-purple-900/30 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-400")}><Filter className="w-3.5 h-3.5" /> Filters</button>
          <button type="button" onClick={handleExportExcel} disabled={filteredProducts.length === 0} className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"><FileDown className="w-3.5 h-3.5" /> Export Excel</button>
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
        <div className="card p-3 border dark:border-slate-700"><div className="flex items-center gap-2 mb-1"><Package className="w-4 h-4 text-purple-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Products</span></div><p className="text-lg font-bold text-gray-800 dark:text-gray-100">{summaryStats.totalProducts}</p></div>
        <div className="card p-3 border dark:border-slate-700"><div className="flex items-center gap-2 mb-1"><Layers className="w-4 h-4 text-blue-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Total Stock</span></div><p className="text-lg font-bold text-blue-600 dark:text-blue-400">{summaryStats.totalStock.toLocaleString()}</p></div>
        <div className="card p-3 border dark:border-slate-700"><div className="flex items-center gap-2 mb-1"><DollarSign className="w-4 h-4 text-green-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Cost Value</span></div><p className="text-lg font-bold text-green-600 dark:text-green-400">₹{summaryStats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p></div>
        <div className="card p-3 border dark:border-slate-700"><div className="flex items-center gap-2 mb-1"><Tag className="w-4 h-4 text-cyan-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Retail Value</span></div><p className="text-lg font-bold text-cyan-600 dark:text-cyan-400">₹{summaryStats.totalRetailValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p></div>
        <div className="card p-3 border dark:border-slate-700"><div className="flex items-center gap-2 mb-1"><Warehouse className="w-4 h-4 text-indigo-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Godown</span></div><p className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{summaryStats.godownStock.toLocaleString()}</p></div>
        <div className="card p-3 border dark:border-slate-700"><div className="flex items-center gap-2 mb-1"><Store className="w-4 h-4 text-pink-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Counter</span></div><p className="text-lg font-bold text-pink-600 dark:text-pink-400">{summaryStats.counterStock.toLocaleString()}</p></div>
        <div className="card p-3 border dark:border-slate-700"><div className="flex items-center gap-2 mb-1"><ShieldAlert className="w-4 h-4 text-red-500" /><span className="text-[10px] uppercase font-semibold text-gray-400 dark:text-gray-500 tracking-wide">Damage</span></div><p className="text-lg font-bold text-red-600 dark:text-red-400">{summaryStats.damageStock.toLocaleString()}</p></div>
      </div>

      {/* ─── Stock Status Quick Bar ─── */}
      <div className="card p-3 border dark:border-slate-700">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <span className="font-semibold text-gray-600 dark:text-gray-300">Stock Status:</span>
          <span className="text-red-500 font-medium">Out of Stock: <span className="font-bold">{summaryStats.stockStatusCounts['Out of Stock'] || 0}</span></span>
          <span className="text-amber-500 font-medium">Low Stock: <span className="font-bold">{summaryStats.stockStatusCounts['Low Stock'] || 0}</span></span>
          <span className="text-green-500 font-medium">Fast Moving: <span className="font-bold">{summaryStats.stockStatusCounts['Fast Moving'] || 0}</span></span>
          <span className="text-orange-500 font-medium">Slow Moving: <span className="font-bold">{summaryStats.stockStatusCounts['Slow Moving'] || 0}</span></span>
          <span className="text-purple-500 font-medium">Dead Stock: <span className="font-bold">{summaryStats.stockStatusCounts['Dead Stock'] || 0}</span></span>
        </div>
      </div>

      {/* ─── Filter Section ─── */}
      {showFilters && (
        <div className="card p-4 border dark:border-slate-700 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><Filter className="w-4 h-4 text-purple-500" /> Report Filters</h3>
            <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 font-medium transition-colors"><RotateCcw className="w-3 h-3" /> Clear All</button>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
            <div className="col-span-2 md:col-span-1"><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Search</label><div className="relative"><Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" /><input type="text" placeholder="Name, Brand, Code..." value={search} onChange={e => { setSearch(e.target.value); setCurrentPage(1) }} className="input-field text-xs pl-8" /></div></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Category</label><select value={categoryFilter} onChange={e => { setCategoryFilter(e.target.value); setCurrentPage(1) }} className="input-field text-xs"><option value="ALL">All Categories</option>{CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Sub Category</label><select value={subCategoryFilter} onChange={e => { setSubCategoryFilter(e.target.value); setCurrentPage(1) }} className="input-field text-xs"><option value="ALL">All Sub Categories</option>{availableSubCategories.map(sc => <option key={sc}>{sc}</option>)}</select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Brand</label><select value={brandFilter} onChange={e => { setBrandFilter(e.target.value); setCurrentPage(1) }} className="input-field text-xs"><option value="ALL">All Brands</option>{availableBrands.map(b => <option key={b}>{b}</option>)}</select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Product Type</label><select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setCurrentPage(1) }} className="input-field text-xs"><option value="ALL">All Types</option>{PRODUCT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Stock Status</label><select value={stockStatusFilter} onChange={e => { setStockStatusFilter(e.target.value); setCurrentPage(1) }} className="input-field text-xs"><option value="ALL">All Statuses</option><option value="Out of Stock">Out of Stock</option><option value="Low Stock">Low Stock</option><option value="Fast Moving">Fast Moving</option><option value="Slow Moving">Slow Moving</option><option value="Dead Stock">Dead Stock</option></select></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Sale Price Min ₹</label><input type="number" placeholder="0" value={priceMin} onChange={e => { setPriceMin(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Sale Price Max ₹</label><input type="number" placeholder="99999" value={priceMax} onChange={e => { setPriceMax(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Expiry From</label><input type="date" value={expiryFrom} onChange={e => { setExpiryFrom(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
            <div><label className="block text-[10px] font-medium text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Expiry To</label><input type="date" value={expiryTo} onChange={e => { setExpiryTo(e.target.value); setCurrentPage(1) }} className="input-field text-xs" /></div>
          </div>
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
            <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide self-center mr-1">Quick:</span>
            {[{ label: 'Out of Stock', value: 'Out of Stock', color: 'red' },{ label: 'Low Stock', value: 'Low Stock', color: 'amber' },{ label: 'Fast Moving', value: 'Fast Moving', color: 'green' },{ label: 'Slow Moving', value: 'Slow Moving', color: 'orange' },{ label: 'Dead Stock', value: 'Dead Stock', color: 'purple' }].map(preset => (
              <button key={preset.value} type="button" onClick={() => { setStockStatusFilter(prev => prev === preset.value ? 'ALL' : preset.value); setCurrentPage(1) }} className={clsx("text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors", stockStatusFilter === preset.value ? `bg-${preset.color}-50 dark:bg-${preset.color}-900/30 border-${preset.color}-200 dark:border-${preset.color}-800 text-${preset.color}-700 dark:text-${preset.color}-400` : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700")}>{preset.label}</button>
            ))}
          </div>
        </div>
      )}

      {/* ─── Tab Navigation ─── */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex gap-1 overflow-x-auto -mb-px">
          {[{ id: 'detail', label: 'Product Detail', icon: Package },{ id: 'byCategory', label: 'By Category', icon: Layers },{ id: 'byBrand', label: 'By Brand', icon: Tag },{ id: 'byStockStatus', label: 'Stock Analysis', icon: BarChart3 }].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={clsx("flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-colors", activeTab === tab.id ? "border-purple-500 text-purple-600 dark:text-purple-400" : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600")}>
              <tab.icon className="w-3.5 h-3.5" />{tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* ─── Tab Content ─── */}
      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary-500" /></div>
      ) : filteredProducts.length === 0 ? (
        <div className="card p-10 text-center border dark:border-slate-700"><Package className="w-12 h-12 text-gray-300 dark:text-gray-600 mx-auto mb-3" /><p className="text-sm text-gray-400 dark:text-gray-500">{hasActiveFilters ? 'No products match the selected filters' : 'No products found'}</p></div>
      ) : (
        <>
          {/* ─── Detail Tab ─── */}
          {activeTab === 'detail' && (
            <div className="space-y-3">
              <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">{[{ label: 'Product', field: 'name' },{ label: 'Code', field: 'item_code' },{ label: 'Category', field: 'category' },{ label: 'Brand', field: 'brand' },{ label: 'Size', field: 'bottle_size' },{ label: 'Sale ₹', field: 'sale_price' },{ label: 'Cost ₹', field: 'landing_cost' },{ label: 'Godown', field: 'godown_stock' },{ label: 'Counter', field: 'counter_stock' },{ label: 'Total', field: 'current_stock' },{ label: 'Value ₹', field: 'stock_value' },{ label: 'Status', field: 'status' }].map(({ label, field }) => (<th key={field} onClick={() => handleSort(field)} className="p-2.5 text-left font-semibold cursor-pointer select-none hover:bg-slate-100 dark:hover:bg-slate-700/50 transition-colors whitespace-nowrap"><div className="flex items-center gap-1">{label} {getSortIcon(sortField === field ? sortDir : '')}</div></th>))}</tr></thead>
                <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                  {paginatedProducts.map(p => {
                   const stock = Number(p.current_stock) || 0; const rate = Number(p.purchase_rate) || 0; const stockValue = stock * rate; const stockStatus = classifyProduct(p)
                    const statusColors = { 'Out of Stock': 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400', 'Low Stock': 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400', 'Fast Moving': 'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400', 'Slow Moving': 'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400', 'Dead Stock': 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' }
                    return (
                      <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="p-2.5"><div className="font-medium text-gray-800 dark:text-gray-200">{p.name}</div><div className="text-[10px] text-gray-400">{p.traditional_name || ''}</div></td>
                        <td className="p-2.5 font-mono text-gray-500">{p.item_code || '—'}</td>
                        <td className="p-2.5"><span className="badge-info">{p.category}</span></td>
                        <td className="p-2.5 text-gray-600 dark:text-gray-400">{p.brand || '—'}</td>
                        <td className="p-2.5 text-gray-500">{p.bottle_size || '—'}</td>
                        <td className="p-2.5 font-medium">₹{Number(p.sale_price || 0).toFixed(2)}</td>
                        <td className="p-2.5 text-gray-500">₹{rate.toFixed(2)}</td>
                        <td className="p-2.5"><div className="flex items-center gap-1.5"><Warehouse className="w-3 h-3 text-blue-400 flex-shrink-0" /><span className={clsx('font-semibold', Number(p.godown_stock) > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400')}>{p.godown_stock || 0}</span></div></td>
                        <td className="p-2.5"><div className="flex items-center gap-1.5"><Store className="w-3 h-3 text-pink-400 flex-shrink-0" /><span className={clsx('font-semibold', Number(p.counter_stock) > 0 ? 'text-pink-600 dark:text-pink-400' : 'text-gray-400')}>{p.counter_stock || 0}</span></div></td>
                        <td className="p-2.5 font-bold text-gray-800 dark:text-gray-200">{stock}</td>
                        <td className="p-2.5 font-medium text-green-600 dark:text-green-400">₹{stockValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td>
                        <td className="p-2.5"><span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full", statusColors[stockStatus])}>{stockStatus}</span></td>
                      </tr>
                    )
                  })}
                </tbody></table></div></div>
              {totalPages > 1 && (
                <div className="flex items-center justify-between px-2">
                  <p className="text-xs text-gray-500 dark:text-gray-400">Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, sortedProducts.length)} of {sortedProducts.length}</p>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronLeft className="w-4 h-4" /></button>
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => { let pageNum; if (totalPages <= 5) pageNum = i + 1; else if (currentPage <= 3) pageNum = i + 1; else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i; else pageNum = currentPage - 2 + i; return (<button key={pageNum} onClick={() => setCurrentPage(pageNum)} className={clsx("w-8 h-8 rounded-lg text-xs font-medium transition-colors", currentPage === pageNum ? "bg-purple-500 text-white" : "border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800")}>{pageNum}</button>) })}
                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"><ChevronRight className="w-4 h-4" /></button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ─── By Category Tab ─── */}
          {activeTab === 'byCategory' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50"><th className="p-3 text-left font-semibold">#</th><th className="p-3 text-left font-semibold">Category</th><th className="p-3 text-center font-semibold">Products</th><th className="p-3 text-center font-semibold">Godown</th><th className="p-3 text-center font-semibold">Counter</th><th className="p-3 text-center font-semibold text-blue-600">Total Stock</th><th className="p-3 text-right font-semibold text-green-600">Cost Value ₹</th><th className="p-3 text-right font-semibold text-cyan-600">Retail Value ₹</th><th className="p-3 text-right font-semibold">% of Total</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">{byCategory.map((c, i) => { const pct = summaryStats.totalValue > 0 ? (c.value / summaryStats.totalValue * 100) : 0; return (<tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"><td className="p-3 text-gray-400">{i + 1}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">{c.name}</td><td className="p-3 text-center"><span className="bg-purple-50 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full font-semibold">{c.count}</span></td><td className="p-3 text-center">{c.godown.toLocaleString()}</td><td className="p-3 text-center">{c.counter.toLocaleString()}</td><td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">{c.stock.toLocaleString()}</td><td className="p-3 text-right font-bold text-green-600 dark:text-green-400">₹{c.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right font-medium text-cyan-600 dark:text-cyan-400">₹{c.retailValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right"><div className="flex items-center gap-2 justify-end"><div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-purple-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span></div></td></tr>) })}</tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600"><tr className="font-bold"><td colSpan={2} className="p-3 text-right text-gray-700 dark:text-gray-300">Grand Total</td><td className="p-3 text-center">{summaryStats.totalProducts}</td><td className="p-3 text-center">{summaryStats.godownStock.toLocaleString()}</td><td className="p-3 text-center">{summaryStats.counterStock.toLocaleString()}</td><td className="p-3 text-center text-blue-600">{summaryStats.totalStock.toLocaleString()}</td><td className="p-3 text-right text-green-600">₹{summaryStats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right text-cyan-600">₹{summaryStats.totalRetailValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right text-[10px] text-gray-400">100%</td></tr></tfoot></table></div></div>
          )}

          {/* ─── By Brand Tab ─── */}
          {activeTab === 'byBrand' && (
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm"><div className="overflow-x-auto"><table className="w-full text-xs"><thead><tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50"><th className="p-3 text-left font-semibold">#</th><th className="p-3 text-left font-semibold">Brand</th><th className="p-3 text-left font-semibold">Category</th><th className="p-3 text-center font-semibold">Products</th><th className="p-3 text-center font-semibold text-blue-600">Total Stock</th><th className="p-3 text-right font-semibold text-green-600">Cost Value ₹</th><th className="p-3 text-right font-semibold text-cyan-600">Retail Value ₹</th><th className="p-3 text-right font-semibold">% of Total</th></tr></thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">{byBrand.map((b, i) => { const pct = summaryStats.totalValue > 0 ? (b.value / summaryStats.totalValue * 100) : 0; return (<tr key={i} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors"><td className="p-3 text-gray-400">{i + 1}</td><td className="p-3 font-medium text-gray-800 dark:text-gray-200">{b.name}</td><td className="p-3 text-gray-500">{b.category}</td><td className="p-3 text-center"><span className="bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400 px-2 py-0.5 rounded-full font-semibold">{b.count}</span></td><td className="p-3 text-center font-bold text-blue-600 dark:text-blue-400">{b.stock.toLocaleString()}</td><td className="p-3 text-right font-bold text-green-600 dark:text-green-400">₹{b.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right font-medium text-cyan-600 dark:text-cyan-400">₹{b.retailValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right"><div className="flex items-center gap-2 justify-end"><div className="w-20 h-1.5 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className="h-full bg-pink-500 rounded-full" style={{ width: `${Math.min(100, pct)}%` }} /></div><span className="text-[10px] text-gray-400 w-8 text-right">{pct.toFixed(1)}%</span></div></td></tr>) })}</tbody>
              <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600"><tr className="font-bold"><td colSpan={3} className="p-3 text-right text-gray-700 dark:text-gray-300">Grand Total</td><td className="p-3 text-center">{summaryStats.totalProducts}</td><td className="p-3 text-center text-blue-600">{summaryStats.totalStock.toLocaleString()}</td><td className="p-3 text-right text-green-600">₹{summaryStats.totalValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right text-cyan-600">₹{summaryStats.totalRetailValue.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</td><td className="p-3 text-right text-[10px] text-gray-400">100%</td></tr></tfoot></table></div></div>
          )}

          {/* ─── Stock Analysis Tab ─── */}
          {activeTab === 'byStockStatus' && (
            <div className="space-y-4">
              {byStockStatus.map((status) => {
                const Icon = status.config.icon
                const colorMap = { red: { bg: 'bg-red-50 dark:bg-red-900/10', border: 'border-red-200 dark:border-red-800', text: 'text-red-600 dark:text-red-400', fill: 'bg-red-500' }, amber: { bg: 'bg-amber-50 dark:bg-amber-900/10', border: 'border-amber-200 dark:border-amber-800', text: 'text-amber-600 dark:text-amber-400', fill: 'bg-amber-500' }, green: { bg: 'bg-green-50 dark:bg-green-900/10', border: 'border-green-200 dark:border-green-800', text: 'text-green-600 dark:text-green-400', fill: 'bg-green-500' }, orange: { bg: 'bg-orange-50 dark:bg-orange-900/10', border: 'border-orange-200 dark:border-orange-800', text: 'text-orange-600 dark:text-orange-400', fill: 'bg-orange-500' }, purple: { bg: 'bg-purple-50 dark:bg-purple-900/10', border: 'border-purple-200 dark:border-purple-800', text: 'text-purple-600 dark:text-purple-400', fill: 'bg-purple-500' } }
                const colors = colorMap[status.config.color] || colorMap.green
                const pct = summaryStats.totalProducts > 0 ? (status.count / summaryStats.totalProducts * 100) : 0
                return (
                  <div key={status.name} className={clsx("card p-4 border shadow-sm", colors.bg, colors.border)}>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3"><div className={clsx("p-2 rounded-lg", colors.bg)}><Icon className={clsx("w-5 h-5", colors.text)} /></div><div><h4 className={clsx("font-bold text-base", colors.text)}>{status.name}</h4><p className="text-xs text-gray-500 dark:text-gray-400">{status.count} products</p></div></div>
                      <div className="text-right"><p className="text-sm font-semibold text-gray-700 dark:text-gray-200">₹{status.value.toLocaleString('en-IN', { maximumFractionDigits: 0 })}</p><p className="text-[10px] text-gray-400">Stock Value</p></div>
                    </div>
                    <div className="w-full h-2 bg-gray-100 dark:bg-gray-800 rounded-full overflow-hidden"><div className={clsx("h-full rounded-full transition-all", colors.fill)} style={{ width: `${pct}%` }} /></div>
                    <div className="flex justify-between mt-1"><span className="text-[10px] text-gray-400">{pct.toFixed(1)}% of products</span><span className="text-[10px] text-gray-400">{status.stock.toLocaleString()} bottles in stock</span></div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}