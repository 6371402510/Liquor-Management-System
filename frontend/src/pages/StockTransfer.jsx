import { useState, useEffect, useRef } from 'react'
import { Plus, X, Loader as Loader2, Trash2, Save, Search, Warehouse, AlertCircle, Store } from 'lucide-react'
import { format } from 'date-fns'
import clsx from 'clsx'

import { createStockTransfer, getStockTransfers } from '../apiservices/stockTransferapi'
import { searchProducts } from '../apiservices/inventoryapi'

function generateTransferNumber() {
  const d = format(new Date(), 'yyyyMMdd')
  return `ST-${d}-${Math.floor(1000 + Math.random() * 9000)}`
}

export default function StockTransfer() {
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
      // ─── PASS COMPANY ID ───
      const data = await getStockTransfers(Number(companyId))
      setTransfers(data || [])
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleSearchChange = async (val) => {
    setSearchQuery(val)
    setSelectedProduct(null)
    if (val.length > 1) {
      setIsSearching(true)
      try {
        const results = await searchProducts(val, companyId)
        const availableResults = results.filter(p => (p.godown_stock || 0) > 0)
        setSearchResults(availableResults)
        setShowDropdown(availableResults.length > 0)
      } catch (err) {
        console.error(err)
      } finally {
        setIsSearching(false)
      }
    } else {
      setSearchResults([])
      setShowDropdown(false)
    }
  }

  const selectProduct = (product) => {
    setSelectedProduct(product)
    setSearchQuery(`${product.name} (${product.barcode || product.item_code})`)
    setShowDropdown(false)
    setTransferQty(1)
  }

  const addToTransferList = () => {
    if (!selectedProduct) return alert('Please select a product')
    if (transferQty <= 0) return alert('Quantity must be greater than 0')
    if (transferQty > selectedProduct.godown_stock) return alert(`Only ${selectedProduct.godown_stock} available in godown`)

    const exists = items.find(i => i.product_id === selectedProduct.id)
    if (exists) return alert('Product already added to the list. Remove it first to change quantity.')

    setItems(prev => [...prev, {
      product_id: selectedProduct.id,
      product_name: selectedProduct.name,
      quantity: Number(transferQty),
      available: selectedProduct.godown_stock
    }])

    setSelectedProduct(null)
    setSearchQuery('')
    setTransferQty(1)
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
      company_id: Number(companyId), // ─── INJECT COMPANY ID ───
      notes,
      items: items.map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        quantity: item.quantity,
        company_id: Number(companyId) // ─── INJECT COMPANY ID ───
      }))
    }

    try {
      await createStockTransfer(payload)
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
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Godown to Counter Transfer</h2>
          {/* ─── COMPANY BADGE ─── */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <button onClick={() => setShowForm(s => !s)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Transfer
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {showForm && (
        <div className="card p-6 border dark:border-slate-700 shadow-sm space-y-6">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Create Transfer Slip</h3>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <div className="relative md:col-span-2" ref={dropdownRef}>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Search Godown Product</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input 
                  ref={productInputRef}
                  type="text" 
                  placeholder="Type barcode or product name..." 
                  value={searchQuery} 
                  onChange={e => handleSearchChange(e.target.value)} 
                  onKeyDown={(e) => {
  if(e.key === "Enter" && selectedProduct){
    qtyInputRef.current?.focus()
  }
}}
                  className="input-field pl-8" 
                />
                {isSearching && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />}
              </div>
              
              {showDropdown && (
                <div className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map(p => (
                    <button 
                      key={p.id} 
                      type="button" 
                      onMouseDown={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 text-xs flex justify-between items-center"
                    >
                      <span className="font-medium text-gray-900 dark:text-gray-100">{p.name} ({p.barcode || p.item_code})</span>
                      <span className="text-amber-600 dark:text-amber-400 font-semibold">Godown: {p.godown_stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Qty to Transfer</label>
              <div className="flex gap-2">
                <input 
                 ref={qtyInputRef}
                  type="number" 
                  min="1" 
                  max={selectedProduct?.godown_stock || 1}
                  value={transferQty} 
                  onChange={e => setTransferQty(e.target.value)} 
                  onKeyDown={(e)=>{
    if(e.key==="Enter"){
      addToTransferList()

      setTimeout(()=>{
        productInputRef.current?.focus()
      },100)
    }
  }}
                  className="input-field" 
                  disabled={!selectedProduct}
                />
                <button type="button" onClick={addToTransferList} className="btn-primary px-4" disabled={!selectedProduct}>
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {items.length > 0 && (
            <div className="overflow-x-auto border dark:border-slate-700 rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="p-2 text-left font-semibold">Product</th>
                    <th className="p-2 text-center font-semibold">Available (Godown)</th>
                    <th className="p-2 text-center font-semibold">Transfer Qty</th>
                    <th className="p-2 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td className="p-2 font-medium">{item.product_name}</td>
                      <td className="p-2 text-center text-gray-500">{item.available}</td>
                      <td className="p-2 text-center font-bold text-amber-600">{item.quantity}</td>
                      <td className="p-2 text-center">
                        <button type="button" onClick={() => removeItem(i)} className="text-red-500 hover:text-red-700">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-end gap-4">
            <div className="w-full sm:w-1/2">
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes (Optional)</label>
              <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Restocking for weekend" className="input-field resize-none" rows="1" />
            </div>
            
            <button 
              type="button" 
              onClick={handleSubmit} 
              disabled={saving || items.length === 0} 
              className={clsx(
                "w-full sm:w-72 flex justify-center items-center gap-2 py-2.5 rounded-lg text-white font-semibold transition-all",
                saving || items.length === 0 ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 active:scale-95 shadow-md"
              )}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />}
              {saving ? "Transferring..." : `Confirm Transfer (${totalItems} Items)`}
            </button>
          </div>
        </div>
      )}

      {/* Transfer History List */}
      <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
                <th className="table-header text-left">Transfer No.</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">Notes</th>
                <th className="table-header text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={4} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
              ) : transfers.length === 0 ? (
                <tr><td colSpan={4} className="text-center py-10 text-sm text-gray-400">No transfers yet</td></tr>
              ) : transfers.map(t => (
                <tr key={t.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30">
                  <td className="table-cell font-mono text-xs">{t.transfer_number}</td>
                  <td className="table-cell text-gray-500">{format(new Date(t.transfer_date), 'dd MMM yyyy hh:mm a')}</td>
                  <td className="table-cell text-sm">{t.notes || '-'}</td>
                  <td className="table-cell text-center"><span className="badge-success">{t.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}