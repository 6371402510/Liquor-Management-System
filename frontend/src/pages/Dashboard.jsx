import { useEffect, useState } from 'react'
import {
  TrendingUp,
  ShoppingCart,
  Package,
  TriangleAlert as AlertTriangle,
  IndianRupee,
  Users,
  Truck,
  CreditCard,
  Wallet,
  TrendingDown,
  CalendarDays,
  RotateCcw,
  Target,
  CheckCircle,
  Clock
} from 'lucide-react'
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts'
import { format } from 'date-fns'
import clsx from 'clsx'

import { getDashboardData } from '../apiservices/dashboardapi'
import { syncProductsToLocalDB } from '../syncService'

const PIE_COLORS = ['#3b82f6', '#f59e0b', '#10b981', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16']

export default function Dashboard() {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  // ─── Sync companyId from localStorage ───
  useEffect(() => {
    const syncCompanyId = () => {
      const newId = localStorage.getItem('selectedCompanyId')
      if (newId !== companyId) setCompanyId(newId)
    }
    window.addEventListener('storage', syncCompanyId)
    return () => window.removeEventListener('storage', syncCompanyId)
  }, [companyId])

  // ─── Fetch Dashboard Data ───
  useEffect(() => {
    if (companyId) fetchDashboardData()
  }, [companyId, selectedDate])

  // ─── OFFLINE SYNC ───
  useEffect(() => {
    if (!companyId) return;
    syncProductsToLocalDB(companyId);
    const handleOnline = () => syncProductsToLocalDB(companyId);
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [companyId])

  const fetchDashboardData = async () => {
    setLoading(true)
    setError('')
    try {
      const result = await getDashboardData(companyId, selectedDate)
      setData(result)
    } catch (err) {
      setError(err.message || 'Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }

  const fmt = (n) => new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(n || 0)
  const fmtCurrency = (n) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n || 0)
  const resetToToday = () => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))

  // ─── Guard: No Company Selected ───
  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view dashboard data.</p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center space-y-2">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-sm text-red-500">{error}</p>
          <button onClick={fetchDashboardData} className="btn-secondary text-xs">Retry</button>
        </div>
      </div>
    )
  }

  const {
    stats,
    dailySales,
    dailyPurchases,
    categoryData,
    expenseBreakdown,
    recentSales,
    recentPurchases,
    lowStockItems,
    paymentModeBreakdown,
    topSellingBrands,
    exciseSummary,
    mgr_status  // ═══ NEW ═══
  } = data;

  // ═══════════════════════════════════════════════════════════
  // MGR HELPERS
  // ═══════════════════════════════════════════════════════════
  const mgrPct = mgr_status?.percentage || 0
  const mgrAchieved = mgr_status?.achieved || 0
  
  const mgrTarget = mgr_status?.monthly_target || 0
  const mgrToBe = mgr_status?.to_be_achieved || 0
  const daysLeft = Math.max(0, new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate() - new Date().getDate())
  const dailyTargetNeeded = daysLeft > 0 ? mgrToBe / daysLeft : 0

  const getMGRProgressColor = () => {
    if (mgrPct >= 100) return 'bg-green-500'
    if (mgrPct >= 75) return 'bg-blue-500'
    if (mgrPct >= 50) return 'bg-yellow-500'
    return 'bg-red-500'
  }

  const getMGRProgressBg = () => {
    if (mgrPct >= 100) return 'bg-green-100 dark:bg-green-900/30'
    if (mgrPct >= 75) return 'bg-blue-100 dark:bg-blue-900/30'
    if (mgrPct >= 50) return 'bg-yellow-100 dark:bg-yellow-900/30'
    return 'bg-red-100 dark:bg-red-900/30'
  }

  const getMGRStatusText = () => {
    if (mgrPct >= 100) return 'Target Achieved! 🎉'
    if (mgrPct >= 75) return 'Almost There!'
    if (mgrPct >= 50) return 'On Track'
    return 'Needs Attention'
  }

  const getMGRStatusIcon = () => {
    if (mgrPct >= 100) return <CheckCircle className="text-green-500" size={22} />
    if (mgrPct >= 50) return <TrendingUp className="text-blue-500" size={22} />
    return <AlertTriangle className="text-red-500" size={22} />
  }

  const statCards = [
    {
      label: "Today's Sales",
      value: `₹${fmt(stats.todaySales)}`,
      icon: IndianRupee,
      color: 'bg-emerald-500',
      sub: `${stats.todayOrders} orders`,
    },
    {
      label: 'Expenses',
      value: `₹${fmt(stats.monthExpenses)}`,
      icon: Wallet,
      color: 'bg-red-500',
      sub: 'Last 30 days',
    },
    {
      label: 'Total Products',
      value: stats.totalProducts,
      icon: Package,
      color: 'bg-amber-500',
      sub: `${stats.lowStockCount} low stock`,
    },
    {
      label: 'Suppliers',
      value: stats.totalSuppliers,
      icon: Truck,
      color: 'bg-cyan-500',
      sub: 'Active vendors',
    },
    {
      label: 'Employees',
      value: stats.totalEmployees,
      icon: Users,
      color: 'bg-purple-500',
      sub: 'Active staff',
    },
    { 
      label: 'Bottles in Stock',
      value: fmt(stats.totalBottlesInStock),
      icon: Package,
      color: 'bg-teal-500',
      sub: 'Total current stock',
    },
    {
      label: 'Bottles Sold',
      value: fmt(stats.totalBottlesSold),
      icon: TrendingUp,
      color: 'bg-green-600',
      sub: 'Last 30 days',
    },
    {
      label: 'Bottles Purchased',
      value: fmt(stats.totalBottlesPurchased),
      icon: ShoppingCart,
      color: 'bg-indigo-500',
      sub: 'Last 30 days',
    },
  ]

  return (
    <div className="space-y-6">
      {/* ─── Date Selector ─── */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
          <CalendarDays className="w-3.5 h-3.5 text-primary-500" />
          <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">
            Dashboard Date
          </span>
        </div>
        <input 
          type="date" 
          value={selectedDate} 
          onChange={e => setSelectedDate(e.target.value)} 
          className="input-field w-44 text-sm" 
        />
        {selectedDate !== format(new Date(), 'yyyy-MM-dd') && (
          <button onClick={resetToToday} className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 font-medium transition-colors">
            <RotateCcw className="w-3 h-3" /> Reset to Today
          </button>
        )}
      </div>
      
      {/* ─── Stat Cards ─── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {statCards.map(s => (
          <div key={s.label} className="card p-4 text-center">
            <div className="flex items-start justify-between mb-3">
              <div className={`w-10 h-10 rounded-lg ${s.color} flex items-center justify-center flex-shrink-0`}>
                <s.icon className="w-5 h-5 text-white" />
              </div>
            </div>
            <p className="text-2xl font-bold text-gray-900 dark:text-white">{s.value}</p>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400 mt-0.5">{s.label}</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ═══              MGR STATUS CARD (NEW)                 ═══ */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* ─── MGR Status Card with Carryover Info ─── */}
<div className="card p-5">
  {/* Header */}
  <div className="flex items-center justify-between mb-4">
    <div className="flex items-center gap-2.5">
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center flex-shrink-0">
        <Target className="w-5 h-5 text-white" />
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-800 dark:text-gray-100">MGER Status — Monthly Target</h3>
        <p className="text-[11px] text-gray-400 dark:text-gray-500">Monitored by Excise Department</p>
      </div>
    </div>
    <div className="flex items-center gap-3">
      <span className={clsx(
        "text-xs font-semibold px-2.5 py-1 rounded-full",
        mgrPct >= 100 
          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          : mgrPct >= 50
            ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
            : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
      )}>
        {getMGRStatusText()}
      </span>
      {getMGRStatusIcon()}
    </div>
  </div>

  {/* Progress Bar */}
  <div className="mb-5">
    <div className="flex justify-between items-end mb-2">
      <div>
        <span className={clsx(
          "text-3xl font-extrabold tracking-tight",
          mgrPct >= 100 ? "text-green-600 dark:text-green-400" :
          mgrPct >= 50 ? "text-blue-600 dark:text-blue-400" :
          "text-red-600 dark:text-red-400"
        )}>
          {mgrPct.toFixed(2)}%
        </span>
        <span className="text-xs text-gray-400 ml-2">achieved</span>
      </div>
      <span className="text-xs text-gray-400">
        {fmtCurrency(mgrAchieved)} / {fmtCurrency(mgrTarget)}
      </span>
    </div>
    <div className={clsx("h-5 w-full rounded-full overflow-hidden", getMGRProgressBg())}>
      <div 
        className={clsx("h-full rounded-full transition-all duration-700 ease-out", getMGRProgressColor())}
        style={{ width: `${Math.min(mgrPct, 100)}%` }}
      />
    </div>
  </div>

  {/* 4 Column Stats (Added Carryover info) */}
  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
    {/* Monthly Target */}
    <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-4 border border-gray-100 dark:border-gray-700/50">
      <div className="flex items-center gap-2 mb-2">
        <Target className="w-4 h-4 text-gray-400" />
        <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">This Month Target</p>
      </div>
      <p className="text-2xl font-bold text-gray-800 dark:text-gray-100">
        {fmtCurrency(mgrTarget)}
      </p>
      <div className="flex flex-col gap-0.5 mt-1">
        <p className="text-[10px] text-gray-400">
          Base: {fmtCurrency(mgr_status?.base_target || 0)}
        </p>
        {mgr_status?.previous_month_carryover > 0 && (
          <p className="text-[10px] text-amber-500 font-medium">
            + Carryover: {fmtCurrency(mgr_status.previous_month_carryover)}
          </p>
        )}
      </div>
    </div>

    {/* Achieved MGR */}
    <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800/50">
      <div className="flex items-center gap-2 mb-2">
        <TrendingUp className="w-4 h-4 text-blue-500" />
        <p className="text-[11px] font-semibold text-blue-500 uppercase tracking-wider">Achieved MGER</p>
      </div>
      <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">
        {fmtCurrency(mgrAchieved)}
      </p>
      <p className="text-[11px] text-blue-400 mt-1">From purchases this month</p>
    </div>

    {/* To Be Achieved */}
    <div className={clsx(
      "rounded-xl p-4 border",
      mgrToBe > 0 
        ? "bg-red-50 dark:bg-red-900/20 border-red-100 dark:border-red-800/50"
        : "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/50"
    )}>
      <div className="flex items-center gap-2 mb-2">
        {mgrToBe > 0 
          ? <AlertTriangle className="w-4 h-4 text-red-500" />
          : <CheckCircle className="w-4 h-4 text-green-500" />
        }
        <p className={clsx(
          "text-[11px] font-semibold uppercase tracking-wider",
          mgrToBe > 0 ? "text-red-500" : "text-green-500"
        )}>Remaining Needed</p>
      </div>
      <p className={clsx(
        "text-2xl font-bold",
        mgrToBe > 0 ? "text-red-700 dark:text-red-300" : "text-green-700 dark:text-green-300"
      )}>
        {fmtCurrency(mgrToBe)}
      </p>
      <p className={clsx(
        "text-[11px] mt-1",
        mgrToBe > 0 ? "text-red-400" : "text-green-400"
      )}>
        {mgrToBe > 0 ? 'Will carry over to next month' : 'Target fully achieved!'}
      </p>
    </div>

    {/* Carryover Info */}
    <div className={clsx(
      "rounded-xl p-4 border",
      mgr_status?.previous_month_carryover > 0
        ? "bg-amber-50 dark:bg-amber-900/20 border-amber-100 dark:border-amber-800/50"
        : "bg-green-50 dark:bg-green-900/20 border-green-100 dark:border-green-800/50"
    )}>
      <div className="flex items-center gap-2 mb-2">
        <Clock className="w-4 h-4 text-amber-500" />
        <p className={clsx(
          "text-[11px] font-semibold uppercase tracking-wider",
          mgr_status?.previous_month_carryover > 0 ? "text-amber-500" : "text-green-500"
        )}>Previous Month Carryover</p>
      </div>
      <p className={clsx(
        "text-2xl font-bold",
        mgr_status?.previous_month_carryover > 0
          ? "text-amber-700 dark:text-amber-300"
          : "text-green-700 dark:text-green-300"
      )}>
        {fmtCurrency(mgr_status?.previous_month_carryover || 0)}
      </p>
      <p className="text-[11px] text-gray-400 mt-1">
        {mgr_status?.previous_month_carryover > 0 
          ? 'Added to this month\'s target'
          : 'No carryover from last month'}
      </p>
    </div>
  </div>

  {/* Bottom Info Row */}
  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 flex flex-wrap items-center gap-x-8 gap-y-2">
    <div className="flex items-center gap-2">
      <Clock className="w-3.5 h-3.5 text-gray-400" />
      <span className="text-xs text-gray-500 dark:text-gray-400">Days Left:</span>
      <span className="text-xs font-bold text-gray-700 dark:text-gray-300">{daysLeft} days</span>
    </div>
    {mgrToBe > 0 && daysLeft > 0 && (
      <div className="flex items-center gap-2">
        <TrendingUp className="w-3.5 h-3.5 text-orange-500" />
        <span className="text-xs text-gray-500 dark:text-gray-400">Daily Target Needed:</span>
        <span className="text-xs font-bold text-orange-600 dark:text-orange-400">{fmtCurrency(dailyTargetNeeded)}/day</span>
      </div>
    )}
    <div className="flex items-center gap-2">
      <div className={clsx(
        "w-2 h-2 rounded-full",
        mgrPct >= 100 ? "bg-green-500" : mgrPct >= 50 ? "bg-blue-500" : "bg-red-500"
      )} />
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {mgrPct >= 100 ? 'On target' : `${(100 - mgrPct).toFixed(2)}% more needed`}
      </span>
    </div>
    {mgr_status?.previous_month_carryover > 0 && (
      <div className="flex items-center gap-2">
        <span className="text-xs text-amber-500 font-medium">
          ⚡ {fmtCurrency(mgr_status.previous_month_carryover)} carried over from last month
        </span>
      </div>
    )}
  </div>
</div>

      {/* ─── Charts Row 1 ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Sales Area Chart */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Sales — Last 7 Days</h3>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={dailySales} margin={{ top: 5, right: 5, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="salesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" className="dark:stroke-gray-800" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#9ca3af' }} axisLine={false} tickLine={false}
  tickFormatter={(v) => {
    if (v >= 10000000) return `₹${(v / 10000000).toFixed(1)}Cr`;  // Crore (1,00,00,000+)
    if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`;       // Lakh (1,00,000+)
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`;           // Thousand (1,000+)
    return `₹${v}`;
  }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} formatter={v => [`₹${fmt(v)}`, 'Sales']} />
              <Area type="monotone" dataKey="sales" stroke="#3b82f6" strokeWidth={2} fill="url(#salesGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Category Pie Chart */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Inventory by Category</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={categoryData} cx="50%" cy="50%" innerRadius={50} outerRadius={75}
                paddingAngle={3} dataKey="value">
                {categoryData.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Legend iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ─── Charts Row 2 ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        
        {/* Excise Summary */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Excise Summary (BL / LPL / MGER)</h3>
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Current Stock</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-blue-700 dark:text-blue-300">{exciseSummary.stock_bl.toFixed(2)}</p>
                  <p className="text-[10px] text-blue-500">Bulk Liters</p>
                </div>
                <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-purple-700 dark:text-purple-300">{exciseSummary.stock_lpl.toFixed(2)}</p>
                  <p className="text-[10px] text-purple-500">LP Liters</p>
                </div>
                <div className="bg-orange-50 dark:bg-orange-900/20 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-orange-700 dark:text-orange-300">{exciseSummary.stock_mger.toFixed(2)}</p>
                  <p className="text-[10px] text-orange-500">MGER</p>
                </div>
              </div>
            </div>
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Sold (Last 30 Days)</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-cyan-50 dark:bg-cyan-900/20 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-cyan-700 dark:text-cyan-300">{exciseSummary.sold_bl.toFixed(2)}</p>
                  <p className="text-[10px] text-cyan-500">Bulk Liters</p>
                </div>
                <div className="bg-pink-50 dark:bg-pink-900/20 rounded-lg p-3 text-center">
                  <p className="text-lg font-bold text-pink-700 dark:text-pink-300">{exciseSummary.sold_lpl.toFixed(2)}</p>
                  <p className="text-[10px] text-pink-500">LP Liters</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Mode Breakdown */}
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Sales by Payment Mode (30d)</h3>
          {paymentModeBreakdown.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">No sales data</p>
          ) : (
            <div className="space-y-3">
              {paymentModeBreakdown.map((item, i) => {
                const totalSalesAmt = paymentModeBreakdown.reduce((s, e) => s + e.total_amount, 0)
                const pct = totalSalesAmt > 0 ? (item.total_amount / totalSalesAmt * 100) : 0
                const modeIcon = item.mode === 'CASH' ? '💵' : item.mode === 'UPI' ? '📱' : item.mode === 'CARD' ? '💳' : '🔄'
                return (
                  <div key={item.mode}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{modeIcon} {item.mode}</span>
                      <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">₹{fmt(item.total_amount)} ({pct.toFixed(0)}%)</span>
                    </div>
                    <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-2">
                      <div
                        className="h-2 rounded-full transition-all duration-500"
                        style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top Selling Brands */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Top Selling Brands (30d)</h3>
            <TrendingUp className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {topSellingBrands.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No sales data</p>
            ) : topSellingBrands.map((item, i) => (
              <div key={item.brand} className="px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-gray-400 w-5">{i + 1}.</span>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{item.brand}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">{fmt(item.bottles_sold)} btls</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ─── Expense Breakdown ─── */}
      <div className="card p-5">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4">Expenses by Category</h3>
        {expenseBreakdown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No expenses this month</p>
        ) : (
          <div className="space-y-3">
            {expenseBreakdown.slice(0, 6).map((item, i) => {
              const totalExpense = expenseBreakdown.reduce((s, e) => s + e.total_amount, 0)
              const pct = totalExpense > 0 ? (item.total_amount / totalExpense * 100) : 0
              return (
                <div key={item.category}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-600 dark:text-gray-400">{item.category}</span>
                    <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">₹{fmt(item.total_amount)}</span>
                  </div>
                  <div className="w-full bg-gray-100 dark:bg-gray-800 rounded-full h-1.5">
                    <div
                      className="h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%`, backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
      
      {/* ─── Lists Row ─── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Recent Purchases */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Purchases</h3>
            <ShoppingCart className="w-4 h-4 text-blue-500" />
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {recentPurchases.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No purchases yet</p>
            ) : recentPurchases.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{p.supplier_name || 'Unknown'}</p>
                  <p className="text-xs text-gray-400">{p.invoice_number}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">₹{fmt(p.total_amount)}</p>
                  <span className={clsx("text-[10px] font-semibold px-1.5 py-0.5 rounded-full",
                    p.status === 'RECEIVED' ? "bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400" : "bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400"
                  )}>{p.status}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Sales */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Recent Sales</h3>
            <CreditCard className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {recentSales.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">No sales yet</p>
            ) : recentSales.map(s => (
              <div key={`${s.type}-${s.id}`} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{s.customer_name}</p>
                    <span className={clsx(
                      "text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider",
                      s.type === "GODOWN"
                        ? "bg-indigo-50 text-indigo-600 dark:bg-indigo-900/20 dark:text-indigo-400"
                        : "bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400"
                    )}>
                      {s.type}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400">{s.invoice_number} · {s.payment_mode}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">₹{fmt(s.total_amount)}</p>
                  <p className="text-xs text-gray-400">{format(new Date(s.created_at), 'h:mm a')}</p>
                </div>
              </div>
            ))}
          </div>
        </div> 

        {/* Low Stock Alerts */}
        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Low Stock Alerts</h3>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="divide-y divide-gray-50 dark:divide-gray-800">
            {lowStockItems.length === 0 ? (
              <p className="px-5 py-6 text-sm text-gray-400 text-center">All items well stocked</p>
            ) : lowStockItems.map(p => (
              <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-800 dark:text-gray-200 truncate max-w-[180px]">{p.name}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span className="badge-warning text-[10px]">{p.category}</span>
                    {p.bottle_size && <span className="text-[10px] text-gray-400">{p.bottle_size}</span>}
                  </div>
                </div>
                <div className="text-right">
                  <p className={clsx("text-sm font-bold", p.current_stock <= 0 ? "text-red-600" : "text-red-500")}>
                    {p.current_stock}
                  </p>
                  <p className="text-xs text-gray-400">min: {p.reorder_level}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}