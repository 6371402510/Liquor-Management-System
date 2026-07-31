// Reports.jsx - Updated data transformation and grouping logic
import { useState, useEffect, Fragment, useMemo } from 'react'
import {
  Store, Warehouse, TrendingUp, CreditCard, Banknote, Smartphone,
  Users, Receipt, RotateCcw, Filter, FileDown, Clock3, Calendar,
  Tag, Package, BarChart3, ArrowUpDown, AlertCircle, Loader as Loader2,
  Pencil, SplitSquareHorizontal
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { format } from 'date-fns'

import { getCounterSales } from '../apiservices/sales-counter'
import { getPosProducts } from '../apiservices/sales-counter'
import { getGodownProducts, getGodownSales } from '../apiservices/godown-counter'

const GROUP_BY_OPTIONS = [
  { value: 'date', label: 'Date Wise' },
  { value: 'bill', label: 'Bill Wise' },
  { value: 'month', label: 'Month Wise' },
  { value: 'year', label: 'Year Wise' },
  { value: 'hour', label: 'Hour Wise' },
  { value: 'item', label: 'Item Wise' },
  { value: 'brand', label: 'Brand Wise' },
  { value: 'category', label: 'Category Wise' },
  { value: 'size', label: 'Size Wise' },
  { value: 'discount', label: 'Discount Wise' },
]

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

// ═══════════════════════════════════════════════════════════════
// NEW: Helper function to parse payment details
// ═══════════════════════════════════════════════════════════════
const parsePaymentDetails = (sale) => {
  let cashAmount = 0
  let upiAmount = 0
  let cardAmount = 0

  // If payment_details exists and has splits, use those amounts
  if (sale.payment_details && Array.isArray(sale.payment_details) && sale.payment_details.length > 0) {
    sale.payment_details.forEach(split => {
      const amount = Number(split.amount) || 0
      if (split.mode === 'CASH') cashAmount += amount
      if (split.mode === 'UPI') upiAmount += amount
      if (split.mode === 'CARD') cardAmount += amount
    })
  } else {
    // Fallback: Use single payment_mode for the full amount
    const amount = Number(sale.total_amount) || 0
    if (sale.payment_mode === 'CASH') cashAmount = amount
    else if (sale.payment_mode === 'UPI') upiAmount = amount
    else if (sale.payment_mode === 'CARD') cardAmount = amount
    // For SPLIT without details, we can't determine individual amounts
  }

  return { cashAmount, upiAmount, cardAmount }
}

export default function Reports() {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [activeTab, setActiveTab] = useState('counter')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rawData, setRawData] = useState([])
  const [productsMap, setProductsMap] = useState({})
  const [expandedBill, setExpandedBill] = useState(null)

  const [dateFrom, setDateFrom] = useState(format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'))
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [groupBy, setGroupBy] = useState('date')
  const [salesType, setSalesType] = useState('ALL')
  const [paymentMode, setPaymentMode] = useState('ALL')
  const [discountFilter, setDiscountFilter] = useState('ALL')

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

  // ─── Fetch products map ───
  useEffect(() => {
    if (!companyId) {
      setProductsMap({})
      return
    }

    const fetchProducts = async () => {
      try {
        const data = activeTab === 'counter'
          ? await getPosProducts(Number(companyId), '')
          : await getGodownProducts(Number(companyId), '')
        const map = {};
        (data || []).forEach(p => { map[p.id] = p; });
        setProductsMap(map);
      } catch (err) {
        console.error("Failed to load products for mapping", err);
      }
    };
    fetchProducts();
  }, [activeTab, companyId])

  // ─── Fetch report data ───
  useEffect(() => {
    if (!companyId) {
      setRawData([])
      return
    }
    fetchReportData()
  }, [activeTab, dateFrom, dateTo, companyId])

  const fetchReportData = async () => {
    setLoading(true)
    setError('')
    try {
      let salesData;
      if (activeTab === 'counter') {
        salesData = await getCounterSales(Number(companyId), dateFrom, dateTo);
      } else {
        salesData = await getGodownSales(Number(companyId), dateFrom, dateTo);
      }

      const transformed = (salesData || []).map(sale => {
        const billDiscount = (sale.items || []).reduce((sum, item) => sum + (item.discount || 0), 0)
        
        // ← NEW: Parse payment details to get individual amounts
        const { cashAmount, upiAmount, cardAmount } = parsePaymentDetails(sale)

        return {
          id: sale.invoice_number,
          dbId: sale.id,
          date: sale.created_at,
          type: activeTab,
          transactionType: 'SALE',
          paymentMode: sale.payment_mode,
          paymentDetails: sale.payment_details,  // ← NEW: Store raw details for display
          customerId: sale.customer_phone,
          customerName: sale.customer_name,
          totalAmount: sale.total_amount,
          discount: billDiscount,
          cashAmount,    // ← NEW
          upiAmount,     // ← NEW
          cardAmount,    // ← NEW
          items: (sale.items || []).map(item => ({
            productId: item.product_id,
            name: item.product_name,
            brand: productsMap[item.product_id]?.brand || 'Unknown',
            category: productsMap[item.product_id]?.category || 'Unknown',
            size: productsMap[item.product_id]?.bottle_size || 'Unknown',
            qty: item.quantity,
            amount: item.total_price,
            unit_price: item.unit_price,
            discount: item.discount || 0,
          }))
        }
      })
      setRawData(transformed);
    } catch (err) {
      setError(err.message || 'Failed to load sales report');
      setRawData([]);
    } finally {
      setLoading(false)
    }
  }

  const { summary, tableData, topSelling } = useMemo(() => {
    let filtered = rawData.filter(row => {
      const rowDate = format(new Date(row.date), 'yyyy-MM-dd')
      if (rowDate < dateFrom || rowDate > dateTo) return false
      if (salesType !== 'ALL' && row.transactionType !== salesType) return false
      
      // ← UPDATED: Filter by payment mode using actual amounts
      if (paymentMode !== 'ALL') {
        if (paymentMode === 'CASH' && row.cashAmount <= 0) return false
        if (paymentMode === 'UPI' && row.upiAmount <= 0) return false
        if (paymentMode === 'CARD' && row.cardAmount <= 0) return false
        if (paymentMode === 'SPLIT' && (!row.paymentDetails || row.paymentDetails.length <= 1)) return false
      }
      
      if (discountFilter === 'WITH_DISCOUNT' && (!row.discount || row.discount <= 0)) return false
      if (discountFilter === 'WITHOUT_DISCOUNT' && row.discount > 0) return false
      return true
    })

    const totalBills = new Set(filtered.filter(f => f.transactionType === 'SALE').map(f => f.id)).size
    const totalCustomers = new Set(filtered.filter(f => f.customerId && f.transactionType === 'SALE').map(f => f.customerId)).size
    const nonBillCustomers = totalBills - totalCustomers
    const totalSales = filtered.filter(f => f.transactionType === 'SALE').reduce((s, f) => s + f.totalAmount, 0)
    const totalReturns = filtered.filter(f => f.transactionType === 'RETURN').reduce((s, f) => s + Math.abs(f.totalAmount), 0)
    const totalDiscount = filtered.filter(f => f.transactionType === 'SALE').reduce((s, f) => s + (f.discount || 0), 0)

    // ← UPDATED: Use actual split amounts for summary
    const totalUpi = filtered.filter(f => f.transactionType === 'SALE').reduce((s, f) => s + (f.upiAmount || 0), 0)
    const totalCash = filtered.filter(f => f.transactionType === 'SALE').reduce((s, f) => s + (f.cashAmount || 0), 0)
    const totalCard = filtered.filter(f => f.transactionType === 'SALE').reduce((s, f) => s + (f.cardAmount || 0), 0)

    const summary = {
      totalBills,
      totalCustomers,
      nonBillCustomers,
      totalSales,
      totalReturns,
      totalDiscount,
      upi: totalUpi,     // ← UPDATED
      cash: totalCash,    // ← UPDATED
      card: totalCard,    // ← UPDATED
    }

    const groups = {}

    const getGroupKey = (row, item = null) => {
      const d = new Date(row.date)
      switch (groupBy) {
        case 'date': return format(d, 'yyyy-MM-dd')
        case 'bill': return row.id
        case 'month': return format(d, 'yyyy-MM')
        case 'year': return format(d, 'yyyy')
        case 'hour': return `${format(d, 'yyyy-MM-dd')} ${d.getHours()}:00`
        case 'item': return item?.name || 'Unknown'
        case 'brand': return item?.brand || 'Unknown'
        case 'category': return item?.category || 'Unknown'
        case 'size': return item?.size || 'Unknown'
        case 'discount': {
          const disc = row.discount || 0
          return disc > 0 ? `₹${disc.toFixed(2)}` : 'No Discount'
        }
        default: return format(d, 'yyyy-MM-dd')
      }
    }

    filtered.forEach(row => {
      if (['item', 'brand', 'category', 'size'].includes(groupBy)) {
        row.items.forEach(item => {
          const key = getGroupKey(row, item)
          if (!groups[key]) groups[key] = { qty: 0, amount: 0, discount: 0, bills: new Set() }
          groups[key].qty += item.qty * (row.transactionType === 'RETURN' ? -1 : 1)
          groups[key].amount += item.amount * (row.transactionType === 'RETURN' ? -1 : 1)
          groups[key].discount += (item.discount || 0) * (row.transactionType === 'RETURN' ? -1 : 1)
          groups[key].bills.add(row.id)
        })
      } else {
        const key = getGroupKey(row)
        if (!groups[key]) groups[key] = { amount: 0, bills: new Set(), customers: new Set(), returns: 0, discount: 0, upi: 0, cash: 0, card: 0 }

        const amt = row.totalAmount
        groups[key].amount += amt
        groups[key].discount += (row.discount || 0)
        groups[key].bills.add(row.id)
        if (row.customerId) groups[key].customers.add(row.customerId)

        if (row.transactionType === 'RETURN') {
          groups[key].returns += Math.abs(amt)
        } else {
          // ← UPDATED: Use actual split amounts instead of payment_mode
          groups[key].upi += row.upiAmount || 0
          groups[key].cash += row.cashAmount || 0
          groups[key].card += row.cardAmount || 0
        }

        if (groupBy === 'bill') {
          if (!groups[key].date) groups[key].date = row.date
          if (!groups[key].paymentMode) groups[key].paymentMode = row.paymentMode
          if (!groups[key].paymentDetails) groups[key].paymentDetails = row.paymentDetails
          if (!groups[key].customerId) groups[key].customerId = row.customerId
          if (!groups[key].customerName) groups[key].customerName = row.customerName
          if (!groups[key].billItems) groups[key].billItems = row.items
          if (!groups[key].discount) groups[key].discount = row.discount
          if (!groups[key].dbId) groups[key].dbId = row.dbId
          if (!groups[key].cashAmount) groups[key].cashAmount = row.cashAmount
          if (!groups[key].upiAmount) groups[key].upiAmount = row.upiAmount
          if (!groups[key].cardAmount) groups[key].cardAmount = row.cardAmount
        }
      }
    })

    const tableData = Object.entries(groups).map(([key, val]) => ({
      group: key,
      bills: val.bills.size,
      customers: val.customers?.size || 0,
      qty: val.qty || 0,
      amount: val.amount,
      returns: val.returns || 0,
      discount: val.discount || 0,
      upi: val.upi || 0,
      cash: val.cash || 0,
      card: val.card || 0,
      date: val.date || null,
      paymentMode: val.paymentMode || null,
      paymentDetails: val.paymentDetails || null,
      customerId: val.customerId || null,
      customerName: val.customerName || null,
      billItems: val.billItems || null,
      dbId: val.dbId || null,
      cashAmount: val.cashAmount || 0,
      upiAmount: val.upiAmount || 0,
      cardAmount: val.cardAmount || 0,
    })).sort((a, b) => {
      if (groupBy === 'bill' && a.date && b.date) {
        return new Date(b.date) - new Date(a.date)
      }
      if (groupBy === 'discount') {
        const getVal = (g) => g === 'No Discount' ? -1 : parseFloat(g.replace('₹', ''))
        return getVal(a.group) - getVal(b.group)
      }
      return a.group.localeCompare(b.group)
    })

    const itemGroups = {}
    rawData.filter(f => f.transactionType === 'SALE' && format(new Date(f.date), 'yyyy-MM-dd') >= dateFrom && format(new Date(f.date), 'yyyy-MM-dd') <= dateTo).forEach(row => {
      row.items.forEach(item => {
        if (!itemGroups[item.name]) itemGroups[item.name] = { qty: 0, amount: 0 }
        itemGroups[item.name].qty += item.qty
        itemGroups[item.name].amount += item.amount
      })
    })
    const topSelling = Object.entries(itemGroups)
      .map(([name, val]) => ({ name, ...val }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10)

    return { summary, tableData, topSelling }
  }, [rawData, dateFrom, dateTo, groupBy, salesType, paymentMode, discountFilter])

  const handleExport = async () => {
    if (tableData.length === 0) return alert('No data to export')

    const exportData = tableData.map(row => ({
      [groupBy.toUpperCase()]: row.group,
      'Bills': row.bills,
      'Customers': row.customers,
      'Qty': row.qty,
      'Total Amount': row.amount,
      'Discount': row.discount,
      'Returns': row.returns,
      'UPI': row.upi,
      'Cash': row.cash,
      'Card': row.card,
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report')

    const fileName = `${activeTab}_sales_report_${companyName}_${new Date().toISOString().slice(0, 10)}.xlsx`
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

  const handleEditSale = (row) => {
    if (!row.dbId || !row.billItems) {
      alert('Cannot edit this sale — missing data')
      return
    }

    const cartItems = row.billItems.map((item, idx) => {
      const product = productsMap[item.productId] || {}
      const unitPrice = item.unit_price || product.sale_price || 0
      const perUnitDiscount = item.qty > 0 ? (item.discount || 0) / item.qty : 0
      const itemMrp = product.mrp || unitPrice

      return {
        ...product,
        scanId: `edit-${item.productId || item.name}-${idx}-${Date.now()}`,
        productId: item.productId != null ? item.productId : (product.id != null ? product.id : null),
        id: item.productId != null ? item.productId : (product.id != null ? product.id : null),
        name: item.name || product.name || 'Unknown Product',
        sale_price: unitPrice,
        mrp: itemMrp,
        bottle_size: item.size !== 'Unknown' ? item.size : (product.bottle_size || ''),
        brand: item.brand !== 'Unknown' ? item.brand : (product.brand || ''),
        category: item.category !== 'Unknown' ? item.category : (product.category || ''),
        traditional_name: product.traditional_name || '',
        barcode: product.barcode || '',
        item_code: product.item_code || '',
        godown_stock: product.godown_stock != null ? product.godown_stock : 9999,
        current_stock: product.current_stock != null ? product.current_stock : 9999,
        image_url: product.image_url || null,
        is_active: product.is_active ?? true,
        quantity: item.qty,
        discount: perUnitDiscount,
        paymentMode: row.paymentMode === 'SPLIT' ? 'CASH' : (row.paymentMode || 'CASH'),
      }
    })

    const editData = {
      dbId: row.dbId,
      invoiceNumber: row.group,
      type: activeTab,
      customerName: row.customerName || 'Walk-in Customer',
      customerPhone: row.customerId || '',
      paymentMode: row.paymentMode || 'CASH',
      paymentDetails: row.paymentDetails,  // ← NEW: Pass payment details for editing
      saleDate: row.date,
      cartItems,
    }

    sessionStorage.setItem('editing_sale_data', JSON.stringify(editData))

    window.dispatchEvent(
      new CustomEvent('open-pos-edit', {
        detail: { type: activeTab }
      })
    )
  }

  // ─── NEW: Render payment details for bill view ───
  const renderPaymentDetails = (row) => {
    if (row.paymentDetails && row.paymentDetails.length > 1) {
      return (
        <div className="mt-1 space-y-0.5">
          {row.paymentDetails.map((split, idx) => (
            <div key={idx} className="flex justify-between text-[10px] text-gray-500">
              <span>{split.mode}:</span>
              <span>₹{Number(split.amount).toFixed(2)}</span>
            </div>
          ))}
        </div>
      )
    }
    return null
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view sales reports.</p>
      </div>
    )
  }

  const billColSpan = 8
  const dateColSpan = 8
  const itemColSpan = 4

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
            <button
              onClick={() => { setActiveTab('counter'); setGroupBy('date') }}
              className={clsx("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all", activeTab === 'counter' ? "bg-white dark:bg-gray-900 shadow-sm text-blue-600 dark:text-blue-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}
            >
              <Store className="w-4 h-4" /> Counter Sales
            </button>
            <button
              onClick={() => { setActiveTab('godown'); setGroupBy('date') }}
              className={clsx("flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all", activeTab === 'godown' ? "bg-white dark:bg-gray-900 shadow-sm text-purple-600 dark:text-purple-400" : "text-gray-500 hover:text-gray-700 dark:hover:text-gray-300")}
            >
              <Warehouse className="w-4 h-4" /> Godown Sales
            </button>
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <button onClick={handleExport} disabled={loading || tableData.length === 0} className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 flex items-center gap-2 disabled:opacity-50">
          <FileDown className="w-4 h-4" /> Export Report
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

  
    
{/* ─── Summary Cards ─── */}
<div className={clsx(
  "grid gap-4",
  // 8 columns for counter, 6 columns for godown (hide 2 customer cards)
  activeTab === 'godown' 
    ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" 
    : "grid-cols-2 md:grid-cols-4 xl:grid-cols-8"
)}>
  <div className="card p-4 border-l-4 border-blue-500">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Receipt className="w-3.5 h-3.5" /> Bills</div>
    <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{summary.totalBills}</p>
  </div>

  {/* ← HIDE for Godown */}
  {activeTab === 'counter' && (
    <div className="card p-4 border-l-4 border-indigo-500">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Users className="w-3.5 h-3.5" /> Customers</div>
      <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{summary.totalCustomers}</p>
    </div>
  )}

  {/* ← HIDE for Godown */}
  {activeTab === 'counter' && (
    <div className="card p-4 border-l-4 border-orange-500">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
        <Users className="w-3.5 h-3.5" /> Walk-in 
      </div>
      <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
        {summary.nonBillCustomers}
      </p>
    </div>
  )}

  <div className="card p-4 border-l-4 border-emerald-500">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" /> Total Sales</div>
    <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{summary.totalSales.toLocaleString()}</p>
  </div>
  <div className="card p-4 border-l-4 border-rose-400">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Tag className="w-3.5 h-3.5" /> Discount</div>
    <p className="text-lg font-bold text-rose-500 dark:text-rose-400">₹{summary.totalDiscount.toLocaleString()}</p>
  </div>
  <div className="card p-4 border-l-4 border-green-500">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Smartphone className="w-3.5 h-3.5" /> UPI</div>
    <p className="text-lg font-bold text-green-600 dark:text-green-400">₹{summary.upi.toLocaleString()}</p>
  </div>
  <div className="card p-4 border-l-4 border-amber-500">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Banknote className="w-3.5 h-3.5" /> Cash</div>
    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">₹{summary.cash.toLocaleString()}</p>
  </div>
  <div className="card p-4 border-l-4 border-blue-400">
    <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><CreditCard className="w-3.5 h-3.5" /> Card</div>
    <p className="text-lg font-bold text-blue-500 dark:text-blue-400">₹{summary.card.toLocaleString()}</p>
  </div>
</div>

      {/* Filters */}
      <div className="card p-4 border dark:border-slate-700 shadow-sm">
        <div className="flex items-center gap-2 mb-3 text-gray-700 dark:text-gray-300 font-medium text-sm">
          <Filter className="w-4 h-4 text-blue-500" /> Report Filters & Grouping
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="input-field text-xs" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Date To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="input-field text-xs" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Group By</label>
            <select value={groupBy} onChange={e => setGroupBy(e.target.value)} className="input-field text-xs">
              {GROUP_BY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sales / Return</label>
            <select value={salesType} onChange={e => setSalesType(e.target.value)} className="input-field text-xs">
              <option value="ALL">All Transactions</option>
              <option value="SALE">Sales Only</option>
              <option value="RETURN">Returns Only</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Payment Mode</label>
            <select value={paymentMode} onChange={e => setPaymentMode(e.target.value)} className="input-field text-xs">
              <option value="ALL">All Modes</option>
              <option value="CASH">Cash</option>
              <option value="UPI">UPI</option>
              <option value="CARD">Card</option>
              <option value="SPLIT">Split Payments</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Discount</label>
            <select value={discountFilter} onChange={e => setDiscountFilter(e.target.value)} className="input-field text-xs">
              <option value="ALL">All Bills</option>
              <option value="WITH_DISCOUNT">With Discount</option>
              <option value="WITHOUT_DISCOUNT">Without Discount</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
          <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide self-center mr-1">Quick:</span>
          {[
            { label: 'Today', from: format(new Date(), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
            { label: 'This Week', from: format(new Date(Date.now() - 6 * 86400000), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
            { label: 'This Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
            { label: 'This Year', from: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
            { label: 'Last Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM-dd'), to: format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd') },
          ].map(preset => (
            <button
              key={preset.label}
              type="button"
              onClick={() => { setDateFrom(preset.from); setDateTo(preset.to) }}
              className={clsx(
                "text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors",
                dateFrom === preset.from && dateTo === preset.to
                  ? "bg-blue-100 dark:bg-blue-900/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
              )}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {/* Report Table & Top Selling */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden border dark:border-slate-700 shadow-sm">
          <div className="p-4 border-b dark:border-slate-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-blue-500" />
              {GROUP_BY_OPTIONS.find(o => o.value === groupBy)?.label} Report
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/50">
                <tr>
                  {groupBy === 'bill' ? (
                    <>
                      <th className="p-3 text-left font-semibold text-gray-500">Invoice No.</th>
                      <th className="p-3 text-left font-semibold text-gray-500">Date / Time</th>
                      <th className="p-3 text-left font-semibold text-gray-500">Customer</th>
                      <th className="p-3 text-center font-semibold text-gray-500">Payment</th>
                      <th className="p-3 text-center font-semibold text-gray-500">Items</th>
                      <th className="p-3 text-right font-semibold text-gray-500">Disc. ₹</th>
                      <th className="p-3 text-right font-semibold text-gray-500">Amount ₹</th>
                      <th className="p-3 text-center font-semibold text-gray-500">Action</th>
                    </>
                  ) : (
                    <>
                      <th className="p-3 text-left font-semibold text-gray-500">{groupBy.toUpperCase()}</th>
                      <th className="p-3 text-center font-semibold text-gray-500">Bills</th>
                      {!['item', 'brand', 'category', 'size'].includes(groupBy) && (
                        <>
                          <th className="p-3 text-center font-semibold text-gray-500">Cust.</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Disc. ₹</th>
                          <th className="p-3 text-right font-semibold text-gray-500">UPI ₹</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Cash ₹</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Card ₹</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Returns ₹</th>
                        </>
                      )}
                      {['item', 'brand', 'category', 'size'].includes(groupBy) && (
                        <>
                          <th className="p-3 text-center font-semibold text-gray-500">Qty</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Disc. ₹</th>
                        </>
                      )}
                      <th className="p-3 text-right font-semibold text-gray-700">Net Amt ₹</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan={groupBy === 'bill' ? billColSpan : (['item', 'brand', 'category', 'size'].includes(groupBy) ? itemColSpan : dateColSpan)} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : tableData.length === 0 ? (
                  <tr><td colSpan={groupBy === 'bill' ? billColSpan : (['item', 'brand', 'category', 'size'].includes(groupBy) ? itemColSpan : dateColSpan)} className="text-center py-10 text-gray-400">No data found for selected filters</td></tr>
                ) : tableData.map((row, i) => (
                  <Fragment key={i}>
                    {groupBy === 'bill' ? (
                      <>
                        <tr
                          onClick={() => setExpandedBill(expandedBill === row.group ? null : row.group)}
                          className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors cursor-pointer"
                        >
                          <td className="p-3 font-medium text-blue-600 dark:text-blue-400">{row.group}</td>
                          <td className="p-3 text-gray-600 dark:text-gray-400">
                            {row.date ? format(new Date(row.date), 'dd MMM yyyy, hh:mm a') : '-'}
                          </td>
                          <td className="p-3 text-gray-600 dark:text-gray-400">{row.customerName || row.customerId || 'Walk-in'}</td>
                          <td className="p-3 text-center">
                            <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full",
                              row.paymentMode === 'UPI' ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                              row.paymentMode === 'CARD' ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" :
                              row.paymentMode === 'SPLIT' ? "bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" :
                              "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                            )}>
                              {row.paymentMode}
                            </span>
                            {/* ← NEW: Show split amounts in bill view */}
                            {renderPaymentDetails(row)}
                          </td>
                          <td className="p-3 text-center text-gray-500">
                            {row.billItems?.length || 0}
                            <span
                              className="ml-1 text-gray-400 cursor-pointer"
                              onClick={(e) => { e.stopPropagation(); setExpandedBill(expandedBill === row.group ? null : row.group) }}
                            >
                              {expandedBill === row.group ? '▲' : '▼'}
                            </span>
                          </td>
                          <td className={clsx("p-3 text-right font-medium", row.discount > 0 ? "text-rose-500 dark:text-rose-400" : "text-gray-400 dark:text-gray-600")}>
                            {row.discount > 0 ? `-₹${row.discount.toLocaleString()}` : '-'}
                          </td>
                          <td className={clsx("p-3 text-right font-bold", row.amount >= 0 ? "text-emerald-600" : "text-red-500")}>
                            ₹{Math.abs(row.amount).toLocaleString()}
                          </td>
                          <td className="p-3 text-center">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleEditSale(row) }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold rounded-md bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800 dark:hover:bg-amber-900/40"
                              title="Edit this bill in POS"
                            >
                              <Pencil className="w-3 h-3" /> Edit
                            </button>
                          </td>
                        </tr>

                        {expandedBill === row.group && row.billItems && (
                          <tr className="bg-gray-50 dark:bg-gray-800/30">
                            <td colSpan={billColSpan} className="p-0">
                              <div className="px-6 py-3 border-l-4 border-blue-400 ml-4">
                                {/* ← NEW: Show payment split breakdown in expanded view */}
                                {row.paymentDetails && row.paymentDetails.length > 1 && (
                                  <div className="mb-3 p-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                                    <div className="text-[10px] font-semibold text-purple-600 dark:text-purple-400 mb-1">Payment Breakdown:</div>
                                    <div className="flex flex-wrap gap-3">
                                      {row.paymentDetails.map((split, idx) => (
                                        <div key={idx} className="flex items-center gap-1.5 text-xs">
                                          <span className={clsx("w-2 h-2 rounded-full",
                                            split.mode === 'CASH' ? "bg-amber-500" :
                                            split.mode === 'UPI' ? "bg-green-500" : "bg-blue-500"
                                          )}></span>
                                          <span className="text-gray-600 dark:text-gray-400">{split.mode}:</span>
                                          <span className="font-semibold text-gray-800 dark:text-gray-200">₹{Number(split.amount).toFixed(2)}</span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                      <th className="text-left py-1 font-medium w-8">#</th>
                                      <th className="text-left py-1 font-medium">Product</th>
                                      <th className="text-center py-1 font-medium">Qty</th>
                                      <th className="text-right py-1 font-medium">Disc. ₹</th>
                                      <th className="text-right py-1 font-medium">Price</th>
                                      <th className="text-right py-1 font-medium">Total</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.billItems.map((item, idx) => (
                                      <tr key={idx} className="border-b border-gray-100 dark:border-gray-800">
                                        <td className="py-1.5 text-gray-400">{idx + 1}</td>
                                        <td className="py-1.5 text-gray-800 dark:text-gray-200">{item.name}</td>
                                        <td className="text-center py-1.5">{item.qty}</td>
                                        <td className={clsx("text-right py-1.5", item.discount > 0 ? "text-rose-500" : "text-gray-400")}>
                                          {item.discount > 0 ? `-₹${item.discount.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="text-right py-1.5">₹{(item.amount / (item.qty || 1)).toFixed(2)}</td>
                                        <td className="text-right py-1.5 font-medium">₹{item.amount.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                    {row.discount > 0 && (
                                      <tr className="bg-rose-50/50 dark:bg-rose-900/10">
                                        <td colSpan="3" className="text-right py-1.5 font-semibold text-rose-600 dark:text-rose-400 pr-3">Bill Discount</td>
                                        <td className="text-right py-1.5 font-bold text-rose-600 dark:text-rose-400">-₹{row.discount.toFixed(2)}</td>
                                        <td colSpan="2"></td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{row.group}</td>
                        <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.bills}</td>
                        {!['item', 'brand', 'category', 'size'].includes(groupBy) && (
                          <>
                            <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.customers}</td>
                            <td className={clsx("p-3 text-right", row.discount > 0 ? "text-rose-500 dark:text-rose-400 font-medium" : "text-gray-400 dark:text-gray-600")}>
                              {row.discount > 0 ? `-₹${row.discount.toLocaleString()}` : '-'}
                            </td>
                            <td className="p-3 text-right text-green-600 dark:text-green-400">₹{row.upi.toLocaleString()}</td>
                            <td className="p-3 text-right text-amber-600 dark:text-amber-400">₹{row.cash.toLocaleString()}</td>
                            <td className="p-3 text-right text-blue-500 dark:text-blue-400">₹{row.card.toLocaleString()}</td>
                            <td className="p-3 text-right text-red-500 dark:text-red-400">₹{row.returns.toLocaleString()}</td>
                          </>
                        )}
                        {['item', 'brand', 'category', 'size'].includes(groupBy) && (
                          <>
                            <td className="p-3 text-center font-medium text-blue-600 dark:text-blue-400">{row.qty}</td>
                            <td className={clsx("p-3 text-right", row.discount > 0 ? "text-rose-500 dark:text-rose-400 font-medium" : "text-gray-400 dark:text-gray-600")}>
                              {row.discount > 0 ? `-₹${row.discount.toLocaleString()}` : '-'}
                            </td>
                          </>
                        )}
                        <td className={clsx("p-3 text-right font-bold", row.amount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                          ₹{Math.abs(row.amount).toLocaleString()} {row.amount < 0 ? '(Dr)' : ''}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
              {tableData.length > 0 && (
                <tfoot className="bg-slate-50 dark:bg-slate-800/50 border-t-2 border-slate-300 dark:border-slate-600">
                  {groupBy === 'bill' ? (
                    <tr className="font-bold text-xs">
                      <td className="p-3 text-right text-gray-700 dark:text-gray-300" colSpan={5}>Grand Total ({tableData.length} Bills)</td>
                      <td className="p-3 text-right text-rose-500 dark:text-rose-400">
                        -₹{tableData.reduce((s, r) => s + r.discount, 0).toLocaleString()}
                      </td>
                      <td className={clsx("p-3 text-right", tableData.reduce((s, r) => s + r.amount, 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                        ₹{Math.abs(tableData.reduce((s, r) => s + r.amount, 0)).toLocaleString()}
                      </td>
                      <td></td>
                    </tr>
                  ) : !['item', 'brand', 'category', 'size'].includes(groupBy) ? (
                    <tr className="font-bold text-xs">
                      <td className="p-3 text-right text-gray-700 dark:text-gray-300">Grand Total</td>
                      <td className="p-3 text-center text-gray-700 dark:text-gray-300">{tableData.reduce((s, r) => s + r.bills, 0)}</td>
                      <td className="p-3 text-center text-gray-700 dark:text-gray-300">{tableData.reduce((s, r) => s + r.customers, 0)}</td>
                      <td className="p-3 text-right text-rose-500 dark:text-rose-400">
                        -₹{tableData.reduce((s, r) => s + r.discount, 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-green-600 dark:text-green-400">₹{tableData.reduce((s, r) => s + r.upi, 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-amber-600 dark:text-amber-400">₹{tableData.reduce((s, r) => s + r.cash, 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-blue-500 dark:text-blue-400">₹{tableData.reduce((s, r) => s + r.card, 0).toLocaleString()}</td>
                      <td className="p-3 text-right text-red-500 dark:text-red-400">₹{tableData.reduce((s, r) => s + r.returns, 0).toLocaleString()}</td>
                    </tr>
                  ) : (
                    <tr className="font-bold text-xs">
                      <td className="p-3 text-right text-gray-700 dark:text-gray-300">Grand Total</td>
                      <td className="p-3 text-center text-blue-600 dark:text-blue-400">{tableData.reduce((s, r) => s + r.qty, 0)}</td>
                      <td className="p-3 text-right text-rose-500 dark:text-rose-400">
                        -₹{tableData.reduce((s, r) => s + r.discount, 0).toLocaleString()}
                      </td>
                      <td className={clsx("p-3 text-right", tableData.reduce((s, r) => s + r.amount, 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                        ₹{Math.abs(tableData.reduce((s, r) => s + r.amount, 0)).toLocaleString()}
                      </td>
                    </tr>
                  )}
                </tfoot>
              )}
            </table>
          </div>
        </div>

        <div className="lg:col-span-1 card p-4 border dark:border-slate-700 shadow-sm h-fit">
          <h3 className="font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Top Selling Items
          </h3>
          <div className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : topSelling.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No sales data</p>
            ) : topSelling.map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className={clsx("w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white", i === 0 ? "bg-yellow-500" : i === 1 ? "bg-gray-400" : i === 2 ? "bg-amber-700" : "bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400")}>
                  {i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate">{item.name}</p>
                  <p className="text-xs text-gray-500">{item.qty} qty</p>
                </div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">₹{item.amount.toLocaleString()}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}