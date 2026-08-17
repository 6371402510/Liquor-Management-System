import { useState, useEffect, useMemo,useRef } from 'react'
import { Plus, Search, CreditCard as Edit2, Trash2, X, Loader as Loader2, TriangleAlert as AlertTriangle, Package, ChevronUp, ShieldAlert, ChevronDown, Upload, Download, FileDown, AlertCircle, TrendingDown, Clock3, TrendingUp, Warehouse, Store, Printer, Minus } from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { useAuth } from '../context/AuthContext'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

// Import API functions
import { getProducts, createProduct, updateProduct, deleteProduct } from '../apiservices/inventoryapi'

// ─── Dropdown Constants ───
const CATEGORIES = ['WHISKY', 'RUM', 'VODKA', 'GIN', 'BEER', 'WINE', 'BRANDY','SCOTCH WHISKY', 'OTHER']

const SUB_CATEGORIES_BY_CATEGORY = {
  'WHISKY': ['PREMIUM', 'SUPER PREMIUM', 'ULTRA PREMIUM', 'REGULAR', 'ECONOMY', 'DELUXE'],
  'SCOTCH WHISKY':['SUPREME','SUPERIOR','RESERVE','CLASSIC','ULTRA PREMIUM','EXTRA PLANTINUM','ULTRA GOLD','ULTRA PREMIUM','ORIGINAL'],
  'RUM': ['PREMIUM', 'SUPER PREMIUM', 'REGULAR', 'ECONOMY', 'DELUXE', 'DARK', 'WHITE', 'SPICED', 'GOLD'],
  'VODKA': ['PREMIUM', 'SUPER PREMIUM', 'REGULAR', 'ECONOMY', 'FLAVOURED', 'NEUTRAL'],
  'GIN': ['PREMIUM', 'LONDON DRY', 'PLYMOUTH', 'OLD TOM', 'FLAVOURED', 'NAVY STRENGTH'],
  'BEER': ['PREMIUM', 'STRONG', 'MAGNUM', 'LIGHT', 'SMOOTH', 'ELEPHANT', 'BLONDE', 'WHITE', 'WIT', 'EXTRA STRONG', '5000', '10000', 'ORIGINAL', 'SILVER', 'CRAFT'],
  'WINE': ['RED', 'WHITE', 'ROSE', 'SPARKLING', 'DESSERT', 'FORTIFIED', 'DRY', 'SWEET', 'SEMI SWEET'],
  'BRANDY': ['PREMIUM', 'SUPER PREMIUM', 'REGULAR', 'ECONOMY', 'VS', 'VSOP', 'XO'],
  'OTHER': ['PREMIUM', 'REGULAR', 'ECONOMY', 'DELUXE'],
}

const DEFAULT_SUB_CATEGORIES = ['PREMIUM', 'SUPER PREMIUM', 'ULTRA PREMIUM', 'REGULAR', 'ECONOMY', 'DELUXE']

const PRODUCT_TYPES = ['IMFL', 'BEER', 'WINE','FMFL']

const BOTTLE_SIZES_BY_TYPE = {
  'IMFL': ['90ml', '180ml','200ml', '250ml', '330ml', '375ml', '500ml', '750ml', '1000ml'],
  'BEER': ['275ml', '330ml', '500ml', '650ml'],
  'WINE': ['180ml', '375ml', '500ml', '750ml', '1000ml', '2000ml'],
  'FMFL':['50ml','60ml','90ml', '180ml', '200ml', '250ml', '330ml', '375ml', '500ml', '700ml','750ml', '1000ml'],
  
}
const DEFAULT_SIZES = BOTTLE_SIZES_BY_TYPE['IMFL']

const SIZE_TRADITIONAL_MAP = {
  '50ml':   { traditionalName: 'Mini / Chota Peg',       bottlesPerCase: 150 },
  '60ml':   { traditionalName: 'Chhota Peg / 60ml Peg',  bottlesPerCase: 150 },
  '90ml':   { traditionalName: 'Peg / Miniature', bottlesPerCase: 96 },
  '180ml':  { traditionalName: 'Nip / Quarter',   bottlesPerCase: 48 },
  '200ml':  { traditionalName: 'Nip + / Quarter+',bottlesPerCase: 24 },
  '250ml':  { traditionalName: 'Quarter Plus',    bottlesPerCase: 36 },
  '275ml':  { traditionalName: 'Small Bottle',    bottlesPerCase: 24 },
  '300ml':  { traditionalName: 'Half Plus',       bottlesPerCase: 30 },
  '330ml':  { traditionalName: 'Small / Pony',    bottlesPerCase: 30 },
  '375ml':  { traditionalName: 'Pint / Half',     bottlesPerCase: 24 },
  '500ml':  { traditionalName: 'Medium',          bottlesPerCase: 24 },
  '650ml':  { traditionalName: 'Large Beer',      bottlesPerCase: 12 },
  '700ml':  { traditionalName: 'Three Quarter / 700ml',   bottlesPerCase: 12 },
  '750ml':  { traditionalName: 'Quart / Bottle',  bottlesPerCase: 12 },
  '1000ml': { traditionalName: 'Liter',           bottlesPerCase: 9 },
  '2000ml': { traditionalName: 'Double Liter',    bottlesPerCase: 6 },
}

const UNITS = ['BOTTLE', 'CASE', 'BOX', 'PACK', 'CARTON', 'PINT', 'QUARTER', 'CAN']
const PACKING_TYPES = ['BOTTLE', 'CAN', 'TETRA PACK']
const BARCODE_TYPES = ['EAN13', 'CODE128', 'UPC', 'QR']
const ITEM_STATUSES = ['ACTIVE', 'INACTIVE']

const emptyForm = {
  item_code: '', barcode: '', name: '', short_name: '', brand: '', category: 'WHISKY',
  sub_category: 'PREMIUM', product_type: 'IMFL', bottle_size: '750ml',
  traditional_name: 'Quart / Bottle',
  bottles_per_case: '12',
  unit: 'BOTTLE',
  packing_type: 'BOTTLE', purchase_rate: '', landing_cost: '', mrp: '', sale_price: '',
  discount_allowed: false, discount_percent: '', VAT_rate: '35',
  margin_percent: '', hsn_code: '', opening_stock: '', current_stock: '',
  godown_stock: '', counter_stock: '',
  reorder_level: '5', maximum_stock: '', damage_stock: '0', reserved_stock: '0',
  stock_location: '', batch_number: '', expiry_date: '', manufacture_date: '',
  fast_billing_key: '', favourite_item: false, allow_return: true, allow_exchange: true,
  print_name: '', barcode_type: 'EAN13', barcode_print_qty: '1',
  auto_barcode_generate: false, store_id: '', branch_name: '', transfer_allowed: false,
  status: 'ACTIVE',
}

