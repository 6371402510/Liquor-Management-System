import { useState, useEffect, useRef, Fragment } from 'react'
import { useAuth } from '../context/AuthContext'
import { Plus, X, Loader as Loader2, Trash2, ChevronDown, ChevronUp, Save, Package, AlertCircle, Search, ScanBarcode, Filter, RotateCcw, FileDown, TriangleAlert, Warehouse, Store, CreditCard as Edit2, Pencil } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'
import * as XLSX from 'xlsx'

import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

// Import API functions
import { getPurchases, createPurchase, getPurchaseItems, updatePurchase,checkInvoiceExists} from '../apiservices/purchasesapi'
// import { getSuppliers,createSupplier } from '../apiservices/supplierapi'
import { searchProducts, createProduct, updateProduct, getProductById } from '../apiservices/inventoryapi'
import { getSuppliers } from '../apiservices/supplierapi'
import { fetchSuppliersSafe } from './supplierHelper'
// ─────────────────────────────────────────────────────────────
// 1. INVENTORY CONSTANTS & HELPERS
// ─────────────────────────────────────────────────────────────

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
  'FMFL':['50ml','60ml','90ml', '180ml', '200ml', '250ml', '330ml', '375ml', '500ml', '700ml','750ml', '1000ml'],
  'IMFL': ['90ml', '180ml', '200ml', '250ml', '330ml', '375ml', '500ml', '750ml', '1000ml'],
  'BEER': ['275ml', '330ml', '500ml', '650ml'],
  'WINE': ['180ml', '375ml', '500ml', '750ml', '1000ml', '2000ml'],
  'COUNTRY LIQUOR': ['200ml', '300ml', '500ml', '750ml'],
}
const DEFAULT_SIZES = BOTTLE_SIZES_BY_TYPE['IMFL']

const SIZE_TRADITIONAL_MAP = {
  '50ml': { traditionalName: 'Peg / Miniature', bottlesPerCase: 150 },
  '60ml': { traditionalName: 'Peg / Miniature', bottlesPerCase: 150},
  '90ml': { traditionalName: 'Peg / Miniature', bottlesPerCase: 96 },
  '180ml': { traditionalName: 'Nip / Quarter', bottlesPerCase: 48 },
  '200ml': { traditionalName: 'Nip + / Quarter+', bottlesPerCase: 24 },
  '250ml': { traditionalName: 'Quarter Plus', bottlesPerCase: 36 },
  '275ml': { traditionalName: 'Small Bottle', bottlesPerCase: 24 },
  '300ml': { traditionalName: 'Half Plus', bottlesPerCase: 30 },
  '330ml': { traditionalName: 'Small / Pony', bottlesPerCase: 30 },
  '375ml': { traditionalName: 'Pint / Half', bottlesPerCase: 24 },
  '500ml': { traditionalName: 'Medium', bottlesPerCase: 24 },
  '650ml': { traditionalName: 'Large Beer', bottlesPerCase: 12 },
  '700ml': { traditionalName: 'Large ', bottlesPerCase: 12 },
  '750ml': { traditionalName: 'Quart / Bottle', bottlesPerCase: 12 },
  '1000ml': { traditionalName: 'Liter', bottlesPerCase: 9 },
  '2000ml': { traditionalName: 'Double Liter', bottlesPerCase: 6 },
}

const UNITS = ['BOTTLE', 'CASE', 'BOX', 'PACK', 'CARTON', 'PINT', 'QUARTER', 'CAN']
const PACKING_TYPES = ['BOTTLE', 'CAN', 'TETRA PACK']
const BARCODE_TYPES = ['EAN13', 'CODE128', 'UPC', 'QR']


// ─── HANDLING EXPENSES DROPDOWN OPTIONS ───






