import { useState, useEffect } from 'react'
import { getExpenses, createExpense, updateExpense, deleteExpense } from '../apiservices/expensesapi'
import { getEmployees } from '../apiservices/employeeapi'
import { getCategories, createCategory as apiCreateCategory, deleteCategory as apiDeleteCategory } from '../apiservices/expensesapi'
import { getMonthlyReport } from '../apiservices/attendanceapi'
import { Plus, Search, CreditCard as Edit2, Trash2, X, Loader as Loader2, IndianRupee, Clock, CheckCircle, XCircle, Receipt, CalendarDays, ChevronUp, ChevronDown, AlertCircle, Store } from 'lucide-react'
import clsx from 'clsx'

const PAYMENT_METHODS = ['CASH', 'UPI', 'BANK_TRANSFER', 'CARD', 'CHEQUE']

const emptyForm = {
  expense_date: new Date().toISOString().slice(0, 10),
  category: '',
  category_id: null, 
  amount: '',
  payment_method: 'CASH',
  description: '',
  employee_name: '',
  designation: '',   
  receipt_number: '',
}

export default function Expenses() {
  // ─── COMPANY ID FROM LOCAL STORAGE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [expenses, setExpenses] = useState([])
  const [employees, setEmployees] = useState([])
  const [categories, setCategories] = useState([]) 
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [calculatingSalary, setCalculatingSalary] = useState(false)
  
  // Filters
  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('ALL')
  
  const [startDate, setStartDate] = useState(() => new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 10))
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10))
  
  const [showModal, setShowModal] = useState(false)
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  
  const [sortField, setSortField] = useState('expense_date')
  const [sortDir, setSortDir] = useState('desc')

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

  // ─── Fetch data when company or date range changes ───
  useEffect(() => {
    if (!companyId) {
      setExpenses([])
      setCategories([])
      setLoading(false)
      return
    }
    fetchExpenses()
    fetchEmployees()
    fetchCategories()
  }, [startDate, endDate, companyId])

  const fetchExpenses = async () => {
    setLoading(true)
    setError('')
    try {
      const data = await getExpenses(Number(companyId), startDate, endDate)
      setExpenses(data || [])
    } catch (err) {
      setError(err.message || 'Failed to load expenses')
    } finally {
      setLoading(false)
    }
  }

  const fetchEmployees = async () => {
    try {
      const data = await getEmployees(Number(companyId))
      setEmployees(data || [])
    } catch (err) {
      console.error('Failed to load employees', err)
    }
  }

  const fetchCategories = async () => {
    try {
      const data = await getCategories(Number(companyId))
      setCategories(data || [])
    } catch (err) {
      console.error('Failed to load categories', err)
    }
  }

  const handleAddCategory = async () => {
    const val = form.category.trim().toUpperCase().replace(/\s+/g, '_')
    if (!val) return
    
    if (categories.some(c => c.name === val)) {
      alert('Category already exists')
      return
    }

    try {
      const newCat = await apiCreateCategory(val, Number(companyId))
      setCategories([...categories, newCat])
      setForm(prev => ({ ...prev, category: newCat.name, category_id: newCat.id }))
      setShowCategoryDropdown(false)
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to add category')
    }
  }

  const handleRemoveCategory = async (id, name) => {
    if (!confirm(`Delete category "${name}"?`)) return

    try {
      await apiDeleteCategory(id, Number(companyId))
      const newCats = categories.filter(c => c.id !== id)
      setCategories(newCats)
      if (form.category === name) {
        setForm(prev => ({ ...prev, category: '' }))
      }
    } catch (err) {
      alert(err.response?.data?.detail || 'Failed to delete category')
    }
  }

  const openAdd = () => {
    setForm(emptyForm)
    setEditingId(null)
    setError('')
    setShowModal(true)
  }

  const openEdit = (expense) => {
    setForm({
      expense_date: expense.expense_date || '',
      category: expense.category || '',
      category_id: expense.category_id || null,  // ← ADDED
      amount: expense.amount || '',
      payment_method: expense.payment_method || 'CASH',
      description: expense.description || '',
      employee_name: expense.employee_name || '',
      designation: expense.designation || '',
      receipt_number: expense.receipt_number || '',
    })
    setEditingId(expense.id)
    setError('')
    setShowModal(true)
  }

  const calculateSalary = async (empId, dateStr) => {
    if (!empId || !dateStr) return;
    
    setCalculatingSalary(true);
    try {
      const month = dateStr.slice(0, 7);
      const reportData = await getMonthlyReport(month, Number(companyId));
      const attRecord = reportData.find(r => r.employee_id === empId);
      
      const emp = employees.find(e => e.id === empId);
      const baseSalary = emp?.salary || 0;
      
      // Inside calculateSalary, when setting SALARY_PAYOUT:
if (baseSalary > 0) {
  const workingDays = attRecord ? attRecord.total_working_days : 0;
  const calculatedAmount = (baseSalary / 30) * workingDays;

  // Find the SALARY_PAYOUT category ID
  const salaryCat = categories.find(c => c.name === 'SALARY_PAYOUT');

  setForm(prev => ({
    ...prev,
    amount: calculatedAmount.toFixed(2),
    category: prev.category || 'SALARY_PAYOUT',
    category_id: salaryCat ? salaryCat.id : prev.category_id,  // ← ADDED
  }));
}
    } catch (err) {
      console.error("Could not calculate salary automatically", err);
    } finally {
      setCalculatingSalary(false);
    }
  };

  const handleEmployeeNameChange = async (e) => {
    const name = e.target.value;
    setForm(prev => ({ ...prev, employee_name: name, amount: '' }));

    const selectedEmp = employees.find(emp => `${emp.first_name} ${emp.last_name}` === name);
    if (selectedEmp) {
      setForm(prev => ({ ...prev, designation: selectedEmp.designation || '' }));
      await calculateSalary(selectedEmp.id, form.expense_date);
    } else {
      setForm(prev => ({ ...prev, designation: '' }));
    }
  };

  const handleDateChange = async (e) => {
    const newDate = e.target.value;
    setForm(prev => ({ ...prev, expense_date: newDate }));

    const selectedEmp = employees.find(emp => `${emp.first_name} ${emp.last_name}` === form.employee_name);
    if (selectedEmp) {
      await calculateSalary(selectedEmp.id, newDate);
    }
  };

 const handleSave = async (e) => {
  e.preventDefault()
  setSaving(true)
  setError('')

  if (!form.category_id) {
    setError('Please select a valid category')
    setSaving(false)
    return
  }

  const payload = {
    expense_date: form.expense_date,
    category_id: form.category_id,    // ← SEND category_id
    amount: Number(form.amount) || 0,
    payment_method: form.payment_method,
    description: form.description || null,
    employee_name: form.employee_name || null,
    designation: form.designation || null,
    receipt_number: form.receipt_number || null,
    company_id: Number(companyId),
  }

  try {
    if (editingId) {
      await updateExpense(editingId, payload, Number(companyId))
    } else {
      await createExpense(payload)
    }
    setShowModal(false)
    fetchExpenses()
  } catch (err) {
    setError(err.message || 'Failed to save expense')
  } finally {
    setSaving(false)
  }
}

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this expense record?')) return
    try {
      await deleteExpense(id, Number(companyId))
      fetchExpenses()
    } catch (err) {
      alert(err.message || 'Failed to delete expense')
    }
  }

  const handleSort = (field) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') } 
    else { setSortField(field); setSortDir('desc') }
  }

  const summaryStats = expenses.reduce((acc, e) => {
    acc.totalAmount += e.amount || 0
    return acc
  }, { totalAmount: 0 })

  const filtered = expenses.filter(e => {
    const q = search.toLowerCase()
    const matchSearch = !q || 
      (e.description || '').toLowerCase().includes(q) || 
      (e.employee_name || '').toLowerCase().includes(q) || 
      (e.designation || '').toLowerCase().includes(q) || 
      (e.receipt_number || '').toLowerCase().includes(q)
    const matchCat = categoryFilter === 'ALL' || e.category === categoryFilter
    return matchSearch && matchCat
  })

  const sorted = [...filtered].sort((a, b) => {
    let av = a[sortField], bv = b[sortField]
    if (sortField === 'amount') { av = Number(av); bv = Number(bv) }
    if (typeof av === 'string') av = av.toLowerCase()
    if (typeof bv === 'string') bv = bv.toLowerCase()
    return sortDir === 'asc' ? (av > bv ? 1 : -1) : (av < bv ? 1 : -1)
  })

  const SortIcon = ({ field }) => (
    sortField === field
      ? (sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)
      : <ChevronUp className="w-3 h-3 opacity-30" />
  )

  const formatCurrency = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

  const categoryOptions = categories.filter(c => 
    c.name.toLowerCase().includes(form.category.toLowerCase()) || !form.category
  )

  // ─── GUARD: NO COMPANY SELECTED ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to manage expenses.</p>
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
              placeholder="Search description, Employee, designation..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="input-field pl-8 w-64"
            />
          </div>
          <select value={categoryFilter} onChange={e => setCategoryFilter(e.target.value)} className="input-field w-44">
            <option value="ALL">All Categories</option>
            {categories.map(c => <option key={c.id} value={c.name}>{c.name.replace(/_/g, ' ')}</option>)}
          </select>
          {/* ─── COMPANY BADGE ─── */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
        <button onClick={openAdd} className="btn-primary">
          <Plus className="w-4 h-4" /> Add Expense
        </button>
      </div>

      {/* Error Alert */}
      {error && !showModal && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {/* Date Range & Summary bar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        <div className="card p-4 lg:col-span-1 flex flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
            <CalendarDays className="w-4 h-4 text-primary-500" /> Date Range
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">From</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="input-field" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">To</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="input-field" />
          </div>
        </div>

        <div className="lg:col-span-3 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Expenses</span>
              <IndianRupee className="w-5 h-5 text-blue-500" />
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{formatCurrency(summaryStats.totalAmount)}</p>
            <p className="text-xs text-gray-400 mt-1">For selected period</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                {[
                  { label: 'Date', field: 'expense_date' },
                  { label: 'Category', field: 'category' },
                  { label: 'Description', field: 'description' },
                  { label: 'Employee', field: 'employee_name' },
                  { label: 'Designation', field: 'designation' },
                  { label: 'Payment', field: 'payment_method' },
                  { label: 'Amount (₹)', field: 'amount' },
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
                <tr><td colSpan={8} className="text-center py-10 text-sm text-gray-400">No expenses found for the selected period</td></tr>
              ) : sorted.map(e => (
                <tr key={e.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="table-cell text-sm font-medium text-gray-800 dark:text-gray-200">{e.expense_date}</td>
                  <td className="table-cell"><span className="badge-info">{(e.category || '').replace(/_/g, ' ')}</span></td>
                  <td className="table-cell">
                    <p className="text-sm text-gray-800 dark:text-gray-200">{e.description || '—'}</p>
                    <p className="text-xs text-gray-400">Receipt: {e.receipt_number || 'N/A'}</p>
                  </td>
                  <td className="table-cell text-sm text-gray-600 dark:text-gray-300">{e.employee_name || '—'}</td>
                  <td className="table-cell text-sm text-gray-500 dark:text-gray-400">{e.designation || '—'}</td>
                  <td className="table-cell text-xs text-gray-500">{(e.payment_method || '').replace('_', ' ')}</td>
                  <td className="table-cell text-sm font-semibold text-gray-900 dark:text-white">₹{Number(e.amount).toLocaleString('en-IN')}</td>
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
            {!loading && sorted.length > 0 && (
              <tfoot className="bg-gray-50 dark:bg-gray-800/30 border-t-2 border-gray-200 dark:border-gray-700">
                <tr>
                  <td colSpan={7} className="px-4 py-3 text-sm font-bold text-gray-700 dark:text-gray-200 text-right">Total:</td>
                  <td className="px-4 py-3 text-sm font-bold text-primary-600 dark:text-primary-400 text-right">
                    ₹{sorted.reduce((sum, e) => sum + (Number(e.amount) || 0), 0).toLocaleString('en-IN')}
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white dark:bg-gray-900 px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between z-10">
              <h3 className="text-base font-semibold text-gray-800 dark:text-gray-100">
                {editingId ? 'Edit Expense' : 'Record Expense'}
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

            <form onSubmit={handleSave} className="p-6 space-y-6">
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Expense Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Expense Date *</label>
                    <input required type="date" value={form.expense_date} onChange={handleDateChange} className="input-field" />
                  </div>
                  
                  <div className="relative z-20">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Category *</label>
                    <div className="flex gap-1">
                      <input 
                        required
                        type="text" 
                        value={form.category}
                        onChange={e => setForm(f => ({ ...f, category: e.target.value, category_id: null }))}
                        onFocus={() => setShowCategoryDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCategoryDropdown(false), 200)} 
                        placeholder="Type or select..."
                        className="input-field flex-1"
                        autoComplete="off"
                      />
                      <button 
                        type="button"
                        onClick={handleAddCategory} 
                        className="px-3 rounded-lg bg-primary-50 text-primary-600 hover:bg-primary-100 border border-primary-200 dark:border-gray-700 dark:bg-gray-800 dark:text-primary-400 transition-colors"
                        title="Add new category"
                      >
                        <Plus className="w-4 h-4" />
                      </button>
                    </div>

                    {showCategoryDropdown && (
                      <div className="absolute top-full left-0 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-48 overflow-y-auto z-50">
                        {categoryOptions.length > 0 ? categoryOptions.map(c => (
                          <div 
                            key={c.id} 
                            className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer group"
                            onMouseDown={() => setForm(f => ({ ...f, category: c.name, category_id: c.id }))}
                          >
                            <span className="text-sm text-gray-700 dark:text-gray-200">{c.name.replace(/_/g, ' ')}</span>
                            <button 
                              type="button"
                              onClick={(e) => { e.stopPropagation(); handleRemoveCategory(c.id, c.name); }}
                              className="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity p-1"
                              title="Remove category"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        )) : (
                          <div className="px-3 py-2 text-sm text-gray-500 italic">No matching categories</div>
                        )}
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Amount (₹) *</label>
                    <div className="relative">
                      <input 
                        required 
                        type="number" 
                        min="0" 
                        step="0.01" 
                        value={form.amount} 
                        onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} 
                        className="input-field text-lg font-semibold pr-10" 
                        placeholder="0.00" 
                      />
                      {calculatingSalary && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary-500" />
                        </div>
                      )}
                    </div>
                    {form.employee_name && form.amount && !calculatingSalary && (
                      <p className="text-[10px] text-gray-400 mt-1">Auto-calculated from attendance</p>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Payment Method *</label>
                    <select required value={form.payment_method} onChange={e => setForm(f => ({ ...f, payment_method: e.target.value }))} className="input-field">
                      {PAYMENT_METHODS.map(p => <option key={p} value={p}>{p.replace('_', ' ')}</option>)}
                    </select>
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Description</label>
                    <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} className="input-field" rows={2} placeholder="Brief details about the expense" />
                  </div>
                </div>
              </div>
              
              <div>
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-4 border-b pb-2">Employee & Reference</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-3">
                  
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Employee Name</label>
                    <input 
                      type="text"
                      list="employee-options"
                      value={form.employee_name}
                      onChange={handleEmployeeNameChange}
                      className="input-field"
                      placeholder="Type or select employee"
                      autoComplete="off"
                    />
                    <datalist id="employee-options">
                      {employees.map(emp => (
                        <option key={emp.id} value={`${emp.first_name} ${emp.last_name}`} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Designation</label>
                    <input 
                      value={form.designation} 
                      onChange={e => setForm(f => ({ ...f, designation: e.target.value }))} 
                      className="input-field" 
                      placeholder="e.g., Cashier, Vendor"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Receipt / Bill No.</label>
                    <div className="relative">
                      <Receipt className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <input value={form.receipt_number} onChange={e => setForm(f => ({ ...f, receipt_number: e.target.value }))} className="input-field pl-8 font-mono" placeholder="Optional" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200 dark:border-gray-700">
                <button type="button" onClick={() => setShowModal(false)} className="btn-secondary flex-1 justify-center">Cancel</button>
                <button type="submit" disabled={saving || calculatingSalary} className="btn-primary flex-1 justify-center">
                  {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                  {saving ? 'Saving...' : editingId ? 'Update Expense' : 'Record Expense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}