// ─── CENTRALIZED EXCEL COLUMN CONFIG ───
// Change columns here once, and it automatically updates Template, Export, and Import mapping!
const EXCEL_COLUMNS = [
  { header: 'Item Code', key: 'item_code', sample: 'ITM001' },
  { header: 'Barcode', key: 'barcode', sample: '8901234567890' },
  { header: 'Product Name', key: 'name', sample: 'Royal Stag 750ml' },
  { header: 'Company/Supplier', key: 'short_name', sample: 'RS750' },
  { header: 'Brand', key: 'brand', sample: 'Royal Stag' },
  { header: 'Category', key: 'category', sample: 'WHISKY' },
  { header: 'Sub Category', key: 'sub_category', sample: 'REGULAR' },
  { header: 'Product Type', key: 'product_type', sample: 'IMFL' },
  { header: 'Bottle Size', key: 'bottle_size', sample: '750ml' },
  { header: 'Traditional Name', key: 'traditional_name', sample: 'Quart / Bottle' },
  { header: 'Bottles Per Case', key: 'bottles_per_case', sample: '12' },
  { header: 'Godown Stock', key: 'godown_stock', sample: '70' },
  { header: 'Counter Stock', key: 'counter_stock', sample: '30' },
  { header: 'Total Stock', key: 'current_stock', sample: '100' },
  { header: 'Purchase Rate', key: 'purchase_rate', sample: '650' },
  { header: 'Landing Cost', key: 'landing_cost', sample: '680' },
  { header: 'MRP', key: 'mrp', sample: '850' },
  { header: 'Sale Price', key: 'sale_price', sample: '800' },
  { header: 'Discount %', key: 'discount_percent', sample: '5' },
  { header: 'VAT %', key: 'VAT_rate', sample: '35' },
  { header: 'Margin %', key: 'margin_percent', sample: '23' },
  { header: 'HSN Code', key: 'hsn_code', sample: '2208' },
  { header: 'Reorder Level', key: 'reorder_level', sample: '5' },
  { header: 'Maximum Stock', key: 'maximum_stock', sample: '500' },
  { header: 'Stock Location', key: 'stock_location', sample: 'Rack-A1' },
  { header: 'Status', key: 'status', sample: 'ACTIVE' }
];

// Auto-generate the header map for imports
const EXCEL_HEADER_MAP = EXCEL_COLUMNS.reduce((acc, col) => {
  acc[col.header.toLowerCase()] = col.key;
  return acc;
}, {});
function getTraditionalData(bottleSize) {
  return SIZE_TRADITIONAL_MAP[bottleSize] || { traditionalName: '', bottlesPerCase: '' }
}

function getSubCategories(category) {
  return SUB_CATEGORIES_BY_CATEGORY[category] || DEFAULT_SUB_CATEGORIES
}

// ─── Stock Classification Helpers ───
function classifyProduct(p) {
  const stock = p.current_stock || 0
  const reorder = p.reorder_level || 0
  const maxStock = p.maximum_stock || 0

  if (stock <= 0) return 'out_of_stock'
  if (stock <= reorder) return 'low_stock'
  if (maxStock > 0 ? stock > maxStock : stock > reorder * 3) return 'dead_stock'
  if (stock > reorder * 2) return 'slow_moving'
  return 'fast_moving'
}

// ─── INLINE STOCK COMPONENT (Admin Only) ───
function StockInput({ productId, field, value, onSave }) {
  const [localVal, setLocalVal] = useState(String(value))

  useEffect(() => {
    setLocalVal(String(value))
  }, [value])

  const commitChange = () => {
    if (parseInt(localVal) !== value) {
      onSave(productId, field, localVal)
    }
  }

  const handleIncrement = (delta) => {
    const numVal = Math.max(0, (parseInt(localVal) || 0) + delta)
    setLocalVal(String(numVal))
    onSave(productId, field, numVal)
  }

  return (
    <div className="flex items-center gap-1">
      <button 
        type="button" 
        onClick={() => handleIncrement(-1)}
        className="p-1 rounded bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 transition-colors"
      >
        <Minus className="w-3 h-3" />
      </button>
      <input 
        type="number"
        value={localVal}
        onChange={(e) => setLocalVal(e.target.value)}
        onBlur={commitChange}
        onKeyDown={(e) => e.key === 'Enter' && commitChange()}
        className="w-14 text-center text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 py-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
      />
      <button 
        type="button" 
        onClick={() => handleIncrement(1)}
        className="p-1 rounded bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 transition-colors"
      >
        <Plus className="w-3 h-3" />
      </button>
    </div>
  )
}



