import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState, useEffect } from 'react' // 👈 Added useState and useEffect
import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { Loader2 } from 'lucide-react'

import Layout from './components/Layout/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import POS from './pages/POS'
import POSGodown from './pages/POS-godown'
import Inventory from './pages/Inventory'
import Suppliers from './pages/Suppliers'
import Purchases from './pages/Purchases'
import Reports from './pages/Reports'
import WineShopBillingUIDesign from './pages/bill'
import Employees from './pages/Employees'
import Expenses from './pages/Expenses'
import ExciseRegister from './pages/ExciseRegister'
import Companies from './pages/Company.jsx'
import StockTransfer from './pages/StockTransfer.jsx'
import PurchaseReport from './pages/PurcheseReport.jsx'
import InventoryReport from './pages/InventoryReport.jsx'
import StockTransferReport from './pages/StockTransferReport.jsx'
import ExciseReports from './pages/ExciseRegister.jsx'
import EmployeeAttendance from './pages/EmployeeAttendance.jsx'
import AttendanceReports from './pages/AttendanceReports.jsx'
import AdminDashboard from './pages/admindashboard.jsx'
import SalaryReport from './pages/SalaryReport.jsx'
import StaffManagement from './pages/StaffManagement.jsx' 
import CashDeposit from './pages/CashDeposit.jsx' 
import Payslips from './pages/Payslips.jsx'
import ExciseSizeWiseReport from './pages/ExciseReport.jsx'
import Damage from './pages/Damage.jsx'
import CounterToGodownTransfer from './pages/CounterToGodownTransfer.jsx'
import CounterToGodownReport  from './pages/CounterToGodownTransferReport.jsx'
// ══════════════════════════════════════════════════
// 👇 NEW: Component to wait for FastAPI to start
// ══════════════════════════════════════════════════
function BackendReady({ children }) {
  const [backendReady, setBackendReady] = useState(false);

  useEffect(() => {
    const checkHealth = async () => {
      try {
        // Pings the root route of your FastAPI backend
        const res = await fetch("http://127.0.0.1:8000/");
        if (res.ok) {
          setBackendReady(true);
        }
      } catch (err) {
        // FastAPI is not up yet, will try again in 1 second
        console.log("Waiting for Python backend to start...");
      }
    };

    const interval = setInterval(checkHealth, 1000);
    return () => clearInterval(interval);
  }, []);

  // Show a loading screen while FastAPI boots up
  if (!backendReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-amber-500 mx-auto mb-4" />
          <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200">Starting Local Database...</h2>
          <p className="text-sm text-gray-500 mt-1">Please wait a moment while the system boots up.</p>
        </div>
      </div>
    );
  }

  // Once FastAPI is ready, render the actual React App
  return children;
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" replace />
  }

  return children
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/companies" element={<ProtectedRoute><Companies /></ProtectedRoute>} />
      <Route path="/admin-dashboard" element={<ProtectedRoute><AdminDashboard /></ProtectedRoute>} />
      <Route path="/admin-staff" element={<ProtectedRoute><StaffManagement /></ProtectedRoute>} />
      <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="/dashboard/:companyId" element={<Dashboard />} />
        <Route path="/pos" element={<POS />} />
        <Route path="/pos-godown" element={<POSGodown />} />
        <Route path="/inventory" element={<Inventory />} />
        <Route path="/WineShopBillingUIDesigny" element={<WineShopBillingUIDesign />} />
        <Route path="/suppliers" element={<Suppliers />} />
        <Route path="/purchases" element={<Purchases />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/employees" element={<Employees />} />
        <Route path="/expenses" element={<Expenses />} />
        <Route path="/excise-register" element={<ExciseRegister />} />
        <Route path="/stock-transfer" element={<StockTransfer />} />
        <Route path="/purchase-report" element={<PurchaseReport />} />
        <Route path="/inventory-report" element={<InventoryReport />} />
        <Route path="/stock-transfer-report" element={<StockTransferReport />} />
        <Route path="/excise-reports" element={<ExciseReports />} />
        <Route path="/employee-attendance" element={<EmployeeAttendance />} />
        <Route path="/attendance-reports" element={<AttendanceReports />} />
        <Route path="/salary-report" element={<SalaryReport />} />
        <Route path="/cash-deposit" element={<CashDeposit />} />
        <Route path="/Payslips" element={<Payslips />} />
        <Route path="/exciseSizeWiseReport" element={<ExciseSizeWiseReport />} />
        <Route path="/damage" element={<Damage />} />
        <Route path="/counter-to-godown-transfer" element={<CounterToGodownTransfer />} />
        <Route path="/counter-to-godown-report" element={<CounterToGodownReport />} />
        {/* ─── ADMIN ROUTES ─── */}
      </Route>

      <Route path="/" element={<Navigate to="/companies" replace />} />
      <Route path="*" element={<Navigate to="/companies" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      {/* 👇 Wrapping the app in BackendReady prevents network errors on startup */}
      <BackendReady>
        <AuthProvider>
          <BrowserRouter>
            <AppRoutes />
          </BrowserRouter>
        </AuthProvider>
      </BackendReady>
    </ThemeProvider>
  )
}