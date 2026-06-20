import { useState, useEffect } from 'react'
import { Plus, CreditCard as Edit2, Trash2, X, Loader as Loader2, Search, Truck, Phone, Mail, AlertCircle } from 'lucide-react'
import { getSuppliers, updateSupplier, deleteSupplier } from '../apiservices/supplierapi'
import { fetchSuppliersSafe } from './supplierHelper'
// Import API functions
// import { getSuppliers, createSupplier, updateSupplier, deleteSupplier } from '../apiservices/supplierapi'
// const defaultSupplier = {
//   name: 'Odisha State Beverages Corporation Limited',
//   contact_person: '',
//   phone: '0674 2303972',
//   email: 'contact.osbcl-od@nic.in',
//   address: `2nd Floor, Fortune Towers, Chandrasekharpur,
// Bhubaneswar-751023 (Odisha)`,
//   gst_number: '',
//   license_number: '',
// }
const emptyForm = {
  name: '', contact_person: '', phone: '', email: '',
  address: '', gst_number: '', license_number: '',
}

export default function Suppliers() {
  const [suppliers, setSuppliers] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('') // Added error state

  useEffect(() => { fetchSuppliers() }, [])

//  const fetchSuppliers = async () => {
//   setLoading(true)
//   setError('')

//   try {
//     let data = await getSuppliers()

//     // Check if the default supplier already exists by NAME, not just array length
//     const defaultExists = (data || []).some(s => s.name === defaultSupplier.name)

//     if (!defaultExists) {
//       // Fetch one more time to avoid race condition with another tab/page
//       const recheck = await getSuppliers()
//       const recheckExists = (recheck || []).some(s => s.name === defaultSupplier.name)

//       if (!recheckExists) {
//         // Safe to create - we've double-checked and it truly doesn't exist
//         const created = await createSupplier(defaultSupplier)
//         data = recheck?.length ? [...recheck, created] : [created]
//       } else {
//         data = recheck || []
//       }
//     }

//     setSuppliers(data || [])

//   } catch (err) {
//     setError(err.message || 'Failed to load suppliers')
//   } finally {
//     setLoading(false)
//   }
// }

const fetchSuppliers = async () => {
  setLoading(true)
  setError('')
  try {
    const data = await fetchSuppliersSafe()
    setSuppliers(data || [])
  } catch (err) {
    setError(err.message || 'Failed to load suppliers')
  } finally {
    setLoading(false)
  }
}
  const openAdd = () => { 
    setForm(emptyForm); 
    setEditingId(null); 
    setError(''); 
    setShowModal(true); 
  }
  
  const openEdit = (s) => {
    setForm({ 
      name: s.name || '', 
      contact_person: s.contact_person || '', 
      phone: s.phone || '',
      email: s.email || '', 
      address: s.address || '', 
      gst_number: s.gst_number || '', 
      license_number: s.license_number || '' 
    })
    setEditingId(s.id)
    setError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')
    
    try {
      if (editingId) {
        await updateSupplier(editingId, form)
      } else {
        await createSupplier(form)
      }
      setShowModal(false)
      fetchSuppliers() // Refresh list
    } catch (err) {
      setError(err.message || 'Failed to save supplier')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this supplier?')) return
    try {
      await deleteSupplier(id)
      fetchSuppliers() // Refresh list
    } catch (err) {
      alert(err.message || 'Failed to delete supplier')
    }
  }

  const filtered = suppliers.filter(s => {
    const q = search.toLowerCase()
    return !q || s.name.toLowerCase().includes(q) || (s.phone || '').includes(q) || (s.gst_number || '').toLowerCase().includes(q)
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-3 items-center justify-between">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
          <input
            type="text"
            placeholder="Search suppliers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-field pl-8 w-64"
          />
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Supplier
        </button>
      </div>

      {/* Error Message for Fetching */}
      {error && !showModal && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.length === 0 ? (
            <div className="col-span-full text-center py-12 text-gray-400">
              <Truck className="w-10 h-10 mx-auto mb-2 opacity-30" />
              <p>No suppliers found</p>
            </div>
          ) : filtered.map(s => (
            <div key={s.id} className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between mb-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="flex gap-1">
                  <button onClick={() => openEdit(s)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="font-semibold text-gray-800 dark:text-gray-200 mb-1">{s.name}</h3>
              {s.contact_person && <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">{s.contact_person}</p>}

              <div className="space-y-1.5">
                {s.phone && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Phone className="w-3 h-3 flex-shrink-0" />
                    <span>{s.phone}</span>
                  </div>
                )}
                {s.email && (
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <Mail className="w-3 h-3 flex-shrink-0" />
                    <span className="truncate">{s.email}</span>
                  </div>
                )}
              </div>

              <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-800 flex flex-wrap gap-2">
                {s.gst_number && (
                  <span className="badge-info text-[10px]">GSTIN/VAT: {s.gst_number}</span>
                )}
                {s.license_number && (
                  <span className="badge-success text-[10px]">Lic: {s.license_number}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {editingId ? 'Edit Supplier' : 'Add Supplier'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Error Message for Modal */}
            {error && showModal && (
              <div className="mx-6 mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {[
                { label: 'Company Name *', key: 'name', required: true },
                { label: 'Contact Person', key: 'contact_person' },
                { label: 'Phone', key: 'phone', type: 'tel' },
                { label: 'Email', key: 'email', type: 'email' },
                { label: 'GSTIN/VAT', key: 'gst_number' },
                { label: 'License Number', key: 'license_number' },
              ].map(({ label, key, required, type = 'text' }) => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">{label}</label>
                  <input
                    required={required}
                    type={type}
                    value={form[key]}
                    onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                    className="input-field"
                  />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Address</label>
                <textarea
                  rows={2}
                  value={form.address}
                  onChange={e => setForm(f => ({ ...f, address: e.target.value }))}
                  className="input-field resize-none"
                />
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving...' : editingId ? 'Update' : 'Add'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}