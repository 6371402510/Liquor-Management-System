import { useState, useEffect } from "react";
import {
  Users,
  IndianRupee,
  Building2,
  CalendarDays,
  Wallet,
  Receipt,
  Loader2,
  AlertTriangle,
  Package,
  PackageCheck,
  BarChart3,
  UserPlus,
  ShoppingCart,
  TrendingUp,
  RotateCcw,
   LogOut, // ← NEW IMPORT for reset button
} from "lucide-react";
import { getOperationsDashboard } from "../apiservices/admindashboardapi";
import { format, startOfMonth, endOfMonth } from "date-fns"; // ← ADDED endOfMonth
import { useNavigate } from "react-router-dom";
import clsx from "clsx";

export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [period, setPeriod] = useState("monthly");
  const [selectedDate, setSelectedDate] = useState(format(new Date(), "yyyy-MM-dd")); // ← NEW STATE

  const [includeTax, setIncludeTax] = useState(false);
  const navigate = useNavigate();

  // ─── Fetch data when period or selectedDate changes ───
  useEffect(() => {
    fetchDashboard();
  }, [period, selectedDate]); // ← DEPENDENCY ADDED

  const fetchDashboard = async () => {
    setLoading(true);
    setError("");

    try {
      let dateFrom = "";
      let dateTo = "";

      if (period === "daily") {
        // For daily, both from and to are the selected date
        dateFrom = selectedDate;
        dateTo = selectedDate;
      } else {
        // For monthly, calculate the start and end of the selected date's month
        const dateObj = new Date(selectedDate + "T00:00:00"); // Prevents timezone shift
        dateFrom = format(startOfMonth(dateObj), "yyyy-MM-dd");
        dateTo = format(endOfMonth(dateObj), "yyyy-MM-dd"); // ← USES END OF MONTH
      }

      const result = await getOperationsDashboard(dateFrom, dateTo);
      setData(result);
    } catch (err) {
      setError(err.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  };
 const handleLogout = () => {
    // Clear authentication data from localStorage
    localStorage.removeItem("token");          // Adjust key name if you use a different one (e.g., 'access_token')
    localStorage.removeItem("isAdmin");        // Remove any admin session flags if you use them
    localStorage.removeItem("selectedCompanyId");
    localStorage.removeItem("selectedCompanyName");
    
    // Redirect to login page
    navigate("/login");                        // Adjust route if your login path is different
  };
  const fmt = (n) =>
    new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n || 0);

  const VAT_RATE = 0.35;
  const TCS_RATE = 0.027;

  const calcTaxedValue = (baseCost) => {
    if (!includeTax) return baseCost;
    const costWithVat = baseCost * (1 + VAT_RATE);
    const costWithVatAndTcs = costWithVat * (1 + TCS_RATE);
    return costWithVatAndTcs;
  };

  const resetToToday = () => setSelectedDate(format(new Date(), "yyyy-MM-dd")); // ← RESET FUNCTION

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64 space-y-4">
        <AlertTriangle className="w-8 h-8 text-red-500" />
        <p className="text-red-500">{error}</p>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const {
    stats,
    stores,
    attendance,
    monthly_expenses,
    payroll_summary,
    company_stock,
  } = data;

  const statCards = [
    {
      title: "Total Stores",
      value: stats.total_stores,
      icon: Building2,
      color: "bg-blue-500",
    },
    {
      title: "Employees",
      value: stats.total_employees,
      icon: Users,
      color: "bg-green-500",
    },
    {
      title: period === "daily" ? "Present Today" : "Total Presence",
      value: stats.present_today,
      icon: CalendarDays,
      color: "bg-purple-500",
    },
    {
      title: "Cash In Hand",
      value: `₹${fmt(stats.cash_in_hand)}`,
      icon: Wallet,
      color: stats.cash_in_hand >= 0 ? "bg-orange-500" : "bg-red-500",
    },
    {
      title: includeTax ? "Stock (Incl. Tax)" : "Stock at Cost",
      value: `₹${fmt(calcTaxedValue(stats.total_stock_value))}`,
      icon: Package,
      color: "bg-teal-500",
    },
    {
      title: "Stock at MRP",
      value: `₹${fmt(stats.total_stock_value_mrp)}`,
      icon: PackageCheck,
      color: "bg-indigo-500",
    },
  ];

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
           OWNER DASHBOARD
        </h1>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={() => navigate("/admin-staff")}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <UserPlus size={16} /> Manage Staff
          </button>
          <button
            onClick={() => navigate("/companies")}
            className="btn-primary flex items-center gap-2 text-sm"
          >
            <Building2 size={16} /> Company List
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
          >
            <LogOut size={16} /> Logout
          </button>
          
          {/* ─── DATE PICKER & PERIOD TOGGLE ─── */}
          <div className="flex items-center gap-2">
            <input 
              type="date" 
              value={selectedDate} 
              onChange={(e) => setSelectedDate(e.target.value)} 
              className="input-field text-sm w-40" 
            />
            {selectedDate !== format(new Date(), "yyyy-MM-dd") && (
              <button 
                onClick={resetToToday} 
                className="text-xs text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 flex items-center gap-1 font-medium transition-colors"
              >
                <RotateCcw className="w-3 h-3" /> Today
              </button>
            )}
          </div>

          <div className="flex items-center bg-slate-200 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setPeriod("daily")}
              className={clsx(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                period === "daily"
                  ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              Daily
            </button>
            <button
              onClick={() => setPeriod("monthly")}
              className={clsx(
                "px-4 py-1.5 rounded-md text-sm font-medium transition-all",
                period === "monthly"
                  ? "bg-white dark:bg-gray-900 text-blue-600 dark:text-blue-400 shadow-sm"
                  : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              )}
            >
              Monthly
            </button>
          </div>
        </div>
      </div>

      {/* Top Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4 p-4">
        {statCards.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.title}
              className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 flex justify-between items-center"
            >
              <div>
                <p className="text-white-500 dark:text-grey-400 text-xs leading-tight font-bold">
                  {item.title}
                </p>
                <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-1">
                  {item.value}
                </h2>
              </div>
              <div className={`${item.color} p-3 rounded-full text-white`}>
                <Icon size={22} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════
          Current Stock Value — Company Wise
          ═══════════════════════════════════════════════════ */}
      <div className="p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">

          {/* ─── Header with Toggle ─── */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
            <h2 className="font-bold flex gap-2 items-center text-gray-900 dark:text-white">
              <BarChart3 size={18} />
              CURRENT STOCK VALUATION — SHOP WISE
            </h2>

            {/* ─── TAX TOGGLE SWITCH ─── */}
            <div className="flex items-center gap-3 bg-slate-100 dark:bg-gray-700 px-4 py-2 rounded-lg">
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Excl. Tax
              </span>
              <button
                onClick={() => setIncludeTax(!includeTax)}
                className={clsx(
                  "relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none",
                  includeTax ? "bg-teal-500" : "bg-gray-300 dark:bg-gray-500"
                )}
              >
                <span
                  className={clsx(
                    "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                    includeTax ? "translate-x-6" : "translate-x-1"
                  )}
                />
              </button>
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                Incl. Tax <br />
                <span className="text-[10px] opacity-75">(VAT 35% + TCS 2.7%)</span>
              </span>
            </div>
          </div>

          {(!company_stock || company_stock.length === 0) ? (
            <p className="text-gray-400 text-center py-6">No stock data available</p>
          ) : (
            <>
              {/* ─── Table ─── */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                      <th className="text-left py-2">#</th>
                      <th className="text-left py-2">Company / Store</th>
                      <th className="text-right py-2">Items</th>
                      <th className="text-right py-2">Bottles</th>
                      <th className="text-right py-2">
                        {includeTax ? "Cost + VAT + TCS" : "Stock Value (Cost)"}
                      </th>
                      <th className="text-right py-2">Stock Value (MRP)</th>
                      <th className="text-right py-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {company_stock.map((cs, idx) => {
                      const calculatedCost = calcTaxedValue(cs.stock_value);
                      const margin = cs.stock_value_mrp - calculatedCost;
                      const marginPct =
                        calculatedCost > 0
                          ? ((margin / calculatedCost) * 100).toFixed(1)
                          : "0.0";

                      return (
                        <tr
                          key={cs.company_id}
                          className="border-b dark:border-gray-700 text-gray-800 dark:text-gray-200"
                        >
                          <td className="py-2 text-gray-400">{idx + 1}</td>
                          <td className="py-2 font-medium">{cs.company_name}</td>
                          <td className="py-2 text-right">{cs.item_count}</td>
                          <td className="py-2 text-right">{fmt(cs.total_bottles)}</td>
                          <td className="py-2 text-right text-teal-600 font-semibold">
                            ₹{fmt(calculatedCost)}
                          </td>
                          <td className="py-2 text-right text-indigo-600 font-semibold">
                            ₹{fmt(cs.stock_value_mrp)}
                          </td>
                          <td className="py-2 text-right">
                            <span
                              className={clsx(
                                "font-semibold",
                                margin >= 0 ? "text-emerald-600" : "text-red-500"
                              )}
                            >
                              ₹{fmt(margin)}
                            </span>
                            <span className="text-gray-400 text-xs ml-1">
                              ({marginPct}%)
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>

                  {/* ─── Totals ─── */}
                  <tfoot>
                    <tr className="font-bold border-t-2 dark:border-gray-600 text-gray-900 dark:text-white">
                      <td className="pt-3" />
                      <td className="pt-3">Total</td>
                      <td className="pt-3 text-right">
                        {company_stock.reduce((s, c) => s + c.item_count, 0)}
                      </td>
                      <td className="pt-3 text-right">
                        {fmt(company_stock.reduce((s, c) => s + c.total_bottles, 0))}
                      </td>
                      <td className="pt-3 text-right text-teal-600">
                        ₹{fmt(calcTaxedValue(stats.total_stock_value))}
                      </td>
                      <td className="pt-3 text-right text-indigo-600">
                        ₹{fmt(stats.total_stock_value_mrp)}
                      </td>
                      <td className="pt-3 text-right">
                        <span
                          className={clsx(
                            stats.total_stock_value_mrp - calcTaxedValue(stats.total_stock_value) >= 0
                              ? "text-emerald-600"
                              : "text-red-500"
                          )}
                        >
                          ₹{fmt(stats.total_stock_value_mrp - calcTaxedValue(stats.total_stock_value))}
                        </span>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ─── Visual bar charts ─── */}
              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  {includeTax ? "Cost + VAT + TCS — Visual" : "Stock at Cost — Visual"}
                </h3>
                {company_stock.map((cs) => {
                  const calculatedCost = calcTaxedValue(cs.stock_value);
                  const maxVal = Math.max(
                    ...company_stock.map((c) => calcTaxedValue(c.stock_value)),
                    1
                  );
                  const pct = (calculatedCost / maxVal) * 100;

                  return (
                    <div key={cs.company_id} className="flex items-center gap-3">
                      <span className="w-32 text-xs text-gray-600 dark:text-gray-300 truncate text-right">
                        {cs.company_name}
                      </span>
                      <div className="flex-1 bg-slate-200 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                        <div
                          className="bg-teal-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-28 text-right">
                        ₹{fmt(calculatedCost)}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-6 space-y-3">
                <h3 className="text-sm font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                  Stock at MRP — Visual
                </h3>
                {company_stock.map((cs) => {
                  const maxVal = Math.max(
                    ...company_stock.map((c) => c.stock_value_mrp),
                    1
                  );
                  const pct = (cs.stock_value_mrp / maxVal) * 100;

                  return (
                    <div key={cs.company_id} className="flex items-center gap-3">
                      <span className="w-32 text-xs text-gray-600 dark:text-gray-300 truncate text-right">
                        {cs.company_name}
                      </span>
                      <div className="flex-1 bg-slate-200 dark:bg-gray-700 rounded-full h-5 overflow-hidden">
                        <div
                          className="bg-indigo-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-200 w-28 text-right">
                        ₹{fmt(cs.stock_value_mrp)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Store Performance & Attendance */}
      <div className="grid md:grid-cols-2 gap-4 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <h2 className="font-bold mb-4 text-gray-900 dark:text-white">
            STORE PERFORMANCE ({period === "daily" ? selectedDate : `Month of ${selectedDate}`})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <th className="text-left py-2">Store</th>
                  <th className="text-right py-2">Sales</th>
                  <th className="text-right py-2">COGS</th>
                  <th className="text-right py-2">VAT (35%)</th>
                  <th className="text-right py-2">TCS (2.7%)</th>
                  <th className="text-right py-2">Expense</th>
                  <th className="text-right py-2">Profit</th>
                  <th className="text-right py-2">Staff</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((store) => (
                  <tr
                    key={store.id}
                    className="border-b dark:border-gray-700 text-gray-800 dark:text-gray-200"
                  >
                    <td className="py-2 font-medium whitespace-nowrap">{store.name}</td>
                    <td className="text-right text-emerald-600 font-semibold">
                      ₹{fmt(store.sales)}
                    </td>
                    <td className="text-right text-gray-500">
                      ₹{fmt(store.cogs)}
                    </td>
                    <td className="text-right text-orange-500">
                      ₹{fmt(store.vat)}
                    </td>
                    <td className="text-right text-yellow-600">
                      ₹{fmt(store.tcs)}
                    </td>
                    <td className="text-right text-red-500">
                      ₹{fmt(store.expense)}
                    </td>
                    <td className={clsx(
                      "text-right font-bold",
                      store.profit >= 0 ? "text-green-600" : "text-red-600"
                    )}>
                      ₹{fmt(store.profit)}
                    </td>
                    <td className="text-right">{store.employees}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <h2 className="font-bold mb-4 text-gray-900 dark:text-white">
            ATTENDANCE ({period === "daily" ? "Today" : "Period Summary"})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <th className="text-left py-2">Employee</th>
                  <th className="text-left py-2">Store</th>
                  <th className="text-left py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {attendance.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-6 text-gray-400">
                      No attendance records found
                    </td>
                  </tr>
                ) : (
                  attendance.map((emp, index) => (
                    <tr
                      key={index}
                      className="border-b dark:border-gray-700 text-gray-800 dark:text-gray-200"
                    >
                      <td className="py-2">{emp.emp}</td>
                      <td className="py-2">{emp.store}</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-1 rounded text-white text-xs font-semibold ${emp.status === "PRESENT"
                              ? "bg-green-500"
                              : "bg-red-500"
                            }`}
                        >
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Expense & Payroll */}
      <div className="grid md:grid-cols-2 gap-4 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <h2 className="font-bold flex gap-2 items-center mb-4 text-gray-900 dark:text-white">
            <Receipt size={18} />
            EXPENSES ({period === "daily" ? selectedDate : `Month of ${selectedDate}`})
          </h2>
          <div className="space-y-2 text-sm">
            {monthly_expenses.length === 0 ? (
              <p className="text-gray-400 text-center py-4">No expenses recorded</p>
            ) : (
              <>
                {monthly_expenses.map((exp) => (
                  <div
                    key={exp.category}
                    className="flex justify-between text-gray-700 dark:text-gray-300"
                  >
                    <span>{exp.category}</span>
                    <span className="font-medium">₹{fmt(exp.total_amount)}</span>
                  </div>
                ))}
                <div className="flex justify-between font-bold border-t dark:border-gray-700 pt-2 text-gray-900 dark:text-white">
                  <span>Total</span>
                  <span>
                    ₹{fmt(monthly_expenses.reduce((sum, e) => sum + e.total_amount, 0))}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
          <h2 className="font-bold flex gap-2 items-center mb-4 text-gray-900 dark:text-white">
            <IndianRupee size={18} />
            PAYROLL SUMMARY ({period === "daily" ? selectedDate : `Month of ${selectedDate}`})
          </h2>
          <div className="space-y-3 text-sm text-gray-700 dark:text-gray-300">
            <div className="flex justify-between">
              <span>Total Employees</span>
              <span className="font-medium">{payroll_summary.total_employees}</span>
            </div>
            <div className="flex justify-between">
              <span>Total Salary</span>
              <span className="font-medium">₹{fmt(payroll_summary.total_salary)}</span>
            </div>
            <div className="flex justify-between">
              <span>Overtime</span>
              <span className="font-medium">₹{fmt(payroll_summary.overtime)}</span>
            </div>
            <div className="flex justify-between">
              <span>Incentive</span>
              <span className="font-medium">₹{fmt(payroll_summary.incentive)}</span>
            </div>
            <div className="flex justify-between font-bold border-t dark:border-gray-700 pt-2 text-gray-900 dark:text-white">
              <span>Net Payroll</span>
              <span>₹{fmt(payroll_summary.net_payroll)}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}