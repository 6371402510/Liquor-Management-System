import { useState, useEffect, useMemo, Fragment } from 'react'
import {
    Loader as Loader2, Filter, RotateCcw, FileDown, Package, AlertCircle,
    ChevronLeft, ChevronRight, Store, Landmark, Calendar
} from 'lucide-react'
import clsx from 'clsx'
import { format, addDays, differenceInDays } from 'date-fns'
import * as XLSX from 'xlsx'
import { save } from '@tauri-apps/plugin-dialog'
import { writeFile } from '@tauri-apps/plugin-fs'

import { getProducts } from '../apiservices/inventoryapi'
import { getPurchases, getPurchaseItems } from '../apiservices/purchasesapi'
import { getCounterSales, extractSaleItems } from '../apiservices/sales-counter'
import { getGodownSales, extractGodownSaleItems } from '../apiservices/godown-counter'

// ─── Helpers ───
const isTauri = () => '__TAURI_INTERNALS__' in window

const downloadAsBlob = (data, fileName) => {
    const blob = new Blob([data], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
}

// Normalize any date-ish value → 'yyyy-MM-dd'
const toYMD = (val) => {
    if (!val) return ''
    if (typeof val === 'string') {
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return val
        if (/^\d{4}-\d{2}-\d{2}T/.test(val)) return val.slice(0, 10)
    }
    try {
        return format(new Date(val), 'yyyy-MM-dd')
    } catch {
        return ''
    }
}

// ─── Column Group Definitions ───
const COLUMN_GROUPS = [
    { key: 'opening', label: 'Opening Stock', headerColor: 'text-blue-700 dark:text-blue-300', headerBg: 'bg-blue-50 dark:bg-blue-900/30', cellBg: 'bg-blue-50/40 dark:bg-blue-900/10' },
    { key: 'purchase', label: 'Purchase Stock', headerColor: 'text-green-700 dark:text-green-300', headerBg: 'bg-green-50 dark:bg-green-900/30', cellBg: 'bg-green-50/40 dark:bg-green-900/10' },
    { key: 'total', label: 'Total Stock', headerColor: 'text-slate-700 dark:text-slate-200', headerBg: 'bg-slate-100 dark:bg-slate-700', cellBg: 'bg-slate-50/60 dark:bg-slate-800/40' },
    { key: 'sale', label: 'Sales', headerColor: 'text-orange-700 dark:text-orange-300', headerBg: 'bg-orange-50 dark:bg-orange-900/30', cellBg: 'bg-orange-50/40 dark:bg-orange-900/10' },
    { key: 'closing', label: 'Closing Stock', headerColor: 'text-indigo-700 dark:text-indigo-300', headerBg: 'bg-indigo-50 dark:bg-indigo-900/30', cellBg: 'bg-indigo-50/40 dark:bg-indigo-900/10' },
]

export default function ExciseSizeWiseReport() {
    // ─── Company ───
    const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
    const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

    // ─── Data ───
    const [products, setProducts] = useState([])
    const [loading, setLoading] = useState(false)
    const [calculating, setCalculating] = useState(false)
    const [error, setError] = useState('')

    // ─── Filters ───
    const [filterDateFrom, setFilterDateFrom] = useState(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'))
    const [filterDateTo, setFilterDateTo] = useState(format(new Date(), 'yyyy-MM-dd'))
    const [filterSize, setFilterSize] = useState('ALL')
    const [showFilters, setShowFilters] = useState(true)
    const [filterProductType, setFilterProductType] = useState('ALL')

    // ─── Table Data ───
    const [dailyMovements, setDailyMovements] = useState({})

    // ─── Filtered products by type ───
    const filteredProducts = useMemo(() => {
        if (filterProductType === 'ALL') return products
        return products.filter(p => p.product_type === filterProductType)
    }, [products, filterProductType])

    // ─── All unique sizes sorted numerically ───
    const allSizes = useMemo(() => {
        const sizes = [...new Set(filteredProducts.map(p => p.bottle_size).filter(Boolean))]
        return sizes.sort((a, b) => (parseInt(a) || 0) - (parseInt(b) || 0))
    }, [filteredProducts])

    // ─── Dynamic Product Types ───
    const productTypes = useMemo(() => {
        const types = [...new Set(products.map(p => p.product_type).filter(Boolean))]
        return types.sort()
    }, [products])

    // ─── Active sizes (after size filter) ───
    const activeSizes = filterSize === 'ALL' ? allSizes : allSizes.filter(s => s === filterSize)

    // ─── Product → Size lookup (built from ALL products) ───
    const productSizeMap = useMemo(() => {
        const map = {}
        products.forEach(p => { if (p.bottle_size) map[p.id] = p.bottle_size })
        return map
    }, [products])

    // ─── Size-wise opening stock (from product.opening_stock) ───
    const sizeOpeningStock = useMemo(() => {
        const map = {}
        allSizes.forEach(s => { map[s] = 0 })
        filteredProducts.forEach(p => {
            const s = p.bottle_size
            if (s && map[s] !== undefined) {
                map[s] += Number(p.opening_stock) || 0
            }
        })
        return map
    }, [filteredProducts, allSizes])

    // ─── Date range ───
    const dateRange = useMemo(() => {
        const dates = []
        const from = new Date(filterDateFrom + 'T00:00:00')
        const to = new Date(filterDateTo + 'T00:00:00')
        const days = differenceInDays(to, from)
        for (let i = 0; i <= days; i++) {
            dates.push(format(addDays(from, i), 'yyyy-MM-dd'))
        }
        return dates
    }, [filterDateFrom, filterDateTo])

    // ─── Company listener ───
    useEffect(() => {
        const handleStorage = () => {
            const newId = localStorage.getItem('selectedCompanyId') || null
            if (newId !== companyId) setCompanyId(newId)
        }
        window.addEventListener('storage', handleStorage)
        const iv = setInterval(() => {
            const newId = localStorage.getItem('selectedCompanyId') || null
            if (newId !== companyId) setCompanyId(newId)
        }, 1000)
        return () => { window.removeEventListener('storage', handleStorage); clearInterval(iv) }
    }, [companyId])

    // ─── Fetch products ───
    useEffect(() => {
        if (!companyId) { setProducts([]); return }
        fetchProducts()
    }, [companyId])

    const fetchProducts = async () => {
        setLoading(true); setError('')
        try {
            const data = await getProducts(Number(companyId))
            setProducts(data || [])
        } catch (err) {
            setError(err.message || 'Failed to load products')
        } finally { setLoading(false) }
    }

    // ─── Fetch & calculate movements when date range changes ───
    useEffect(() => {
        if (!companyId || products.length === 0 || dateRange.length === 0) return
        calculateMovements()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filterDateFrom, filterDateTo, products, companyId])

    const calculateMovements = async () => {
        setCalculating(true)
        try {
            // Build size set from ALL products (so nothing gets dropped)
            const sizeSet = new Set()
            products.forEach(p => { if (p.bottle_size) sizeSet.add(p.bottle_size) })
            const allProductSizes = [...sizeSet]

            // Initialize daily map
            const daily = {}
            dateRange.forEach(d => {
                daily[d] = {}
                allProductSizes.forEach(s => { daily[d][s] = { purchase: 0, sale: 0 } })
            })

            // ── Purchases ──
            // Backend /purchases/ has NO date params → fetch broad + filter client-side
            const allPurchases = await getPurchases(Number(companyId), 0, 100000).catch(err => {
                console.error('[ExciseSizeWise] getPurchases failed:', err)
                return []
            })
            const purchases = allPurchases.filter(p => {
                const d = toYMD(p.billing_date || p.purchase_date)
                return d && d >= filterDateFrom && d <= filterDateTo
            })

            // ── Sales (backend accepts date_from/date_to) ──
            const [counterSales, godownSales] = await Promise.all([
                getCounterSales(Number(companyId), filterDateFrom, filterDateTo).catch(err => {
                    console.error('[ExciseSizeWise] getCounterSales failed:', err)
                    return []
                }),
                getGodownSales(Number(companyId), filterDateFrom, filterDateTo).catch(err => {
                    console.error('[ExciseSizeWise] getGodownSales failed:', err)
                    return []
                }),
            ])

            // ── Purchase items (real endpoint exists) ──
            const purchaseItemArrays = await Promise.all(
                purchases.map(p =>
                    getPurchaseItems(p.id, Number(companyId)).catch(err => {
                        console.error('[ExciseSizeWise] getPurchaseItems failed for', p.id, err)
                        return []
                    })
                )
            )

            // ── Aggregate purchases by date + size ──
            purchases.forEach((p, idx) => {
                const pDate = toYMD(p.billing_date || p.purchase_date)
                if (!pDate || !daily[pDate]) return
                ;(purchaseItemArrays[idx] || []).forEach(item => {
                    const size = productSizeMap[item.product_id] || item.bottle_size
                    if (size && daily[pDate][size]) {
                        daily[pDate][size].purchase +=
                            Number(item.total_bottles ?? item.totalBottles ?? item.quantity ?? 0) || 0
                    }
                })
            })

            // ── Aggregate sales by date + size (items embedded in each sale) ──
            const allSales = [
                ...counterSales.map(s => ({
                    date: s.sale_date || s.billing_date || s.created_at,
                    items: extractSaleItems(s),
                })),
                ...godownSales.map(s => ({
                    date: s.sale_date || s.billing_date || s.created_at,
                    items: extractGodownSaleItems(s),
                })),
            ]

            allSales.forEach(sale => {
                const sDate = toYMD(sale.date)
                if (!sDate || !daily[sDate]) return
                ;(sale.items || []).forEach(item => {
                    const size = productSizeMap[item.product_id] || item.bottle_size
                    if (size && daily[sDate][size]) {
                        daily[sDate][size].sale +=
                            Number(item.quantity ?? item.total_bottles ?? item.totalBottles ?? 0) || 0
                    }
                })
            })

            // ── Debug (remove once verified) ──
            console.log('[ExciseSizeWise] sizes:', allProductSizes.length,
                        '| purchases:', purchases.length,
                        '| counterSales:', counterSales.length,
                        '| godownSales:', godownSales.length)
            console.log('[ExciseSizeWise] sample counter sale:', counterSales[0])
            console.log('[ExciseSizeWise] sample godown sale:', godownSales[0])
            console.log('[ExciseSizeWise] sample purchase:', purchases[0])

            setDailyMovements(daily)
        } catch (err) {
            console.error('Error calculating movements:', err)
        } finally { setCalculating(false) }
    }

    // ─── Calculate rows with opening/closing ───
    const calculatedRows = useMemo(() => {
        const prevClosing = {}
        allSizes.forEach(size => { prevClosing[size] = 0 })

        return dateRange.map((date, index) => {
            const dayData = dailyMovements[date] || {}
            const row = { date }

            let tOpen = 0
            let tPurchase = 0
            let tSale = 0
            let tClosing = 0

            allSizes.forEach(size => {
                // First date → product opening_stock ; else → previous closing
                const opening = index === 0
                    ? (sizeOpeningStock[size] || 0)
                    : (prevClosing[size] || 0)

                const purchase = dayData[size]?.purchase || 0
                const total = opening + purchase
                const sale = dayData[size]?.sale || 0
                const closing = Math.max(0, total - sale)

                row[`${size}_opening`] = opening
                row[`${size}_purchase`] = purchase
                row[`${size}_total`] = total
                row[`${size}_sale`] = sale
                row[`${size}_closing`] = closing

                prevClosing[size] = closing

                tOpen += opening
                tPurchase += purchase
                tSale += sale
                tClosing += closing
            })

            row.total_opening = tOpen
            row.total_purchase = tPurchase
            row.total_total = tOpen + tPurchase
            row.total_sale = tSale
            row.total_closing = tClosing

            return row
        })
    }, [dateRange, dailyMovements, allSizes, sizeOpeningStock])

    // ─── Totals row ───
    const totalsRow = useMemo(() => {
        const t = { date: 'TOTAL' }
        allSizes.forEach(s => {
            COLUMN_GROUPS.forEach(g => {
                t[`${s}_${g.key}`] = calculatedRows.reduce((sum, r) => sum + (r[`${s}_${g.key}`] || 0), 0)
            })
        })
        COLUMN_GROUPS.forEach(g => {
            t[`total_${g.key}`] = calculatedRows.reduce((sum, r) => sum + (r[`total_${g.key}`] || 0), 0)
        })
        return t
    }, [calculatedRows, allSizes])

    // ─── Clear filters ───
    const clearFilters = () => {
        setFilterDateFrom(format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'))
        setFilterDateTo(format(new Date(), 'yyyy-MM-dd'))
        setFilterSize('ALL')
        setFilterProductType('ALL')
    }

    // ─── Export Excel with merged headers ───
    const handleExport = async () => {
        if (calculatedRows.length === 0) return alert('No data to export')

        const wb = XLSX.utils.book_new()
        const ws = {}
        const merges = []

        const setCell = (r, c, val, style = {}) => {
            const addr = XLSX.utils.encode_cell({ r, c })
            ws[addr] = { t: typeof val === 'number' ? 'n' : 's', v: val }
            if (Object.keys(style).length) ws[addr].s = style
        }

        // Row 0: Group headers
        setCell(0, 0, 'Date', { font: { bold: true }, alignment: { vertical: 'center' } })
        merges.push({ s: { r: 0, c: 0 }, e: { r: 1, c: 0 } })

        let col = 1
        COLUMN_GROUPS.forEach(group => {
            const startCol = col
            setCell(0, col, group.label, {
                font: { bold: true, color: { rgb: group.key === 'opening' ? '1D4ED8' : group.key === 'purchase' ? '15803D' : group.key === 'sale' ? 'C2410C' : group.key === 'closing' ? '4338CA' : '374151' } },
                alignment: { horizontal: 'center', vertical: 'center' },
                fill: { fgColor: { rgb: group.key === 'total' ? 'F1F5F9' : 'F9FAFB' } }
            })
            merges.push({ s: { r: 0, c: startCol }, e: { r: 0, c: startCol + activeSizes.length } })
            col += activeSizes.length + 1
        })

        // Row 1: Sub headers
        col = 1
        COLUMN_GROUPS.forEach(group => {
            activeSizes.forEach(size => {
                setCell(1, col, size, { font: { bold: true, size: 10 }, alignment: { horizontal: 'center' } })
                col++
            })
            setCell(1, col, 'Total', { font: { bold: true }, alignment: { horizontal: 'center' } })
            col++
        })

        // Data rows
        calculatedRows.forEach((row, idx) => {
            const r = idx + 2
            setCell(r, 0, format(new Date(row.date + 'T00:00:00'), 'dd/MM/yyyy'), { alignment: { vertical: 'center' } })
            let c = 1
            COLUMN_GROUPS.forEach(group => {
                activeSizes.forEach(size => {
                    setCell(r, c, row[`${size}_${group.key}`] || 0, { alignment: { horizontal: 'right' } })
                    c++
                })
                setCell(r, c, row[`total_${group.key}`] || 0, { font: { bold: true }, alignment: { horizontal: 'right' } })
                c++
            })
        })

        // Totals row
        const tr = calculatedRows.length + 2
        setCell(tr, 0, 'TOTAL', { font: { bold: true } })
        let tc = 1
        COLUMN_GROUPS.forEach(group => {
            activeSizes.forEach(size => {
                setCell(tr, tc, totalsRow[`${size}_${group.key}`] || 0, { font: { bold: true }, alignment: { horizontal: 'right' } })
                tc++
            })
            setCell(tr, tc, totalsRow[`total_${group.key}`] || 0, { font: { bold: true }, alignment: { horizontal: 'right' } })
            tc++
        })

        ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: tr, c: tc - 1 } })
        ws['!merges'] = merges
        ws['!cols'] = [{ wch: 14 }, ...Array(tc - 1).fill(null).map(() => ({ wch: 13 }))]

        XLSX.utils.book_append_sheet(wb, ws, 'Size Wise Excise')

        const fileName = `Excise_SizeWise_${companyName}_${filterDateFrom}_to_${filterDateTo}.xlsx`
        const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

        if (isTauri()) {
            try {
                const filePath = await save({ defaultPath: fileName, filters: [{ name: 'Excel', extensions: ['xlsx'] }] })
                if (filePath) await writeFile(filePath, new Uint8Array(wbout))
            } catch { downloadAsBlob(wbout, fileName) }
        } else {
            downloadAsBlob(wbout, fileName)
        }
    }

    // ─── Guard ───
    if (!companyId) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
                <AlertCircle className="w-12 h-12 text-amber-500" />
                <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
                <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to view the size-wise excise report.</p>
            </div>
        )
    }

    return (
        <div className="space-y-5">
            {/* ─── Header ─── */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                <div className="flex items-center gap-3 flex-wrap">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
                        <Landmark className="w-5 h-5 text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100">Excise Size-Wise Stock Report</h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {dateRange.length} days • {format(new Date(filterDateFrom), 'dd MMM yyyy')} – {format(new Date(filterDateTo), 'dd MMM yyyy')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
                        <Store className="w-3.5 h-3.5 text-primary-500" />
                        <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button onClick={() => setShowFilters(s => !s)} className={clsx("btn-secondary flex items-center gap-2 text-xs", showFilters && "bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 text-indigo-700")}>
                        <Filter className="w-3.5 h-3.5" /> Filters
                    </button>
                    <button onClick={handleExport} disabled={calculating || calculatedRows.length === 0} className="btn-secondary bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 flex items-center gap-2 text-xs disabled:opacity-40">
                        <FileDown className="w-3.5 h-3.5" /> Export Excel
                    </button>
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {/* ─── Filters ─── */}
            {showFilters && (
                <div className="card p-4 border dark:border-slate-700 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 flex items-center gap-2"><Filter className="w-4 h-4 text-indigo-500" /> Filters</h3>
                        <button onClick={clearFilters} className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 font-medium"><RotateCcw className="w-3 h-3" /> Clear</button>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Period From</label>
                            <input type="date" value={filterDateFrom} onChange={e => setFilterDateFrom(e.target.value)} className="input-field text-xs" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Period To</label>
                            <input type="date" value={filterDateTo} onChange={e => setFilterDateTo(e.target.value)} className="input-field text-xs" />
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Product Type</label>
                            <select value={filterProductType} onChange={e => setFilterProductType(e.target.value)} className="input-field text-xs">
                                <option value="ALL">All Types</option>
                                {productTypes.map(t => <option key={t}>{t}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-[10px] font-medium text-gray-500 mb-1 uppercase">Bottle Size</label>
                            <select value={filterSize} onChange={e => setFilterSize(e.target.value)} className="input-field text-xs">
                                <option value="ALL">All Sizes ({allSizes.length})</option>
                                {allSizes.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                        <div className="flex items-end">
                            <div className="p-2.5 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800 w-full">
                                <p className="text-[10px] text-amber-700 dark:text-amber-300 leading-relaxed">
                                    <strong>Note:</strong> First date's opening uses product <code className="bg-amber-100 dark:bg-amber-900/40 px-0.5 rounded">opening_stock</code>. Subsequent dates carry forward previous closing.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Quick Date Presets */}
                    <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-800">
                        <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide self-center mr-1">Quick:</span>
                        {[
                            { label: 'This Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth(), 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
                            { label: 'Last Month', from: format(new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1), 'yyyy-MM-dd'), to: format(new Date(new Date().getFullYear(), new Date().getMonth(), 0), 'yyyy-MM-dd') },
                            { label: 'This Quarter', from: format(new Date(new Date().getFullYear(), Math.floor(new Date().getMonth() / 3) * 3, 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
                            { label: 'This Year', from: format(new Date(new Date().getFullYear(), 0, 1), 'yyyy-MM-dd'), to: format(new Date(), 'yyyy-MM-dd') },
                        ].map(preset => (
                            <button key={preset.label} type="button" onClick={() => { setFilterDateFrom(preset.from); setFilterDateTo(preset.to) }}
                                className={clsx("text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors",
                                    filterDateFrom === preset.from && filterDateTo === preset.to
                                        ? "bg-indigo-100 dark:bg-indigo-900/40 border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300"
                                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                                )}>
                                {preset.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ─── Size Legend ─── */}
            <div className="flex flex-wrap items-center gap-2">
                <span className="text-[10px] uppercase font-semibold text-gray-400 tracking-wide">Sizes:</span>
                {activeSizes.map(s => (
                    <span key={s} className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-gray-600 dark:text-gray-400 border border-slate-200 dark:border-slate-700">{s}</span>
                ))}
                <span className="text-[10px] text-gray-400 ml-1">({activeSizes.length} sizes × {dateRange.length} days)</span>
            </div>

            {/* ─── Main Table ─── */}
            <div className="card overflow-hidden border dark:border-slate-700 shadow-sm">
                {calculating && (
                    <div className="w-full bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs text-center py-2 font-medium flex items-center justify-center gap-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Calculating size-wise movements...
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="w-full text-xs border-collapse">
                        {/* Header Row 1: Column Groups */}
                        <thead>
                            <tr className="border-b-2 border-gray-300 dark:border-gray-600">
                                <th rowSpan={2} className="p-3 text-left font-bold text-gray-700 dark:text-gray-200 bg-slate-50 dark:bg-slate-800/80 sticky left-0 z-10 min-w-[110px] border-r border-gray-200 dark:border-gray-700">
                                    <div className="flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> Date</div>
                                </th>
                                {COLUMN_GROUPS.map(group => (
                                    <th
                                        key={group.key}
                                        colSpan={activeSizes.length + 1}
                                        className={clsx("p-2.5 text-center font-bold text-xs uppercase tracking-wider border-l border-gray-200 dark:border-gray-700", group.headerBg, group.headerColor)}
                                    >
                                        {group.label}
                                    </th>
                                ))}
                            </tr>

                            {/* Header Row 2: Sizes */}
                            <tr className="border-b border-gray-200 dark:border-gray-700 bg-slate-50/50 dark:bg-slate-800/30">
                                {COLUMN_GROUPS.map(group => (
                                    <Fragment key={`sub-${group.key}`}>
                                        {activeSizes.map(size => (
                                            <th key={size} className={clsx("p-2 text-center font-semibold text-[10px] uppercase tracking-wide border-l border-gray-100 dark:border-gray-700/50", group.headerBg)}>
                                                {size}
                                            </th>
                                        ))}
                                        <th className={clsx("p-2 text-center font-bold text-[10px] uppercase tracking-wide border-l-2 border-gray-300 dark:border-gray-600", group.headerBg, group.headerColor)}>
                                            Total
                                        </th>
                                    </Fragment>
                                ))}
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                            {loading ? (
                                <tr>
                                    <td colSpan={1 + COLUMN_GROUPS.length * (activeSizes.length + 1)} className="text-center py-12">
                                        <Loader2 className="w-6 h-6 animate-spin text-primary-500 mx-auto" />
                                    </td>
                                </tr>
                            ) : calculatedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={1 + COLUMN_GROUPS.length * (activeSizes.length + 1)} className="text-center py-12 text-sm text-gray-400">
                                        No data found
                                    </td>
                                </tr>
                            ) : (
                                calculatedRows.map((row) => (
                                    <tr key={row.date} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/20 transition-colors">
                                        <td className="p-2.5 font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-900 sticky left-0 z-10 border-r border-gray-100 dark:border-gray-800 whitespace-nowrap">
                                            {format(new Date(row.date + 'T00:00:00'), 'dd/MM/yyyy')}
                                        </td>

                                        {COLUMN_GROUPS.map(group => (
                                            <Fragment key={`data-${group.key}-${row.date}`}>
                                                {activeSizes.map(size => (
                                                    <td key={size} className={clsx("p-2 text-right tabular-nums border-l border-gray-50 dark:border-gray-800/50", group.cellBg)}>
                                                        {(row[`${size}_${group.key}`] || 0).toLocaleString()}
                                                    </td>
                                                ))}
                                                <td className={clsx("p-2 text-right font-bold tabular-nums border-l-2 border-gray-200 dark:border-gray-700", group.cellBg)}>
                                                    {(row[`total_${group.key}`] || 0).toLocaleString()}
                                                </td>
                                            </Fragment>
                                        ))}
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ─── Footer Info ─── */}
            {!loading && calculatedRows.length > 0 && (
                <div className="text-[10px] text-gray-400 text-right">
                    {calculatedRows.length} rows × {(activeSizes.length + 1) * COLUMN_GROUPS.length + 1} columns
                </div>
            )}
        </div>
    )
}