const emptyProductForm = {
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

const getTraditionalData = (bottleSize) => {
  return SIZE_TRADITIONAL_MAP[bottleSize] || { traditionalName: '', bottlesPerCase: '' }
}

const getSubCategories = (category) => {
  return SUB_CATEGORIES_BY_CATEGORY[category] || DEFAULT_SUB_CATEGORIES
}

const calculateBLandLPL = (totalQty, bottleSize, productType) => {
  const sizeInMl = parseInt(bottleSize) || 0
  const bottles = Number(totalQty) || 0

  if (bottles > 0 && sizeInMl > 0) {
    const bl = (bottles * sizeInMl) / 1000
    const lpl = productType === 'BEER' ? 0 : bl * 0.75
    return {
      qtyBulkLiters: parseFloat(bl.toFixed(3)),
      qtyLPLiters: parseFloat(lpl.toFixed(3))
    }
  }
  return { qtyBulkLiters: 0, qtyLPLiters: 0 }
}

// ─────────────────────────────────────────────────────────────
// 2. EXTRACTED PRODUCT MODAL COMPONENT
// ─────────────────────────────────────────────────────────────

const ProductModal = ({ isOpen, onClose, onSaveSuccess }) => {
  const [form, setForm] = useState(emptyProductForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (isOpen) {
      const defaultTradData = getTraditionalData(emptyProductForm.bottle_size)
      setForm({
        ...emptyProductForm,
        item_code: `ITM${Date.now().toString().slice(-6)}`,
        traditional_name: defaultTradData.traditionalName,
        bottles_per_case: String(defaultTradData.bottlesPerCase),
      })
      setError('')
    }
  }, [isOpen])

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

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const currentCompanyId = localStorage.getItem('selectedCompanyId')
    const payload = {
      ...form,
      company_id: Number(currentCompanyId),
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
      await createProduct(payload)
      onSaveSuccess()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save product.')
    } finally {
      setSaving(false)
    }
  }

  if (!isOpen) return null

  const currentSizes = BOTTLE_SIZES_BY_TYPE[form.product_type] || DEFAULT_SIZES
  const currentSubCategories = getSubCategories(form.category)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
          <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">Add New Product (Quick)</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
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
          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Basic Item Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Item Code *</label>
                <input required value={form.item_code} onChange={e => setForm(f => ({ ...f, item_code: e.target.value }))} className="input-field font-mono" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Barcode</label>
                <input value={form.barcode} onChange={e => setForm(f => ({ ...f, barcode: e.target.value }))} className="input-field font-mono" placeholder="Scan or enter..." />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Product Name *</label>
                <input required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="input-field" />
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
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sub Category</label>
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
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Traditional Name</label>
                <input value={form.traditional_name} onChange={e => setForm(f => ({ ...f, traditional_name: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bottles Per Case</label>
                <input type="number" min="0" value={form.bottles_per_case} onChange={e => setForm(f => ({ ...f, bottles_per_case: e.target.value }))} className="input-field" />
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Pricing & Stock</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Purchase Rate (₹)</label>
                <input type="number" min="0" step="0.01" value={form.purchase_rate} onChange={e => setForm(f => ({ ...f, purchase_rate: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">MRP (₹)</label>
                <input type="number" min="0" step="0.01" value={form.mrp} onChange={e => setForm(f => ({ ...f, mrp: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Sale Price (₹) *</label>
                <input required type="number" min="0" step="0.01" value={form.sale_price} onChange={e => setForm(f => ({ ...f, sale_price: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Opening Stock</label>
                <input type="number" min="0" value={form.opening_stock} onChange={e => setForm(f => ({ ...f, opening_stock: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Godown Stock</label>
                <input type="number" min="0" value={form.godown_stock} onChange={e => setForm(f => ({ ...f, godown_stock: e.target.value }))} className="input-field" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Counter Stock</label>
                <input type="number" min="0" value={form.counter_stock} onChange={e => setForm(f => ({ ...f, counter_stock: e.target.value }))} className="input-field" />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
              {saving && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
              {saving ? 'Saving...' : 'Create Product'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// 3. ORIGINAL PURCHASES PAGE LOGIC
// ─────────────────────────────────────────────────────────────

const SIZE_BOTTLES_MAP = {
  '90ml': 96, '180ml': 48, '200ml': 24, '250ml': 36, '275ml': 24, '300ml': 30,
  '330ml': 30, '375ml': 24, '500ml': 24, '650ml': 12, '750ml': 12,
  '1000ml': 9, '2000ml': 6,
}

function generatePurchaseNumber() {
  const d = format(new Date(), 'yyyyMMdd')
  return `PO-${d}-${Math.floor(1000 + Math.random() * 9000)}`
}

function normalizeItem(item) {
  const qty_cases = Number(item.qty_cases ?? item.qtyCases) || 0
  const bottles_per_case = Number(item.bottles_per_case ?? item.bottlesPerCase) || 0
  const purchase_rate_per_unit = Number(item.purchase_rate_per_unit ?? item.purchaseRatePerUnit) || 0
  const stored_total_cost = Number(item.total_cost) || 0

  // Get raw bottle quantities - NO cross-calculation
  const raw_qty_bottles = Number(item.qty_bottles ?? item.qtyBottles) || 0
  const raw_total_bottles = Number(item.total_bottles ?? item.totalBottles) || 0

  // Just use raw values - don't calculate from cases
  const total_bottles = raw_total_bottles || raw_qty_bottles

  // Calculate total_cost
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
    product_id: item.product_id ?? null,
    product_name: item.product_name ?? item.name ?? '',
    brand: item.brand ?? '',
    category: item.category ?? '',
    barcode: item.barcode ?? '',
    bottle_size: item.bottle_size ?? '',
    traditional_name: item.traditional_name ?? '',
    bottles_per_case: bottles_per_case,
    mrp: Number(item.mrp) || 0,
    unit_cost: Number(item.unit_cost ?? item.purchaseRate) || 0,
    purchase_rate_per_unit: purchase_rate_per_unit,
    selling_rate: Number(item.selling_rate ?? item.sellingRate) || 0,
    qty_cases: qty_cases,
    qty_bottles: raw_qty_bottles,      // 0 when entered by cases
    total_bottles: total_bottles,       // 0 when entered by cases
    qty_bulk_liters: Number(item.qty_bulk_liters ?? item.qtyBulkLiters) || 0,
    qty_lp_liters: Number(item.qty_lp_liters ?? item.qtyLPLiters) || 0,
    mger_value: Number(item.mger_value ?? item.mgerValue) || 0,
    opening_stock: Number(item.opening_stock ?? item.openingStock) || 0,
    min_stock: Number(item.min_stock ?? item.minStock) || 0,
    total_cost: total_cost,
  }
}

const EMPTY_ITEM = {
  name: '',
  brand: '',
  category: '',
  manufacturer: '',
  image: '',
  mrp: '',
  barcode: '',
  purchaseRatePerCase: '',
  purchaseRatePerUnit: 0,
  sellingRate: '',
  productId: null,
  productType: 'IMFL',
  bottleSize: '',
  traditionalName: '',
  bottlesPerCase: 0,
  qtyCases: 0,
  totalQty: 0,
  qtyBulkLiters: 0,
  qtyLPLiters: 0,
  mgerValue: 0,
  openingStock: 0,
  minStock: 0,
}

export default function Purchases() {

  // After successful purchase creation/update

  const { user } = useAuth()
  const isAdmin = user?.role?.toUpperCase() === 'ADMIN' // <-- ADD THIS LINE
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [purchases, setPurchases] = useState([])
  const [purchaseSide, setPurchaseSide] = useState('LIQUOR') // 'LIQUOR' or 'BEER'
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [error, setError] = useState('')

  const [showProductModal, setShowProductModal] = useState(false)

  const [suppliers, setSuppliers] = useState([])
  const [selectedSupplier, setSelectedSupplier] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [notes, setNotes] = useState('')
  const [currentItem, setCurrentItem] = useState(EMPTY_ITEM)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [barcodeDetected, setBarcodeDetected] = useState(false)
  const dropdownRef = useRef(null)
  const searchInputRef = useRef(null)

  const [purchaseVat, setPurchaseVat] = useState(35)
  const [purchaseCess, setPurchaseCess] = useState(0)
  const [purchaseSpecial, setPurchaseSpecial] = useState(0)
  const [purchaseTcs, setPurchaseTcs] = useState(2)

  const [invoiceDate, setInvoiceDate] = useState('')
  const [billingDate, setBillingDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [transportPass, setTransportPass] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [tokenNumber, setTokenNumber]=useState('')

  const [expandedId, setExpandedId] = useState(null)
  const [expandedItems, setExpandedItems] = useState({})

  const [filterProduct, setFilterProduct] = useState('')
  const [filterBrand, setFilterBrand] = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterMrp, setFilterMrp] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [filterType, setFilterType] = useState('ALL')

  const [editingPurchaseId, setEditingPurchaseId] = useState(null)
  const [editingItemIndex, setEditingItemIndex] = useState(null)
  // ─── NEW: Stock destination state ───
const [stockDestination, setStockDestination] = useState('GODOWN')





// ─── HANDLING EXPENSES STATE ───
// ─── HANDLING EXPENSES STATE ───
const [showHandling, setShowHandling] = useState(false)
const [handlingTransport, setHandlingTransport] = useState('')
const [handlingDepotExp, setHandlingDepotExp] = useState('')
const [handlingPassFees, setHandlingPassFees] = useState('')
const [handlingUnloading, setHandlingUnloading] = useState('')
const [handlingOtherName, setHandlingOtherName] = useState('')
const [handlingOtherAmount, setHandlingOtherAmount] = useState('')


// ─── HANDLING EXPENSE HELPERS ───
// ─── HANDLING EXPENSE HELPERS ───
const h = (val) => Number(val) || 0

const calcTotalHandling = () => {
  return h(handlingTransport) + h(handlingDepotExp) + h(handlingPassFees) + h(handlingUnloading) + h(handlingOtherAmount)
}

const resetHandlingState = () => {
  setShowHandling(false)
  setHandlingTransport(''); setHandlingDepotExp(''); setHandlingPassFees('')
  setHandlingUnloading(''); setHandlingOtherName(''); setHandlingOtherAmount('')
}



// ─────────────────────────────────────────────────────────────
// HANDLING EXPENSES ROW COMPONENT
// ─────────────────────────────────────────────────────────────


  useEffect(() => {
    if (companyId) {
      fetchPurchases()
      fetchSuppliers()
    }
  }, [companyId])

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  useEffect(() => {
    const hasItemFilter = filterProduct || filterBrand || filterCategory || filterMrp
    if (!hasItemFilter || purchases.length === 0) return

    const fetchMissingItems = async () => {
      const promises = purchases
        .filter(p => !expandedItems[p.id])
        .map(async p => {
          try {
            const data = await getPurchaseItems(p.id)
            return { id: p.id, data: (data || []).map(normalizeItem) }
          } catch { return null }
        })

      const results = await Promise.all(promises)
      setExpandedItems(prev => {
        const next = { ...prev }
        results.forEach(r => { if (r && r.data) next[r.id] = r.data })
        if (JSON.stringify(next) !== JSON.stringify(prev)) return next
        return prev
      })
    }
    fetchMissingItems()
  }, [filterProduct, filterBrand, filterCategory, filterMrp, purchases])

  const fetchPurchases = async () => {
    setLoading(true); setError('')
    try {
      const data = await getPurchases(Number(companyId))
      setPurchases(data || [])
    } catch (err) { setError(err.message || 'Failed to load purchases') }
    finally { setLoading(false) }
  }

  const handleEditPurchase = async (purchase) => {
    try {
      const rawItems = await getPurchaseItems(purchase.id)
      const normalizedItems = (rawItems || []).map(normalizeItem)

      setSelectedSupplier(String(purchase.supplier_id || ''))
      setInvoiceNumber(purchase.invoice_number || '')
      setBillingDate(purchase.billing_date || purchase.purchase_date || format(new Date(), 'yyyy-MM-dd'))
      setInvoiceDate(purchase.invoice_date || '')
      setTransportPass(purchase.notes || '')
      setVehicleNumber(purchase.vehicle_number || '')
      setTokenNumber(purchase.token_number || '')
      setStockDestination(purchase.stock_destination || 'GODOWN')
      setPurchaseSide(purchase.purchase_side || 'LIQUOR')  // ← ADD THIS
      // Add after: setStockDestination(purchase.stock_destination || 'GODOWN')
setHandlingTransport(purchase.handling_transport || '')
setHandlingDepotExp(purchase.handling_depot_exp || '')
setHandlingPassFees(purchase.handling_pass_fees || '')
setHandlingUnloading(purchase.handling_unloading || '')
setHandlingOtherName(purchase.handling_other_name || '')
setHandlingOtherAmount(purchase.handling_other_amount || '')
setShowHandling(
  (purchase.handling_transport || 0) > 0 ||
  (purchase.handling_depot_exp || 0) > 0 ||
  (purchase.handling_pass_fees || 0) > 0 ||
  (purchase.handling_unloading || 0) > 0 ||
  (purchase.handling_other_amount || 0) > 0
)
      setPurchaseVat(purchase.subtotal > 0 ? ((purchase.vat_amount / purchase.subtotal) * 100).toFixed(1) : 35)
      setPurchaseCess(purchase.subtotal > 0 ? ((purchase.cess_amount / purchase.subtotal) * 100).toFixed(1) : 0)
      setPurchaseSpecial(purchase.subtotal > 0 ? ((purchase.special_amount / purchase.subtotal) * 100).toFixed(1) : 0)
      setPurchaseTcs(purchase.subtotal > 0 ? ((purchase.tcs_amount / purchase.subtotal) * 100).toFixed(1) : 2)

      const mappedItems = normalizedItems.map((item, idx) => {
        const bpc = Number(item.bottles_per_case) || 0
        const ratePerCase = bpc > 0 ? Number(item.unit_cost) : 0
        const ratePerUnit = Number(item.purchase_rate_per_unit) || 0

        return {
          serialNo: idx + 1,
          name: item.product_name || '',
          brand: item.brand || '',
          category: item.category || '',
          barcode: item.barcode || '',
          productId: item.product_id || null,
          productType: item.category === 'BEER' ? 'BEER' : 'IMFL',
          bottleSize: item.bottle_size || '',
          traditionalName: item.traditional_name || '',
          bottlesPerCase: bpc,
          mrp: Number(item.mrp) || 0,
          purchaseRatePerCase: ratePerCase,
          purchaseRatePerUnit: ratePerUnit,
          sellingRate: Number(item.selling_rate) || 0,
          qtyCases: Number(item.qty_cases) || 0,
          totalQty: Number(item.total_bottles) || 0,
          qtyBulkLiters: Number(item.qty_bulk_liters) || 0,
          qtyLPLiters: Number(item.qty_lp_liters) || 0,
          mgerValue: Number(item.mger_value ?? item.mgerValue) || 0, // <--- ADD THIS LINE
          openingStock: Number(item.opening_stock) || 0,
          minStock: Number(item.min_stock) || 0,
        }
      })

      setItems([...mappedItems].reverse().map((item, i) => ({ ...item, serialNo: i + 1 })))
      setEditingPurchaseId(purchase.id)
      setEditingItemIndex(null)
      setShowForm(true)
      setCurrentItem(EMPTY_ITEM)
      setSearchQuery('')
    } catch (err) {
      alert('Failed to load purchase for editing: ' + err.message)
    }
  }

  // const fetchSuppliers = async () => {
  //   try {
  //     let data = await getSuppliers()

  //     // Ensure default supplier exists
  //     const defaultExists = (data || []).some(s => s.name === 'Odisha State Beverages Corporation Limited')

  //     if (!defaultExists) {
  //       const defaultSupplier = {
  //         name: 'Odisha State Beverages Corporation Limited',
  //         contact_person: '',
  //         phone: '0674 2303972',
  //         email: 'contact.osbcl-od@nic.in',
  //         address: `2nd Floor, Fortune Towers, Chandrasekharpur,
  // Bhubaneswar-751023 (Odisha)`,
  //         gst_number: '',
  //         license_number: '',
  //       }

  //       // Double-check before creating
  //       const recheck = await getSuppliers()
  //       if (!(recheck || []).some(s => s.name === defaultSupplier.name)) {
  //         const created = await createSupplier(defaultSupplier)
  //         data = recheck?.length ? [...recheck, created] : [created]
  //       } else {
  //         data = recheck || []
  //       }
  //     }

  //     setSuppliers(data || [])
  //   } catch (err) { 
  //     console.error('Failed to load suppliers', err) 
  //   }
  // }
  const fetchSuppliers = async () => {
    try {
      const data = await fetchSuppliersSafe()
      setSuppliers(data || [])
    } catch (err) {
      console.error('Failed to load suppliers', err)
    }
  }

  const handleItemChange = (key, val) => {
    setCurrentItem(prev => {
      const updated = { ...prev, [key]: val }

      // ─── When user types QUANTITY (bottles) directly ───
      if (key === 'totalQty') {
        // Just set the value — don't touch cases
        // Cases is a separate optional input
      }

      // ─── When user types CASES — auto-calculate bottles ───
      if (key === 'qtyCases') {
        const cases = Number(val) || 0
        const bpc = Number(prev.bottlesPerCase) || 0
        if (cases > 0 && bpc > 0) {
          updated.totalQty = cases * bpc
        } else if (cases === 0) {
          updated.totalQty = 0
        }
      }

      // ─── When bottles-per-case changes — recalculate if cases > 0 ───
      if (key === 'bottlesPerCase') {
        const cases = Number(prev.qtyCases) || 0
        const bpc = Number(val) || 0
        if (cases > 0 && bpc > 0) {
          updated.totalQty = cases * bpc
        }
        // Also recalculate rate per case
        const ratePerUnit = Number(prev.purchaseRatePerUnit) || 0
        if (ratePerUnit > 0 && bpc > 0) {
          updated.purchaseRatePerCase = ratePerUnit * bpc
        }
      }

      // ─── When per-unit rate changes — auto-calculate per-case rate ───
      if (key === 'purchaseRatePerUnit') {
        const ratePerUnit = Number(val) || 0
        const bpc = Number(prev.bottlesPerCase) || 0
        if (ratePerUnit > 0 && bpc > 0) {
          updated.purchaseRatePerCase = ratePerUnit * bpc
        } else {
          updated.purchaseRatePerCase = 0
        }
      }

      // ─── When per-case rate changes — auto-calculate per-unit rate ───
      if (key === 'purchaseRatePerCase') {
        const ratePerCase = Number(val) || 0
        const bpc = Number(prev.bottlesPerCase) || 0
        if (ratePerCase > 0 && bpc > 0) {
          updated.purchaseRatePerUnit = ratePerCase / bpc
        } else {
          updated.purchaseRatePerUnit = 0
        }
      }

      // ─── Calculate Bulk Liters & LP Liters ───
      const latestQty = Number(updated.totalQty) || 0
      const latestSize = updated.bottleSize || prev.bottleSize
      const latestType = updated.productType || prev.productType
      const { qtyBulkLiters, qtyLPLiters } = calculateBLandLPL(latestQty, latestSize, latestType)
      updated.qtyBulkLiters = qtyBulkLiters
      updated.qtyLPLiters = qtyLPLiters

      return updated
    })
  }
  const calcLineTotal = (item) => {
    const totalQty = Number(item.totalQty) || 0
    const ratePerUnit = Number(item.purchaseRatePerUnit) || 0

    // Priority 1: Direct Quantity × Rate per unit (when typing bottles directly)
    if (totalQty > 0 && ratePerUnit > 0) {
      return totalQty * ratePerUnit
    }

    // Fallback: Cases × Rate per case (normal case entry)
    const ratePerCase = Number(item.purchaseRatePerCase) || 0
    const cases = Number(item.qtyCases) || 0
    return ratePerCase * cases
  }

  const calcRatePerUnit = (item) => {
    // Priority 1: Direct per-unit rate from product/rate input
    if (Number(item.purchaseRatePerUnit) > 0) {
      return Number(item.purchaseRatePerUnit)
    }

    const ratePerCase = Number(item.purchaseRatePerCase) || 0
    const bpc = Number(item.bottlesPerCase) || 0

    if (ratePerCase > 0 && bpc > 0) return ratePerCase / bpc

    const cases = Number(item.qtyCases) || 0
    const totalQty = Number(item.totalQty) || 0
    if (totalQty > 0 && cases > 0) return (ratePerCase * cases) / totalQty
    return 0
  }

  const handleSearchChange = async (val) => {
    setSearchQuery(val)
    setBarcodeDetected(false)
    if (val.length > 1) {
      setIsSearching(true)
      try {
        const results = await searchProducts(val, companyId)
        const isBarcodeLike = /^\d{4,}$/.test(val.trim())
        if (isBarcodeLike && results.length === 1) {
          selectProduct(results[0])
          setBarcodeDetected(true)
          setTimeout(() => setBarcodeDetected(false), 2000)
        } else {
          setSearchResults(results)
          setShowDropdown(results.length > 0)
        }
      } catch (err) { console.error(err) }
      finally { setIsSearching(false) }
    } else {
      setSearchResults([]); setShowDropdown(false)
    }
  }

  const handleSearchKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (searchResults.length === 1) {
        selectProduct(searchResults[0])
        setBarcodeDetected(true)
        setTimeout(() => setBarcodeDetected(false), 2000)
      } else if (searchResults.length > 1) {
        setShowDropdown(true)
      }
    }
  }

  const selectProduct = (product) => {
    const bpc = product.bottles_per_case || SIZE_BOTTLES_MAP[product.bottle_size] || 0
    const productType = product.product_type || 'IMFL'

    // PRIMARY: Rate per bottle from product
    const purchaseRatePerUnit = Number(product.purchase_rate) || 0
    // AUTO-CALCULATE: Rate per case (for display only)
    const autoRatePerCase = purchaseRatePerUnit > 0 && bpc > 0 ? purchaseRatePerUnit * bpc : 0

    const newItem = {
      ...EMPTY_ITEM,
      name: product.name || '',
      brand: product.brand || '',
      category: product.category || '',
      barcode: product.barcode || '',
      bottleSize: product.bottle_size || '',
      traditionalName: product.traditional_name || '',
      bottlesPerCase: bpc,
      productId: product.id || null,
      productType,
      mrp: product.mrp || '',
      sellingRate: product.sale_price || '',
      purchaseRatePerUnit: purchaseRatePerUnit,   // ← Pre-fill per-bottle rate
      purchaseRatePerCase: autoRatePerCase,       // ← Auto-calc per-case
      openingStock: product.current_stock || 0,
    }

    const { qtyBulkLiters, qtyLPLiters } = calculateBLandLPL(0, product.bottle_size || '', productType)
    newItem.qtyBulkLiters = qtyBulkLiters
    newItem.qtyLPLiters = qtyLPLiters

    setCurrentItem(newItem)
    setSearchQuery(product.name)
    setShowDropdown(false)
    setTimeout(() => {
      const qtyInput = document.getElementById('qtyBottlesInput')
      if (qtyInput) qtyInput.focus()
    }, 100)
  }

  const addItemToTable = () => {
    if (!currentItem.name || !currentItem.purchaseRatePerCase || !currentItem.sellingRate) {
      return alert('Please fill at least Item Name, Purchase Rate/Case, and Selling Rate')
    }
    if (Number(currentItem.totalQty) <= 0 && Number(currentItem.qtyCases) <= 0) {
      return alert('Please enter quantity (cases or total bottles)')
    }

    const { qtyBulkLiters, qtyLPLiters } = calculateBLandLPL(
      currentItem.totalQty, currentItem.bottleSize, currentItem.productType
    )
    const itemToSave = { ...currentItem, qtyBulkLiters, qtyLPLiters }

    if (editingItemIndex !== null) {
      setItems(prev => prev.map((item, i) =>
        i === editingItemIndex ? { ...itemToSave, serialNo: item.serialNo } : item
      ))
    } else {
      setItems(prev => {
  const withNew = [{ ...itemToSave, serialNo: 1 }, ...prev]
  return withNew.map((item, i) => ({ ...item, serialNo: i + 1 }))
})
    }

    setCurrentItem(EMPTY_ITEM)
    setSearchQuery('')
    setBarcodeDetected(false)
    setEditingItemIndex(null)

    setTimeout(() => { if (searchInputRef.current) searchInputRef.current.focus() }, 100)
  }

  const handleEditItem = (index) => {
    const itemToEdit = items[index]
    setCurrentItem(itemToEdit)
    setSearchQuery(itemToEdit.name || '')
    setEditingItemIndex(index)
  }

  const removeItemFromTable = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index).map((item, i) => ({ ...item, serialNo: i + 1 })))

    if (editingItemIndex === index) {
      setCurrentItem(EMPTY_ITEM)
      setSearchQuery('')
      setEditingItemIndex(null)
    } else if (editingItemIndex !== null && editingItemIndex > index) {
      setEditingItemIndex(editingItemIndex - 1)
    }
  }

const calcTotals = () => {
  const subtotal = items.reduce((s, i) => s + calcLineTotal(i), 0)
  const vatTotal = subtotal * Number(purchaseVat) / 100
  const cessTotal = subtotal * Number(purchaseCess) / 100
  const specialTotal = subtotal * Number(purchaseSpecial) / 100
  
  // ─── FIX: TCS = 2% of (Subtotal + VAT) ───
  const tcsTotal = (subtotal + vatTotal) * Number(purchaseTcs) / 100
  
  const handlingTotal = calcTotalHandling()
  const totalWithoutHandling = subtotal + vatTotal + cessTotal + specialTotal + tcsTotal
  return {
    subtotal, vatTotal, cessTotal, specialTotal, tcsTotal,
    handlingTotal,
    totalWithoutHandling,
    total: totalWithoutHandling + handlingTotal
  }
}


  const calcItemTableTotals = () => {
  return items.reduce((acc, item) => {
    acc.totalBottles += Number(item.totalQty) || 0
    acc.totalCases += Number(item.qtyCases) || 0
    acc.totalBL += Number(item.qtyBulkLiters) || 0
    acc.totalLPL += Number(item.qtyLPLiters) || 0
    acc.totalMger += Number(item.mgerValue) || 0
    acc.totalCost += calcLineTotal(item)
    acc.totalMRP += (Number(item.mrp) || 0) * (Number(item.totalQty) || 0)
    return acc
  }, {
    totalBottles: 0,
    totalCases: 0,
    totalBL: 0,
    totalLPL: 0,
    totalMger: 0,
    totalCost: 0,
    totalMRP: 0,
  })
}


const roundTaxAmount = () => {
  const { subtotal, vatTotal } = calcTotals();

  if (subtotal <= 0) return;

  // ─── FIX: Round TCS based on (Subtotal + VAT) ───
  const roundedAmount = Math.round((subtotal + vatTotal) * Number(purchaseTcs) / 100);

  const newPercent = (roundedAmount * 100) / (subtotal + vatTotal);

  setPurchaseTcs(newPercent.toFixed(6)); // keep more precision
};




 const handleSubmit = async (e) => {
  e.preventDefault()
  if (!selectedSupplier) return alert('Please select a supplier')
  if (items.length === 0) return alert('Please add at least one item')

  // ─── FINAL DUPLICATE CHECK BEFORE SUBMIT ───
  const finalInvoiceNumber = invoiceNumber.trim() || generatePurchaseNumber()
  setInvoiceNumber(finalInvoiceNumber)
  
  const exists = await checkInvoiceExists(
    finalInvoiceNumber,
    Number(companyId),
    editingPurchaseId || null
  )
  
  if (exists) {
    setInvoiceError(`❌ Invoice number "${finalInvoiceNumber}" already exists! Please use a different number.`)
    setSaving(false)
    return alert(`❌ Invoice number "${finalInvoiceNumber}" already exists! Please use a different number.`)
  }

  setSaving(true)
  setError('')
  
  const supplier = suppliers.find(s => s.id === Number(selectedSupplier))
  const { subtotal, vatTotal, cessTotal, specialTotal, tcsTotal, total } = calcTotals()
  const totalHand = calcTotalHandling()
  
 const payload = {
  invoice_number: finalInvoiceNumber,
  company_id: Number(companyId),
  supplier_id: Number(selectedSupplier),
  supplier_name: supplier?.name || '',
  purchase_date: billingDate || format(new Date(), 'yyyy-MM-dd'),
  invoice_date: invoiceDate || null,
  billing_date: billingDate,
  stock_destination: stockDestination,
  purchase_side: purchaseSide,
  notes: transportPass,
  vehicle_number: vehicleNumber,
  token_number: tokenNumber,
  subtotal, 
  vat_amount: vatTotal, 
  cess_amount: cessTotal,
  special_amount: specialTotal, 
  tcs_amount: tcsTotal,
  
  // ─── ADD THESE TWO LINES ───
  
  
  handling_transport: h(handlingTransport),
  handling_depot_exp: h(handlingDepotExp),
  handling_pass_fees: h(handlingPassFees),
  handling_unloading: h(handlingUnloading),
  handling_other_name: handlingOtherName || null,
  handling_other_amount: h(handlingOtherAmount),
  total_handling: totalHand,
  total_amount: subtotal + vatTotal + cessTotal + specialTotal + tcsTotal + totalHand,
  status: "RECEIVED",
  items: items.map(item => {
    const ratePerUnit = calcRatePerUnit(item)
    const enteredByCases = Number(item.qtyCases) > 0
    
    return {
      product_id: item.productId,
      company_id: Number(companyId),
      name: item.name, 
      brand: item.brand, 
      category: item.category,
      barcode: item.barcode, 
      bottle_size: item.bottleSize,
      traditional_name: item.traditionalName,
      bottles_per_case: Number(item.bottlesPerCase) || 0,
      mrp: Number(item.mrp) || 0,
      purchaseRate: Number(item.purchaseRatePerCase) || 0,
      purchaseRatePerUnit: ratePerUnit,
      sellingRate: Number(item.sellingRate) || 0,
      qtyCases: Number(item.qtyCases) || 0,
      qtyBottles: enteredByCases ? 0 : (Number(item.totalQty) || 0),
      totalBottles: enteredByCases ? 0 : (Number(item.totalQty) || 0),
      qtyBulkLiters: Number(item.qtyBulkLiters) || 0,
      qtyLPLiters: Number(item.qtyLPLiters) || 0,
      mgerValue: Number(item.mgerValue) || 0,
      openingStock: Number(item.openingStock) || 0,
      minStock: Number(item.minStock) || 0,
      total_cost: calcLineTotal(item),
    }
  }),
}

  try {
    // ─── SAVE PURCHASE ───
    if (editingPurchaseId) {
      if (!isAdmin) {
        return alert("Permission denied: Only admins can update purchases.")
      }
      await updatePurchase(editingPurchaseId, payload)
    } else {
      await createPurchase(payload)
    }

    // ─── STORE LAST PURCHASE DATA FOR LANDING COST CALCULATION ───
    localStorage.setItem('lastPurchaseData', JSON.stringify({
      total_handling: totalHand,
      vat_rate: Number(purchaseVat),
      tcs_rate: Number(purchaseTcs),
      subtotal: subtotal,
      timestamp: new Date().toISOString()
    }))

    // ─── RESET FORM ───
    setShowForm(false)
    setEditingPurchaseId(null)
    setEditingItemIndex(null)
    setSelectedSupplier('')
    setInvoiceNumber('')
    setItems([])
    setNotes('')
    setInvoiceDate('')
    setBillingDate(format(new Date(), 'yyyy-MM-dd'))
    setTransportPass('')
    setVehicleNumber('')
    setTokenNumber('')
    setStockDestination('GODOWN')
    setInvoiceError('')
    resetHandlingState()
    fetchPurchases()
    
  } catch (err) {
    if (err.message && err.message.includes('already exists')) {
      setInvoiceError(`❌ Invoice number "${finalInvoiceNumber}" already exists. Please use a different invoice number.`)
      alert(`❌ Invoice number "${finalInvoiceNumber}" already exists. Please use a different invoice number.`)
    } else {
      setError(err.message || 'Failed to save purchase')
    }
  } finally {
    setSaving(false)
  }
}
const handleInvoiceNumberChange = async (value) => {
    setInvoiceNumber(value)
    setInvoiceError('')
    setIsCheckingInvoice(false)
    
    // Clear previous timeout
    clearTimeout(window.invoiceCheckTimeout)
    
    // Don't check if value is empty or too short
    if (value.trim().length < 2) {
        return
    }
    
    // Wait 500ms after user stops typing
    window.invoiceCheckTimeout = setTimeout(async () => {
        setIsCheckingInvoice(true)
        try {
            const exists = await checkInvoiceExists(
                value.trim(),
                Number(companyId),
                editingPurchaseId || null
            )
            
            if (exists) {
                setInvoiceError(`⚠️ Invoice number "${value}" already exists in the system! Please use a different number.`)
            } else {
                setInvoiceError('')
            }
        } catch (err) {
            // Silent fail - we'll validate on submit
            console.error('Invoice check failed:', err)
        } finally {
            setIsCheckingInvoice(false)
        }
    }, 500)
}
// Add state for invoice error
const [invoiceError, setInvoiceError] = useState('')
const [isCheckingInvoice, setIsCheckingInvoice] = useState(false)


  const clearFilters = () => {
    setFilterProduct(''); setFilterBrand(''); setFilterCategory('')
    setFilterMrp(''); setFilterDateFrom(''); setFilterDateTo(''); setFilterType('ALL')
  }


  const loadItems = async (id) => {
  if (expandedId === id) { 
    setExpandedId(null); 
    return; 
  }
  try {
    if (!expandedItems[id]) {
      const data = await getPurchaseItems(id);
      const normalized = (data || []).map(normalizeItem);
      setExpandedItems(prev => ({ ...prev, [id]: normalized }));
    }
    setExpandedId(id);
  } catch (err) {
    alert('Failed to load items');
  }
};

  const filteredPurchases = purchases.filter(p => {
    const pDate = p.billing_date || p.purchase_date || ''
    if (filterDateFrom && pDate < filterDateFrom) return false
    if (filterDateTo && pDate > filterDateTo) return false
    if (filterType === 'PURCHASE' && p.status === 'RETURN') return false
    if (filterType === 'RETURN' && p.status !== 'RETURN') return false

    const hasItemFilter = filterProduct || filterBrand || filterCategory || filterMrp
    if (hasItemFilter) {
      const pItems = expandedItems[p.id] || []
      if (pItems.length === 0) return false
      return pItems.some(item => {
        const matchProduct = !filterProduct || (item.product_name || '').toLowerCase().includes(filterProduct.toLowerCase())
        const matchCategory = !filterCategory || (item.category || '').toLowerCase().includes(filterCategory.toLowerCase())
        const matchBrand = !filterBrand || (item.brand || '').toLowerCase().includes(filterBrand.toLowerCase())
        const matchMrp = !filterMrp || String(item.mrp).includes(filterMrp)
        return matchProduct && matchCategory && matchBrand && matchMrp
      })
    }
    return true
  })

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

  const handleExportExcel = async () => {
    if (filteredPurchases.length === 0) { alert('No data to export'); return }

    const exportData = filteredPurchases.map(p => ({
      'Invoice No.': p.invoice_number || '',
      'Billing Date': p.billing_date || p.purchase_date || '',
      'Invoice Date': p.invoice_date || '',
      'Supplier': p.supplier_name || '',
       'Stock To': p.stock_destination || 'GODOWN',   // ← ADD THIS
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

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Purchases Data')

    const fileName = `Purchases_Report_${new Date().toISOString().slice(0, 10)}.xlsx`
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

  const { subtotal, vatTotal, cessTotal, specialTotal, tcsTotal, handlingTotal, totalWithoutHandling, total } = calcTotals()
  const isTotalQtyAuto = Number(currentItem.qtyCases) > 0 && Number(currentItem.bottlesPerCase) > 0
  const currentRatePerUnit = calcRatePerUnit(currentItem)

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company from the Companies page to view and create purchases.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-blue-500" />
            Purchases
          </h2>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={handleExportExcel} className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 flex items-center gap-2">
            <FileDown className="w-4 h-4" /> Export
          </button>
          <button
            onClick={() => {
              if (showForm) {
                setShowForm(false)
                setEditingPurchaseId(null)
                setEditingItemIndex(null)
                setItems([])
                setSelectedSupplier('')
                setInvoiceNumber('')
                setInvoiceDate('')
                setBillingDate(format(new Date(), 'yyyy-MM-dd'))
                setTransportPass('')
                setVehicleNumber('')
                setTokenNumber('')
                setCurrentItem(EMPTY_ITEM)
                setSearchQuery('')
                setPurchaseVat(35)
                setPurchaseCess(0)
                setPurchaseSpecial(0)
                setPurchaseTcs(2)
                setStockDestination('GODOWN') 
                setPurchaseSide('LIQUOR')  // ← ADD THIS
                resetHandlingState()  // ← ADD THIS
              } else {
                setEditingPurchaseId(null)
                setEditingItemIndex(null)
                setItems([])
                setSelectedSupplier('')
                setInvoiceNumber('')
                setCurrentItem(EMPTY_ITEM)
                setSearchQuery('')
                setShowForm(true)
                setStockDestination('GODOWN')
                resetHandlingState()  // ← ADD THIS
              }
            }}
            className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-sm transition-colors",
              editingPurchaseId
                ? "bg-amber-500 hover:bg-amber-600 text-white"
                : "btn-primary"
            )}
          >
            {editingPurchaseId ? (
              <><X className="w-4 h-4" /> Cancel Edit</>
            ) : showForm ? (
              <><X className="w-4 h-4" /> Close</>
            ) : (
              <><Plus className="w-4 h-4" /> New Purchase</>
            )}
          </button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {showForm && (
        <div className="card p-6 border dark:border-slate-700 shadow-sm">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6">
            {editingPurchaseId ? '✏️ Edit Purchase' : 'New Purchase Entry'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-8 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
  <div className="col-span-1">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">Date</label>
    <input type="date" value={billingDate} onChange={e => setBillingDate(e.target.value)} className="input-field bg-green-50 dark:bg-green-900/10" />
  </div>
  
  <div className="col-span-2">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">Supplier *</label>
    <select value={selectedSupplier} onChange={e => setSelectedSupplier(e.target.value)} required className="input-field">
      <option value="">Select supplier</option>
      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
    </select>
  </div>
  
  {/* ─── PURCHASE TYPE ─── */}
  <div className="col-span-2">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">
Description *</label>
    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setPurchaseSide('LIQUOR')}
        className={clsx(
          "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-r border-gray-200 dark:border-gray-700",
          purchaseSide === 'LIQUOR'
            ? "bg-blue-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
        )}
      >
        <span className="text-base">🥃</span>
        Liquor
      </button>
      <button
        type="button"
        onClick={() => setPurchaseSide('BEER')}
        className={clsx(
          "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors",
          purchaseSide === 'BEER'
            ? "bg-amber-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
        )}
      >
        <span className="text-base">🍺</span>
        Beer
      </button>
    </div>
  </div>
  
  <div className="col-span-2">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">Stock To *</label>
    <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
      <button
        type="button"
        onClick={() => setStockDestination('GODOWN')}
        className={clsx(
          "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors border-r border-gray-200 dark:border-gray-700",
          stockDestination === 'GODOWN'
            ? "bg-blue-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
        )}
      >
        <Warehouse className="w-4 h-4" />
        Godown
      </button>
      <button
        type="button"
        onClick={() => setStockDestination('COUNTER')}
        className={clsx(
          "flex-1 flex items-center justify-center gap-1.5 py-2.5 text-sm font-medium transition-colors",
          stockDestination === 'COUNTER'
            ? "bg-emerald-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
        )}
      >
        <Store className="w-4 h-4" />
        Counter
      </button>
    </div>
  </div>
  
  <div className="col-span-2">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">
        Invoice Number *
    </label>
    <div className="relative">
        <input 
            type="text" 
            value={invoiceNumber} 
            onChange={e => handleInvoiceNumberChange(e.target.value)} 
            placeholder="e.g. INV-20250101-001" 
            className={clsx(
                "input-field pr-20",
                invoiceError && "border-red-500 ring-2 ring-red-200 dark:ring-red-800",
                isCheckingInvoice && "border-amber-500 ring-2 ring-amber-200 dark:ring-amber-800"
            )}
        />
        {isCheckingInvoice && (
            <Loader2 className="absolute right-16 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-gray-400" />
        )}
        <button 
            type="button" 
            onClick={() => setInvoiceNumber(generatePurchaseNumber())} 
            className="absolute right-1 top-1/2 -translate-y-1/2 text-[10px] font-medium px-2 py-1 rounded bg-blue-100 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/60 transition-colors"
        >
            Auto
        </button>
    </div>
    {invoiceError && (
        <div className="flex items-center gap-1 mt-1 text-xs text-red-500 dark:text-red-400">
            <AlertCircle className="w-3 h-3" />
            <span>{invoiceError}</span>
        </div>
    )}
</div>
  
  <div className="col-span-1">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">Invoice date</label>
    <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} className="input-field" />
  </div>
  
  <div className="col-span-1">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">Transport Pass</label>
    <input type="text" value={transportPass} onChange={e => setTransportPass(e.target.value)} placeholder="Optional" className="input-field" />
  </div>
  
  <div className="col-span-1">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">Vehicle No.</label>
    <input type="text" value={vehicleNumber} onChange={e => setVehicleNumber(e.target.value.toUpperCase())} placeholder="e.g. MH12AB1234" className="input-field" />
  </div>
  
  <div className="col-span-1">
    <label className="block text-md font-semibold text-black-600 dark:text-gray-400 mb-1">Token No.</label>
    <input type="text" value={tokenNumber} onChange={e => setTokenNumber(e.target.value)} placeholder="Optional" className="input-field" />
  </div>
</div>
    

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left: Item Entry Form */}
              <div className="lg:col-span-4 border dark:border-slate-700 rounded-lg p-4 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between mb-0">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
                    <Package className="w-4 h-4 text-blue-500" />
                    {editingItemIndex !== null ? 'Edit Item' : 'Add New Item'}
                  </h4>

                  <button
                    type="button"
                    onClick={() => setShowProductModal(true)}
                    className="p-2 border border-dashed border-primary-300 dark:border-primary-700 rounded-lg bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 hover:bg-primary-100 dark:hover:bg-primary-900/30 transition-colors flex items-center justify-center"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3 max-h-[620px] overflow-y-auto pr-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2 relative" ref={dropdownRef}>
                      <label className="block text-md font-semibold text-black-800 mb-1">
                        Scan Barcode / Search Item
                        {barcodeDetected && <span className="ml-2 text-[10px] text-green-500 font-semibold animate-pulse">✓ Barcode found!</span>}
                      </label>
                      <div className="relative">
                        <ScanBarcode className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                        <input ref={searchInputRef} type="text" value={searchQuery} onChange={e => handleSearchChange(e.target.value)} onKeyDown={handleSearchKeyDown} onFocus={() => searchResults.length > 0 && setShowDropdown(true)} placeholder="Scan or type barcode / name..." className={clsx("input-field text-sm pl-8 pr-8", barcodeDetected && "ring-2 ring-green-400 border-green-400")} />
                        {isSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />}
                      </div>
                      {showDropdown && (
                        <div className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {searchResults.map(p => (
                            <button key={p.id} type="button" onMouseDown={() => selectProduct(p)} className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs flex justify-between items-center">
                              <div><span className="font-medium text-gray-900 dark:text-gray-100">{p.name}</span><span className="text-gray-500 ml-1">({p.brand})</span>{p.bottle_size && <span className="text-blue-500 ml-1">{p.bottle_size}</span>}</div>
                              <span className="text-gray-400 font-mono">₹{p.mrp}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* {currentItem.productId && (
                      <div className="col-span-2 rounded-md border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-900/20 px-3 py-2">
                        <div className="flex items-center justify-between">
                          <div className="text-xs">
                            <span className="font-semibold text-blue-700 dark:text-blue-300">{currentItem.bottleSize}</span>
                            <span className="text-blue-500 mx-1">·</span>
                            <span className="text-blue-600 dark:text-blue-400">{currentItem.traditionalName}</span>
                          </div>
                          <span className="text-[11px] font-bold text-blue-700 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/50 px-2 py-0.5 rounded-full">{currentItem.bottlesPerCase} btls/case</span>
                        </div>
                      </div>
                    )} */}

                    <div className="col-span-2">
                      <label className="block text-md font-semibold text-black-800 mb-0">Item Name *</label>
                      <input type="text" value={currentItem.name} onChange={e => handleItemChange('name', e.target.value)} placeholder="e.g. Royal Stag" className="input-field text-sm" />
                    </div>
                   
                    <div><label className="block text-md font-semibold text-black-800 mb-0">MRP (₹) *</label><input type="number" value={currentItem.mrp} onChange={e => handleItemChange('mrp', e.target.value)} className="input-field text-sm" /></div>
 <div>
                      <label className="block text-md font-semibold text-black-800 mb-0">
                        Qty in Cases
                        {currentItem.bottlesPerCase > 0 && <span className="ml-1 text-[10px] text-blue-500">×{currentItem.bottlesPerCase} btls</span>}
                      </label>
                      <input
                        id="qtyCasesInput"
                        type="number"
                        min="0"
                        value={currentItem.qtyCases}
                        onChange={e => handleItemChange('qtyCases', e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            addItemToTable();
                          }
                        }}
                        className="input-field text-sm"
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <label className="block text-md font-semibold text-black-800 mb-0">Total Qty (Bottles) {isTotalQtyAuto ? <span className="ml-1 text-[10px] text-blue-500">auto</span> : ''}</label>
                      <input
                        type="number"
                        min="0"
                        value={currentItem.totalQty}
                        onChange={e => handleItemChange('totalQty', e.target.value)}
                        className={clsx("input-field text-sm", isTotalQtyAuto && "bg-gray-50 dark:bg-gray-800")}
                        readOnly={isTotalQtyAuto}
                      />
                    </div>
                     <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">MGER Value</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={currentItem.mgerValue || ''}
                        onChange={e => handleItemChange('mgerValue', e.target.value)}
                        className="input-field text-sm font-semibold"
                        placeholder="Enter MGER"
                      />
                    </div>
                    <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">
                        Purchase Rate / Case (₹) *
                        {currentItem.purchaseRatePerCase && Number(currentItem.purchaseRatePerCase) > 0 && currentItem.bottlesPerCase > 0 ? (
                          <span className="ml-1 text-[10px] text-blue-500 font-medium">
                            (₹{(Number(currentItem.purchaseRatePerCase) / currentItem.bottlesPerCase).toFixed(2)}/unit)
                          </span>
                        ) : (
                          <span className="ml-1 text-[10px] text-red-500 font-medium">manual</span>
                        )}
                      </label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={currentItem.purchaseRatePerCase}
                        onChange={e => handleItemChange('purchaseRatePerCase', e.target.value)}
                        className={clsx(
                          "input-field text-sm font-semibold",
                          currentItem.purchaseRatePerCase && Number(currentItem.purchaseRatePerCase) > 0 && currentItem.bottlesPerCase > 0
                            ? "border-blue-300 dark:border-blue-700 bg-blue-50/50 dark:bg-blue-900/20"
                            : "border-orange-300 dark:border-orange-700 bg-orange-50/50 dark:bg-orange-900/20"
                        )}
                        placeholder="Enter per case or auto-filled"
                      />
                    </div>
                    <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">Rate / Unit (Bottle) ₹ <span className="ml-1 text-[10px] text-green-500 font-medium">auto</span></label>
                      <input type="text" value={currentRatePerUnit > 0 ? `₹${currentRatePerUnit.toFixed(2)}` : '—'} readOnly className="input-field text-sm font-semibold bg-green-50 dark:bg-green-900/20 border-green-300 dark:border-green-700 text-green-700 dark:text-green-300 cursor-not-allowed" />
                    </div>
                    <div><label className="block text-md font-semibold text-black-800 mb-1">Selling Rate (₹) *</label><input type="number" min="0" step="0.01" value={currentItem.sellingRate} onChange={e => handleItemChange('sellingRate', e.target.value)} className="input-field text-sm" /></div>

                   

                    {/* ─── RESTORED OPENING, MIN, BL, LPL FIELDS ─── */}
                    <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">Opening Stock</label>
                      <input type="number" min="0" value={currentItem.openingStock} onChange={e => handleItemChange('openingStock', e.target.value)} className="input-field text-sm" />
                    </div>
                    <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">Min Stock</label>
                      <input type="number" min="0" value={currentItem.minStock} onChange={e => handleItemChange('minStock', e.target.value)} className="input-field text-sm" />
                    </div>
                    {/* <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">Bulk Liters (BL) <span className="ml-1 text-[10px] text-cyan-500 font-medium">auto</span></label>
                      <input type="text" value={currentItem.qtyBulkLiters > 0 ? currentItem.qtyBulkLiters.toFixed(3) : '—'} readOnly className="input-field text-sm font-semibold bg-cyan-50 dark:bg-cyan-900/20 border-cyan-300 dark:border-cyan-700 text-cyan-700 dark:text-cyan-300 cursor-not-allowed" />
                    </div>
                    <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">LP Liters (LPL) <span className="ml-1 text-[10px] text-purple-500 font-medium">auto</span></label>
                      <input
                        type="text"
                        value={currentItem.qtyLPLiters > 0 ? currentItem.qtyLPLiters.toFixed(3) : '—'}
                        readOnly
                        className="input-field text-sm font-semibold bg-purple-50 dark:bg-purple-900/20 border-purple-300 dark:border-purple-700 text-purple-700 dark:text-purple-300 cursor-not-allowed"
                      />
                    </div> */}
                     <div><label className="block text-md font-semibold text-black-800 mb-1">Brand</label><input type="text" value={currentItem.brand} onChange={e => handleItemChange('brand', e.target.value)} className="input-field text-sm" /></div>
                    <div>
                      <label className="block text-md font-semibold text-black-800 mb-1">Product Type</label>
                      <select value={currentItem.productType} onChange={e => handleItemChange('productType', e.target.value)} className="input-field text-sm">
                        {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                      </select>
                    </div>
                    <div><label className="block text-md font-semibold text-black-800 mb-1">Category</label><input type="text" value={currentItem.category} onChange={e => handleItemChange('category', e.target.value)} className="input-field text-sm" /></div> 
                  </div>
                </div>

                {/* Add / Update Item Buttons */}
                <div className="flex gap-2 mt-4 pt-4 border-t border-gray-100 dark:border-gray-800">
                  <button
                    type="button"
                    onClick={addItemToTable}
                    className={clsx(
                      "flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold text-sm transition-colors",
                      editingItemIndex !== null
                        ? "bg-amber-500 hover:bg-amber-600 text-white"
                        : "btn-primary"
                    )}
                  >
                    {editingItemIndex !== null ? (
                      <><Save className="w-4 h-4" /> Update Item</>
                    ) : (
                      <><Plus className="w-4 h-4" /> Add Item</>
                    )}
                  </button>

                  {editingItemIndex !== null && (
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentItem(EMPTY_ITEM)
                        setSearchQuery('')
                        setEditingItemIndex(null)
                      }}
                      className="btn-secondary flex items-center gap-2"
                    >
                      <X className="w-4 h-4" /> Cancel
                    </button>
                  )}
                </div>
              </div>

              {/* Right: Items Table */}
              <div className="lg:col-span-8 border dark:border-slate-700 rounded-lg bg-white dark:bg-slate-900">
                <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    Items in this Purchase ({items.length})
                  </h4>
                </div>

                {items.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                    <Package className="w-10 h-10 mb-2" />
                    <p className="text-sm">No items added yet</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
                          <th className="text-left py-2 px-2 font-medium text-gray-500">#</th>
                          <th className="text-left py-2 px-2 font-medium text-gray-500">Product</th>
                          <th className="text-center py-2 px-2 font-medium text-gray-500">Cases</th>
                          <th className="text-center py-2 px-2 font-medium text-green-500">Btls</th>
                          <th className="text-center py-2 px-2 font-medium text-cyan-500">BL</th>
                          <th className="text-center py-2 px-2 font-medium text-purple-500">LPL</th>
                          <th className="px-3 py-2 text-right">MGER</th> {/* <--- ADD THIS */}
                          <th className="text-center py-2 px-2 font-medium text-gray-500">Opening</th>
                          <th className="text-center py-2 px-2 font-medium text-gray-500">Min</th>
                          <th className="text-right py-2 px-2 font-medium text-orange-500">Rate/Case</th>
                          <th className="text-right py-2 px-2 font-medium text-green-500">Rate/Unit</th>
                          <th className="text-right py-2 px-2 font-medium text-gray-500">Total</th>
                          <th className="text-center py-2 px-2 font-medium text-gray-500">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                        {items.map((item, idx) => {
                          const lineTotal = calcLineTotal(item)
                          const ratePerUnit = calcRatePerUnit(item)

                          return (
                            <tr key={idx} className={clsx(
                              editingItemIndex === idx && "bg-amber-50 dark:bg-amber-900/20"
                            )}>
                              <td className="py-2 px-2 text-gray-400">{item.serialNo}</td>
                              <td className="py-2 px-2">
                                <div className="font-medium text-gray-800 dark:text-gray-200">{item.name}</div>
                                <div className="text-gray-400">{item.bottleSize} · {item.traditionalName}</div>
                              </td>
                              <td className="py-2 px-2 text-center font-medium">{item.qtyCases || '-'}</td>
                              <td className="py-2 px-2 text-center font-bold text-green-600">{item.totalQty}</td>
                              <td className="py-2 px-2 text-center font-semibold text-cyan-600 dark:text-cyan-400">{item.qtyBulkLiters > 0 ? item.qtyBulkLiters.toFixed(3) : '-'}</td>
                              <td className="py-2 px-2 text-center font-semibold text-purple-600 dark:text-purple-400">{item.qtyLPLiters > 0 ? item.qtyLPLiters.toFixed(3) : '-'}</td>
                              <td className="px-3 py-2 text-right text-xs text-gray-500">{item.mgerValue || 0}</td> {/* <--- ADD THIS */}
                              <td className="py-2 px-2 text-center">{item.openingStock || '-'}</td>
                              <td className="py-2 px-2 text-center">{item.minStock || '-'}</td>
                              <td className="py-2 px-2 text-right font-semibold text-orange-600">₹{Number(item.purchaseRatePerCase).toFixed(2)}</td>
                              <td className="py-2 px-2 text-right font-semibold text-green-600">₹{ratePerUnit.toFixed(2)}</td>
                              <td className="py-2 px-2 text-right font-semibold">₹{lineTotal.toFixed(2)}</td>
                              <td className="py-2 px-2 text-center">
                                <div className="flex items-center justify-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleEditItem(idx)}
                                    className="p-1 rounded text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                                    title="Edit this item"
                                  >
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => removeItemFromTable(idx)}
                                    className="p-1 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                    title="Remove this item"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Totals Section */}

          <div className="flex flex-col items-end gap-2 w-full sm:w-auto mt-6">
  <div className="w-full sm:w-72 text-sm space-y-2">
    
    {/* ─── SUBTOTAL ─── */}
    <div className="flex justify-between items-center font-semibold text-gray-800 dark:text-gray-200">
      <span>Subtotal</span>
      <span className="w-24 text-right">₹{subtotal.toFixed(2)}</span>
    </div>

    {/* ─── VAT ─── */}
    <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-2">
        <span className="w-16">VAT</span>
        <input type="number" value={purchaseVat} onChange={e => setPurchaseVat(e.target.value)} className="w-14 input-field text-xs py-0.5 text-right" />
        <span>%</span>
      </div>
      <span className="w-24 text-right">₹{vatTotal.toFixed(2)}</span>
    </div>

    {/* ─── TCS ─── */}
    <div className="flex justify-between items-center text-gray-500 dark:text-gray-400">
      <div className="flex items-center gap-2">
        <span className="w-16">TCS</span>
        <div className="flex items-center gap-1">
          <input type="number" value={purchaseTcs} onChange={e => setPurchaseTcs(e.target.value)} className="w-14 input-field text-xs py-0.5 text-right" />
          <button type="button" onClick={roundTaxAmount} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-colors" title="Round TCS amount">⤴</button>
        </div>
        <span>%</span>
      </div>
      <span className="w-24 text-right font-medium">₹{tcsTotal.toFixed(2)}</span>
    </div>

    {/* ─── HANDLING EXPENSES BUTTON & PANEL ─── */}
    <div className="pt-1">
      <button
        type="button"
        onClick={() => setShowHandling(!showHandling)}
        className={clsx(
          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all border w-full justify-center",
          showHandling
            ? "bg-orange-50 dark:bg-orange-900/20 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400"
            : calcTotalHandling() > 0
              ? "bg-emerald-50 dark:bg-emerald-900/20 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400"
              : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-750"
        )}
      >
        <span className="text-base">🧾</span>
        <span>Handling Expenses</span>
        {calcTotalHandling() > 0 && (
          <span className="ml-1 px-2 py-0.5 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-800 text-emerald-700 dark:text-emerald-300">
            ₹ {calcTotalHandling().toLocaleString('en-IN')}
          </span>
        )}
        {showHandling ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
      </button>

      
     {/* ─── COLLAPSIBLE PANEL ─── */}
{showHandling && (
  <div className="mt-3 p-4 rounded-xl bg-orange-50/60 dark:bg-orange-900/10 border border-orange-200 dark:border-orange-800/50 space-y-3">
    <div className="flex items-center gap-2 mb-3 pb-2 border-b border-orange-200 dark:border-orange-800/50">
      <span className="text-sm">📦</span>
      <span className="text-xs font-bold text-orange-700 dark:text-orange-400 uppercase tracking-wider">
        Handling & Transport Expenses
      </span>
    </div>

    <div className="grid grid-cols-1 gap-2.5">
      {/* TRANSPORT */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-[100px] flex-shrink-0 flex items-center gap-1.5">
          <span>🚛</span> TRANSPORT
        </span>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-xs text-gray-400">₹</span>
          <input
            type="number" min="0" step="1"
            value={handlingTransport}
            onChange={e => setHandlingTransport(e.target.value)}
            placeholder="0"
            className="input-field !py-1.5 !text-xs w-full"
          />
        </div>
      </div>

      {/* DEPOT EXP */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-[100px] flex-shrink-0 flex items-center gap-1.5">
          <span>🏭</span> DEPOT EXP
        </span>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-xs text-gray-400">₹</span>
          <input
            type="number" min="0" step="1"
            value={handlingDepotExp}
            onChange={e => setHandlingDepotExp(e.target.value)}
            placeholder="0"
            className="input-field !py-1.5 !text-xs w-full"
          />
        </div>
      </div>

      {/* PASS FEES */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-[100px] flex-shrink-0 flex items-center gap-1.5">
          <span>🎫</span> PASS FEES
        </span>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-xs text-gray-400">₹</span>
          <input
            type="number" min="0" step="1"
            value={handlingPassFees}
            onChange={e => setHandlingPassFees(e.target.value)}
            placeholder="0"
            className="input-field !py-1.5 !text-xs w-full"
          />
        </div>
      </div>

      {/* UNLOADING */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-[100px] flex-shrink-0 flex items-center gap-1.5">
          <span>🏋️</span> UNLOADING
        </span>
        <div className="flex items-center gap-1 flex-1">
          <span className="text-xs text-gray-400">₹</span>
          <input
            type="number" min="0" step="1"
            value={handlingUnloading}
            onChange={e => setHandlingUnloading(e.target.value)}
            placeholder="0"
            className="input-field !py-1.5 !text-xs w-full"
          />
        </div>
      </div>

      {/* OTHER */}
      <div className="flex items-center gap-2 pt-1 border-t border-orange-200/50 dark:border-orange-800/30">
        <span className="text-xs font-semibold text-gray-600 dark:text-gray-400 w-[100px] flex-shrink-0 flex items-center gap-1.5">
          <span>📋</span> OTHER
        </span>
        <input
          type="text"
          value={handlingOtherName}
          onChange={e => setHandlingOtherName(e.target.value)}
          placeholder="Expense name..."
          className="input-field !py-1.5 !text-xs flex-1 min-w-0"
        />
        <div className="flex items-center gap-1 w-[100px] flex-shrink-0">
          <span className="text-xs text-gray-400">₹</span>
          <input
            type="number" min="0" step="1"
            value={handlingOtherAmount}
            onChange={e => setHandlingOtherAmount(e.target.value)}
            placeholder="0"
            className="input-field !py-1.5 !text-xs w-full"
          />
        </div>
      </div>
    </div>

    {/* ─── TOTAL HANDLING ─── */}
    <div className="flex items-center justify-between pt-3 mt-1 border-t-2 border-orange-300 dark:border-orange-700">
      <span className="text-sm font-bold text-orange-800 dark:text-orange-300">
        Total Handling Expenses
      </span>
      <span className="text-lg font-extrabold text-orange-700 dark:text-orange-400 tabular-nums">
        ₹ {calcTotalHandling().toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </span>
    </div>
  </div>
)}
    </div>

    {/* ─── HANDLING SUMMARY LINE (when panel is closed but has value) ─── */}
    {calcTotalHandling() > 0 && !showHandling && (
      <div className="flex justify-between text-sm">
        <span className="text-orange-600 dark:text-orange-400 font-medium">+ Handling Expenses</span>
        <span className="font-semibold text-orange-600 dark:text-orange-400 tabular-nums">
          ₹ {handlingTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
        </span>
      </div>
    )}

    {/* ─── GRAND TOTAL ─── */}
    <div className="flex justify-between text-base font-bold border-t-2 border-gray-300 dark:border-gray-600 pt-2">
  <span>Grand Total</span>
  <span className="text-green-600 dark:text-green-400 tabular-nums">
    ₹ {Number(total).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}
  </span>
</div>
  </div>

  {/* ─── SUBMIT BUTTON ─── */}
  <button
    type="submit"
    disabled={saving || items.length === 0}
    className={clsx(
      "w-full sm:w-72 flex justify-center items-center gap-2 py-2.5 rounded-lg text-white font-semibold transition-all",
      saving || items.length === 0
        ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed"
        : "bg-green-600 hover:bg-green-700 active:scale-95 shadow-md"
    )}
  >
    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
    {saving ? "Saving Purchase..." : editingPurchaseId ? "Update Purchase" : "Confirm Purchase"}
  </button>
</div>
          </form>
        </div>
      )}

      <ProductModal
        isOpen={showProductModal}
        onClose={() => setShowProductModal(false)}
        onSaveSuccess={fetchPurchases}
      />

      {/* ─── PURCHASES LIST TABLE ─── */}
    <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
  <div className="overflow-x-auto">
    <table className="w-full">
      <thead>
        <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
          <th className="table-header text-left">Invoice No.</th>
          <th className="table-header text-left">Date</th>
          <th className="table-header text-left">Supplier</th>
          <th className="table-header text-left">Stock To</th>
          <th className="table-header text-left">Description</th>  {/* ← ADD THIS */}
          <th className="table-header text-right text-blue-600 dark:text-blue-400">Subtotal</th>
          <th className="table-header text-right">VAT</th>
          <th className="table-header text-right">TCS</th>
          
          <th className="table-header text-right text-blue-600 dark:text-blue-400">Total Cost</th>
          <th className="table-header text-right">Handling</th>
          <th className="table-header text-right text-green-600 dark:text-green-400">Grand Total</th>
          <th className="table-header text-center">Status</th>
          <th className="table-header text-center">Actions</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
        {loading ? (
          <tr><td colSpan={12} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
        ) : filteredPurchases.length === 0 ? (
          <tr><td colSpan={12} className="text-center py-10 text-sm text-gray-400">No purchases match the selected filters</td></tr>
        ) : filteredPurchases.map(p => {
          // Total Cost = WITHOUT handling expense
          const totalCost = (Number(p.subtotal) || 0)
            + (Number(p.vat_amount) || 0)
            + (Number(p.cess_amount) || 0)
            + (Number(p.special_amount) || 0)
            + (Number(p.tcs_amount) || 0)
          // Grand Total = WITH handling expense (same as total_amount)
          const grandTotal = Number(p.total_amount) || 0

          return (
            <Fragment key={p.id}>
              <tr className={clsx("hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors", p.status === 'RETURN' && "bg-red-50/30 dark:bg-red-900/10")}>
                <td className="table-cell font-mono text-xs font-semibold">{p.invoice_number}</td>
                <td className="table-cell text-gray-500">
                  {p.billing_date
                    ? format(new Date(p.billing_date + 'T00:00:00'), 'dd MMM yyyy')
                    : p.purchase_date
                      ? format(new Date(p.purchase_date + 'T00:00:00'), 'dd MMM yyyy')
                      : '—'
                  }
                </td>
                <td className="table-cell text-gray-600 dark:text-gray-400">{p.supplier_name || '—'}</td>
                <td className="px-3 py-3">
                  <span className={clsx(
                    "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold",
                    (p.stock_destination || 'GODOWN') === 'COUNTER'
                      ? "bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-800"
                      : "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                  )}>
                    {(p.stock_destination || 'GODOWN') === 'COUNTER' ? (
                      <><Store className="w-3 h-3" /> Counter</>
                    ) : (
                      <><Warehouse className="w-3 h-3" /> Godown</>
                    )}
                  </span>
                </td>

                
<td className="table-cell text-center">
  <div className="flex items-center justify-center gap-1.5">
    <span className={clsx(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
      p.purchase_side === 'BEER' 
        ? "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
        : "bg-blue-50 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400"
    )}>
      {p.purchase_side === 'BEER' ? '🍺 Beer' : '🥃 Liquor'}
    </span>
    {/* <span className={clsx(
      "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold",
      p.status === 'RETURN' 
        ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" 
        : "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400"
    )}>
      {p.status}
    </span> */}
  </div>
</td>


  {/* ── Subtotal (line items only, no taxes) ── */}
                <td className="table-cell text-right font-semibold text-blue-600 dark:text-blue-400">
                  ₹{Number(p.subtotal || 0).toFixed(2)}
                </td>
                <td className="table-cell text-right">₹{Number(p.vat_amount).toFixed(2)}</td>
                <td className="table-cell text-right">₹{Number(p.tcs_amount || 0).toFixed(2)}</td>

              

                {/* ── Total Cost (subtotal + taxes, WITHOUT handling) ── */}
                <td className="table-cell text-right font-semibold text-blue-700 dark:text-blue-400">
                  ₹{totalCost.toFixed(2)}
                </td>

                {/* ── Handling ── */}
                <td className="table-cell text-right">
                  {Number(p.total_handling || 0) > 0
                    ? <span className="text-orange-600 dark:text-orange-400 font-medium">₹{Number(p.total_handling).toFixed(2)}</span>
                    : <span className="text-gray-300 dark:text-gray-600">—</span>
                  }
                </td>

                {/* ── Grand Total (WITH handling) ── */}
                <td className="table-cell text-right font-bold text-green-700 dark:text-green-400">
                  {Number(p.total_handling || 0) > 0
                    ? <>₹{grandTotal.toFixed(2)} <span className="text-[9px] text-orange-500 ml-0.5">▲</span></>
                    : <>₹{grandTotal.toFixed(2)}</>
                  }
                </td>

                <td className="table-cell text-center">
                  <span className={clsx("inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold", p.status === 'RETURN' ? "bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400" : "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400")}>{p.status}</span>
                </td>
                <td className="table-cell text-center">
                  <div className="flex items-center justify-center gap-1">
                    {isAdmin && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEditPurchase(p) }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                        title="Edit Purchase"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                    )}

                    <button onClick={() => loadItems(p.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                      {expandedId === p.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </td>
              </tr>
             {expandedId === p.id && expandedItems[p.id] && (
  <tr key={`${p.id}-items`} className="bg-gray-50/50 dark:bg-gray-800/20">
    <td colSpan={12} className="px-6 py-3">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-gray-400 border-b border-gray-200 dark:border-gray-700">
            <th className="text-left py-1 font-medium">#</th>
            <th className="text-left py-1 font-medium">Product</th>
            <th className="text-center py-1 font-medium">Size</th>
            <th className="text-center py-1 font-medium">Cases</th>
            <th className="text-center py-1 font-medium font-bold text-green-500">Btls</th>
            <th className="text-center py-1 font-medium text-cyan-500">BL</th>
            <th className="text-center py-1 font-medium text-purple-500">LPL</th>
            <th className="text-center py-2 px-2 font-medium text-orange-500">MGER</th>
            <th className="text-right py-1 font-medium text-orange-500">Rate/Case</th>
            <th className="text-right py-1 font-medium text-green-500">Rate/Unit</th>
            <th className="text-right py-1 font-medium">Total</th>
          </tr>
        </thead>
        <tbody>
          {expandedItems[p.id].map((item, idx) => {
            const cases = item.qty_cases || 0
            const btls = item.qty_bottles || 0  // ✅ Use qty_bottles (0 when entered by cases)
            const ratePerCase = item.unit_cost || 0
            const ratePerUnit = item.purchase_rate_per_unit > 0
              ? item.purchase_rate_per_unit
              : (btls > 0 ? (ratePerCase * cases) / btls : 0)

            return (
              <tr key={item.id} className="border-b border-gray-100 dark:border-gray-800">
                <td className="py-1.5 text-gray-400">{idx + 1}</td>
                <td className="py-1.5">
                  <span className="font-medium text-gray-800 dark:text-gray-200">{item.product_name}</span>
                  {item.traditional_name && <span className="text-gray-400 ml-1">· {item.traditional_name}</span>}
                </td>
                <td className="text-center py-1.5 text-gray-500">{item.bottle_size || '-'}</td>
                <td className="text-center py-1.5 font-medium">{cases || '—'}</td>
                <td className="text-center py-1.5 font-bold text-green-600">{btls || 0}</td>  {/* ✅ FIXED */}
                <td className="text-center py-1.5 font-semibold text-cyan-600 dark:text-cyan-400">{item.qty_bulk_liters > 0 ? item.qty_bulk_liters.toFixed(3) : '-'}</td>
                <td className="text-center py-1.5 font-semibold text-purple-600 dark:text-purple-400">{item.qty_lp_liters > 0 ? item.qty_lp_liters.toFixed(3) : '-'}</td>
                <td className="px-2 py-2 text-center font-semibold text-orange-600">
                  {item.mger_value || 0}
                </td>
                <td className="text-right py-1.5 font-semibold text-orange-600">₹{ratePerCase.toFixed(2)}</td>
                <td className="text-right py-1.5 font-semibold text-green-600">₹{ratePerUnit.toFixed(2)}</td>
                <td className="text-right py-1.5 font-medium">₹{item.total_cost.toFixed(2)}</td>
              </tr>
            )
          })}
          {expandedItems[expandedId]?.length > 0 && (() => {
            const t = expandedItems[expandedId].reduce((acc, item) => {
              acc.totalBottles += Number(item.qty_bottles) || 0  // ✅ Use qty_bottles
              acc.totalCases += Number(item.qty_cases) || 0
              acc.totalBL += Number(item.qty_bulk_liters) || 0
              acc.totalLPL += Number(item.qty_lp_liters) || 0
              acc.totalMger += Number(item.mger_value) || 0
              acc.totalCost += Number(item.total_cost) || 0
              return acc
            }, { totalBottles: 0, totalCases: 0, totalBL: 0, totalLPL: 0, totalMger: 0, totalCost: 0 })

            return (
              <>
                {/* ── Items Subtotal ── */}
                <tr className="bg-blue-50 dark:bg-blue-900/15 border-t border-blue-200 dark:border-blue-800 text-xs">
                  <td className="px-2 py-2 font-semibold text-blue-700 dark:text-blue-300" colSpan={10}>
                    Items Subtotal
                  </td>
                  <td className="px-2 py-2 text-right font-bold text-blue-700 dark:text-blue-300">
                    ₹{t.totalCost.toFixed(2)}
                  </td>
                </tr>
                {/* ── Total QTY ── */}
                <tr className="bg-emerald-50 dark:bg-emerald-900/20 border-t-2 border-emerald-300 dark:border-emerald-700 font-bold text-xs">
                  <td className="px-2 py-2 text-emerald-800 dark:text-emerald-300" colSpan={3}>TOTAL QTY</td>
                  <td className="px-2 py-2 text-right text-emerald-800 dark:text-emerald-300">{t.totalCases}</td>
                  <td className="px-2 py-2 text-right text-emerald-800 dark:text-emerald-300">{t.totalBottles}</td>
                  <td className="px-2 py-2 text-right text-emerald-800 dark:text-emerald-300">{t.totalBL.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right text-emerald-800 dark:text-emerald-300">{t.totalLPL.toFixed(3)}</td>
                  <td className="px-2 py-2 text-right text-emerald-800 dark:text-emerald-300">{t.totalMger.toFixed(2)}</td>
                  <td colSpan={3}></td>
                </tr>
                {/* ── Taxes & Grand Total ── */}
                <tr className="bg-slate-100 dark:bg-slate-800/40 border-t border-slate-300 dark:border-slate-600 text-xs">
                  <td className="px-2 py-1.5 text-gray-500 dark:text-gray-400" colSpan={8}>
                    Taxes: VAT ₹{Number(p.vat_amount || 0).toFixed(2)}
                    {Number(p.cess_amount || 0) > 0 && <> · CESS ₹{Number(p.cess_amount).toFixed(2)}</>}
                    {Number(p.special_amount || 0) > 0 && <> · Special ₹{Number(p.special_amount).toFixed(2)}</>}
                    {Number(p.tcs_amount || 0) > 0 && <> · TCS ₹{Number(p.tcs_amount).toFixed(2)}</>}
                  </td>
                  <td className="px-2 py-1.5 text-right font-semibold text-blue-700 dark:text-blue-400">₹{t.totalCost.toFixed(2)}</td>
                  <td className="px-2 py-1.5 text-right font-bold text-green-700 dark:text-green-400">₹{Number(p.total_amount || 0).toFixed(2)}</td>
                </tr>
              </>
            )
          })()}
        </tbody>
      </table>
    </td>
  </tr>
)}
            </Fragment>
          )
        })}
      </tbody>
    </table>
  </div>
</div>
    </div>
  )
}