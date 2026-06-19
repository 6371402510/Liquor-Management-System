import { useState, useEffect } from 'react'
import { Plus, Search, CreditCard as Edit2, Trash2, X, Loader as Loader2, Users, UserCheck, UserX, ChevronUp, ChevronDown, AlertCircle, Store } from 'lucide-react'
import clsx from 'clsx'

import { getEmployees, createEmployee, updateEmployee, deleteEmployee } from '../apiservices/employeeapi'

const DEPARTMENTS = ['SALES', 'WAREHOUSE', 'ACCOUNTS', 'MANAGEMENT', 'OTHER']
const DESIGNATIONS = ['MANAGER', 'CASHIER', 'SALES_EXECUTIVE', 'STOCK_KEEPER', 'ACCOUNTANT', 'SUPERVISOR']
const SYSTEM_ROLES = ['ADMIN', 'MANAGER', 'CASHIER', 'STAFF']
const GENDERS = ['MALE', 'FEMALE', 'OTHER']
const EMPLOYEE_STATUSES = ['ACTIVE', 'INACTIVE', 'ON_LEAVE']

const emptyForm = {
  employee_code: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  gender: 'MALE',
  date_of_birth: '',
  department: 'SALES',
  designation: 'CASHIER',
  date_of_joining: '',
  system_role: 'STAFF',
  status: 'ACTIVE',
  salary: '',
  pan_number: '',
  adhaar_number: '',
  bank_account: '',
  ifsc_code: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
}

