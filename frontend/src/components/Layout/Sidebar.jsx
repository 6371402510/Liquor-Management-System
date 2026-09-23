import { useState, useEffect } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  ShoppingBag,
  LogOut,
  Wine,
  X,
  ChevronRight,
  ChevronDown,
  Users,
  Settings,
  Receipt,
  FileText,
  Building2
} from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import clsx from 'clsx'

export default function Sidebar({ open, onClose, desktopCollapsed }) {
  const { signOut, user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const role = user?.role?.toUpperCase() || 'SALESMAN'

  // ✅ FIX: Use correct localStorage key
  const [currentCompanyId, setCurrentCompanyId] = useState(null)

  const [openMenus, setOpenMenus] = useState({
    pos: false,
    purchase: false,
    inventory: false,
    excise: false,
    finance: false,
    hr: false,
    damage: false,
  })

  // ✅ FIX: Sync openMenus with current route on load/navigation
  useEffect(() => {
    const companyId = localStorage.getItem('selectedCompanyId')
    if (companyId) {
      setCurrentCompanyId(companyId)
    }

    // Auto-open the menu that contains the current route
    const path = location.pathname
    const menuMap = {
      '/pos': 'pos',
      '/pos-godown': 'pos',
      '/reports': 'pos',
      '/purchases': 'purchase',
      '/purchase-report': 'purchase',
      '/suppliers': 'purchase',
      '/inventory': 'inventory',
      '/inventory-report': 'inventory',
      '/stock-transfer': 'inventory',
      '/stock-transfer-report': 'inventory',
      '/excise-register': 'excise',
      '/exciseSizeWiseReport': 'excise',
      '/expenses': 'finance',
      '/cash-deposit': 'finance',
      '/employees': 'hr',
      '/employee-attendance': 'hr',
      '/attendance-reports': 'hr',
      '/Payslips': 'hr',
      '/salary-report': 'hr',
      '/damage': 'damage',
      '/item-wise-sell-report': 'item-wise-sell-report',
      '/item-wise-purchase-report': 'item-wise-purchase-report',
      '/cash-bank-report': 'cash-bank-report',
      '/company-stock-transfer': 'company-stock-transfer',
      '/mgr-report': 'mgr-report',
      '/company-transfer-report': 'company-transfer-report',
    }

    for (const [route, key] of Object.entries(menuMap)) {
      if (path.startsWith(route)) {
        setOpenMenus(prev => ({ ...prev, [key]: true }))
        break
      }
    }
  }, [location.pathname])

  // ─── Define all available nav items ───
  const allNavItems = [
    {
      to: currentCompanyId ? `/dashboard/${currentCompanyId}` : '/',
      icon: LayoutDashboard,
      label: 'Dashboard',
      roles: ['ADMIN', 'MANAGER']
    },
    {
      label: 'Sales & Billing',
      icon: ShoppingCart,
      key: 'pos',
      roles: ['ADMIN', 'MANAGER', 'SALESMAN'],
      children: [
        { to: '/pos', label: 'Counter', roles: ['ADMIN', 'MANAGER', 'SALESMAN'] },
        { to: '/pos-godown', label: 'WareHouse', roles: ['ADMIN', 'MANAGER'] },
        { to: '/reports', label: 'Sales Reports', roles: ['ADMIN', 'MANAGER'] },
        { to: '/item-wise-sell-report', label: 'Item-wise Sell Report', roles: ['ADMIN', 'MANAGER'] },
      ],
    },
    {
      label: 'Purchase Mgmt',
      icon: ShoppingBag,
      key: 'purchase',
      roles: ['ADMIN', 'MANAGER'],
      children: [
        { to: '/purchases', label: 'Purchase', roles: ['ADMIN', 'MANAGER'] },
        { to: '/purchase-report', label: 'Purchase Report', roles: ['ADMIN', 'MANAGER'] },
        { to: '/item-wise-purchase-report', label: 'Item-wise Purchase Report', roles: ['ADMIN', 'MANAGER'] },    
        { to: '/suppliers', label: 'Supplier', roles: ['ADMIN', 'MANAGER'] },
      ],
    },
    {
      label: 'Inventory & Stock',
      icon: Package,
      key: 'inventory',
      roles: ['ADMIN', 'MANAGER'],
      children: [
        { to: '/inventory', label: 'Inventory', roles: ['ADMIN', 'MANAGER'] },
        { to: '/inventory-report', label: 'Inv. Report', roles: ['ADMIN', 'MANAGER'] },
        { to: '/stock-transfer', label: 'Stock Transfer(G → C)', roles: ['ADMIN', 'MANAGER'] },
        { to: '/counter-to-godown-transfer', label: 'Stock Transfer(C → G)', roles: ['ADMIN', 'MANAGER'] },
        { to: '/stock-transfer-report', label: 'Transfer Report (G → C)', roles: ['ADMIN', 'MANAGER'] },
        { to: '/counter-to-godown-report', label: 'Transfer Report (C → G)', roles: ['ADMIN', 'MANAGER'] },
        { to: '/company-stock-transfer', label: 'Company Stock Transfer', roles: ['ADMIN', 'MANAGER'] },
        { to: '/mgr-report', label: 'MGR Report', roles: ['ADMIN', 'MANAGER'] },
        { to: '/company-transfer-report', label: 'Company Transfer Report', roles: ['ADMIN', 'MANAGER'] },
      ],
    },
    {
      label: 'Damage',
      icon: Package,
      key: 'damage',
      roles: ['ADMIN', 'MANAGER'],
      children: [
        { to: '/damage', label: 'Damage', roles: ['ADMIN', 'MANAGER'] },

      ],
    },
    {
      label: 'Excise Mgmt',
      icon: FileText,
      key: 'excise',
      roles: ['ADMIN', 'MANAGER'],
      children: [
        { to: '/excise-register', label: 'Excise Register', roles: ['ADMIN', 'MANAGER'] },
        { to: '/exciseSizeWiseReport', label: 'Size Report', roles: ['ADMIN', 'MANAGER'] },
      ],
    },
    {
      label: 'Finance & Acc.',
      icon: Receipt,
      key: 'finance',
      roles: ['ADMIN', 'MANAGER'],
      children: [
        { to: '/expenses', label: 'Expenses', roles: ['ADMIN', 'MANAGER'] },
        { to: '/cash-deposit', label: 'Cash & Bank', roles: ['ADMIN', 'MANAGER'] },
        { to: '/cash-bank-report', label: 'Cash & Bank Report', roles: ['ADMIN', 'MANAGER'] },
      ],
    },
    {
      label: 'HR & Payroll',
      icon: Users,
      key: 'hr',
      roles: ['ADMIN', 'MANAGER'],
      children: [
        { to: '/employees', label: 'Employees', roles: ['ADMIN', 'MANAGER'] },
        { to: '/employee-attendance', label: 'Attendance', roles: ['ADMIN', 'MANAGER'] },
        { to: '/attendance-reports', label: 'Att. Reports', roles: ['ADMIN', 'MANAGER'] },
        { to: '/Payslips', label: 'Payslip', roles: ['ADMIN', 'MANAGER'] },
        { to: '/salary-report', label: 'Salary Report', roles: ['ADMIN', 'MANAGER'] },
      ],
    },
  ]

  // ✅ FIX: Create NEW objects instead of mutating original array
  const navItems = allNavItems
    .filter(item => item.roles?.includes(role))
    .map(item => {
      if (!item.children) return item

      const filteredChildren = item.children.filter(
        child => child.roles?.includes(role)
      )

      if (filteredChildren.length === 0) return null

      return {
        ...item,
        children: filteredChildren,
      }
    })
    .filter(Boolean)

  const handleSignOut = async () => {
    await signOut()
    localStorage.removeItem('selectedCompanyId')
    navigate('/login')
  }

  const handleSwitchCompany = () => {
    localStorage.removeItem('selectedCompanyId')
    navigate('/companies')
    onClose()
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={clsx(
          'fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        )}
        onClick={onClose}
      />

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed top-0 left-0 z-40 h-full flex flex-col",
          "bg-gray-900 dark:bg-gray-950 border-r border-gray-800",
          "transition-all duration-300 ease-in-out",

          // Mobile
          open ? "translate-x-0" : "-translate-x-full",

          // Desktop
          "lg:translate-x-0 lg:relative lg:flex-shrink-0",

          desktopCollapsed
            ? "lg:w-20"
            : "lg:w-60",

          "w-60"
        )}
      >
        {/* Logo */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
              <img
                src="/vichaarlab.jpg"
                className="w-full h-full object-contain rounded"
                alt="Vichaar Lab Logo"
              />
            </div>
            <div
              className={clsx(
                desktopCollapsed && "lg:hidden"
              )}
            >
              <p className="text-white font-bold text-sm">
                VICHAAR
              </p>
              <p className="text-gray-400 text-xs">
                BevTrac
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Info */}
        <div
          className={clsx(
            'px-4 py-3 border-b border-gray-800',
            role === 'ADMIN' && 'cursor-pointer hover:bg-gray-800/70 transition-colors'
          )}
          onClick={() => {
            if (role === 'ADMIN') {
              navigate('/admin-dashboard')
              onClose()
            }
          }}
          title={role === 'ADMIN' ? 'Go to Admin Dashboard' : undefined}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-semibold">
                {user?.email?.[0]?.toUpperCase() || 'A'}
              </span>
            </div>
            <div
              className={clsx(
                "min-w-0 flex-1",
                desktopCollapsed && "lg:hidden"
              )}
            >
              <p className="text-gray-200 text-xs font-medium truncate">
                {user?.email || 'User'}
              </p>
              <p className="text-gray-500 text-xs">
                {role === 'ADMIN' ? 'Admin' : role === 'MANAGER' ? 'Manager' : 'Salesman'}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto scrollbar-thin">
          {navItems.map((item) => {
            const Icon = item.icon

            // ─── Parent with Children ───
            if (item.children) {
              const isOpen = openMenus[item.key]

              return (
                <div key={item.key}>
                  <button
                     onClick={() => {
    // If sidebar is collapsed on desktop, expand it first
    if (desktopCollapsed) {
      onClose(false); // We'll change this below
      return;
    }

    setOpenMenus(prev => ({
      ...prev,
      [item.key]: !prev[item.key],
    }));
  }}
                    className={clsx(
                      'w-full group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                      isOpen
                        ? 'bg-gray-800/80 text-gray-100'
                        : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                    )}
                  >
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!desktopCollapsed && (
                      <span className="flex-1 text-left font-medium truncate">
                        {item.label}
                      </span>
                    )}

                    {!desktopCollapsed && (
                      <ChevronDown
                        className={clsx(
                          'w-3.5 h-3.5 flex-shrink-0 transition-transform duration-200',
                          isOpen && 'rotate-180'
                        )}

                      />
                    )}
                  </button>

                  {/* ✅ FIX: Use smooth height transition */}
                 {!desktopCollapsed && ( <div
                    className={clsx(
                      'overflow-hidden transition-all duration-200',
                      isOpen ? 'max-h-96 opacity-100' : 'max-h-0 opacity-0'
                    )}
                  >
                    <div className="ml-5 pl-3 border-l border-gray-700/50 mt-1 space-y-0.5 pb-1">
                      {item.children.map((sub) => (
                        <NavLink
                          key={sub.to}
                          to={sub.to}
                          onClick={onClose}
                          className={({ isActive }) =>
                            clsx(
                              'flex items-center px-3 py-1.5 rounded-md text-[13px] transition-all duration-150',
                              isActive
                                ? 'bg-primary-600/90 text-white font-medium'
                                : 'text-gray-400 hover:bg-gray-800 hover:text-gray-200'
                            )
                          }
                        >
                          {sub.label}
                        </NavLink>
                      ))}
                    </div>
                  </div>
                  )}
                </div>
              )
            }

            // ─── Single Link ───
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to?.startsWith('/dashboard')}
                onClick={onClose}
                className={({ isActive }) =>
                  clsx(
                    'group flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all duration-150',
                    isActive
                      ? 'bg-primary-600 text-white shadow-lg shadow-primary-600/20'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-gray-100'
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon className="w-4 h-4 flex-shrink-0" />
                    {!desktopCollapsed && (
    <span className="flex-1 font-medium truncate">
        {item.label}
    </span>
)}
                    {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-70 flex-shrink-0" />}
                  </>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Bottom Actions */}
        <div className="px-3 pb-3 border-t border-gray-800 pt-3 space-y-0.5">
          {role === 'ADMIN' && (
            <button
              onClick={handleSwitchCompany}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-amber-900/20 hover:text-amber-400 transition-all duration-150"
            >
              <Building2 className="w-4 h-4 flex-shrink-0" />
             {!desktopCollapsed && (
    <span className="font-medium truncate">
        Switch Company
    </span>
)}
            </button>
          )}

          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-gray-400 hover:bg-red-900/20 hover:text-red-400 transition-all duration-150"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
             {!desktopCollapsed && (<span className="font-medium truncate">Sign Out</span>)}
          </button>
        </div>
      </aside>
    </>
  )
}