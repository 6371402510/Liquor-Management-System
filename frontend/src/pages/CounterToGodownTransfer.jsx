import { useState, useEffect, useRef } from 'react'
import { Plus, X, Loader as Loader2, Trash2, Save, Search, Warehouse, AlertCircle, Store, ArrowUpCircle } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'

import { createCounterToGodownTransfer, getCounterToGodownTransfers } from '../apiservices/counterToGodownTransferApi'
import { searchProducts } from '../apiservices/inventoryapi'

function generateTransferNumber() {
  const d = format(new Date(), 'yyyyMMdd')
  return `CTG-${d}-${Math.floor(1000 + Math.random() * 9000)}`
}

export default function CounterToGodownTransfer() {
  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Form State
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const dropdownRef = useRef(null)
  const productInputRef = useRef(null)
  const qtyInputRef = useRef(null)

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [transferQty, setTransferQty] = useState(1)
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')

  useEffect(() => {
    if (companyId) fetchTransfers()
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

  const fetchTransfers = async () => {
    setLoading(true)
    try {
      const data = await getCounterToGodownTransfers(Number(companyId))
      setTransfers(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

 const handleSearchChange = async (val) => {
  setSearchQuery(val)

  if (val.length < 2) {
    setSearchResults([])
    setShowDropdown(false)
    setSelectedProduct(null)
    return
  }

  setIsSearching(true)

  try {
    const results = await searchProducts(val, companyId)
    const availableResults = results.filter(
      p => (p.godown_stock || 0) > 0
    )

    setSearchResults(availableResults)

    // Barcode scanned -> Auto Select
    if (availableResults.length === 1) {
      const product = availableResults[0]

      setSelectedProduct(product)
      setSearchQuery(`${product.name} (${product.barcode || product.item_code})`)
      setTransferQty(1)
      setShowDropdown(false)

      setTimeout(() => {
        qtyInputRef.current?.focus()
        qtyInputRef.current?.select()
      }, 50)
    } else {
      // Manual search by name
      setSelectedProduct(null)
      setShowDropdown(availableResults.length > 0)
    }
  } catch (err) {
    console.error(err)
  } finally {
    setIsSearching(false)
  }
}
  const selectProduct = (product) => {
  setSelectedProduct(product)
  setSearchQuery(`${product.name} (${product.barcode || product.item_code})`)
  setTransferQty(1)
  setShowDropdown(false)

  setTimeout(() => {
    qtyInputRef.current?.focus()
    qtyInputRef.current?.select()
  }, 50)
}

  const addToTransferList = () => {
    if (!selectedProduct) return alert('Please select a product')
    if (transferQty <= 0) return alert('Quantity must be greater than 0')
    
    // ─── CHECK COUNTER STOCK ───
    if (transferQty > selectedProduct.counter_stock) {
      return alert(`Only ${selectedProduct.counter_stock} available in counter`)
    }

    const exists = items.find(i => i.product_id === selectedProduct.id)
    if (exists) return alert('Product already added to the list. Remove it first to change quantity.')

    setItems(prev => [...prev, {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      quantity: Number(transferQty),
      available: selectedProduct.counter_stock // ─── Show counter stock
    }])

    setSelectedProduct(null)
setSearchQuery("")
setSearchResults([])
setShowDropdown(false)
setTransferQty(1)

setTimeout(() => {
  productInputRef.current?.focus()
  productInputRef.current?.select()
}, 100)
  }

  const removeItem = (index) => {
    setItems(prev => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (items.length === 0) return alert('Add at least one item to transfer')

    setSaving(true)
    setError('')

    const payload = {
      transfer_number: generateTransferNumber(),
      company_id: Number(companyId),
      notes,
      items: items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        company_id: Number(companyId)
      }))
    }

    try {
      await createCounterToGodownTransfer(payload)
      setShowForm(false)
      setItems([])
      setNotes('')
      setSearchQuery('')
      fetchTransfers()
    } catch (err) {
      setError(err.message || 'Failed to transfer stock')
    } finally {
      setSaving(false)
    }
  }

  const totalItems = items.reduce((sum, item) => sum + item.quantity, 0)

  // ─── GUARD: NO COMPANY SELECTED ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view and create stock transfers.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Counter to Godown Transfer</h2>
          {/* ─── COMPANY BADGE ─── */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
            <Store className="w-3.5 h-3.5 text-blue-500" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-300">{companyName}</span>
          </div>
        </div>
        <button 
          onClick={() => setShowForm(s => !s)} 
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-lg font-semibold transition-all",
            showForm 
              ? "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600" 
              : "bg-blue-600 text-white hover:bg-blue-700 active:scale-95 shadow-md"
          )}
        >
          {showForm ? <X className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
          {showForm ? "Cancel" : "New Return"}
        </button>
      </div>

      {/* Transfer Direction Indicator */}
      <div className="flex items-center justify-center gap-4 p-3 bg-gradient-to-r from-blue-50 via-purple-50 to-amber-50 dark:from-blue-900/10 dark:via-purple-900/10 dark:to-amber-900/10 rounded-xl border border-blue-100 dark:border-blue-800/50">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Store className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">Counter</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-8 h-0.5 bg-blue-300 dark:bg-blue-700" />
          <ArrowUpCircle className="w-5 h-5 text-blue-500 dark:text-blue-400" />
          <div className="w-8 h-0.5 bg-blue-300 dark:bg-blue-700" />
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
            <Warehouse className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          </div>
          <span className="text-sm font-semibold text-amber-700 dark:text-amber-300">Godown</span>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Create Form */}
      {showForm && (
        <div className="card p-6 border dark:border-slate-700 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
              <ArrowUpCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Return to Godown</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">Select products to return from counter to godown</p>
            </div>
          </div>
          
          {/* Search & Quantity Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-blue-50/50 dark:bg-blue-900/10 rounded-lg border border-blue-100 dark:border-blue-800/30">
            <div className="relative md:col-span-2" ref={dropdownRef}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Search Counter Product
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input 
                  ref={productInputRef}
                  type="text" 
                  placeholder="Type barcode or product name..." 
                  value={searchQuery} 
                  onChange={e => handleSearchChange(e.target.value)} 
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && selectedProduct) {
                      qtyInputRef.current?.focus()
                    }
                  }}
                  className="input-field pl-8" 
                />
                {isSearching && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                )}
              </div>
              
              {showDropdown && (
                <div className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map(p => (
                    <button 
                      key={p.id} 
                      type="button" 
                      onMouseDown={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-xs flex justify-between items-center transition-colors"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        {p.name} ({p.barcode || p.item_code})
                      </span>
                      <span className="text-blue-600 dark:text-blue-400 font-semibold">
                        Counter: {p.counter_stock}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Qty to Return
              </label>
              <div className="flex gap-2">
                <input
  ref={qtyInputRef}
  type="number"
  min="1"
  max={selectedProduct?.godown_stock || 1}
  value={transferQty}
  onChange={(e) => setTransferQty(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      e.preventDefault()

      addToTransferList()

      setTimeout(() => {
        productInputRef.current?.focus()
        productInputRef.current?.select()
      }, 100)
    }
  }}
  className="input-field"
  disabled={!selectedProduct}
/>
                <button 
                  type="button" 
                  onClick={addToTransferList} 
                  className="bg-blue-600 hover:bg-blue-700 text-white px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed" 
                  disabled={!selectedProduct}
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Selected Product Info */}
          {selectedProduct && (
            <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800/30">
              <div className="flex-1">
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200">{selectedProduct.name}</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">Code: {selectedProduct.barcode || selectedProduct.item_code}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500 dark:text-gray-400">Available in Counter</p>
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{selectedProduct.counter_stock}</p>
              </div>
            </div>
          )}

          {/* Items Table */}
          {items.length > 0 && (
            <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-blue-50 dark:bg-blue-900/20">
                  <tr>
                    <th className="p-3 text-left font-semibold text-blue-800 dark:text-blue-300">Product</th>
                    <th className="p-3 text-center font-semibold text-blue-800 dark:text-blue-300">Counter Stock</th>
                    <th className="p-3 text-center font-semibold text-blue-800 dark:text-blue-300">Return Qty</th>
                    <th className="p-3 text-center font-semibold text-blue-800 dark:text-blue-300">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item, i) => (
                    <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                      <td className="p-3 font-medium">{item.product_name}</td>
                      <td className="p-3 text-center text-gray-500">{item.available}</td>
                      <td className="p-3 text-center">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                          {item.quantity}
                        </span>
                      </td>
                      <td className="p-3 text-center">
                        <button 
                          type="button" 
                          onClick={() => removeItem(i)} 
                          className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-1.5 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-gray-50 dark:bg-gray-800/50">
                  <tr>
                    <td colSpan={2} className="p-3 text-right font-semibold text-gray-700 dark:text-gray-300">
                      Total Items to Return:
                    </td>
                    <td className="p-3 text-center">
                      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-bold bg-blue-600 text-white">
                        {totalItems}
                      </span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          {/* Notes & Submit */}
          <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
            <div className="w-full sm:w-1/2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Reason / Notes (Optional)
              </label>
              <textarea 
                value={notes} 
                onChange={e => setNotes(e.target.value)} 
                placeholder="e.g. Closing excess stock, damaged items, end of day return..." 
                className="input-field resize-none" 
                rows="2" 
              />
            </div>
            
            <button 
              type="button" 
              onClick={handleSubmit} 
              disabled={saving || items.length === 0} 
              className={clsx(
                "w-full sm:w-80 flex justify-center items-center gap-2 py-3 rounded-xl text-white font-semibold transition-all",
                saving || items.length === 0 
                  ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed" 
                  : "bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 active:scale-95 shadow-lg shadow-blue-500/25"
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUpCircle className="w-4 h-4" />}
              {saving ? "Processing..." : `Return ${totalItems} Items to Godown`}
            </button>
          </div>
        </div>
      )}

      {/* Transfer History List */}
      <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
        <div className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-b border-blue-100 dark:border-blue-800/30">
          <h3 className="text-sm font-semibold text-blue-800 dark:text-blue-300">Return History</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="table-header text-left">Return No.</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Notes</th>
                <th className="table-header text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr>
                  <td colSpan={4} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-blue-500 mx-auto" />
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center py-10">
                    <div className="flex flex-col items-center gap-2">
                      <ArrowUpCircle className="w-10 h-10 text-gray-300 dark:text-gray-600" />
                      <p className="text-sm text-gray-400">No returns yet</p>
                      <p className="text-xs text-gray-400">Click "New Return" to get started</p>
                    </div>
                  </td>
                </tr>
              ) : transfers.map(t => (
                <tr key={t.id} className="hover:bg-blue-50/50 dark:hover:bg-blue-900/10 transition-colors">
                  <td className="table-cell font-mono text-xs text-blue-600 dark:text-blue-400">{t.transfer_number}</td>
                  <td className="table-cell text-gray-500">{format(new Date(t.transfer_date), 'dd MMM yyyy hh:mm a')}</td>
                  <td className="table-cell text-sm max-w-xs truncate">{t.notes || '-'}</td>
                  <td className="table-cell text-center">
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}