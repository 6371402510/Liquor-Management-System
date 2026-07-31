import { useState, useEffect } from 'react'
import { useLocation, useNavigate, Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import Header from './Header'

const pageTitles = {
  '/companies': 'Company Management',
  '/pos': 'POS Billing',
   '/pos-godown': 'Godown POS',
  '/inventory': 'Inventory',
  '/purchases': 'Purchase Entry',
  '/suppliers': 'Supplier Management',
  '/reports': 'Sales Reports',
  '/employees': 'Employees',
  '/expenses': 'Expenses',
  '/excise-register': 'Excise Register',
}

export default function Layout() {
const [sidebarOpen, setSidebarOpen] = useState(
  window.innerWidth >= 1024
)
  const location = useLocation()
  const navigate = useNavigate()  // ← ADD THIS

  // Handle dynamic dashboard route title
  let title = pageTitles[location.pathname]
  if (location.pathname.startsWith('/dashboard')) {
    title = 'Dashboard'
  }
  if (!title) title = 'IMFL Billing'

  // Close sidebar on route change on mobile
useEffect(() => {
  if (window.innerWidth < 1024) {
    setSidebarOpen(false)
  }
}, [location.pathname])

  // ═══════════════════════════════════════════════════════════
  // ADD THIS: Listen for Edit button click from Reports
  // ═══════════════════════════════════════════════════════════
  useEffect(() => {
    const handleEditNavigation = (event) => {
      const saleType = event.detail.type  // 'counter' or 'godown'

      if (saleType === 'counter') {
        navigate('/pos')
      } else if (saleType === 'godown') {
        navigate('/pos-godown')
      }
    }

    window.addEventListener('open-pos-edit', handleEditNavigation)
    return () => window.removeEventListener('open-pos-edit', handleEditNavigation)
  }, [navigate])

  return (
  <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
  <Sidebar
  open={sidebarOpen}
  desktopCollapsed={!sidebarOpen}
  onClose={() => {
    if (window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  }}
  setOpen={setSidebarOpen}
/>

  <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
    <Header
      onToggleSidebar={() => setSidebarOpen(prev => !prev)}
      title={title}
    />

    <main className="flex-1 flex flex-col min-h-0 overflow-y-auto p-4 lg:p-6">
      <Outlet />
    </main>
  </div>
</div>
  )
}