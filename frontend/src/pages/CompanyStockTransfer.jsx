import { useState, useEffect, useRef } from 'react'
import {
  Plus, X, Loader2, Trash2, Search, Warehouse, AlertCircle,
  Store, ArrowRight, Building2,
} from 'lucide-react'
import clsx from 'clsx'

import { 
  getCompanyTransfers, 
  createCompanyTransfer, 
  getCompanyTransferItems 
} from '../apiservices/companyTransferapi'
import { searchProducts } from '../apiservices/inventoryapi'
import { getCompanies } from '../apiservices/companyapi' // adjust path

const SIZE_BOTTLES_MAP = {
  '90ml': 96, '180ml': 48, '200ml': 24, '250ml': 36, '275ml': 24, '300ml': 30,
  '330ml': 30, '375ml': 24, '500ml': 24, '650ml': 12, '750ml': 12,
  '1000ml': 9, '2000ml': 6,
}

export default function CompanyStockTransfer() {
  const [fromCompanyId, setFromCompanyId] = useState(
    () => localStorage.getItem('selectedCompanyId') || null
  )
  const [toCompanyId, setToCompanyId] = useState('')
  const [companies, setCompanies] = useState([])
  const [transfers, setTransfers] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const dropdownRef = useRef(null)

  const [selectedProduct, setSelectedProduct] = useState(null)
  const [transferCases, setTransferCases] = useState(0)
  const [transferQty, setTransferQty] = useState(0)
  const [bottlesPerCase, setBottlesPerCase] = useState(0)
  const [items, setItems] = useState([])
  const [notes, setNotes] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')

const handleFromCompanyChange = (newFromId) => {
  setFromCompanyId(newFromId)

  // Persist selection
  if (newFromId) {
    localStorage.setItem('selectedCompanyId', newFromId)
    const match = companies.find((c) => Number(c.id) === Number(newFromId))
    if (match) {
      localStorage.setItem('selectedCompanyName', match.companyName)
    }
  } else {
    localStorage.removeItem('selectedCompanyId')
    localStorage.removeItem('selectedCompanyName')
  }

  // Reset destination if it equals new source
  if (Number(newFromId) === Number(toCompanyId)) {
    setToCompanyId('')
  }

  // Reset transfer items (they belong to previous source company's stock)
  setItems([])
  setSelectedProduct(null)
  setSearchQuery('')
  setTransferCases(0)
  setTransferQty(0)
  setBottlesPerCase(0)
  setError('')
}

  const loadCompanies = async () => {
  try {
    const data = await getCompanies()

    let list = []
    if (Array.isArray(data)) list = data
    else if (Array.isArray(data?.companies)) list = data.companies
    else if (Array.isArray(data?.data)) list = data.data
    else if (Array.isArray(data?.items)) list = data.items

    setCompanies(list)

    // Only auto-set fromCompanyId if not already set
    if (!fromCompanyId && list.length > 0) {
      const stored = localStorage.getItem('selectedCompanyId')
      const match = list.find((c) => Number(c.id) === Number(stored))
      if (match) {
        setFromCompanyId(String(match.id))
      }
      // else: leave empty, let user pick from dropdown
    }
  } catch (err) {
    console.error('❌ loadCompanies failed:', err)
    setError('Failed to load companies: ' + (err?.message || err))
  }
}
  useEffect(() => {
    loadCompanies()
  }, [])

  useEffect(() => {
    if (fromCompanyId) fetchTransfers()
  }, [fromCompanyId])

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])


  const fetchTransfers = async () => {
    setLoading(true)
    try {
      const data = await getCompanyTransfers(Number(fromCompanyId))
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
        const results = await searchProducts(val, fromCompanyId)
        const available = results.filter((p) => (p.godown_stock || 0) > 0)
        setSearchResults(available)
        if (available.length === 1) selectProduct(available[0])
        else setShowDropdown(available.length > 0)
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
    const bpc = product.bottles_per_case || SIZE_BOTTLES_MAP[product.bottle_size] || 0
    setSelectedProduct(product)
    setSearchQuery(`${product.name} (${product.barcode || product.item_code})`)
    setShowDropdown(false)
    setBottlesPerCase(bpc)
    setTransferCases(0)
    setTransferQty(0)
  }

  const handleCasesChange = (val) => {
    const cases = Number(val) || 0
    setTransferCases(cases)
    if (cases > 0 && bottlesPerCase > 0) setTransferQty(cases * bottlesPerCase)
    else setTransferQty(0)
  }

  const addToTransferList = () => {
    if (!selectedProduct) return alert('Please select a product')
    if (transferQty <= 0) return alert('Quantity must be greater than 0')
    if (transferQty > selectedProduct.godown_stock)
      return alert(`Only ${selectedProduct.godown_stock} available in godown`)

    if (items.find((i) => i.product_id === selectedProduct.id))
      return alert('Product already added. Remove it first to change quantity.')

    setItems((prev) => [
      ...prev,
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        bottle_size: selectedProduct.bottle_size || '',
        bottles_per_case: bottlesPerCase,
        cases: transferCases,
        quantity: Number(transferQty),
        available: selectedProduct.godown_stock,
      },
    ])

    setSelectedProduct(null)
    setSearchQuery('')
    setTransferCases(0)
    setTransferQty(0)
    setBottlesPerCase(0)
  }

  const removeItem = (i) => setItems((prev) => prev.filter((_, idx) => idx !== i))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!toCompanyId) return alert('Please select destination company')
    if (Number(toCompanyId) === Number(fromCompanyId))
      return alert('Source and destination companies must be different')
    if (items.length === 0) return alert('Add at least one item')

    setSaving(true)
    setError('')
    try {
      await createCompanyTransfer({
        from_company_id: Number(fromCompanyId),
        to_company_id: Number(toCompanyId),
        notes,
        vehicle_number: vehicleNumber,
        items: items.map((i) => ({
          product_id: i.product_id,
          quantity: i.quantity,
          cases: i.cases,
          bottles_per_case: i.bottles_per_case,
        })),
      })
      setShowForm(false)
      setItems([])
      setNotes('')
      setVehicleNumber('')
      setToCompanyId('')
      fetchTransfers()
      alert('✅ Stock transferred successfully!')
    } catch (err) {
      setError(err.message || 'Transfer failed')
    } finally {
      setSaving(false)
    }
  }

  const totalBottles = items.reduce((s, i) => s + i.quantity, 0)
  const totalCases = items.reduce((s, i) => s + (i.cases || 0), 0)

  if (!fromCompanyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold">No Company Selected</h3>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">
            Company-to-Company Transfer
          </h2>
        </div>
        <button onClick={() => setShowForm((s) => !s)} className="btn-primary flex items-center gap-2">
          <Plus className="w-4 h-4" /> New Transfer
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 border border-red-200">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {showForm && (
        <div className="card p-6 border shadow-sm space-y-6">
          <h3 className="text-lg font-bold">Create Transfer Slip</h3>

          {/* ─── COMPANY SELECTOR ─── */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg items-end">
           <div className="md:col-span-5">
  <label className="block text-xs font-medium mb-1 flex items-center gap-1">
    <Building2 className="w-3 h-3 text-blue-500" /> From Company (Source Godown)
  </label>
  <select
    value={fromCompanyId || ''}
    onChange={(e) => handleFromCompanyChange(e.target.value)}
    className="input-field"
  >
    <option value="">-- Select source company --</option>
    {companies.length === 0 ? (
      <option value="">⚠️ Loading companies...</option>
    ) : (
      companies.map((c) => (
        <option key={c.id} value={c.id}>
          {c.companyName}
        </option>
      ))
    )}
  </select>
</div>
            <div className="md:col-span-2 flex justify-center">
              <ArrowRight className="w-6 h-6 text-primary-500" />
            </div>
            <div className="md:col-span-5">
              <label className="block text-xs font-medium mb-1 flex items-center gap-1">
                <Store className="w-3 h-3 text-emerald-500" /> To Company (Destination Godown)
              </label>
             <select
  value={toCompanyId}
  onChange={(e) => setToCompanyId(e.target.value)}
  className="input-field"
>
  <option value="">-- Select destination company --</option>
  {companies.length === 0 ? (
    <option value="">⚠️ Loading companies...</option>
  ) : companies.filter((c) => Number(c.id) !== Number(fromCompanyId)).length === 0 ? (
    <option value="">No other companies available</option>
  ) : (
    companies
      .filter((c) => Number(c.id) !== Number(fromCompanyId))
      .map((c) => (
        <option key={c.id} value={c.id}>
          {c.companyName}
        </option>
      ))
  )}
</select>
            </div>
          </div>

          {/* ─── PRODUCT SEARCH ─── */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg">
            <div className="relative md:col-span-5" ref={dropdownRef}>
              <label className="block text-xs font-medium mb-1">Search Godown Product</label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Type barcode or product name..."
                  value={searchQuery}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="input-field pl-8"
                />
                {isSearching && (
                  <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                )}
              </div>

              {showDropdown && (
                <div className="absolute z-30 w-full mt-1 bg-white dark:bg-gray-800 border rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {searchResults.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onMouseDown={() => selectProduct(p)}
                      className="w-full text-left px-3 py-2 hover:bg-gray-100 text-xs flex justify-between"
                    >
                      <span className="font-medium">
                        {p.name} ({p.barcode || p.item_code}){' '}
                        <span className="text-gray-400 ml-1">{p.bottle_size || ''}</span>
                      </span>
                      <span className="text-amber-600 font-semibold">Godown: {p.godown_stock}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium mb-1">Cases</label>
              <input
                type="number"
                min="0"
                value={transferCases || ''}
                onChange={(e) => handleCasesChange(e.target.value)}
                className="input-field text-center"
                disabled={!selectedProduct}
              />
            </div>

            <div className="md:col-span-1">
              <label className="block text-xs font-medium mb-1">BPC</label>
              <input
                type="text"
                value={bottlesPerCase || '-'}
                disabled
                className="input-field text-center bg-gray-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-medium mb-1">Total Bottles</label>
              <input
                type="number"
                min="0"
                value={transferQty || ''}
                onChange={(e) => setTransferQty(Number(e.target.value) || 0)}
                className="input-field text-center"
                disabled={!selectedProduct}
              />
            </div>

            <div className="md:col-span-2 flex items-end">
              <button
                type="button"
                onClick={addToTransferList}
                disabled={!selectedProduct}
                className="btn-primary w-full"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>

          {selectedProduct && (
            <div className="flex items-center gap-4 p-3 bg-amber-50 rounded-lg border border-amber-100 text-xs">
              <div className="flex-1">
                <p className="font-semibold">{selectedProduct.name}</p>
                <p className="text-gray-500">
                  {selectedProduct.barcode || selectedProduct.item_code} ·{' '}
                  {selectedProduct.bottle_size}
                </p>
              </div>
              <div className="text-right">
                <p className="text-gray-500">Available in source godown</p>
                <p className="text-lg font-bold text-amber-600">{selectedProduct.godown_stock}</p>
              </div>
            </div>
          )}

          {items.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-slate-100 dark:bg-slate-800">
                  <tr>
                    <th className="p-2 text-left">Product</th>
                    <th className="p-2 text-left">Size</th>
                    <th className="p-2 text-center">BPC</th>
                    <th className="p-2 text-center">Cases</th>
                    <th className="p-2 text-center">Bottles</th>
                    <th className="p-2 text-center">Available</th>
                    <th className="p-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {items.map((item, i) => (
                    <tr key={i}>
                      <td className="p-2 font-medium">{item.product_name}</td>
                      <td className="p-2 text-xs text-gray-500">{item.bottle_size}</td>
                      <td className="p-2 text-center">{item.bottles_per_case}</td>
                      <td className="p-2 text-center text-blue-600">{item.cases}</td>
                      <td className="p-2 text-center font-bold text-amber-600">{item.quantity}</td>
                      <td className="p-2 text-center text-gray-500">{item.available}</td>
                      <td className="p-2 text-center">
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="bg-slate-50 font-semibold text-xs">
                  <tr>
                    <td colSpan={3} className="p-2 text-right">Total</td>
                    <td className="p-2 text-center text-blue-700">{totalCases}</td>
                    <td className="p-2 text-center text-amber-700">{totalBottles}</td>
                    <td colSpan={2}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium mb-1">Vehicle Number</label>
              <input
                value={vehicleNumber}
                onChange={(e) => setVehicleNumber(e.target.value)}
                className="input-field"
                placeholder="e.g. KA-01-AB-1234"
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="input-field resize-none"
                rows="1"
              />
            </div>
          </div>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={saving || items.length === 0 || !toCompanyId}
            className={clsx(
              'w-full flex justify-center items-center gap-2 py-2.5 rounded-lg text-white font-semibold',
              saving || items.length === 0 || !toCompanyId
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-green-600 hover:bg-green-700'
            )}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Warehouse className="w-4 h-4" />}
            {saving ? 'Transferring...' : `Confirm Transfer (${totalCases} Cases / ${totalBottles} Bottles)`}
          </button>
        </div>
      )}

      {/* ─── HISTORY ─── */}
      <div className="card overflow-hidden border">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 dark:bg-slate-800/50 border-b">
              <tr>
                <th className="table-header text-left">Transfer No.</th>
                <th className="table-header text-left">Date</th>
                <th className="table-header text-left">From</th>
                <th className="table-header text-left">To</th>
                <th className="table-header text-center">Bottles</th>
                <th className="table-header text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loading ? (
                <tr>
                  <td colSpan={6} className="text-center py-10">
                    <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />
                  </td>
                </tr>
              ) : transfers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-10 text-sm text-gray-400">
                    No transfers yet
                  </td>
                </tr>
              ) : (
                transfers.map((t) => (
                  <tr key={t.id} className="hover:bg-gray-50/50">
                    <td className="table-cell font-mono text-xs">{t.transfer_number}</td>
                    <td className="table-cell text-gray-500 text-xs">
                      {new Date(t.transfer_date).toLocaleString()}
                    </td>
                    <td className="table-cell text-sm">
                      {t.from_company_name}{' '}
                      {t.from_company_id === Number(fromCompanyId) && (
                        <span className="badge-info ml-1">You</span>
                      )}
                    </td>
                    <td className="table-cell text-sm">
                      {t.to_company_name}{' '}
                      {t.to_company_id === Number(fromCompanyId) && (
                        <span className="badge-success ml-1">You</span>
                      )}
                    </td>
                    <td className="table-cell text-center font-semibold">{t.total_bottles}</td>
                    <td className="table-cell text-center">
                      <span className="badge-success">{t.status}</span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}