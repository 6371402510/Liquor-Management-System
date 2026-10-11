import { useRef } from 'react'
import { X, Printer, Download, Building2, Truck } from 'lucide-react'

export default function CompanyTransferInvoiceModal({ invoice, onClose }) {
  const printRef = useRef(null)

  if (!invoice) return null

  const handlePrint = () => {
    const printContents = printRef.current.innerHTML
    const win = window.open('', '', 'height=900,width=800')
    win.document.write(`
      <html>
        <head>
          <title>${invoice.invoice_number}</title>
          <style>
            * { box-sizing: border-box; }
            body { font-family: Arial, sans-serif; padding: 24px; color: #111; }
            .header { display: flex; justify-content: space-between; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 16px; }
            .title { font-size: 22px; font-weight: bold; }
            .sub { font-size: 12px; color: #555; }
            .grid { display: flex; gap: 24px; margin-bottom: 16px; }
            .box { flex: 1; border: 1px solid #ccc; border-radius: 6px; padding: 10px; font-size: 12px; }
            .box h4 { margin: 0 0 6px; font-size: 12px; text-transform: uppercase; color: #666; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 12px; }
            th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
            th { background: #f3f4f6; font-weight: 600; }
            .right { text-align: right; }
            .center { text-align: center; }
            .totals { margin-top: 16px; width: 300px; margin-left: auto; font-size: 13px; }
            .totals-row { display: flex; justify-content: space-between; padding: 4px 0; }
            .grand { font-weight: bold; font-size: 15px; border-top: 2px solid #333; padding-top: 8px; }
            .sign { margin-top: 60px; display: flex; justify-content: space-between; font-size: 12px; }
            .sign div { border-top: 1px solid #333; padding-top: 6px; width: 200px; text-align: center; }
          </style>
        </head>
        <body>${printContents}</body>
      </html>
    `)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 300)
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto p-4">
      <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl my-8">
        {/* Header bar */}
        <div className="flex items-center justify-between p-4 border-b dark:border-gray-700">
          <h3 className="font-bold text-lg">Transfer Invoice</h3>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="btn-secondary flex items-center gap-1 text-sm">
              <Printer className="w-4 h-4" /> Print
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable content */}
        <div ref={printRef} className="p-6">
          {/* Header */}
          <div className="header flex justify-between items-start border-b-2 border-gray-800 pb-3 mb-4">
            <div>
              <div className="title text-2xl font-bold">STOCK TRANSFER INVOICE</div>
              <div className="sub text-sm text-gray-500">Company to Company Transfer</div>
            </div>
            <div className="text-right text-xs">
              <div><b>Invoice #:</b> {invoice.invoice_number}</div>
              <div><b>Transfer #:</b> {invoice.transfer_number}</div>
              <div><b>Date:</b> {new Date(invoice.transfer_date).toLocaleString()}</div>
            </div>
          </div>

          {/* From / To */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="border rounded-lg p-3 text-xs">
              <h4 className="font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> From (Source)
              </h4>
              <div className="font-bold text-sm">{invoice.from_company_name}</div>
              {invoice.from_company_address && <div>{invoice.from_company_address}</div>}
              {invoice.from_company_gst && <div>GST: {invoice.from_company_gst}</div>}
              {invoice.from_company_phone && <div>Ph: {invoice.from_company_phone}</div>}
            </div>
            <div className="border rounded-lg p-3 text-xs">
              <h4 className="font-semibold text-gray-500 uppercase mb-1 flex items-center gap-1">
                <Building2 className="w-3 h-3" /> To (Destination)
              </h4>
              <div className="font-bold text-sm">{invoice.to_company_name}</div>
              {invoice.to_company_address && <div>{invoice.to_company_address}</div>}
              {invoice.to_company_gst && <div>GST: {invoice.to_company_gst}</div>}
              {invoice.to_company_phone && <div>Ph: {invoice.to_company_phone}</div>}
            </div>
          </div>

          {invoice.vehicle_number && (
            <div className="text-xs mb-3 flex items-center gap-2">
              <Truck className="w-3 h-3 text-gray-500" />
              <b>Vehicle:</b> {invoice.vehicle_number}
            </div>
          )}

          {/* Items table */}
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-gray-100">
                <th className="border p-2 text-left">#</th>
                <th className="border p-2 text-left">Product Name</th>
                <th className="border p-2 text-left">Size</th>
                <th className="border p-2 text-right">Rate / Case</th>
                <th className="border p-2 text-center">Qty (Cases)</th>
                <th className="border p-2 text-center">Qty (Units)</th>
                <th className="border p-2 text-right">Total Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.items.map((it, i) => (
                <tr key={i}>
                  <td className="border p-2">{i + 1}</td>
                  <td className="border p-2 font-medium">{it.product_name}</td>
                  <td className="border p-2">{it.bottle_size || '-'}</td>
                  <td className="border p-2 text-right">₹{it.rate_per_case.toFixed(2)}</td>
                  <td className="border p-2 text-center">{it.quantity_cases}</td>
                  <td className="border p-2 text-center">{it.quantity_units}</td>
                  <td className="border p-2 text-right font-semibold">₹{it.total_amount.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="totals mt-4 ml-auto w-72 text-sm">
            <div className="totals-row flex justify-between py-1">
              <span>Total Cases:</span>
              <span className="font-semibold">{invoice.total_cases}</span>
            </div>
            <div className="totals-row flex justify-between py-1">
              <span>Total Units:</span>
              <span className="font-semibold">{invoice.total_units}</span>
            </div>
            <div className="totals-row flex justify-between py-1">
              <span>Subtotal:</span>
              <span>₹{invoice.subtotal.toFixed(2)}</span>
            </div>
            <div className="grand flex justify-between py-2 border-t-2 border-gray-800 font-bold text-base">
              <span>Grand Total:</span>
              <span>₹{invoice.grand_total.toFixed(2)}</span>
            </div>
          </div>

          {invoice.notes && (
            <div className="mt-4 text-xs">
              <b>Notes:</b> {invoice.notes}
            </div>
          )}

          {/* Signatures */}
          <div className="sign flex justify-between mt-16 text-xs">
            <div className="border-t border-gray-800 pt-2 w-48 text-center">
              Prepared By
            </div>
            <div className="border-t border-gray-800 pt-2 w-48 text-center">
              Received By
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}