export default function Employees() {
  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('ALL')

  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [sortField, setSortField] = useState('first_name')
  const [sortDir, setSortDir] = useState('asc')

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

  // ─── Fetch when company changes ───
  useEffect(() => {
    if (!companyId) {
      setEmployees([])
      setLoading(false)
      return
    }
    fetchEmployees()
  }, [companyId])

  const fetchEmployees = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getEmployees(Number(companyId))
      setEmployees(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load employees')
    } finally {
      setLoading(false)
    }
  }

  const generateEmployeeCode = () => {
    const prefix = 'EMP'
    const timestamp = Date.now().toString().slice(-4)
    const random = Math.floor(Math.random() * 100).toString().padStart(2, '0')
    return `${prefix}${timestamp}${random}`
  }

  const openAdd = () => {
    setForm({ ...emptyForm, employee_code: generateEmployeeCode() })
    setEditingId(null)
    setError('')
    setShowModal(true)
  }

  const openEdit = (employee) => {
    setForm({
      employee_code: employee.employee_code || '',
      first_name: employee.first_name || '',
      last_name: employee.last_name || '',
      email: employee.email || '',
      phone: employee.phone || '',
      gender: employee.gender || 'MALE',
      date_of_birth: employee.date_of_birth || '',
      department: employee.department || 'SALES',
      designation: employee.designation || 'CASHIER',
      date_of_joining: employee.date_of_joining || '',
      system_role: employee.system_role || 'STAFF',
      status: employee.status || 'ACTIVE',
      salary: employee.salary || '',
      pan_number: employee.pan_number || '',
      adhaar_number: employee.adhaar_number || '',
      bank_account: employee.bank_account || '',
      ifsc_code: employee.ifsc_code || '',
      address: employee.address || '',
      city: employee.city || '',
      state: employee.state || '',
      pincode: employee.pincode || '',
    })
    setEditingId(employee.id)
    setError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setError('')

    const payload = {
      ...form,
      company_id: Number(companyId),  // ← ADDED
      salary: Number(form.salary) || 0,
    }

    try {
      if (editingId) {
        await updateEmployee(editingId, payload, Number(companyId))
      } else {
        await createEmployee(payload)
      }
      setShowModal(false)
      fetchEmployees()
    } catch (err) {
      setError(err.message || 'Failed to save employee')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this employee record?')) return
    try {
      await deleteEmployee(id, Number(companyId))
      fetchEmployees()
    } catch (err) {
      alert(err.message || 'Failed to delete employee')
    }
  }

  const handleSort = (field) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDir('asc') }
  }

  const sorted = [...employees]
    .filter(e => {
      const q = search.toLowerCase()
      const matchSearch = !q || e.first_name.toLowerCase().includes(q) || e.last_name.toLowerCase().includes(q) || (e.employee_code || '').toLowerCase().includes(q) || (e.phone || '').includes(q)
      const matchDept = departmentFilter === 'ALL' || e.department === departmentFilter
      return matchSearch && matchDept
    })
    .sort((a, b) => {
      let av = a[sortField], bv = b[sortField]
      if (typeof av === 'string') av = av.toLowerCase()
      if (typeof bv === 'string') bv = bv.toLowerCase()
      return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
    })

  const SortIcon = ({ field }) => (
    sortField === field
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
      : <ChevronUp className="w-3 h-3 opacity-30" />
  )

  const activeCount = employees.filter(e => e.status === 'ACTIVE').length
  const inactiveCount = employees.filter(e => e.status !== 'ACTIVE').length

  // ─── GUARD: NO COMPANY SELECTED ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to manage employees.</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex flex-wrap gap-2 flex-1 items-center">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search name, code, or phone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-8 w-64"
            />
          </div>
          <select
            value={departmentFilter}
            onChange={e => setDepartmentFilter(e.target.value)}
            className="input-field w-40"
          >
            <option value="ALL">All Departments</option>
            {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
          </select>
          {/* ─── COMPANY BADGE ─── */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Employee
        </button>
      </div>

      {/* Summary bar */}
      <div className="flex gap-3">
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{employees.length} Total</span>
        </div>
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <UserCheck className="w-4 h-4 text-emerald-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{activeCount} Active</span>
        </div>
        <div className="card px-4 py-2.5 flex items-center gap-2">
          <UserX className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{inactiveCount} Inactive/Leave</span>
        </div>
      </div>

      {/* Error Message */}
      {error && !showModal && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {[
                  { label: 'Employee', field: 'first_name' },
                  { label: 'Code', field: 'employee_code' },
                  { label: 'Department', field: 'department' },
                  { label: 'Designation', field: 'designation' },
                  { label: 'Phone', field: 'phone' },
                  { label: 'System Role', field: 'system_role' },
                  { label: 'Status', field: 'status' },
                ].map(({ label, field }) => (
                  <th
                    key={field}
                    onClick={() => handleSort(field)}
                    className="table-header text-left cursor-pointer hover:text-gray-700 dark:hover:text-gray-200 select-none"
                  >
                    <span className="flex items-center gap-1">{label} <SortIcon field={field} /></span>
                  </th>
                ))}
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan={8} className="text-center py-10"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
              ) : sorted.length === 0 ? (
                <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">No employees found</td></tr>
              ) : sorted.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-xs">
                        {e.first_name?.charAt(0)}{e.last_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{e.first_name} {e.last_name}</p>
                        <p className="text-xs text-gray-400">{e.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell font-mono text-xs text-gray-500">{e.employee_code || '—'}</td>
                  <td className="table-cell"><span className="badge-info">{e.department}</span></td>
                  <td className="table-cell text-sm text-gray-600 dark:text-gray-300">{e.designation}</td>
                  <td className="table-cell text-sm text-gray-600 dark:text-gray-300">{e.phone || '—'}</td>
                  <td className="table-cell">
                    <span className={clsx(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      e.system_role === 'ADMIN' ? 'bg-purple-50 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'
                    )}>
                      {e.system_role}
                    </span>
                  </td>
                  <td className="table-cell">
                    <span className={clsx(
                      'text-xs font-medium px-2 py-0.5 rounded-full',
                      e.status === 'ACTIVE' ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400' :
                        e.status === 'ON_LEAVE' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400' :
                          'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                    )}>
                      {e.status.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => openEdit(e)} className="p-1.5 rounded-lg text-gray-400 hover:text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/20 transition-colors">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDelete(e.id)} className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {editingId ? 'Edit Employee' : 'Add Employee'}
              </h3>
              <button onClick={() => setShowModal(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800">
                <X className="w-4 h-4" />
              </button>
            </div>

            {error && showModal && (
              <div className="mx-6 mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            <form onSubmit={handleSave} className="p-6 space-y-8">

              {/* ── 1. Personal Details ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Personal Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Employee Code *</label>
                    <input required value={form.employee_code} onChange={e => setForm(f => ({ ...f, employee_code: e.target.value }))} className="input-field font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">First Name *</label>
                    <input required value={form.first_name} onChange={e => setForm(f => ({ ...f, first_name: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Last Name *</label>
                    <input required value={form.last_name} onChange={e => setForm(f => ({ ...f, last_name: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Email</label>
                    <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone *</label>
                    <input required type="tel" maxLength={10} pattern="[0-9]{10}" value={form.phone} onChange={e => {
                      const value = e.target.value.replace(/\D/g, '')
                        if (value.length <= 10) {
                        setForm(f => ({ ...f, phone: value }))
                      }
                    }}
                      className="input-field"
                      placeholder="Enter 10 digit phone number"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Gender</label>
                    <select value={form.gender} onChange={e => setForm(f => ({ ...f, gender: e.target.value }))} className="input-field">
                      {GENDERS.map(g => <option key={g}>{g}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date of Birth</label>
                    <input type="date" value={form.date_of_birth} onChange={e => setForm(f => ({ ...f, date_of_birth: e.target.value }))} className="input-field" />
                  </div>
                </div>
              </div>

              {/* ── 2. Job & System Access ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Job & System Access</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Department *</label>
                    <select required value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} className="input-field">
                      {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Designation *</label>
                    <select required value={form.designation} onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} className="input-field">
                      {DESIGNATIONS.map(d => <option key={d}>{d}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date of Joining *</label>
                    <input required type="date" value={form.date_of_joining} onChange={e => setForm(f => ({ ...f, date_of_joining: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">System Role *</label>
                    <select required value={form.system_role} onChange={e => setForm(f => ({ ...f, system_role: e.target.value }))} className="input-field">
                      {SYSTEM_ROLES.map(r => <option key={r}>{r}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Status *</label>
                    <select required value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className="input-field">
                      {EMPLOYEE_STATUSES.map(s => <option key={s}>{s.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* ── 3. Compensation & Compliance ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Compensation & Compliance</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Monthly Salary (₹)</label>
                    <input type="number" min="0" step="0.01" value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">PAN Number</label>
                    <input value={form.pan_number} onChange={e => setForm(f => ({ ...f, pan_number: e.target.value.toUpperCase() }))} className="input-field font-mono uppercase" maxLength={10} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Adhaar Number</label>
                    <input value={form.adhaar_number} onChange={e => setForm(f => ({ ...f, adhaar_number: e.target.value }))} className="input-field font-mono" maxLength={12} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Bank Account No.</label>
                    <input value={form.bank_account} onChange={e => setForm(f => ({ ...f, bank_account: e.target.value }))} className="input-field font-mono" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">IFSC Code</label>
                    <input value={form.ifsc_code} onChange={e => setForm(f => ({ ...f, ifsc_code: e.target.value.toUpperCase() }))} className="input-field font-mono uppercase" maxLength={11} />
                  </div>
                </div>
              </div>

              {/* ── 4. Address ── */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Address</h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-4 gap-y-3">
                  <div className="md:col-span-3">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Address</label>
                    <textarea value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} className="input-field" rows={2} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">City</label>
                    <input value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">State</label>
                    <input value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className="input-field" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Pincode</label>
                    <input value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value }))} className="input-field" />
                  </div>
                </div>
              </div>

              {/* ── Form Actions ── */}
              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving...' : editingId ? 'Update Employee' : 'Add Employee'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}