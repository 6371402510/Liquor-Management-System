import { getSuppliers, createSupplier } from '../apiservices/supplierapi'

const DEFAULT_SUPPLIER = {
  name: 'Odisha State Beverages Corporation Limited',
  contact_person: '',
  phone: '0674 2303972',
  email: 'contact.osbcl-od@nic.in',
  address: `2nd Floor, Fortune Towers, Chandrasekharpur,
Bhubaneswar-751023 (Odisha)`,
  gst_number: '',
  license_number: '',
}

const LOCK_KEY = '_supplier_init_lock'
const LOCK_MS = 5000 // 5 second lock

function acquireLock() {
  const existing = localStorage.getItem(LOCK_KEY)
  if (existing && (Date.now() - Number(existing)) < LOCK_MS) {
    return false // Another page is currently creating
  }
  localStorage.setItem(LOCK_KEY, String(Date.now()))
  return true
}

function releaseLock() {
  localStorage.removeItem(LOCK_KEY)
}

// Deduplicate suppliers by name (keep lowest ID / first occurrence)
function deduplicate(list) {
  const seen = new Set()
  return (list || []).filter(s => {
    if (seen.has(s.name)) return false
    seen.add(s.name)
    return true
  })
}

export async function fetchSuppliersSafe() {
  // 1. Fetch current list
  let data = deduplicate(await getSuppliers().catch(() => []))

  // 2. Check if default exists
  const defaultExists = data.some(s => s.name === DEFAULT_SUPPLIER.name)

  if (!defaultExists) {
    if (acquireLock()) {
      // We got the lock — we are responsible for creating
      try {
        // One final check after acquiring lock
        const recheck = deduplicate(await getSuppliers().catch(() => []))
        if (!recheck.some(s => s.name === DEFAULT_SUPPLIER.name)) {
          const created = await createSupplier(DEFAULT_SUPPLIER)
          data = [...recheck, created]
        } else {
          data = recheck // Another call just created it
        }
      } catch (err) {
        console.error('Failed to create default supplier:', err)
      } finally {
        releaseLock()
      }
    } else {
      // Another page has the lock — wait for it to finish, then refetch
      await new Promise(r => setTimeout(r, 1500))
      data = deduplicate(await getSuppliers().catch(() => []))
    }
  }

  return data
}