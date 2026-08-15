import { useState, useEffect, Fragment } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2, Clock, Plus, ChevronDown, ChevronUp, Save, Loader2,
  ShieldCheck, Settings, Landmark, ArrowLeft, LayoutDashboard, AlertCircle, Edit3, Trash2, Target
} from 'lucide-react'

// Import the API functions
import { getCompanies, createCompany, updateCompany, deleteCompany } from '../apiservices/companyapi'

const EMPTY_COMPANY = {
  companyName: '',
  ownerName: '',
  email: '',
  phone: '',
  address: '',
  establishmentYear: '',
  exciseLicenseNo: '',
  tradeLicenseNo: '',
  exciseLicenseExpiry: '',
  exciseZone: '',
  gstin: '',
  pan: '',
  operatingHours: '10:00 AM - 10:30 PM',
  dryDaysPolicy: 'Closed on National Holidays & Election Days as per Govt. norms',
  defaultVat: 18,
  defaultCess: 0,
  defaultSpecial: 0,
  defaultTcs: 1,
  mgerTargetedValue: 0,  // ← ADD THIS
}

export default function Companies() {
  const [companies, setCompanies] = useState([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)

  const [currentCompany, setCurrentCompany] = useState(EMPTY_COMPANY)
  const [editingId, setEditingId] = useState(null) // Null = Create, Number = Update
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState(null)

  const navigate = useNavigate()

  useEffect(() => {
    fetchCompanies()
  }, [])

  const fetchCompanies = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getCompanies()
      setCompanies(data)
    } catch (err) {
      setError(err.message || 'Could not load companies.')
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (key, value) => {
    setCurrentCompany(prev => ({ ...prev, [key]: value }))
  }

  const handleOpenDashboard = (company) => {
    // 1. Store Company ID and Name separately for Inventory & other modules to read
    localStorage.setItem('selectedCompanyId', String(company.id))
    localStorage.setItem('selectedCompanyName', company.companyName)

    // 2. (Optional) Keep the full object stored as well if you use it elsewhere
    localStorage.setItem('selectedCompany', JSON.stringify(company))

    // 3. Navigate to the dashboard
    navigate(`/dashboard/${company.id}`)
  }

  const handleEdit = (company) => {
    setCurrentCompany(company)
    setEditingId(company.id)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' }) // Scroll to form
  }

  const handleCancelForm = () => {
    setShowForm(false)
    setEditingId(null)
    setCurrentCompany(EMPTY_COMPANY)
    setError('')
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!currentCompany.companyName) return alert('Please enter a Company Name')

    setSaving(true)
    setError('')

    try {
      if (editingId) {
        // UPDATE existing company
        const updated = await updateCompany(editingId, currentCompany)
        setCompanies(prev => prev.map(c => c.id === editingId ? updated : c))
      } else {
        // CREATE new company
        const newCompany = await createCompany(currentCompany)
        setCompanies(prev => [newCompany, ...prev])
        handleOpenDashboard(newCompany) // Auto-open dashboard for new companies
      }

      handleCancelForm() // Reset form state
    } catch (err) {
      setError(err.message || 'Failed to save company.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This action cannot be undone.`)) return

    try {
      await deleteCompany(id)
      setCompanies(prev => prev.filter(c => c.id !== id))
      if (expandedId === id) setExpandedId(null) // Close expanded row if deleted
    } catch (err) {
      alert(err.message || 'Failed to delete company.')
    }
  }

  const toggleExpand = (id) => {
    setExpandedId(expandedId === id ? null : id)
  }

  return (
    <div className="space-y-6">


      {/* Top Bar */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-4">
          {/* ─── BACK TO ADMIN DASHBOARD BUTTON ─── */}
          <button
            onClick={() => navigate('/admin-dashboard')}
            className="p-2 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-gray-200 dark:hover:bg-gray-800 transition-colors"
            title="Back to Admin Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Company Management</h2>
        </div>

        {!showForm && (
          <button onClick={() => { handleCancelForm(); setShowForm(true); }} className="btn-primary flex items-center gap-2">
            <Plus className="w-4 h-4" /> Add Company
          </button>
        )}
      </div>

      {/* Global Error Message */}
      {error && !showForm && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* CREATE / EDIT COMPANY PAGE */}
      {showForm && (
        <div className="space-y-6 max-w-5xl mx-auto">

          {/* Header / Hero Section */}
          <div className="relative bg-gradient-to-r from-slate-800 to-slate-900 dark:from-slate-900 dark:to-black rounded-xl p-6 text-white shadow-lg overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative flex flex-col md:flex-row justify-between items-start md:items-center gap-4 z-10">
              <div className="flex items-center gap-4">
                <div className={`w-16 h-16 rounded-xl flex items-center justify-center shadow-md ${editingId ? 'bg-blue-500' : 'bg-amber-500'}`}>
                  <Landmark className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight">
                    {editingId ? 'Edit Company Details' : 'New IMFL Off-Shop'}
                  </h1>
                  <p className="text-slate-300 text-sm mt-1">
                    {editingId ? 'Update the excise, compliance, and business details' : 'Fill in the excise, compliance, and business details'}
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleCancelForm}
                  className="flex items-center gap-2 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-lg text-sm font-medium transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Cancel
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${editingId ? 'bg-blue-500 hover:bg-blue-600' : 'bg-amber-500 hover:bg-amber-600'}`}
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {saving ? 'Saving...' : editingId ? 'Update Company' : 'Save Company'}
                </button>
              </div>
            </div>
          </div>

          {/* Form Error */}
          {error && showForm && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
              <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            </div>
          )}

          <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Column: Business Details */}
            <div className="lg:col-span-2 space-y-6">

              {/* Basic Information */}
              <div className="card p-6 border dark:border-slate-700 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-500" /> Business Information
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Name And Residence Of Licensee *</label>
                    <input type="text" required value={currentCompany.companyName} onChange={e => handleChange('companyName', e.target.value)} className="input-field" placeholder="e.g. Royal Spirits" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Owner Name *</label>
                    <input type="text" required value={currentCompany.ownerName} onChange={e => handleChange('ownerName', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Phone
                    </label>

                    <input
                      type="text"
                      value={currentCompany.phone}
                      maxLength={10}
                      onChange={e => {
                        const value = e.target.value.replace(/\D/g, ""); // only numbers
                        handleChange('phone', value);
                      }}
                      className="input-field"
                      placeholder="Enter 10 digit phone number"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Email</label>
                    <input type="email" value={currentCompany.email} onChange={e => handleChange('email', e.target.value)} className="input-field" />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Address</label>
                    <textarea rows="2" value={currentCompany.address} onChange={e => handleChange('address', e.target.value)} className="input-field" />
                  </div>
                </div>
              </div>

              {/* Excise & Compliance */}
              <div className="card p-6 border dark:border-slate-700 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-green-500" /> Excise & Compliance
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-y-4 gap-x-6">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Shop License Number *</label>
                    <input type="text" required value={currentCompany.exciseLicenseNo} onChange={e => handleChange('exciseLicenseNo', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Trade License Number</label>
                    <input type="text" value={currentCompany.tradeLicenseNo} onChange={e => handleChange('tradeLicenseNo', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">License Valid Till</label>
                    <input type="date" value={currentCompany.exciseLicenseExpiry} onChange={e => handleChange('exciseLicenseExpiry', e.target.value)} className="input-field" />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                      Excise Division
                    </label>

                    <select
                      value={currentCompany.exciseZone}
                      onChange={e => handleChange('exciseZone', e.target.value)}
                      className="input-field"
                    >
                      <option value="">Select Excise Division</option>

                      <option value="Northern Division (Sambalpur)">
                        Northern Division (Sambalpur)
                      </option>

                      <option value="Central Division (Cuttack)">
                        Central Division (Cuttack)
                      </option>

                      <option value="Southern Division (Berhampur)">
                        Southern Division (Berhampur)
                      </option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">PAN Number</label>
                    <input type="text" value={currentCompany.pan} onChange={e => handleChange('pan', e.target.value.toUpperCase())} className="input-field" />
                  </div>
                  <div >
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">VAT </label>
                    <input type="text" value={currentCompany.gstin} onChange={e => handleChange('gstin', e.target.value.toUpperCase())} className="input-field" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column: Settings & Operations */}
            <div className="space-y-6">

              <div className="card p-6 border dark:border-slate-700 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-purple-500" /> Store Operations
                </h3>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Operating Hours</label>
                    <input type="text" value={currentCompany.operatingHours} onChange={e => handleChange('operatingHours', e.target.value)} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Dry Days / Holiday Policy</label>
                    <textarea rows="2" value={currentCompany.dryDaysPolicy} onChange={e => handleChange('dryDaysPolicy', e.target.value)} className="input-field" />
                  </div>
                </div>
              </div>

              <div className="card p-6 border dark:border-slate-700 shadow-sm">
                <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-4 flex items-center gap-2">
                  <Settings className="w-5 h-5 text-orange-500" /> Default Taxes
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">Auto-applied on new purchases</p>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">VAT %</span>
                    <input type="number" value={currentCompany.defaultVat} onChange={e => handleChange('defaultVat', e.target.value)} className="w-20 input-field text-right text-sm py-1" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">CESS %</span>
                    <input type="number" value={currentCompany.defaultCess} onChange={e => handleChange('defaultCess', e.target.value)} className="w-20 input-field text-right text-sm py-1" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">Special %</span>
                    <input type="number" value={currentCompany.defaultSpecial} onChange={e => handleChange('defaultSpecial', e.target.value)} className="w-20 input-field text-right text-sm py-1" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">TCS %</span>
                    <input type="number" value={currentCompany.defaultTcs} onChange={e => handleChange('defaultTcs', e.target.value)} className="w-20 input-field text-right text-sm py-1" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-700 dark:text-gray-300">MGR Target (₹)</span>
                    <input type="number" value={currentCompany.mgerTargetedValue} onChange={e => handleChange('mgerTargetedValue', e.target.value)} className="w-20 input-field text-right text-sm py-1" />
                  </div>
                </div>

                
              </div>

              

              <button
                type="submit"
                disabled={saving}
                className={`w-full flex justify-center items-center gap-2 py-2.5 rounded-lg text-white font-semibold transition-all active:scale-95 shadow-md disabled:opacity-50 ${editingId ? 'bg-blue-600 hover:bg-blue-700' : 'bg-green-600 hover:bg-green-700'}`}
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : editingId ? 'Update Company' : 'Create Company'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* COMPANY LIST PAGE */}
      {!showForm && (
        <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-800/50">
                  <th className="table-header text-left">Company Name</th>
                  <th className="table-header text-left">Owner</th>
                  <th className="table-header text-left">Shop License</th>
                  <th className="table-header text-left">Trade License</th>
                  <th className="table-header text-left">VAT</th>
                  <th className="table-header text-center">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10">
                      <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />
                    </td>
                  </tr>
                ) : companies.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-sm text-gray-400">
                      No companies added yet. Click "Add Company" to create one.
                    </td>
                  </tr>
                ) : (
                  companies.map(c => (
                    <Fragment key={c.id}>
                      <tr className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                        <td className="table-cell font-semibold">
                          <button
                            onClick={() => handleOpenDashboard(c)}
                            className="flex items-center gap-2 group text-left"
                          >
                            <Landmark className="w-4 h-4 text-amber-500 flex-shrink-0" />
                            <span className="group-hover:text-amber-500 dark:group-hover:text-amber-400 transition-colors">
                              {c.companyName}
                            </span>
                            <LayoutDashboard className="w-3.5 h-3.5 text-gray-300 group-hover:text-amber-500 transition-colors" title="Open Dashboard" />
                          </button>
                        </td>
                        <td className="table-cell">{c.ownerName}</td>
                        <td className="table-cell font-mono text-xs">{c.exciseLicenseNo}</td>
                        <td className="table-cell font-mono text-xs"> {c.tradeLicenseNo || 'N/A'}</td>
                        <td className="table-cell font-mono text-xs">{c.gstin}</td>
                        <td className="table-cell text-center">
                          <button
                            onClick={() => toggleExpand(c.id)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors"
                          >
                            {expandedId === c.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </td>
                      </tr>

                      {expandedId === c.id && (
                        <tr className="bg-gray-50/50 dark:bg-gray-800/20">
                          <td colSpan={5} className="px-6 py-4">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-sm">
                              <div className="space-y-2">
                                <h4 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1"><ShieldCheck className="w-4 h-4 text-green-500" /> Compliance</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">License Expiry: <span className="text-gray-900 dark:text-white font-medium">{c.exciseLicenseExpiry || 'N/A'}</span></p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Excise Zone: <span className="text-gray-900 dark:text-white font-medium">{c.exciseZone || 'N/A'}</span></p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">PAN: <span className="text-gray-900 dark:text-white font-medium">{c.pan || 'N/A'}</span></p>
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1"><Clock className="w-4 h-4 text-purple-500" /> Operations</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Hours: <span className="text-gray-900 dark:text-white font-medium">{c.operatingHours}</span></p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Dry Days: <span className="text-gray-900 dark:text-white font-medium">{c.dryDaysPolicy}</span></p>
                              </div>
                              <div className="space-y-2">
                                <h4 className="font-bold text-gray-700 dark:text-gray-200 flex items-center gap-1"><Settings className="w-4 h-4 text-orange-500" /> Default Taxes</h4>
                                <p className="text-xs text-gray-500 dark:text-gray-400">VAT: <span className="text-gray-900 dark:text-white font-medium">{c.defaultVat}%</span></p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">CESS: <span className="text-gray-900 dark:text-white font-medium">{c.defaultCess}%</span></p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">Special: <span className="text-gray-900 dark:text-white font-medium">{c.defaultSpecial}%</span></p>
                               
                               <p className="text-xs text-gray-500 dark:text-gray-400">TCS: <span className="text-gray-900 dark:text-white font-medium">{c.defaultTcs}%</span></p>
                               <p className="text-xs text-gray-500 dark:text-gray-400">
  MGER Target:
  <span className="text-gray-900 dark:text-white font-medium">
    {" "}
    {c.mgerTargetedValue}
  </span>
</p>
                              </div>
                            </div>

                            {/* Action Buttons */}
                            <div className="mt-4 pt-3 border-t dark:border-gray-700 flex items-center gap-4">
                              <button
                                onClick={() => handleOpenDashboard(c)}
                                className="flex items-center gap-2 text-sm font-medium text-amber-600 hover:text-amber-700 dark:text-amber-400 dark:hover:text-amber-300 transition-colors"
                              >
                                <LayoutDashboard className="w-4 h-4" /> Open Dashboard
                              </button>

                              <button
                                onClick={() => handleEdit(c)}
                                className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 transition-colors"
                              >
                                <Edit3 className="w-4 h-4" /> Edit Details
                              </button>

                              <button
                                onClick={() => handleDelete(c.id, c.companyName)}
                                className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 transition-colors"
                              >
                                <Trash2 className="w-4 h-4" /> Delete
                              </button>
                            </div>

                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}