// ─── COMPANY/SUPPLIER SMART DROPDOWN ───
function CompanySupplierDropdown({ value, onChange, products, onRemoveSupplier }) {
  const [isOpen, setIsOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [showManage, setShowManage] = useState(false)
  const ref = useRef(null)
  const inputRef = useRef(null)

  const uniqueSuppliers = useMemo(() => {
    const set = new Set()
    products.forEach(p => {
      if (p.short_name && p.short_name.trim()) {
        set.add(p.short_name.trim())
      }
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [products])

  const filtered = useMemo(() => {
    if (!search.trim()) return uniqueSuppliers
    return uniqueSuppliers.filter(s =>
      s.toLowerCase().includes(search.toLowerCase())
    )
  }, [uniqueSuppliers, search])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setIsOpen(false)
        setShowManage(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleSelect = (supplier) => {
    onChange(supplier)
    setSearch('')
    setIsOpen(false)
    inputRef.current?.blur()
  }

  const handleInputChange = (val) => {
    onChange(val)
    setSearch(val)
    if (!isOpen) setIsOpen(true)
  }

  const handleFocus = () => {
    setSearch(value || '')
    setIsOpen(true)
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      setIsOpen(false)
      setShowManage(false)
      inputRef.current?.blur()
    }
    if (e.key === 'Enter' && filtered.length === 1 && search.trim()) {
      e.preventDefault()
      handleSelect(filtered[0])
    }
    if (e.key === 'Tab') {
      setIsOpen(false)
    }
  }

  return (
    <div className="relative" ref={ref}>
      {/* ── Main Input ── */}
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={value || ''}
          placeholder="Type or select..."
          onChange={e => handleInputChange(e.target.value)}
          onFocus={handleFocus}
          onKeyDown={handleKeyDown}
          className="input-field pr-8"
        />
        {/* Manage button (gear icon) */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setShowManage(m => !m)
            setIsOpen(false)
          }}
          className={clsx(
            "absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded transition-colors",
            showManage
              ? "bg-primary-100 dark:bg-primary-900/40 text-primary-600 dark:text-primary-400"
              : "text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
          title="Manage supplier list"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* ── Suggestions Dropdown ── */}
      {isOpen && (
        <div className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {filtered.length > 0 ? (
            filtered.map(supplier => (
              <button
                key={supplier}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); handleSelect(supplier) }}
                className={clsx(
                  "w-full text-left px-3 py-2 text-sm transition-colors flex items-center justify-between group",
                  value === supplier
                    ? "bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-300 font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                )}
              >
                <span>{supplier}</span>
                {value === supplier && (
                  <span className="text-[10px] text-primary-500">✓ selected</span>
                )}
              </button>
            ))
          ) : search.trim() ? (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault()
                handleSelect(search.trim())
              }}
              className="w-full text-left px-3 py-2.5 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-2"
            >
              <Plus className="w-3.5 h-3.5" />
              Add "<span className="font-medium">{search.trim()}</span>"
            </button>
          ) : (
            <div className="px-3 py-3 text-xs text-gray-400 text-center">No suppliers added yet</div>
          )}
          {search.trim() && filtered.length > 0 && (
            <div className="border-t border-gray-100 dark:border-gray-700">
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault()
                  handleSelect(search.trim())
                }}
                className="w-full text-left px-3 py-2 text-sm text-primary-600 dark:text-primary-400 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors flex items-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add "<span className="font-medium">{search.trim()}</span>" as new
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Manage Panel (Remove suppliers) ── */}
      {showManage && (
        <div className="absolute z-40 right-0 top-full mt-1 w-72 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 dark:border-gray-700">
            <div>
              <h4 className="text-sm font-semibold text-gray-800 dark:text-gray-100">Manage Suppliers</h4>
              <p className="text-[10px] text-gray-400 mt-0.5">{uniqueSuppliers.length} supplier(s) in list</p>
            </div>
            <button
              type="button"
              onClick={() => setShowManage(false)}
              className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto p-2">
            {uniqueSuppliers.length > 0 ? (
              uniqueSuppliers.map(supplier => {
                const count = products.filter(p => p.short_name?.trim() === supplier).length
                return (
                  <div
                    key={supplier}
                    className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 group transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{supplier}</p>
                      <p className="text-[10px] text-gray-400">{count} product(s)</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        if (onRemoveSupplier) onRemoveSupplier(supplier, count)
                      }}
                      className="p-1.5 rounded-lg text-gray-300 dark:text-gray-600 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0 ml-2"
                      title="Remove this supplier from all products"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              })
            ) : (
              <div className="px-3 py-6 text-center text-xs text-gray-400">No suppliers to manage</div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


export default function Inventory() {
  const { user } = useAuth()
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN'

  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  const [stores] = useState([{ id: 'store1', name: 'Main Branch' }, { id: 'store2', name: 'Warehouse' }])

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [editingItemId, setEditingItemId] = useState(null)
  const [auditData, setAuditData] = useState({})

  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // const [sortField, setSortField] = useState('name')
  // const [sortDir, setSortDir] = useState('asc')

    const [sortField, setSortField] = useState('updated_at')
  const [sortDir, setSortDir] = useState('desc')

  const fileInputRef = useRef(null)

  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  // Listen for localStorage changes
  useEffect(() => {
    const syncCompanyId = () => {
      const newId = localStorage.getItem('selectedCompanyId')
      if (newId !== companyId) setCompanyId(newId)
    }
    window.addEventListener('storage', syncCompanyId)
    return () => window.removeEventListener('storage', syncCompanyId)
  }, [companyId])

  // Re-fetch products when companyId changes
  useEffect(() => {
    if (companyId) {
      fetchProducts()
    } else {
      setProducts([])
      setLoading(false)
    }
  }, [companyId])

  const getVolumeStandard = () => {
    const sizeInMl = parseInt(form.bottle_size) || 0
    const unit = form.unit.toUpperCase()
    switch (unit) {
      case 'CASE': {
        const bpc = Number(form.bottles_per_case) || 12
        const total = bpc * sizeInMl
        return total >= 1000 ? `${(total / 1000).toFixed(2)} Liters` : `${total} ml`
      }
      case 'BOX': return '12 Liters'
      case 'CARTON': { const t = 24 * sizeInMl; return t >= 1000 ? `${(t / 1000).toFixed(2)} Liters` : `${t} ml` }
      case 'PACK': { const t = 6 * sizeInMl; return t >= 1000 ? `${(t / 1000).toFixed(2)} Liters` : `${t} ml` }
      default: return sizeInMl >= 1000 ? `${(sizeInMl / 1000).toFixed(2)} Liters` : `${sizeInMl} ml`
    }
  }

  const fetchProducts = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getProducts(Number(companyId))
      setProducts(data)
    } catch (err) {
      setError(err.message || 'Failed to load products')
    } finally {
      setLoading(false)
    }
  }

  const generateItemCode = () => {
    const prefix = 'ITM'
    const timestamp = Date.now().toString().slice(-6)
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0')
    return `${prefix}${timestamp}${random}`
  }

  // ─── INLINE STOCK UPDATE HANDLER ───
  const handleInlineStockUpdate = async (productId, field, newValue) => {
    const numValue = parseInt(newValue) || 0
    const product = products.find(p => p.id === productId)
    if (!product || product[field] === numValue) return // No change

    const updatedData = {
      ...product,
      [field]: numValue,
      current_stock: field === 'godown_stock' 
        ? numValue + (product.counter_stock || 0) 
        : (product.godown_stock || 0) + numValue
    }

    // Optimistic UI Update
    setProducts(prev => prev.map(p => p.id === productId ? updatedData : p))

    try {
      await updateProduct(productId, updatedData)
    } catch (err) {
      alert('Failed to update stock')
      fetchProducts() // Revert on failure
    }
  }

  const handleBottleSizeChange = (newSize) => {
    const tradData = getTraditionalData(newSize)
    setForm(f => ({
      ...f,
      bottle_size: newSize,
      traditional_name: tradData.traditionalName || f.traditional_name,
      bottles_per_case: tradData.bottlesPerCase !== '' ? String(tradData.bottlesPerCase) : f.bottles_per_case,
    }))
  }

  const handleProductTypeChange = (newType) => {
    const allowedSizes = BOTTLE_SIZES_BY_TYPE[newType] || DEFAULT_SIZES
    setForm(f => {
      const newSize = allowedSizes.includes(f.bottle_size) ? f.bottle_size : allowedSizes[0]
      const tradData = getTraditionalData(newSize)
      return {
        ...f,
        product_type: newType,
        bottle_size: newSize,
        traditional_name: tradData.traditionalName || f.traditional_name,
        bottles_per_case: tradData.bottlesPerCase !== '' ? String(tradData.bottlesPerCase) : f.bottles_per_case,
      }
    })
  }

  const handleCategoryChange = (newCategory) => {
    const newSubCategories = getSubCategories(newCategory)
    setForm(f => {
      const isValidSubCategory = newSubCategories.includes(f.sub_category)
      return {
        ...f,
        category: newCategory,
        sub_category: isValidSubCategory ? f.sub_category : newSubCategories[0],
      }
    })
  }

  const handleGodownStockChange = (val) => {
    const godown = Number(val) || 0
    const counter = Number(form.counter_stock) || 0
    setForm(f => ({
      ...f,
      godown_stock: val,
      current_stock: String(godown + counter),
    }))
  }

  const handleCounterStockChange = (val) => {
    const counter = Number(val) || 0
    const godown = Number(form.godown_stock) || 0
    setForm(f => ({
      ...f,
      counter_stock: val,
      current_stock: String(godown + counter),
    }))
  }

  const openAdd = () => {
    const defaultTradData = getTraditionalData(emptyForm.bottle_size)
    setForm({
      ...emptyForm,
      item_code: generateItemCode(),
      traditional_name: defaultTradData.traditionalName,
      bottles_per_case: String(defaultTradData.bottlesPerCase),
    })
    setEditingId(null)
    setEditingItemId(null)
    setAuditData({})
    setError('')
    setShowModal(true)
  }

  const openEdit = (product) => {
    setForm({
      item_code: product.item_code || '', barcode: product.barcode || '', name: product.name || '',
      short_name: product.short_name || '', brand: product.brand || '', category: product.category || 'WHISKY',
      sub_category: product.sub_category || 'PREMIUM', product_type: product.product_type || 'IMFL',
      bottle_size: product.bottle_size || '750ml',
      traditional_name: product.traditional_name || getTraditionalData(product.bottle_size || '750ml').traditionalName,
      bottles_per_case: product.bottles_per_case || getTraditionalData(product.bottle_size || '750ml').bottlesPerCase,
      unit: product.unit || 'BOTTLE', packing_type: product.packing_type || 'BOTTLE',
      purchase_rate: product.purchase_rate || '', landing_cost: product.landing_cost || '', mrp: product.mrp || '',
      sale_price: product.sale_price || '', discount_allowed: product.discount_allowed || false,
      discount_percent: product.discount_percent || '', VAT_rate: product.vat_rate || product.VAT_rate || '35',
      margin_percent: product.margin_percent || '', hsn_code: product.hsn_code || '',
      opening_stock: product.opening_stock || '', current_stock: product.current_stock || '',
      godown_stock: product.godown_stock || '', counter_stock: product.counter_stock || '',
      reorder_level: product.reorder_level || '5', maximum_stock: product.maximum_stock || '',
      damage_stock: product.damage_stock || '0', reserved_stock: product.reserved_stock || '0',
      stock_location: product.stock_location || '', batch_number: product.batch_number || '',
      expiry_date: product.expiry_date || '', manufacture_date: product.manufacture_date || '',
      fast_billing_key: product.fast_billing_key || '', favourite_item: product.favourite_item || false,
      allow_return: product.allow_return !== false, allow_exchange: product.allow_exchange !== false,
      print_name: product.print_name || '', barcode_type: product.barcode_type || 'EAN13',
      barcode_print_qty: product.barcode_print_qty || '1', auto_barcode_generate: product.auto_barcode_generate || false,
      store_id: product.store_id || '', branch_name: product.branch_name || '', transfer_allowed: product.transfer_allowed || false,
      status: product.status || 'ACTIVE',
    })
    setEditingId(product.id)
    setEditingItemId(product.item_id || null)
    setAuditData({
      created_by: product.created_by, created_at: product.created_at,
      modified_by: product.modified_by, modified_at: product.updated_at,
    })
    setError('')
    setShowModal(true)
  }

   const downloadTemplate = async () => {
    const headers = EXCEL_COLUMNS.map(c => c.header)
    const sampleRow = EXCEL_COLUMNS.map(c => c.sample || '')

    const ws = XLSX.utils.aoa_to_sheet([headers, sampleRow])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Product Template')

    const fileName = 'Product_Import_Template.xlsx'
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    // Check if Tauri is available
    const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

    if (isTauri) {
      try {
        const filePath = await save({
          defaultPath: fileName,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        })
        if (filePath) {
          await writeFile(filePath, new Uint8Array(wbout))
        }
      } catch (err) {
        console.error('Tauri export error:', err)
        alert('Export failed: ' + (err?.message || err))
      }
    } else {
      // Standard Browser Fallback
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    }
  }
     const handleExportExcel = async () => {
    if (sorted.length === 0) {
      alert('No data to export')
      return
    }

    const exportData = sorted.map(p => {
      const row = {}
      EXCEL_COLUMNS.forEach(col => {
        if (typeof p[col.key] === 'boolean') {
          row[col.header] = p[col.key] ? 'TRUE' : 'FALSE'
        } else {
          row[col.header] = p[col.key] !== undefined && p[col.key] !== null ? p[col.key] : ''
        }
      })
      return row
    })

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Inventory Data')

    const fileName = `Inventory_Export_${new Date().toISOString().slice(0, 10)}.xlsx`
    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

    // Check if Tauri is available
    const isTauri = typeof window !== 'undefined' && window.__TAURI_INTERNALS__;

    if (isTauri) {
      try {
        const filePath = await save({
          defaultPath: fileName,
          filters: [{ name: 'Excel', extensions: ['xlsx'] }]
        })
        if (filePath) {
          await writeFile(filePath, new Uint8Array(wbout))
        }
      } catch (err) {
        console.error('Tauri export error:', err)
        alert('Export failed: ' + (err?.message || err))
      }
    } else {
      // Standard Browser Fallback
      const blob = new Blob([wbout], { type: 'application/octet-stream' })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = fileName
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(link.href)
    }
  }



   const handleExcelUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    
    if (!companyId) {
      alert('Please select a company first before importing.')
      return
    }

    const reader = new FileReader()
    reader.onload = async (evt) => {
      const bstr = evt.target.result
      const wb = XLSX.read(bstr, { type: 'binary', cellDates: true })
      const wsname = wb.SheetNames[0]
      const ws = wb.Sheets[wsname]
      const data = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false, dateNF: 'yyyy-mm-dd' })
      
      if (data.length === 0) {
        alert('No data found in the Excel file.')
        return
      }

      setLoading(true)
      let successCount = 0
      let failCount = 0
      const errors = []

      // Loop through all rows
      for (let i = 0; i < data.length; i++) {
        const payload = mapRowToProduct(data[i])
        
        try {
          await createProduct(payload)
          successCount++
        } catch (err) {
          failCount++
          // Capture the error and row number for the summary
          errors.push(`Row ${i + 2}: ${err.message || 'Unknown error'}`)
        }
      }

      setLoading(false)
      fetchProducts() // Refresh the table with new products
      
      // Show Import Summary
      let summaryMessage = `Import Complete!\n\n✅ Success: ${successCount}\n❌ Failed: ${failCount}`
      if (errors.length > 0 && errors.length <= 5) {
        summaryMessage += `\n\nErrors:\n${errors.join('\n')}`
      } else if (errors.length > 5) {
        summaryMessage += `\n\nFirst 5 errors:\n${errors.slice(0, 5).join('\n')}\n...and ${errors.length - 5} more.`
      }
      
      alert(summaryMessage)
    }
    
    reader.readAsBinaryString(file)
    e.target.value = '' // Reset file input
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      company_id: Number(companyId),
      purchase_rate: Number(form.purchase_rate) || 0, landing_cost: Number(form.landing_cost) || 0,
      mrp: Number(form.mrp) || 0, sale_price: Number(form.sale_price) || 0,
      discount_percent: Number(form.discount_percent) || 0, VAT_rate: Number(form.VAT_rate) || 0,
      margin_percent: Number(form.margin_percent) || 0, opening_stock: Number(form.opening_stock) || 0,
      current_stock: Number(form.current_stock) || 0,
      godown_stock: Number(form.godown_stock) || 0,
      counter_stock: Number(form.counter_stock) || 0,
      reorder_level: Number(form.reorder_level) || 0,
      maximum_stock: Number(form.maximum_stock) || 0, damage_stock: Number(form.damage_stock) || 0,
      reserved_stock: Number(form.reserved_stock) || 0, barcode_print_qty: Number(form.barcode_print_qty) || 1,
      bottles_per_case: Number(form.bottles_per_case) || 0,
      store_id: form.store_id || null,
    }

    try {
      if (editingId) {
        await updateProduct(editingId, payload)
      } else {
        await createProduct(payload)
      }
      setShowModal(false)
      fetchProducts()
    } catch (err) {
      setError(err.message || 'Failed to save product. Check if Item Code/Barcode already exists.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this product?')) return
    try {
      await deleteProduct(id)
      fetchProducts()
    } catch (err) {
      alert(err.message || 'Failed to delete product.')
    }
  }




    const handleRemoveSupplier = async (supplierName, productCount) => {
    if (!confirm(
      `Remove "${supplierName}"?\n\nThis will clear the Company/Supplier field for ${productCount} product(s).`
    )) return

    const affectedProducts = products.filter(p => p.short_name?.trim() === supplierName)
    let failCount = 0

    for (const p of affectedProducts) {
      try {
        await updateProduct(p.id, { ...p, short_name: '' })
      } catch (err) {
        failCount++
      }
    }

    fetchProducts() // Refresh

    if (failCount > 0) {
      alert(`Removed from most products, but ${failCount} update(s) failed.`)
    }
  }

  const handleSort = (field) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDir('asc') }
  }

  const stockCounts = products.reduce((acc, p) => {
    const cls = classifyProduct(p)
    acc[cls] = (acc[cls] || 0) + 1
    return acc
  }, {})

  const lowStockCount = stockCounts['low_stock'] || 0
  const deadStockCount = stockCounts['dead_stock'] || 0
  const slowMovingCount = stockCounts['slow_moving'] || 0
  const fastMovingCount = stockCounts['fast_moving'] || 0
  const totalDamageStock = products.reduce((acc, p) => acc + (p.damage_stock || 0), 0)

   const sorted = [...products]
    .filter(p => {
      const q = search.toLowerCase()
      const matchSearch = !q || p.name.toLowerCase().includes(q) || p.brand.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.item_code || '').toLowerCase().includes(q)
      const matchCat = categoryFilter === 'ALL' || p.category === categoryFilter
      return matchSearch && matchCat
    })
    .sort((a, b) => {
      let av = a[sortField], bv = b[sortField]
      
      // Handle date fields properly
      if (sortField === 'updated_at' || sortField === 'created_at') {
        av = av ? new Date(av).getTime() : 0
        bv = bv ? new Date(bv).getTime() : 0
      } else {
        if (typeof av === 'string') av = av.toLowerCase()
        if (typeof bv === 'string') bv = bv.toLowerCase()
      }

      if (av < bv) return sortDir === 'asc' ? -1 : 1
      if (av > bv) return sortDir === 'asc' ? 1 : -1
      return 0
    })

  const SortIcon = ({ field }) => (
    sortField === field
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
      : <ChevronUp className="w-3 h-3 opacity-30" />
  )

  const ToggleSwitch = ({ label, fieldKey }) => (
    <div className="flex items-center justify-between h-[38px]">
      <span className="text-xs font-medium text-gray-600 dark:text-gray-400 mr-3">{label}</span>
      <div className="flex items-center">
        <button type="button" onClick={() => setForm(f => ({ ...f, [fieldKey]: !f[fieldKey] }))} className={clsx('relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none', form[fieldKey] ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600')}>
          <span className={clsx('pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out', form[fieldKey] ? 'translate-x-4' : 'translate-x-0')} />
        </button>
        <span className="ml-2 text-xs text-gray-500 w-6">{form[fieldKey] ? 'Yes' : 'No'}</span>
      </div>
    </div>
  )

  const currentSizes = BOTTLE_SIZES_BY_TYPE[form.product_type] || DEFAULT_SIZES
  const currentSubCategories = getSubCategories(form.category)

  // ─── GUARD: NO COMPANY SELECTED ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <div className="w-16 h-16 rounded-full bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
          <AlertTriangle className="w-8 h-8 text-amber-500" />
        </div>
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center max-w-md">
          Please select a company from the Companies page to view and manage its inventory.
        </p>
      </div>
    )
  }

  // ─── PRINT HANDLER ───
   // ─── PRINT HANDLER ───
  const handlePrint = () => {
    const currentCompanyName = localStorage.getItem('selectedCompanyName') || 'Store'

    let tableRows = sorted.map(p => `
      <tr>
        <td style="padding: 8px; border: 1px solid #ddd;">${p.name || ''} ${p.brand ? '(' + p.brand + ')' : ''}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${p.category || ''}</td>
        <td style="padding: 8px; border: 1px solid #ddd;">${p.bottle_size || ''}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${p.godown_stock || 0}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center;">${p.counter_stock || 0}</td>
        <td style="padding: 8px; border: 1px solid #ddd; text-align: center; font-weight: bold;">${p.current_stock || 0}</td>
      </tr>
    `).join('')

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();

    doc.write(`
      <html>
        <head>
          <title>Print Inventory - ${currentCompanyName}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 20px; }
            h2 { text-align: center; margin-bottom: 5px; }
            p { text-align: center; color: #666; margin-top: 0; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; }
            th { background-color: #f2f2f2; font-weight: bold; text-align: left; padding: 8px; border: 1px solid #ddd; }
          </style>
        </head>
        <body>
          <h2>${currentCompanyName}</h2>
          <p>Inventory Report - ${new Date().toLocaleDateString()}</p>
          <table>
            <thead>
              <tr>
                <th>Product</th>
                <th>Category</th>
                <th>Size</th>
                <th style="text-align: center;">Godown</th>
                <th style="text-align: center;">Counter</th>
                <th style="text-align: center;">Total Stock</th>
              </tr>
            </thead>
            <tbody>
              ${tableRows}
            </tbody>
          </table>
        </body>
      </html>
    `);

    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      document.body.removeChild(iframe);
    }, 500);
  }


    // ─── HELPER: Map Excel Row to Product Payload ───
  const mapRowToProduct = (row) => {
    const mappedForm = { ...emptyForm }
    Object.keys(row).forEach((excelHeader) => {
      const normalizedHeader = excelHeader.toLowerCase().trim()
      const formKey = EXCEL_HEADER_MAP[normalizedHeader]
      if (formKey) {
        let value = row[excelHeader]
        if (['discount_allowed', 'favourite_item', 'allow_return', 'allow_exchange', 'auto_barcode_generate', 'transfer_allowed'].includes(formKey)) {
          value = value === true || value === 1 || String(value).toUpperCase() === 'TRUE' || String(value).toUpperCase() === 'YES'
        } else { value = String(value) }
        mappedForm[formKey] = value
      }
    })

    if (!mappedForm.item_code) mappedForm.item_code = generateItemCode()
    if (!mappedForm.traditional_name || mappedForm.traditional_name === '') {
      const tradData = getTraditionalData(mappedForm.bottle_size)
      mappedForm.traditional_name = tradData.traditionalName
    }
    if (!mappedForm.bottles_per_case || mappedForm.bottles_per_case === '' || mappedForm.bottles_per_case === '0') {
      const tradData = getTraditionalData(mappedForm.bottle_size)
      if (tradData.bottlesPerCase !== '') mappedForm.bottles_per_case = String(tradData.bottlesPerCase)
    }
    const validSubCategories = getSubCategories(mappedForm.category)
    if (!validSubCategories.includes(mappedForm.sub_category)) {
      mappedForm.sub_category = validSubCategories[0]
    }
    const gs = Number(mappedForm.godown_stock) || 0
    const cs = Number(mappedForm.counter_stock) || 0
    if (gs > 0 || cs > 0) {
      mappedForm.current_stock = String(gs + cs)
    }

    return {
      ...mappedForm,
      company_id: Number(companyId),
      purchase_rate: Number(mappedForm.purchase_rate) || 0, landing_cost: Number(mappedForm.landing_cost) || 0,
      mrp: Number(mappedForm.mrp) || 0, sale_price: Number(mappedForm.sale_price) || 0,
      discount_percent: Number(mappedForm.discount_percent) || 0, VAT_rate: Number(mappedForm.VAT_rate) || 0,
      margin_percent: Number(mappedForm.margin_percent) || 0, opening_stock: Number(mappedForm.opening_stock) || 0,
      current_stock: Number(mappedForm.current_stock) || 0,
      godown_stock: Number(mappedForm.godown_stock) || 0,
      counter_stock: Number(mappedForm.counter_stock) || 0,
      reorder_level: Number(mappedForm.reorder_level) || 0,
      maximum_stock: Number(mappedForm.maximum_stock) || 0, damage_stock: Number(mappedForm.damage_stock) || 0,
      reserved_stock: Number(mappedForm.reserved_stock) || 0, barcode_print_qty: Number(mappedForm.barcode_print_qty) || 1,
      bottles_per_case: Number(mappedForm.bottles_per_case) || 0,
      store_id: mappedForm.store_id || null,
    }
  }

  return (
    <div className="space-y-4">
      <input type="file" ref={fileInputRef} accept=".xlsx,.xls,.csv" onChange={handleExcelUpload} className="hidden" />

      {/* ─── Toolbar ─── */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1 items-center">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Search name, brand, code, barcode..." value={search} onChange={e => setSearch(e.target.value)} className="input-field pl-8 w-64" />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input-field w-36">
            <option value="ALL">All Categories</option>
            {CATEGORIES.map(c => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={downloadTemplate} className="btn-secondary bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600">
            <Download className="w-4 h-4" /> Template
          </button>
          <button type="button" onClick={() => fileInputRef.current.click()} className="btn-secondary">
            <Upload className="w-4 h-4" /> Import
          </button>
          <button type="button" onClick={handleExportExcel} className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50">
            <FileDown className="w-4 h-4" /> Export
          </button>

          <button type="button" onClick={handlePrint} className="btn-secondary bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50">
            <Printer className="w-4 h-4" /> Print
          </button>
          <button onClick={openAdd} className="btn-primary">
            <Plus className="w-4 h-4" /> Add Product
          </button>
        </div>
      </div>

      {/* ─── Summary Cards ─── */}
      <div className="flex flex-wrap gap-3">
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <Package className="w-4 h-4 text-primary-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{products.length} Products</span>
        </div>
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{lowStockCount} Low Stock</span>
        </div>
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <ShieldAlert className="w-4 h-4 text-red-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{totalDamageStock} Damage Stock</span>
        </div>
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <TrendingDown className="w-4 h-4 text-red-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{deadStockCount} Dead Stock</span>
        </div>
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <Clock3 className="w-4 h-4 text-orange-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{slowMovingCount} Slow Moving</span>
        </div>
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{fastMovingCount} Fast Moving</span>
        </div>
      </div>

      {/* ─── Product Table ─── */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {[{ label: 'Item Code', field: 'item_code' },
                  { label: 'Product', field: 'name' },
                  
                  { label: 'Godown', field: 'godown_stock' },
                  { label: 'Counter', field: 'counter_stock' },
                  { label: 'Total Stock', field: 'current_stock' },
                  { label: 'Category', field: 'category' },
                  { label: 'Sub Cat.', field: 'sub_category' },
                  { label: 'Type', field: 'product_type' },
                  { label: 'Size', field: 'bottle_size' },
                  { label: 'Trad. Name', field: 'traditional_name' },
                  { label: 'Btls/Case', field: 'bottles_per_case' },
                  { label: 'Sale ₹', field: 'sale_price' },
                  { label: 'Status', field: 'status' },
                  { label: 'Actions', field: 'actions' },
               ].map(({ label, field }) => (
  field === 'actions' ? (
    <th key={field} className="table-header text-left whitespace-nowrap px-4">
      {label}
    </th>
  ) : (
    <th key={field} onClick={() => handleSort(field)} className="table-header text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none whitespace-nowrap ${field === 'name' ? 'w-72 min-w-[280px]' : ''}">
      <span className="flex items-center gap-1">{label} <SortIcon field={field} /></span>
    </th>
  )
))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={14} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={14} className="text-center py-10 text-sm text-gray-400">No products found</td></tr>
              ) : sorted.map(p => {
                const stock = p.current_stock ?? 0
                const reorder = p.reorder_level ?? 0
                const godown = p.godown_stock ?? 0
                const counter = p.counter_stock ?? 0
                return (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">

                    <td className="table-cell font-mono text-xs text-gray-500">{p.item_code || '—'}</td>
                   <td className="table-cell w-72 min-w-[280px]">
  <p className="font-medium text-gray-800 dark:text-gray-200">
    {p.name}
  </p>
  <p className="text-xs text-gray-400">
    {p.brand}{p.short_name ? ` · ${p.short_name}` : ''}
  </p>
</td>
                    
                      
                    {/* ─── GODOWN STOCK COLUMN ─── */}
                    <td className="table-cell">
                      {isAdmin ? (
                        <StockInput productId={p.id} field="godown_stock" value={godown} onSave={handleInlineStockUpdate} />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Warehouse className="w-3 h-3 text-blue-400 flex-shrink-0" />
                          <span className={clsx('font-semibold text-sm', godown > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-gray-400')}>{godown}</span>
                        </div>
                      )}
                    </td>
                    <td className="table-cell">
                      {isAdmin ? (
                        <StockInput productId={p.id} field="counter_stock" value={counter} onSave={handleInlineStockUpdate} />
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <Store className="w-3 h-3 text-purple-400 flex-shrink-0" />
                          <span className={clsx('font-semibold text-sm', counter > 0 ? 'text-purple-600 dark:text-purple-400' : 'text-gray-400')}>{counter}</span>
                        </div>
                      )}
                    </td>
                    <td className="table-cell">
                      <span className={clsx('font-semibold', stock <= reorder ? 'text-red-500' : stock <= reorder * 2 ? 'text-amber-500' : 'text-emerald-500')}>{stock}</span>
                      {stock <= reorder && stock > 0 && <AlertTriangle className="w-3 h-3 text-amber-500 inline ml-1" />}
                      {stock <= 0 && <span className="ml-1 text-[10px] text-red-400 font-medium">OUT</span>}
                    </td>
                    <td className="table-cell"><span className="badge-info">{p.category}</span></td>
                    <td className="table-cell"><span className="text-xs text-gray-500 bg-gray-100 dark:bg-gray-800 px-1.5 py-0.5 rounded">{p.sub_category || '—'}</span></td>
                    <td className="table-cell text-xs text-gray-500">{p.product_type || '—'}</td>
                    <td className="table-cell text-xs text-gray-500">{p.bottle_size || '—'}</td>
                    <td className="table-cell text-xs text-gray-500">{p.traditional_name || '—'}</td>
                    <td className="table-cell text-xs text-gray-500 font-mono">{p.bottles_per_case || '—'}</td>
                    <td className="table-cell font-medium">₹{p.sale_price || 0}</td>
                  

                    {/* ─── COUNTER STOCK COLUMN ─── */}
                    

                    
                    <td className="table-cell">
                      <span className={clsx('text-xs font-medium px-2 py-0.5 rounded-full', p.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400')}>{p.status || 'ACTIVE'}</span>
                    </td>

      

{/* ─── ACTIONS COLUMN ─── */}
<td className="table-cell px-4">
  <div className="flex items-center gap-1">
    <button
      type="button"
      onClick={() => openEdit(p)}
      title="Edit Product"
      className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:text-blue-400 dark:hover:bg-blue-900/30 transition-colors"
    >
      <Edit2 className="w-4 h-4" />
    </button>
    <button
      type="button"
      onClick={() => handleDelete(p.id)}
      title="Delete Product"
      className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:text-red-400 dark:hover:bg-red-900/30 transition-colors"
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Add/Edit Modal ─── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {editingId ? 'Edit Product' : 'Add Product'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && (
              <div className="mx-6 mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleSave} className="p-6 space-y-8">

              {/* ── 1. Basic Item Information ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Basic Item Information</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Item ID</label>
                    <input value={editingItemId || 'Auto-assigned'} disabled className="input-field bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Item Code *</label>
                    <input required value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))} className="input-field font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Barcode</label>
                    <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} className="input-field font-mono" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Product Name *</label>
                    <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
                  </div>
                              <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Company/Supplier</label>
                    <CompanySupplierDropdown
                      value={form.short_name}
                      onChange={(val) => setForm(f => ({ ...f, short_name: val }))}
                      products={products}
                      onRemoveSupplier={handleRemoveSupplier}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Brand Name</label>
                    <input value={form.brand} onChange={e => setForm(f => ({ ...f, brand: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category *</label>
                    <select required value={form.category} onChange={e => handleCategoryChange(e.target.value)} className="input-field">
                      {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Sub Category
                      <span className="ml-1 text-[10px] text-blue-500 font-normal">(by category)</span>
                    </label>
                    <select value={form.sub_category} onChange={e => setForm(f => ({ ...f, sub_category: e.target.value }))} className="input-field">
                      {currentSubCategories.map(sc => <option key={sc}>{sc}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Product Type</label>
                    <select value={form.product_type} onChange={e => handleProductTypeChange(e.target.value)} className="input-field">
                      {PRODUCT_TYPES.map(pt => <option key={pt}>{pt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bottle Size</label>
                    <select value={form.bottle_size} onChange={e => handleBottleSizeChange(e.target.value)} className="input-field">
                      {currentSizes.map(bs => <option key={bs}>{bs}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Traditional Name
                      <span className="ml-1 text-[10px] text-blue-500 font-normal">(auto-filled)</span>
                    </label>
                    <input value={form.traditional_name} onChange={e => setForm(f => ({ ...f, traditional_name: e.target.value }))} className="input-field" placeholder="e.g. Quart / Bottle" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Bottles Per Standard Case
                      <span className="ml-1 text-[10px] text-blue-500 font-normal">(auto-filled)</span>
                    </label>
                    <input type="number" min="0" value={form.bottles_per_case} onChange={e => setForm(f => ({ ...f, bottles_per_case: e.target.value }))} className="input-field" placeholder="e.g. 12" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Unit</label>
                    <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="input-field">
                      {UNITS.map(u => <option key={u}>{u}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Packing Type</label>
                    <select value={form.packing_type} onChange={e => setForm(f => ({ ...f, packing_type: e.target.value }))} className="input-field">
                      {PACKING_TYPES.map(pt => <option key={pt}>{pt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Volume (Auto-Calc)</label>
                    <input type="text" value={getVolumeStandard()} readOnly className="input-field bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 font-semibold cursor-not-allowed border-blue-200 dark:border-blue-800" />
                  </div>
                  <div className="md:col-span-3">
                    <div className="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20 p-3">
                      <p className="text-xs font-semibold text-blue-700 dark:text-blue-300 mb-2">📋 Size → Traditional Name Reference</p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                        {Object.entries(SIZE_TRADITIONAL_MAP).map(([size, data]) => (
                          <button key={size} type="button" onClick={() => handleBottleSizeChange(size)} className={clsx('text-left px-2.5 py-1.5 rounded-md border text-xs transition-all', form.bottle_size === size ? 'border-primary-400 bg-primary-100 dark:bg-primary-900/40 text-primary-700 dark:text-primary-300 font-semibold ring-1 ring-primary-300' : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:border-primary-300 hover:bg-primary-50 dark:hover:bg-primary-900/20')}>
                            <span className="font-medium">{size}</span>
                            <span className="block text-[10px] opacity-75">{data.traditionalName} · {data.bottlesPerCase}/case</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* ── 2. Pricing & Tax ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Pricing & Tax</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Purchase Rate (₹)
                      <span className="ml-1 text-[10px] text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input type="number" min="0" step="0.01" value={form.purchase_rate} onChange={e => setForm(f => ({ ...f, purchase_rate: e.target.value }))} className="input-field" placeholder="Enter at purchase time" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Landing Cost (₹)</label>
                    <input type="number" min="0" step="0.01" value={form.landing_cost} onChange={e => setForm(f => ({ ...f, landing_cost: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">MRP (₹)</label>
                    <input type="number" min="0" step="0.01" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sale Price (₹) *</label>
                    <input required type="number" min="0" step="0.01" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} className="input-field" />
                  </div>
                  <ToggleSwitch label="Discount Allowed" fieldKey="discount_allowed" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Discount %</label>
                    <input type="number" min="0" step="0.01" value={form.discount_percent} onChange={e => setForm(f => ({ ...f, discount_percent: e.target.value }))} className="input-field" disabled={!form.discount_allowed} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">VAT %</label>
                    <select value={form.VAT_rate} onChange={e => setForm(f => ({ ...f, VAT_rate: e.target.value }))} className="input-field">
                      <option value="0">35%</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Margin %</label>
                    <input type="number" min="0" step="0.01" value={form.margin_percent} onChange={e => setForm(f => ({ ...f, margin_percent: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">HSN Code</label>
                    <input value={form.hsn_code} onChange={e => setForm(f => ({ ...f, hsn_code: e.target.value }))} className="input-field" />
                  </div>
                </div>
              </div>

              {/* ── 3. Stock & Inventory ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Stock & Inventory</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      <span className="inline-flex items-center gap-1"><Warehouse className="w-3 h-3 text-blue-500" /> Godown Stock</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.godown_stock}
                      onChange={e => handleGodownStockChange(e.target.value)}
                      className="input-field border-blue-200 dark:border-blue-800 focus:ring-blue-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      <span className="inline-flex items-center gap-1"><Store className="w-3 h-3 text-purple-500" /> Counter Stock</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.counter_stock}
                      onChange={e => handleCounterStockChange(e.target.value)}
                      className="input-field border-purple-200 dark:border-purple-800 focus:ring-purple-500"
                      placeholder="0"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Current Stock
                      <span className="ml-1 text-[10px] text-emerald-500 font-normal">(auto = godown + counter)</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={form.current_stock}
                      readOnly
                      className="input-field bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 font-semibold cursor-not-allowed border-emerald-200 dark:border-emerald-800"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Opening Stock
                      <span className="ml-1 text-[10px] text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input type="number" min="0" value={form.opening_stock} onChange={e => setForm(f => ({ ...f, opening_stock: e.target.value }))} className="input-field" placeholder="Updated via purchases" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                      Reorder Level
                      <span className="ml-1 text-[10px] text-gray-400 font-normal">(optional)</span>
                    </label>
                    <input type="number" min="0" value={form.reorder_level} onChange={e => setForm(f => ({ ...f, reorder_level: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Maximum Stock</label>
                    <input type="number" min="0" value={form.maximum_stock} onChange={e => setForm(f => ({ ...f, maximum_stock: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Damage Stock</label>
                    <input type="number" min="0" value={form.damage_stock} onChange={e => setForm(f => ({ ...f, damage_stock: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Reserved Stock</label>
                    <input type="number" min="0" value={form.reserved_stock} onChange={e => setForm(f => ({ ...f, reserved_stock: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Stock Location</label>
                    <input value={form.stock_location} onChange={e => setForm(f => ({ ...f, stock_location: e.target.value }))} className="input-field" placeholder="Rack/Shelf" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Batch Number</label>
                    <input value={form.batch_number} onChange={e => setForm(f => ({ ...f, batch_number: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expiry Date</label>
                    <input type="date" value={form.expiry_date} onChange={e => setForm(f => ({ ...f, expiry_date: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Manufacture Date</label>
                    <input type="date" value={form.manufacture_date} onChange={e => setForm(f => ({ ...f, manufacture_date: e.target.value }))} className="input-field" />
                  </div>
                </div>

                <div className="mt-4 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3">
                  <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">📦 Stock Breakdown</p>
                  <div className="flex flex-wrap gap-4">
                    <div className="flex items-center gap-2">
                      <Warehouse className="w-4 h-4 text-blue-500" />
                      <span className="text-xs text-gray-500">Godown:</span>
                      <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{Number(form.godown_stock) || 0}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Store className="w-4 h-4 text-purple-500" />
                      <span className="text-xs text-gray-500">Counter:</span>
                      <span className="text-sm font-bold text-purple-600 dark:text-purple-400">{Number(form.counter_stock) || 0}</span>
                    </div>
                    <div className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
                      <Package className="w-4 h-4 text-emerald-500" />
                      <span className="text-xs text-gray-500">Total:</span>
                      <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{Number(form.current_stock) || 0}</span>
                    </div>
                    {(Number(form.damage_stock) || 0) > 0 && (
                      <div className="flex items-center gap-2 border-l border-gray-300 dark:border-gray-600 pl-4">
                        <ShieldAlert className="w-4 h-4 text-red-500" />
                        <span className="text-xs text-gray-500">Damage:</span>
                        <span className="text-sm font-bold text-red-600 dark:text-red-400">{Number(form.damage_stock) || 0}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ── 4. POS Billing ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">POS Billing</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Fast Billing Key</label>
                    <input value={form.fast_billing_key} onChange={e => setForm(f => ({ ...f, fast_billing_key: e.target.value }))} className="input-field font-mono" placeholder="e.g. F1, F2" />
                  </div>
                  <ToggleSwitch label="Favourite Item" fieldKey="favourite_item" />
                  <ToggleSwitch label="Allow Return" fieldKey="allow_return" />
                  <ToggleSwitch label="Allow Exchange" fieldKey="allow_exchange" />
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Print Name</label>
                    <input value={form.print_name} onChange={e => setForm(f => ({ ...f, print_name: e.target.value }))} className="input-field" />
                  </div>
                </div>
              </div>

              {/* ── 5. Barcode ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Barcode Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Barcode Type</label>
                    <select value={form.barcode_type} onChange={e => setForm(f => ({ ...f, barcode_type: e.target.value }))} className="input-field">
                      {BARCODE_TYPES.map(bt => <option key={bt}>{bt}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Barcode Print Qty</label>
                    <input type="number" min="0" value={form.barcode_print_qty} onChange={e => setForm(f => ({ ...f, barcode_print_qty: e.target.value }))} className="input-field" />
                  </div>
                  <ToggleSwitch label="Auto Barcode Generate" fieldKey="auto_barcode_generate" />
                </div>
              </div>

              {/* ── 6. Multi-Store ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Multi-Store (Optional)</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Store</label>
                    <select value={form.store_id || ''} onChange={e => setForm(f => ({ ...f, store_id: e.target.value }))} className="input-field">
                      <option value="">Select Store</option>
                      {stores.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Branch Name</label>
                    <input value={form.branch_name} onChange={e => setForm(f => ({ ...f, branch_name: e.target.value }))} className="input-field" />
                  </div>
                  <ToggleSwitch label="Transfer Allowed" fieldKey="transfer_allowed" />
                </div>
              </div>

              {/* ── 7. Audit ── */}
              {editingId && (
                <div>
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Audit & System</h4>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Created By</label>
                      <input value={auditData.created_by || 'System'} disabled className="input-field bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Created Date</label>
                      <input value={auditData.created_at ? new Date(auditData.created_at).toLocaleString() : '—'} disabled className="input-field bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Modified By</label>
                      <input value={auditData.modified_by || 'System'} disabled className="input-field bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Modified Date</label>
                      <input value={auditData.modified_at ? new Date(auditData.modified_at).toLocaleString() : '—'} disabled className="input-field bg-gray-50 dark:bg-gray-800 text-gray-400 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status</label>
                      <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input-field">
                        {ITEM_STATUSES.map(s => <option key={s}>{s}</option>)}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving...' : editingId ? 'Update Product' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}