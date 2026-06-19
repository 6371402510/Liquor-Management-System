import { useState, useEffect } from 'react'
import { getEmployees } from '../apiservices/employeeapi'
import { getMonthlyReport } from '../apiservices/attendanceapi'
import { getExpenses } from '../apiservices/expensesapi'
import { getCompanies } from '../apiservices/companyapi' // <--- USE SINGULAR IMPORT
import {
  FileText,
  Calendar,
  Printer,
  Building2,
  Loader as Loader2,
  X,
  User
} from 'lucide-react'

export default function Payslips() {
  // ─── STATE ───
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'
  
  // State for Company Details
  const [companyDetails, setCompanyDetails] = useState(() => {
  try {
    const saved = localStorage.getItem('selectedCompany');
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
});



  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [selectedMonth, setSelectedMonth] = useState(() => new Date().toISOString().slice(0, 7)) // YYYY-MM

  // Payslip Modal State
  const [showModal, setShowModal] = useState(false)
  const [payslipData, setPayslipData] = useState(null)
  const [generating, setGenerating] = useState(false)

  // ─── EFFECTS ───
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

  useEffect(() => {
    if (companyId) fetchEmployees()
    else {
      setEmployees([])
      setLoading(false)
    }
  }, [companyId])

  // ─── FETCH COMPANY DETAILS (FIXED) ───
  useEffect(() => {
    if (companyId) {
      const fetchCompany = async () => {
        try {
          // Use SINGULAR function, pass ID
          const data = await getCompanies(Number(companyId))
          const company = Array.isArray(data)
  ? data.find(c => c.id === Number(companyId))
  : data

setCompanyDetails(company || {})
        } catch (err) {
          console.error("Failed to load company details", err)
        }
      }
      fetchCompany()
    }
  }, [companyId])

  const fetchEmployees = async () => {
    setLoading(true)
    try {
      const data = await getEmployees(Number(companyId))
      if (!data || !Array.isArray(data)) {
        setEmployees([])
        return
      }
      setEmployees(data)
    } catch (err) {
      console.error('Failed to load employees', err)
      setEmployees([])
    } finally {
      setLoading(false)
    }
  }

  // ─── PAYSLIP LOGIC ───
  const handleGeneratePayslip = async (employee) => {
    if (!companyId || !selectedMonth) return

    setGenerating(true)
    setShowModal(true)
    setPayslipData(null)

    try {
      // 1. Fetch Attendance
      const reportData = await getMonthlyReport(selectedMonth, Number(companyId))
      const attRecord = reportData.find(r => r.employee_id === employee.id)

      // 2. Fetch Expenses (Advances)
      const year = parseInt(selectedMonth.slice(0, 4))
      const month = parseInt(selectedMonth.slice(5, 7))
      const startOfMonth = `${year}-${month.toString().padStart(2, '0')}-01`
      const lastDayOfMonth = new Date(year, month, 0).getDate()
      const endOfMonth = `${year}-${month.toString().padStart(2, '0')}-${lastDayOfMonth}`

      const monthExpenses = await getExpenses(Number(companyId), startOfMonth, endOfMonth)

      const employeeFullName = `${employee.first_name} ${employee.last_name}`
      const totalAdvance = monthExpenses.reduce((sum, exp) => {
        const isAdvance = exp.category === 'ADVANCE_SALARY'
        const isEmployee = exp.employee_name === employeeFullName
        return isAdvance && isEmployee ? sum + (Number(exp.amount) || 0) : sum
      }, 0)

      // 3. Financials
      const basicSalary = Number(employee.salary) || 0
      const totalDaysInMonth = 30
      const presentDays = attRecord ? (attRecord.total_working_days || 0) : 0
      const absentDays = totalDaysInMonth - presentDays

      // 4. Calculations
      const perDaySalary = basicSalary / totalDaysInMonth
      const earnedBasic = perDaySalary * presentDays
      const grossSalary = earnedBasic
      const totalDeductions = totalAdvance
      const netSalary = grossSalary - totalDeductions

      // 5. Set Data
      setPayslipData({
        employee,
        month: selectedMonth,
        companyName,
        stats: {
          totalDays: totalDaysInMonth,
          present: presentDays,
          absent: absentDays,
          leave: 0,
          payableDays: presentDays
        },
        earnings: {
          'Basic Salary': earnedBasic,
        },
        deductions: {
          'Advance Salary': totalAdvance,
        },
        totals: {
          earnings: grossSalary,
          deductions: totalDeductions,
          net: netSalary
        }
      })

    } catch (err) {
      console.error("Failed to generate payslip", err)
      setPayslipData({ error: true })
    } finally {
      setGenerating(false)
    }
  }

  const formatCurrency = (amount) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount)

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A'
    const date = new Date(dateStr)
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // ─── RENDER ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-gray-500">
        <Building2 className="w-12 h-12 mb-2 opacity-50" />
        <p>Please select a company to view payslips.</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* CSS FOR COLORFUL PRINT */}
      <style>{`
        @media print {
          body {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .no-print {
            display: none !important;
          }
        }
      `}</style>

      {/* Header & Controls */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800 dark:text-gray-100">Payslips</h1>
          <p className="text-sm text-gray-500">Generate and manage monthly payslips for employees.</p>
        </div>
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 p-1.5 rounded-lg border border-gray-200 dark:border-gray-700 shadow-sm">
          <Calendar className="w-4 h-4 text-gray-400 ml-2" />
          <input
            type="month"
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(e.target.value)}
            className="bg-transparent border-none text-sm font-medium text-gray-700 dark:text-gray-200 focus:outline-none"
          />
        </div>
      </div>

      {/* Employee List Card */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 dark:border-gray-800">
                <th className="table-header text-left">Employee</th>
                <th className="table-header text-left">ID / Code</th>
                <th className="table-header text-left">Designation</th>
                <th className="table-header text-left">Joining Date</th>
                <th className="table-header text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50 dark:divide-gray-800">
              {loading ? (
                <tr><td colSpan="5" className="py-10 text-center"><Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" /></td></tr>
              ) : employees.length === 0 ? (
                <tr><td colSpan="5" className="py-10 text-center text-sm text-gray-400">No employees found.</td></tr>
              ) : employees.map(emp => (
                <tr key={emp.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/30 transition-colors">
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center text-primary-600 dark:text-primary-400 font-semibold text-xs">
                        {emp.first_name?.charAt(0)}{emp.last_name?.charAt(0)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-800 dark:text-gray-200">{emp.first_name} {emp.last_name}</p>
                        <p className="text-xs text-gray-400">{emp.email || '—'}</p>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-sm text-gray-500 font-mono">{emp.employee_code}</td>
                  <td className="table-cell text-sm text-gray-600 dark:text-gray-300">{emp.designation}</td>
                  <td className="table-cell text-sm text-gray-500">{formatDate(emp.date_of_joining)}</td>
                  <td className="table-cell">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleGeneratePayslip(emp)}
                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-primary-600 dark:text-primary-400 bg-primary-50 dark:bg-primary-900/20 rounded-md hover:bg-primary-100 dark:hover:bg-primary-900/40 transition-colors"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        View Payslip
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payslip Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 bg-gray-100">
          <div className="bg-white w-full h-full max-w-[1000px] max-h-[100vh] overflow-y-auto shadow-2xl relative flex flex-col">

            {/* Modal Toolbar (Fixed Top) */}
            <div className="sticky top-0 bg-white z-10 px-6 py-3 border-b border-gray-200 flex items-center justify-between no-print">
              <h3 className="font-semibold text-gray-800">Payslip Preview</h3>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="p-2 text-gray-500 hover:bg-gray-100 rounded-lg" title="Print">
                  <Printer className="w-4 h-4" />
                </button>
                <button onClick={() => setShowModal(false)} className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Payslip Content Area */}
            {generating ? (
              <div className="flex flex-col items-center justify-center flex-1 text-gray-500">
                <Loader2 className="w-8 h-8 animate-spin mb-2 text-primary-500" />
                <p>Generating...</p>
              </div>
            ) : payslipData?.error ? (
              <div className="text-center py-10 text-red-500">
                <p>Failed to load data.</p>
              </div>
            ) : payslipData ? (
              <div
                id="payslip-content"
                className="flex-1 bg-white text-black p-8 mx-auto print:p-0"
              >
                
                {/* HEADER */}
                <div className="border-b-2 border-green-700 pb-4">
                  <div className="flex justify-between items-center">
                    
                    {/* Center Info: Name, Address, Email, License */}
                    <div className="text-center flex-1 px-4">
                      <h1 className="text-3xl font-bold text-blue-900 uppercase">
                        {companyName}
                      </h1>
                      
                      {/* Using companyDetails from State */}
                      <div className="text-[20px] md:text-m text-gray-600 mt-1 font-medium">
                        <p><b>{companyDetails.address || 'Address not available'}</b></p>
                        <p><b>Email:</b> {companyDetails.email || 'N/A'}</p>
                        <p>
  <b>Shop License No:</b> 
  {companyDetails.exciseLicenseNo || 'N/A'}
</p>
                      </div>

                      <div className="bg-black text-white px-8 py-2 mt-3 rounded inline-block">
                        <b> EMPLOYEE SALARY SLIP</b>
                      </div>
                    </div>

                    {/* Right Box */}
                  </div>
                </div>

                {/* EMPLOYEE AREA */}
                <div className="grid grid-cols-2 gap-4 mt-5">
                  {/* Employee Details */}
                  <div className="text-sm space-y-2">
                    <p><b>Employee ID :</b> {payslipData.employee.employee_code}</p>
                    <p><b>Name :</b> {payslipData.employee.first_name} {payslipData.employee.last_name}</p>
                    <p><b>Designation :</b> {payslipData.employee.designation}</p>
                    <p><b>Joining Date :</b> {formatDate(payslipData.employee.date_of_joining)}</p>
                    <p><b>Bank :</b> {payslipData.employee.bank_name || "N/A"}</p>
                    <p><b>A/C :</b> {payslipData.employee.bank_account || "N/A"}</p>
                  </div>

                  {/* Attendance Box */}
                  <div className="border rounded">
                    <div className="bg-black text-white p-2 text-center font-bold">
                      Attendance Summary
                    </div>
                    <p className="flex justify-between p-2 border-b">
                      Total Days <b>{payslipData.stats.totalDays}</b>
                    </p>
                    <p className="flex justify-between p-2 border-b">
                      Present <b>{payslipData.stats.present}</b>
                    </p>
                    <p className="flex justify-between p-2 border-b">
                      Leave <b>{payslipData.stats.leave || 0}</b>
                    </p>
                    <p className="flex justify-between p-2">
                      Absent <b>{payslipData.stats.absent}</b>
                    </p>
                  </div>
                </div>

                {/* TABLES */}
                <div className="grid grid-cols-2 gap-5 mt-6">
                  {/* Earnings Table */}
                  <table className="border w-full">
                    <thead>
                      <tr className="bg-black text-white">
                        <th className="p-2">EARNINGS</th>
                        <th>AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(payslipData.earnings).map(([key, val]) => (
                        <tr key={key} className="border">
                          <td className="p-2">{key}</td>
                          <td className="text-right p-2">{formatCurrency(val)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold text-green-700">
                        <td className="p-2">GROSS SALARY</td>
                        <td className="text-right">{formatCurrency(payslipData.totals.earnings)}</td>
                      </tr>
                    </tbody>
                  </table>

                  {/* Deductions Table */}
                  <table className="border w-full">
                    <thead>
                      <tr className="bg-black text-white">
                        <th className="p-2">DEDUCTIONS</th>
                        <th>AMOUNT</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(payslipData.deductions).map(([key, val]) => (
                        <tr key={key} className="border">
                          <td className="p-2">Advance</td>
                          <td className="text-right p-2">{formatCurrency(val)}</td>
                        </tr>
                      ))}
                      <tr className="font-bold text-red-700">
                        <td className="p-2">TOTAL DEDUCTION</td>
                        <td className="text-right">{formatCurrency(payslipData.totals.deductions)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                {/* NET SALARY */}
                <div className="border mt-5 p-5 flex justify-between items-center">
                  <h2 className="font-bold text-xl">NET PAYABLE SALARY</h2>
                  <h1 className="text-3xl font-bold text-green-700">
                    {formatCurrency(payslipData.totals.net)}
                  </h1>
                </div>


                {/* SIGNATURE */}
                <div className="flex justify-between mt-16 mb-5">
                  <div>
                    Employee Signature
                    <br /><br />
                    _____________
                  </div>
                  <div className="text-right">
                    Authorized Signatory
                    <br /><br />
                    _____________
                  </div>
                </div>

                <p className="text-center text-xs text-gray-400 print:hidden">
                  This is a computer generated salary slip and does not require any signature.
                </p>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}