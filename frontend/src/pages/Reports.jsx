import { useState, useEffect, Fragment, useMemo } from 'react'
import {
  Store, Warehouse, TrendingUp, CreditCard, Banknote, Smartphone,
  Users, Receipt, RotateCcw, Filter, FileDown, Clock3, Calendar,
  Tag, Package, BarChart3, ArrowUpDown, AlertCircle, Loader as Loader2
} from 'lucide-react'
import clsx from 'clsx'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'
import { format } from 'date-fns'

// Import API functions
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
export default function Reports() {
  // ─── COMPANY ID FROM LOCAL STORAGE ───
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
  // API: getPosProducts(companyId, search) / getGodownProducts(companyId, search)
  useEffect(() => {
    if (!companyId) {
      setProductsMap({})
      return
    }

    const fetchProducts = async () => {
      try {
        const data = activeTab === 'counter'
          ? await getPosProducts(Number(companyId), '')       // ✅ companyId FIRST
          : await getGodownProducts(Number(companyId), '')    // ✅ companyId FIRST
        const map = {};
        (data || []).forEach(p => { map[p.id] = p; });
        setProductsMap(map);
      } catch (err) {
        console.error("Failed to load products for mapping", err);
      }
    };
    fetchProducts();
  }, [activeTab, companyId]);

  // ─── Fetch report data ───
  // API: getCounterSales(companyId, dateFrom, dateTo) / getGodownSales(companyId, dateFrom, dateTo)
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
        salesData = await getCounterSales(Number(companyId), dateFrom, dateTo);   // ✅ companyId FIRST
      } else {
        salesData = await getGodownSales(Number(companyId), dateFrom, dateTo);    // ✅ companyId FIRST
      }

      const transformed = (salesData || []).map(sale => ({
        id: sale.invoice_number,
        date: sale.created_at,
        type: activeTab,
        transactionType: 'SALE',
        paymentMode: sale.payment_mode,
        customerId: sale.customer_phone,
        totalAmount: sale.total_amount,
        items: (sale.items || []).map(item => ({
          productId: item.product_id,
          name: item.product_name,
          brand: productsMap[item.product_id]?.brand || 'Unknown',
          category: productsMap[item.product_id]?.category || 'Unknown',
          size: productsMap[item.product_id]?.bottle_size || 'Unknown',
          qty: item.quantity,
          amount: item.total_price,
        }))
      }));

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
      if (paymentMode !== 'ALL' && row.paymentMode !== paymentMode) return false
      return true
    })

    const totalBills = new Set(filtered.filter(f => f.transactionType === 'SALE').map(f => f.id)).size
    const totalCustomers = new Set(filtered.filter(f => f.customerId && f.transactionType === 'SALE').map(f => f.customerId)).size
    const nonBillCustomers = totalBills - totalCustomers
    const totalSales = filtered.filter(f => f.transactionType === 'SALE').reduce((s, f) => s + f.totalAmount, 0)
    const totalReturns = filtered.filter(f => f.transactionType === 'RETURN').reduce((s, f) => s + Math.abs(f.totalAmount), 0)

    const byPayment = (type) => filtered.filter(f => f.paymentMode === type && f.transactionType === 'SALE').reduce((s, f) => s + f.totalAmount, 0)

    const summary = {
      totalBills,
      totalCustomers,
      nonBillCustomers,
      totalSales,
      totalReturns,
      upi: byPayment('UPI'),
      cash: byPayment('CASH'),
      card: byPayment('CARD'),
    }

    const groups = {}

    const getGroupKey = (row, item = null) => {
      const d = new Date(row.date)
      switch (groupBy) {
        case 'date': return format(d, 'yyyy-MM-dd')
        case 'bill': return row.id // <-- Group by Invoice Number
        case 'month': return format(d, 'yyyy-MM')
        case 'year': return format(d, 'yyyy')
        case 'hour': return `${format(d, 'yyyy-MM-dd')} ${d.getHours()}:00`
        case 'item': return item?.name || 'Unknown'
        case 'brand': return item?.brand || 'Unknown'
        case 'category': return item?.category || 'Unknown'
        case 'size': return item?.size || 'Unknown'
        default: return format(d, 'yyyy-MM-dd')
      }
    }

    filtered.forEach(row => {
      if (['item', 'brand', 'category', 'size'].includes(groupBy)) {
        row.items.forEach(item => {
          const key = getGroupKey(row, item)
          if (!groups[key]) groups[key] = { qty: 0, amount: 0, bills: new Set() }
          groups[key].qty += item.qty * (row.transactionType === 'RETURN' ? -1 : 1)
          groups[key].amount += item.amount * (row.transactionType === 'RETURN' ? -1 : 1)
          groups[key].bills.add(row.id)
        })
      } else {
        const key = getGroupKey(row)
        if (!groups[key]) groups[key] = { amount: 0, bills: new Set(), customers: new Set(), returns: 0, upi: 0, cash: 0, card: 0 }

        const amt = row.totalAmount
        groups[key].amount += amt
        groups[key].bills.add(row.id)
        if (row.customerId) groups[key].customers.add(row.customerId)

        if (row.transactionType === 'RETURN') {
          groups[key].returns += Math.abs(amt)
        } else {
          if (row.paymentMode === 'UPI') groups[key].upi += amt
          if (row.paymentMode === 'CASH') groups[key].cash += amt
          if (row.paymentMode === 'CARD') groups[key].card += amt
        }

        // ─── STORE METADATA FOR BILL WISE VIEW ───
        if (groupBy === 'bill') {
          if (!groups[key].date) groups[key].date = row.date
          if (!groups[key].paymentMode) groups[key].paymentMode = row.paymentMode
          if (!groups[key].customerId) groups[key].customerId = row.customerId
          if (!groups[key].billItems) groups[key].billItems = row.items
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
      upi: val.upi || 0,
      cash: val.cash || 0,
      card: val.card || 0,
      // Extra data for Bill Wise view
      date: val.date || null,
      paymentMode: val.paymentMode || null,
      customerId: val.customerId || null,
      billItems: val.billItems || null,
    })).sort((a, b) => {
      // Sort bills by newest first, others alphabetically
      if (groupBy === 'bill' && a.date && b.date) {
        return new Date(b.date) - new Date(a.date)
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
  }, [rawData, dateFrom, dateTo, groupBy, salesType, paymentMode])
    const handleExport = async () => {
    if (tableData.length === 0) return alert('No data to export')

    const exportData = tableData.map(row => ({
      [groupBy.toUpperCase()]: row.group,
      'Bills': row.bills,
      'Customers': row.customers,
      'Qty': row.qty,
      'Total Amount': row.amount,
      'Returns': row.returns,
      'UPI': row.upi,
      'Cash': row.cash,
      'Card': row.card,
    }))

    const ws = XLSX.utils.json_to_sheet(exportData)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Sales Report')

    // ─── Save File (Tauri + Browser) ───
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

  // ─── GUARD: NO COMPANY SELECTED ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view sales reports.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* ─── Header with Tab Toggle & Company Badge ─── */}
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
          {/* ─── COMPANY BADGE ─── */}
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
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-4">
        <div className="card p-4 border-l-4 border-blue-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Receipt className="w-3.5 h-3.5" /> Bills</div>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{summary.totalBills}</p>
        </div>
        <div className="card p-4 border-l-4 border-indigo-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><Users className="w-3.5 h-3.5" /> Customers</div>
          <p className="text-xl font-bold text-gray-900 dark:text-gray-100">{summary.totalCustomers}</p>
        </div>
        <div className="card p-4 border-l-4 border-orange-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1">
            <Users className="w-3.5 h-3.5" /> Non Bill Customer
          </div>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
            {summary.nonBillCustomers}
          </p>
        </div>
        <div className="card p-4 border-l-4 border-emerald-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><TrendingUp className="w-3.5 h-3.5" /> Total Sales</div>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">₹{summary.totalSales.toLocaleString()}</p>
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
        <div className="card p-4 border-l-4 border-red-500">
          <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 text-xs mb-1"><RotateCcw className="w-3.5 h-3.5" /> Returns</div>
          <p className="text-lg font-bold text-red-500 dark:text-red-400">₹{summary.totalReturns.toLocaleString()}</p>
        </div>
      </div>

      {/* ─── Filters & Grouping ─── */}
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
            </select>
          </div>
        </div>

        {/* Quick Date Presets */}
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

      {/* ─── Report Table & Top Selling ─── */}
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
                      <th className="p-3 text-right font-semibold text-gray-500">Amount ₹</th>
                    </>
                  ) : (
                    <>
                      <th className="p-3 text-left font-semibold text-gray-500">{groupBy.toUpperCase()}</th>
                      <th className="p-3 text-center font-semibold text-gray-500">Bills</th>
                      {!['item', 'brand', 'category', 'size'].includes(groupBy) && (
                        <>
                          <th className="p-3 text-center font-semibold text-gray-500">Cust.</th>
                          <th className="p-3 text-right font-semibold text-gray-500">UPI ₹</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Cash ₹</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Card ₹</th>
                          <th className="p-3 text-right font-semibold text-gray-500">Returns ₹</th>
                        </>
                      )}
                      {['item', 'brand', 'category', 'size'].includes(groupBy) && (
                        <th className="p-3 text-center font-semibold text-gray-500">Qty</th>
                      )}
                      <th className="p-3 text-right font-semibold text-gray-700">Net Amt ₹</th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {loading ? (
                  <tr><td colSpan={9} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" /></td></tr>
                ) : tableData.length === 0 ? (
                  <tr><td colSpan={9} className="text-center py-10 text-gray-400">No data found for selected filters</td></tr>
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
                          <td className="p-3 text-gray-600 dark:text-gray-400">{row.customerId || 'Walk-in'}</td>
                          <td className="p-3 text-center">
                            <span className={clsx("text-[10px] font-semibold px-2 py-0.5 rounded-full", 
                              row.paymentMode === 'UPI' ? "bg-green-50 text-green-700" : 
                              row.paymentMode === 'CARD' ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"
                            )}>
                              {row.paymentMode}
                            </span>
                          </td>
                          <td className="p-3 text-center text-gray-500">
                            {row.billItems?.length || 0} 
                            <span className="ml-1 text-gray-400">
                              {expandedBill === row.group ? '▲' : '▼'}
                            </span>
                          </td>
                          <td className={clsx("p-3 text-right font-bold", row.amount >= 0 ? "text-emerald-600" : "text-red-500")}>
                            ₹{Math.abs(row.amount).toLocaleString()}
                          </td>
                        </tr>
                        
                        {/* Expandable Items List */}
                        {expandedBill === row.group && row.billItems && (
                          <tr className="bg-gray-50 dark:bg-gray-800/30">
                            <td colSpan="6" className="p-0">
                              <div className="px-6 py-3 border-l-4 border-blue-400 ml-4">
                                <table className="w-full text-xs">
                                  <thead>
                                    <tr className="text-gray-400 border-b border-gray-200 dark:border-gray-700">
                                      <th className="text-left py-1 font-medium w-8">#</th>
                                      <th className="text-left py-1 font-medium">Product</th>
                                      <th className="text-center py-1 font-medium">Qty</th>
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
                                        <td className="text-right py-1.5">₹{(item.amount / (item.qty || 1)).toFixed(2)}</td>
                                        <td className="text-right py-1.5 font-medium">₹{item.amount.toFixed(2)}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    ) : (
                      /* Original Row Rendering for non-bill groupings */
                      <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="p-3 font-medium text-gray-800 dark:text-gray-200">{row.group}</td>
                        <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.bills}</td>
                        {!['item', 'brand', 'category', 'size'].includes(groupBy) && (
                          <>
                            <td className="p-3 text-center text-gray-600 dark:text-gray-400">{row.customers}</td>
                            <td className="p-3 text-right text-green-600 dark:text-green-400">₹{row.upi.toLocaleString()}</td>
                            <td className="p-3 text-right text-amber-600 dark:text-amber-400">₹{row.cash.toLocaleString()}</td>
                            <td className="p-3 text-right text-blue-500 dark:text-blue-400">₹{row.card.toLocaleString()}</td>
                            <td className="p-3 text-right text-red-500 dark:text-red-400">₹{row.returns.toLocaleString()}</td>
                          </>
                        )}
                        {['item', 'brand', 'category', 'size'].includes(groupBy) && (
                          <td className="p-3 text-center font-medium text-blue-600 dark:text-blue-400">{row.qty}</td>
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
                  <tr className="font-bold text-xs">
                    <td className="p-3 text-right text-gray-700 dark:text-gray-300">Grand Total</td>
                    <td className="p-3 text-center text-gray-700 dark:text-gray-300">{tableData.reduce((s, r) => s + r.bills, 0)}</td>
                    {!['item', 'brand', 'category', 'size'].includes(groupBy) && (
                      <>
                        <td className="p-3 text-center text-gray-700 dark:text-gray-300">{tableData.reduce((s, r) => s + r.customers, 0)}</td>
                        <td className="p-3 text-right text-green-600 dark:text-green-400">₹{tableData.reduce((s, r) => s + r.upi, 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-amber-600 dark:text-amber-400">₹{tableData.reduce((s, r) => s + r.cash, 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-blue-500 dark:text-blue-400">₹{tableData.reduce((s, r) => s + r.card, 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-red-500 dark:text-red-400">₹{tableData.reduce((s, r) => s + r.returns, 0).toLocaleString()}</td>
                      </>
                    )}
                    {['item', 'brand', 'category', 'size'].includes(groupBy) && (
                      <td className="p-3 text-center text-blue-600 dark:text-blue-400">{tableData.reduce((s, r) => s + r.qty, 0)}</td>
                    )}
                    <td className={clsx("p-3 text-right", tableData.reduce((s, r) => s + r.amount, 0) >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-red-500 dark:text-red-400")}>
                      ₹{Math.abs(tableData.reduce((s, r) => s + r.amount, 0)).toLocaleString()}
                    </td>
                  </tr>
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