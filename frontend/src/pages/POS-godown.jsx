import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart,
  Printer, CheckCircle, X, Loader2, CreditCard, Banknote,
  Smartphone, Send, Package, Tag, Hash, Calendar, Layers, Download,
  AlertCircle, ChevronDown, Store
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { getGodownProducts, processGodownCheckout } from '../apiservices/godown-counter';
import { openUrl } from '@tauri-apps/plugin-opener'

function generateInvoiceNumber(companyId) {
  if (!companyId) return `GD-TEMP-${Date.now()}`;

  const storageKey = `godown_invoice_counter_${companyId}`;
  let lastNumber = parseInt(localStorage.getItem(storageKey) || '0', 10);
  lastNumber += 1;

  localStorage.setItem(storageKey, String(lastNumber));

  return `GD-${String(lastNumber).padStart(4, '0')}`;
}

let scanCounter = 0;
function generateScanId(productId) {
  scanCounter++;
  return `${productId}-scan-${Date.now()}-${scanCounter}`;
}

export default function POSGodown() {
  const [companyId, setCompanyId] = useState(() => localStorage.getItem('selectedCompanyId') || null)
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company'

  const [companyDetails, setCompanyDetails] = useState(() => {
    try {
      const saved = localStorage.getItem('selectedCompany');
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);

  const [cart, setCart] = useState(() => {
    try {
      const saved = localStorage.getItem('godown_cart');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });

  const [search, setSearch] = useState('');
  const [paymentSplits, setPaymentSplits] = useState([]);

  const [customerName, setCustomerName] = useState(() => {
    try { const saved = localStorage.getItem('godown_customerName'); return saved ? JSON.parse(saved) : 'Walk-in Customer'; } catch { return 'Walk-in Customer'; }
  });

  const [customerPhone, setCustomerPhone] = useState(() => {
    try { const saved = localStorage.getItem('godown_customerPhone'); return saved ? JSON.parse(saved) : ''; } catch { return ''; }
  });

  const [discount, setDiscount] = useState(() => {
    try { const saved = localStorage.getItem('godown_discount'); return saved ? JSON.parse(saved) : 0; } catch { return 0; }
  });

  const [recentlyScanned, setRecentlyScanned] = useState([]);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);

  const barcodeRef = useRef(null);
  const qtyInputRefs = useRef({});
  const discInputRefs = useRef({});
  const [focusRequest, setFocusRequest] = useState(null);

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState('');

  const [selectedItems, setSelectedItems] = useState([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printCustomerName, setPrintCustomerName] = useState('');
  const [printCustomerPhone, setPrintCustomerPhone] = useState('');
  const [printing, setPrinting] = useState(false);

  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const isTauri = () => '__TAURI_INTERNALS__' in window

  // ─── PERSISTENCE ───
  useEffect(() => { localStorage.setItem('godown_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => {
    const lastMode = paymentSplits.length > 0 ? paymentSplits[0].mode : 'CASH';
    localStorage.setItem('godown_lastPaymentMode', JSON.stringify(lastMode));
  }, [paymentSplits]);
  useEffect(() => { localStorage.setItem('godown_customerName', JSON.stringify(customerName)); }, [customerName]);
  useEffect(() => { localStorage.setItem('godown_customerPhone', JSON.stringify(customerPhone)); }, [customerPhone]);
  useEffect(() => { localStorage.setItem('godown_discount', JSON.stringify(discount)); }, [discount]);

  useEffect(() => { if (companyId) fetchProducts(); }, [companyId]);

  // ─── Auto-Focus Logic ───
  useEffect(() => {
    if (focusRequest) {
      const { scanId, field } = focusRequest;
      const timer = setTimeout(() => {
        if (field === 'qty' && qtyInputRefs.current[scanId]) {
          qtyInputRefs.current[scanId].focus();
          qtyInputRefs.current[scanId].select();
        } else if (field === 'disc' && discInputRefs.current[scanId]) {
          discInputRefs.current[scanId].focus();
          discInputRefs.current[scanId].select();
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [focusRequest]);

  const fetchProducts = async (searchTerm = '') => {
    setLoadingProducts(true);
    try {
      const data = await getGodownProducts(companyId, searchTerm);
      setProducts(data || []);
      setFilteredProducts(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingProducts(false);
    }
  };

 useEffect(() => {
  const availableProducts = products.filter(
    p => Number(p.godown_stock) > 0
  );

  if (search.trim()) {
    const q = search.toLowerCase();

    setFilteredProducts(
      availableProducts.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.barcode || '').includes(q) ||
        (p.brand || '').toLowerCase().includes(q) ||
        (p.item_code || '').toLowerCase().includes(q) ||
        (p.traditional_name || '').toLowerCase().includes(q)
      )
    );
  } else {
    setFilteredProducts(availableProducts);
  }
}, [products, search]);

  useEffect(() => {
    setSelectedItems(prev => prev.filter(scanId => cart.some(item => item.scanId === scanId)));
  }, [cart]);

  const addToCart = useCallback((product) => {
    if ((product.godown_stock || 0) <= 0) {
      alert(`${product.name} is Out Of Stock`);
      return;
    }

    let focusScanId = null;

    setCart(prev => {
      const existingItem = prev.find(
        item => item.productId === product.id
      );

      const totalQty = prev
        .filter(item => item.productId === product.id)
        .reduce(
          (sum, item) => sum + (Number(item.quantity) || 0),
          0
        );

      if (totalQty >= product.godown_stock) {
        alert(`Only ${product.godown_stock} items available in stock`);
        return prev;
      }

      if (existingItem) {
        focusScanId = existingItem.scanId;
        return prev.map(item =>
          item.scanId === existingItem.scanId
            ? {
                ...item,
                quantity: (Number(item.quantity) || 0) + 1
              }
            : item
        );
      }

      const newScanId = generateScanId(product.id);
      focusScanId = newScanId;

      return [
        ...prev,
        {
          ...product,
          scanId: newScanId,
          productId: product.id,
          quantity: 1,
          discount: 0
        }
      ];
    });

    setTimeout(() => {
      if (focusScanId && qtyInputRefs.current[focusScanId]) {
        qtyInputRefs.current[focusScanId].focus();
        qtyInputRefs.current[focusScanId].select();
      }
    }, 100);

    setRecentlyScanned(prev => {
      const filtered = prev.filter(p => p.id !== product.id);
      return [{ ...product, scanTime: Date.now() }, ...filtered].slice(0, 15);
    });
  }, []);

  const updateQuantity = (scanId, delta) => {
    setCart(prev => {
      const item = prev.find(i => i.scanId === scanId);
      if (!item) return prev;

      const currentQty = Number(item.quantity) || 0;
      const newQty = currentQty + delta;

      if (newQty < 1) {
        return prev.filter(i => i.scanId !== scanId);
      }

      const totalQty = prev
        .filter(i => i.productId === item.productId)
        .reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);

      if (delta > 0 && totalQty >= (item.godown_stock || 0)) {
        alert(`Only ${item.godown_stock} items available in godown stock!`);
        return prev;
      }

      return prev.map(i =>
        i.scanId === scanId ? { ...i, quantity: newQty } : i
      );
    });
  };

  const handleManualQuantityChange = (scanId, value) => {
    setCart(prev => {
      const item = prev.find(i => i.scanId === scanId);
      if (!item) return prev;

      if (value === '') {
        return prev.map(i => i.scanId === scanId ? { ...i, quantity: '' } : i);
      }

      const newQty = parseInt(value, 10);
      if (isNaN(newQty)) return prev;

      const currentQtyOtherRows = prev
        .filter(i => i.productId === item.productId && i.scanId !== scanId)
        .reduce((sum, i) => sum + (parseInt(i.quantity) || 0), 0);

      if (currentQtyOtherRows + newQty > (item.godown_stock || 0)) {
        alert(`Only ${item.godown_stock} items available in godown stock!`);
        const maxAllowed = Math.max(1, (item.godown_stock || 0) - currentQtyOtherRows);
        return prev.map(i =>
          i.scanId === scanId ? { ...i, quantity: maxAllowed } : i
        );
      }

      return prev.map(i =>
        i.scanId === scanId ? { ...i, quantity: newQty } : i
      );
    });
  };

  const handleQuantityBlur = (scanId) => {
    setCart(prev => {
      const item = prev.find(i => i.scanId === scanId);
      if (!item) return prev;
      const qty = Number(item.quantity) || 0;
      if (qty < 1) {
        return prev.filter(i => i.scanId !== scanId);
      }
      return prev.map(i => i.scanId === scanId ? { ...i, quantity: qty } : i);
    });
  };

  const updateItemDiscount = (scanId, value) => {
    setCart(prev => prev.map(i => i.scanId === scanId ? { ...i, discount: Math.max(0, Number(value)) } : i));
  };

  const handleQtyKeyDown = (e, scanId) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleQuantityBlur(scanId);
      if (discInputRefs.current[scanId]) {
        discInputRefs.current[scanId].focus();
        discInputRefs.current[scanId].select();
      }
    }
  };

  const handleDiscKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (barcodeRef.current) {
        barcodeRef.current.focus();
      }
    }
  };

  const removeFromCart = (scanId) => {
    setCart(prev => prev.filter(i => i.scanId !== scanId));
  };

  const subtotal = cart.reduce((s, i) => s + i.sale_price * (Number(i.quantity) || 0), 0);
  const totalItemDiscount = cart.reduce((s, i) => s + (i.discount || 0) * (Number(i.quantity) || 0), 0);
  const globalDiscountAmount = Number(discount) || 0;
  const grandTotal = Math.max(0, subtotal - totalItemDiscount - globalDiscountAmount);

  const getProductCartCount = (productId) => {
    return cart.filter(i => i.productId === productId).reduce((sum, i) => sum + (Number(i.quantity) || 0), 0);
  };

  const handleBarcodeInput = () => {
    const barcode = barcodeValue.trim();
    if (!barcode) return;
    const product = products.find(p => p.barcode === barcode);
    if (product) {
      addToCart(product);
    } else {
      alert('Product not found or not in godown stock');
      if (barcodeRef.current) barcodeRef.current.focus();
    }
    setBarcodeValue('');
  };

  const clearPersistedSale = () => {
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setDiscount(0);
    setPaymentSplits([]);
  };

  const openPayModal = () => {
    if (!cart.length) return;
    try {
      const lastMode = localStorage.getItem('godown_lastPaymentMode');
      const defaultMode = lastMode ? JSON.parse(lastMode) : 'CASH';
      setPaymentSplits([{ mode: defaultMode, amount: grandTotal }]);
    } catch {
      setPaymentSplits([{ mode: 'CASH', amount: grandTotal }]);
    }
    setIsPayModalOpen(true);
  };

  const setQuickPay = (mode) => {
    setPaymentSplits([{ mode, amount: grandTotal }]);
  };

  const updateSplitAmount = (index, value) => {
    const newSplits = [...paymentSplits];
    newSplits[index].amount = parseFloat(value) || 0;
    setPaymentSplits(newSplits);
  };

  const updateSplitMode = (index, mode) => {
    const newSplits = [...paymentSplits];
    newSplits[index].mode = mode;
    setPaymentSplits(newSplits);
  };

  const addSplitRow = () => {
    const currentTotalPaid = paymentSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
    const remainder = Math.max(0, grandTotal - currentTotalPaid);
    if (remainder <= 0) {
      alert("Total amount is already covered!");
      return;
    }
    setPaymentSplits([...paymentSplits, { mode: 'CASH', amount: remainder }]);
  };

  const removeSplitRow = (index) => {
    if (paymentSplits.length === 1) return;
    setPaymentSplits(paymentSplits.filter((_, i) => i !== index));
  };

  const totalPaid = paymentSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  const remaining = Math.max(0, grandTotal - totalPaid);
  const isPaymentValid = Math.abs(remaining) < 0.1;

  // ─── FIXED: Uses iframe instead of window.open() ───
  const printThermalReceipt = (payload, aggregatedItems) => {
    const printGroups = {};
    let totalAmount = 0;

    Object.values(aggregatedItems).forEach(item => {
      if (!printGroups[item.product_id]) {
        printGroups[item.product_id] = { name: item.product_name, bottle_size: item.bottle_size, sale_price: item.unit_price, qty: 0, totalDiscount: 0, lineTotal: 0 };
      }
      printGroups[item.product_id].qty += item.quantity;
      printGroups[item.product_id].totalDiscount += item.discount;
      printGroups[item.product_id].lineTotal += item.total_price;
      totalAmount += item.total_price;
    });

    let itemsHtml = '';

    Object.values(printGroups).forEach(g => {
      const discountHtml = g.totalDiscount > 0
        ? `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>Discount</span><span>-₹${g.totalDiscount.toFixed(2)}</span></div>`
        : '';

      itemsHtml += `
        <div style="margin-bottom:6px;">
          <div style="font-weight:bold; text-transform:uppercase; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.name} ${g.bottle_size ? `(${g.bottle_size})` : ''}</div>
          <div style="display:flex; justify-content:space-between; font-size:11px;">
            <span>₹${g.sale_price.toFixed(2)} x ${g.qty}</span>
            <span>₹${(g.sale_price * g.qty).toFixed(2)}</span>
          </div>
          ${discountHtml}
        </div>
      `;
    });

    let paymentHtml = '';
    if (payload.payment_details && payload.payment_details.length > 0) {
      payload.payment_details.forEach(split => {
        if (split.amount > 0) {
          paymentHtml += `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>${split.mode}:</span><span>₹${Number(split.amount).toFixed(2)}</span></div>`;
        }
      });
    } else {
      paymentHtml = `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>CASH:</span><span>₹${totalAmount.toFixed(2)}</span></div>`;
    }

    const invoiceNumber = payload.invoice_number;
    const printDate = format(new Date(), 'dd/MM/yyyy hh:mm a');
    const cName = payload.customer_name || 'Walk-in Customer';
    const cPhone = payload.customer_phone || 'N/A';

    const cAddress = companyDetails.address || '';
    const cEmail = companyDetails.email || '';
    const cExcise = companyDetails.exciseLicenseNo || '';

    // ─── IFRAME METHOD ───
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();

    doc.write(`
      <html>
        <head>
          <title>Godown Receipt</title>
          <style>
            @page { margin: 0mm; size: 80mm auto; }
            body { margin: 0; padding: 0; width: 100%; }
          </style>
        </head>
        <body>
          <div style="font-family: 'Courier New', monospace; width: 100%; max-width: 280px; margin: 0 auto; padding: 10px 5px; font-size: 12px; line-height: 1.4;">
            <div style="text-align:center; margin-bottom:5px;">
              <h2 style="margin:0; font-size:16px; text-transform:uppercase; letter-spacing:1px;">${companyName}</h2>
              ${cAddress ? `<p style="margin:2px 0 0 0; font-size:10px; white-space:normal;">${cAddress}</p>` : ''}
              ${cEmail ? `<p style="margin:2px 0 0 0; font-size:10px;">Email: ${cEmail}</p>` : ''}
              ${cExcise ? `<p style="margin:2px 0 0 0; font-size:11px; font-weight:bold;">Shop Lic No: ${cExcise}</p>` : ''}
              <p style="margin:4px 0 0 0; font-size:10px; font-weight:bold;">GODOWN SALE BILL</p>
            </div>
            <div style="border-top:1px dashed #000; margin:8px 0;"></div>
            <div style="font-size:11px; margin-bottom:5px;">
              <div style="display:flex; justify-content:space-between;"><span>Bill No:</span><span>${invoiceNumber}</span></div>
              <div style="display:flex; justify-content:space-between;"><span>Date:</span><span>${printDate}</span></div>
              <div style="display:flex; justify-content:space-between;"><span>Customer:</span><span>${cName}</span></div>
              ${cPhone ? `<div style="display:flex; justify-content:space-between;"><span>Phone:</span><span>${cPhone}</span></div>` : ''}
            </div>
            <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; margin:8px 0; padding:4px 0; font-weight:bold; display:flex; justify-content:space-between; font-size:11px;">
              <span>ITEM</span>
              <span>AMOUNT</span>
            </div>
            ${itemsHtml}
            <div style="border-top:1px dashed #000; margin-top:8px; padding-top:6px;">
              <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px;">
                <span>TOTAL</span>
                <span>₹${totalAmount.toFixed(2)}</span>
              </div>
              ${paymentHtml ? `
                <div style="border-top:1px dashed #000; margin-top:6px; padding-top:4px;">
                  <div style="font-size:10px; font-weight:bold; margin-bottom:2px;">Payment Details:</div>
                  ${paymentHtml}
                </div>
              ` : ''}
            </div>
           <div style="border-top:1px dashed #000; margin-top:15px; padding-top:5px; text-align:center; font-size:9px; line-height:1.4;">
  <p style="margin:0 0 4px 0; font-weight:bold;">Goods once sold will not be taken back.</p>
  <p style="margin:0 0 4px 0;">Please check items before leaving.</p>
  <p style="margin:0 0 4px 0; font-weight:bold;">Liquor consumption is injurious to health.</p>
  <p style="margin:0 0 4px 0;">Do not drink and drive.</p>
  <p style="margin:0 0 4px 0;">Subject to local jurisdiction.</p>
  <p style="margin:8px 0 0 0; font-weight:bold;">Thank You. Visit Again.</p>
</div>
          </div>
        </body>
      </html>
    `);

    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      document.body.removeChild(iframe);
    }, 500);
  };

  const handleCheckout = async () => {
    if (!isPaymentValid) {
      alert(`Payment incomplete. Remaining: ₹${remaining.toFixed(2)}`);
      return;
    }

    setCheckingOut(true);
    setError('');

    const aggregated = {};
    cart.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const key = item.productId;
      if (!aggregated[key]) {
        aggregated[key] = {
          product_id: item.productId,
          product_name: item.name,
          bottle_size: item.bottle_size,
          quantity: 0,
          unit_price: item.sale_price,
          discount: 0,
          total_price: 0,
        };
      }
      aggregated[key].quantity += qty;
      aggregated[key].discount += (item.discount || 0) * qty;
      aggregated[key].total_price += (item.sale_price - (item.discount || 0)) * qty;
    });
    const isSplit = paymentSplits.length > 1;
    const paymentMode = isSplit ? 'SPLIT' : paymentSplits[0].mode;

    const payload = {
      invoice_number: generateInvoiceNumber(companyId),
      company_id: Number(companyId),
      customer_name: customerName,
      customer_phone: customerPhone,
      total_amount: grandTotal,
      payment_mode: paymentMode,
      payment_details: paymentSplits,
      items: Object.values(aggregated).map(item => ({
        ...item,
        company_id: Number(companyId)
      })),
    };

    try {
      const result = await processGodownCheckout(payload);

      // ─── AUTO PRINT THERMAL RECEIPT ───
      printThermalReceipt(payload, aggregated);

      setCompletedSale({ ...payload, created_at: result.created_at || new Date().toISOString() });
      setShowInvoice(true);
      setRecentlyScanned([]);
      setSelectedItems([]);
      setIsPayModalOpen(false);
      setPaymentSplits([]);
      clearPersistedSale();
      fetchProducts();
    } catch (err) {
      setError(err.message || 'Checkout failed. Check godown stock.');
    } finally {
      setCheckingOut(false);
    }
  };

  const toggleSelectItem = (scanId) => {
    setSelectedItems(prev => prev.includes(scanId) ? prev.filter(id => id !== scanId) : [...prev, scanId]);
  };

  const toggleSelectAll = () => {
    if (selectedItems.length === cart.length) {
      setSelectedItems([]);
    } else {
      setSelectedItems(cart.map(i => i.scanId));
    }
  };

  const handleBulkPrint = () => {
    if (selectedItems.length === 0) return alert('Please select items to print.');
    setPrintCustomerName(customerName === 'Walk-in Customer' ? '' : customerName);
    setPrintCustomerPhone(customerPhone);
    setIsPrintModalOpen(true);
  };

  const confirmPrint = async () => {
    const itemsToPrint = cart.filter(i => selectedItems.includes(i.scanId));
    if (!itemsToPrint.length) return;

    const cName = printCustomerName || 'Walk-in Customer';
    const cPhone = printCustomerPhone || 'N/A';
    setPrinting(true);

    const aggregated = {};
    let totalAmount = 0;

    itemsToPrint.forEach(item => {
      const qty = Number(item.quantity) || 0;
      const key = item.productId;
      if (!aggregated[key]) {
        aggregated[key] = {
          product_id: item.productId,
          product_name: item.name,
          quantity: 0,
          unit_price: item.sale_price,
          discount: 0,
          total_price: 0,
        };
      }
      aggregated[key].quantity += qty;
      aggregated[key].discount += (item.discount || 0) * qty;
      aggregated[key].total_price += (item.sale_price - (item.discount || 0)) * qty;
      totalAmount += (item.sale_price - (item.discount || 0)) * qty;
    });

    const printPaymentMode = paymentSplits.length > 1 ? 'SPLIT' : (paymentSplits.length === 1 ? paymentSplits[0].mode : 'CASH');

    const payload = {
      invoice_number: generateInvoiceNumber(companyId),
      company_id: Number(companyId),
      customer_name: cName,
      customer_phone: cPhone === 'N/A' ? '' : cPhone,
      total_amount: totalAmount,
      payment_mode: printPaymentMode,
      payment_details: paymentSplits,
      items: Object.values(aggregated).map(item => ({
        ...item,
        company_id: Number(companyId)
      })),
    };

    try {
      await processGodownCheckout(payload);

      const printGroups = {};
      itemsToPrint.forEach(item => {
        const qty = Number(item.quantity) || 0;
        if (!printGroups[item.productId]) {
          printGroups[item.productId] = { name: item.name, bottle_size: item.bottle_size, sale_price: item.sale_price, qty: 0, totalDiscount: 0, lineTotal: 0 };
        }
        printGroups[item.productId].qty += qty;
        printGroups[item.productId].totalDiscount += (item.discount || 0) * qty;
        printGroups[item.productId].lineTotal += (item.sale_price - (item.discount || 0)) * qty;
      });

      let itemsHtml = '';

      Object.values(printGroups).forEach(g => {
        const discountHtml = g.totalDiscount > 0
          ? `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>Discount</span><span>-₹${g.totalDiscount.toFixed(2)}</span></div>`
          : '';

        itemsHtml += `
          <div style="margin-bottom:6px;">
            <div style="font-weight:bold; text-transform:uppercase; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.name} ${g.bottle_size ? `(${g.bottle_size})` : ''}</div>
            <div style="display:flex; justify-content:space-between; font-size:11px;">
              <span>₹${g.sale_price.toFixed(2)} x ${g.qty}</span>
              <span>₹${(g.sale_price * g.qty).toFixed(2)}</span>
            </div>
            ${discountHtml}
          </div>
        `;
      });

      let paymentHtml = '';
      if (paymentSplits.length > 0) {
        paymentSplits.forEach(split => {
          if (split.amount > 0) {
            paymentHtml += `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>${split.mode}:</span><span>₹${Number(split.amount).toFixed(2)}</span></div>`;
          }
        });
      } else {
        paymentHtml = `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>CASH:</span><span>₹${totalAmount.toFixed(2)}</span></div>`;
      }

      const invoiceNumber = payload.invoice_number;
      const printDate = format(new Date(), 'dd/MM/yyyy hh:mm a');

      const cAddress = companyDetails.address || '';
      const cEmail = companyDetails.email || '';
      const cExcise = companyDetails.exciseLicenseNo || '';
      const cTrade = companyDetails.tradeLicenseNo || '';

      // ─── IFRAME METHOD ───
      const iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.right = "0";
      iframe.style.bottom = "0";
      iframe.style.width = "1px";
      iframe.style.height = "1px";
      iframe.style.border = "0";
      document.body.appendChild(iframe);

      const doc = iframe.contentWindow.document;
      doc.open();

      doc.write(`
        <html>
          <head>
            <title>Godown Receipt</title>
            <style>
              @page {
                margin: 0mm;
                size: 80mm auto;
              }
              body {
                margin: 0;
                padding: 0;
                width: 100%;
              }
            </style>
          </head>
          <body>
            <div style="font-family: 'Courier New', monospace; width: 100%; max-width: 280px; margin: 0 auto; padding: 10px 5px; font-size: 12px; line-height: 1.4;">

              <!-- Header -->
              <div style="text-align:center; margin-bottom:5px;">
                <h2 style="margin:0; font-size:16px; text-transform:uppercase; letter-spacing:1px;">${companyName}</h2>
                ${cAddress ? `<p style="margin:2px 0 0 0; font-size:10px; white-space:normal;">${cAddress}</p>` : ''}
                ${cEmail ? `<p style="margin:2px 0 0 0; font-size:10px;">Email: ${cEmail}</p>` : ''}
                ${cExcise ? `<p style="margin:2px 0 0 0; font-size:11px; font-weight:bold;">Shop Lic No: ${cExcise}</p>` : ''}
                <p style="margin:4px 0 0 0; font-size:10px; font-weight:bold;">GODOWN SALE BILL</p>
              </div>

              <div style="border-top:1px dashed #000; margin:8px 0;"></div>

              <!-- Info -->
              <div style="font-size:11px; margin-bottom:5px;">
                <div style="display:flex; justify-content:space-between;"><span>Bill No:</span><span>${invoiceNumber}</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Date:</span><span>${printDate}</span></div>
                <div style="display:flex; justify-content:space-between;"><span>Customer:</span><span>${cName}</span></div>
                ${cPhone !== 'N/A' ? `<div style="display:flex; justify-content:space-between;"><span>Phone:</span><span>${cPhone}</span></div>` : ''}
              </div>

              <div style="border-top:1px dashed #000; border-bottom:1px dashed #000; margin:8px 0; padding:4px 0; font-weight:bold; display:flex; justify-content:space-between; font-size:11px;">
                <span>ITEM</span>
                <span>AMOUNT</span>
              </div>

              <!-- Items -->
              ${itemsHtml}

              <!-- Totals -->
              <div style="border-top:1px dashed #000; margin-top:8px; padding-top:6px;">
                <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px;">
                  <span>TOTAL</span>
                  <span>₹${totalAmount.toFixed(2)}</span>
                </div>

                <!-- Payment Mode Breakdown -->
                ${paymentHtml ? `
                  <div style="border-top:1px dashed #000; margin-top:6px; padding-top:4px;">
                    <div style="font-size:10px; font-weight:bold; margin-bottom:2px;">Payment Details:</div>
                    ${paymentHtml}
                  </div>
                ` : ''}
              </div>

              <!-- Footer -->
               <div style="border-top:1px dashed #000; margin-top:15px; padding-top:5px; text-align:center; font-size:9px; line-height: 1.4;">
                <p style="margin:0 0 4px 0; font-weight:bold;">Goods once sold will not be taken back.</p>
                <p style="margin:0 0 4px 0;">Please check items before leaving.</p>
                <p style="margin:0 0 4px 0; font-weight:bold;">Liquor consumption is injurious to health.</p>
                <p style="margin:0 0 4px 0;">Do not drink and drive.</p>
                <p style="margin:0 0 4px 0;">Subject to local jurisdiction.</p>
                <p style="margin:8px 0 0 0; font-weight:bold;">Thank You. Visit Again.</p>
              </div>

            </div>
          </body>
        </html>
      `);

      doc.close();

      setTimeout(() => {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        document.body.removeChild(iframe);
      }, 500);

      setCart(prev => prev.filter(i => !selectedItems.includes(i.scanId)));
      setSelectedItems([]);
      setIsPrintModalOpen(false);
      fetchProducts();

    } catch (err) {
      alert(err.message || 'Checkout/Print failed. Check godown stock.');
    } finally {
      setPrinting(false);
    }
  };

    const handleBulkWhatsApp = async () => {
    if (selectedItems.length === 0) return alert('Please select items to send.');
    const itemsToSend = cart.filter(i => selectedItems.includes(i.scanId));

    const waGroups = {};
    itemsToSend.forEach(item => {
      const qty = Number(item.quantity) || 0;
      if (!waGroups[item.productId]) {
        waGroups[item.productId] = { name: item.name, bottle_size: item.bottle_size, sale_price: item.sale_price, qty: 0, totalDiscount: 0, lineTotal: 0 };
      }
      waGroups[item.productId].qty += qty;
      waGroups[item.productId].totalDiscount += (item.discount || 0) * qty;
      waGroups[item.productId].lineTotal += (item.sale_price - (item.discount || 0)) * qty;
    });

    let msg = `*Godown Invoice Details*\n\n`;
    let totalAmount = 0;

    Object.values(waGroups).forEach(g => {
      totalAmount += g.lineTotal;
      msg += `_${g.name} ${g.bottle_size ? `(${g.bottle_size})` : ''}_ x${g.qty} - ₹${(g.sale_price * g.qty).toFixed(2)}`;
      if (g.totalDiscount > 0) {
        msg += `\n  Discount: -₹${g.totalDiscount.toFixed(2)}`;
      }
      msg += `\n  Total: ₹${g.lineTotal.toFixed(2)}\n\n`;
    });

    msg += `*Grand Total: ₹${totalAmount.toFixed(2)}*`;

    // Auto-add India country code if 10-digit number
    let waPhone = (customerPhone || '').replace(/\D/g, '');
    if (waPhone.length === 10) waPhone = '91' + waPhone;

    const url = waPhone 
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(msg)}`
      : `https://wa.me/?text=${encodeURIComponent(msg)}`;

    if (isTauri()) {
      try {
        await openUrl(url);
      } catch (err) {
        console.error('Failed to open WhatsApp:', err);
        alert('Could not open WhatsApp. Make sure it is installed.');
      }
    } else {
      window.open(url, '_blank');
    }
  };

  // ─── FIXED: Uses iframe instead of window.open() ───
  const handleSavePDF = () => {
    if (cart.length === 0) return alert('Cart is empty.');

    const cName = customerName || 'Walk-in Customer';
    const cPhone = customerPhone || 'N/A';
    const invoiceNumber = generateInvoiceNumber(companyId);

    const pdfGroups = {};
    cart.forEach(item => {
      const qty = Number(item.quantity) || 0;
      if (!pdfGroups[item.productId]) {
        pdfGroups[item.productId] = { name: item.name, bottle_size: item.bottle_size, sale_price: item.sale_price, qty: 0, totalDiscount: 0 };
      }
      pdfGroups[item.productId].qty += qty;
      pdfGroups[item.productId].totalDiscount += (item.discount || 0) * qty;
    });

    let itemsHtml = '';

    Object.values(pdfGroups).forEach(g => {
      const lineTotal = (g.sale_price * g.qty) - g.totalDiscount;
      const discountHtml = g.totalDiscount > 0
        ? `<tr><td colspan="3" style="text-align:right; padding:4px 8px; color:#d9534f; font-size:0.9em;">Discount</td><td style="padding:4px 8px; text-align:right; color:#d9534f;">-₹${g.totalDiscount.toFixed(2)}</td></tr>`
        : '';

      itemsHtml += `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #eee;">${g.name} ${g.bottle_size ? `(${g.bottle_size})` : ''}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;">${g.qty}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">₹${g.sale_price}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:right; font-weight:bold;">₹${lineTotal.toFixed(2)}</td>
        </tr>
        ${discountHtml}
      `;
    });

    // ─── IFRAME METHOD ───
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "1px";
    iframe.style.height = "1px";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();

    doc.write(`
      <html>
        <head>
          <title>Godown Invoice ${invoiceNumber}</title>
          <style>
            body { font-family: Arial, sans-serif; color: #333; }
            .container { max-width: 800px; margin: 0 auto; padding: 20px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 10px; }
            .title { font-size: 24px; font-weight: bold; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background-color: #f8f9fa; text-align: left; padding: 8px; border-bottom: 2px solid #dee2e6; }
            .totals { width: 100%; max-width: 300px; margin-left: auto; }
            .totals tr td { padding: 5px 10px; }
            .grand-total { font-size: 1.2em; font-weight: bold; border-top: 2px solid #333; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div>
                <div class="title">GODOWN INVOICE</div>
                <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
                <p><strong>Date:</strong> ${format(new Date(), 'dd/MM/yyyy hh:mm a')}</p>
              </div>
              <div style="text-align: right;">
                <p><strong>Customer:</strong> ${cName}</p>
                <p><strong>Phone:</strong> ${cPhone}</p>
                <p><strong>Payment:</strong> ${paymentSplits.length > 1 ? 'Split Payment' : paymentSplits[0]?.mode || 'CASH'}</p>
              </div>
            </div>

            <table>
              <thead>
                <tr>
                  <th>Item Description</th>
                  <th style="text-align:center;">Qty</th>
                  <th style="text-align:right;">Rate</th>
                  <th style="text-align:right;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>

            <table class="totals">
              <tr>
                <td>Subtotal</td>
                <td style="text-align:right;">₹${subtotal.toFixed(2)}</td>
              </tr>
              ${totalItemDiscount > 0 ? `<tr><td>Item Discounts</td><td style="text-align:right; color:#d9534f;">-₹${totalItemDiscount.toFixed(2)}</td></tr>` : ''}
              ${globalDiscountAmount > 0 ? `<tr><td>Global Discount</td><td style="text-align:right; color:#d9534f;">-₹${globalDiscountAmount}</td></tr>` : ''}
              <tr class="grand-total">
                <td>Grand Total</td>
                <td style="text-align:right;">₹${grandTotal.toFixed(2)}</td>
              </tr>
            </table>

            <div style="margin-top: 40px; text-align: center; color: #888; font-size: 0.8em;">
              Thank you for your purchase!
            </div>
          </div>
        </body>
      </html>
    `);

    doc.close();

    setTimeout(() => {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      document.body.removeChild(iframe);
    }, 500);
  };

  if (showInvoice && completedSale) {
    return (
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="p-8 bg-white dark:bg-gray-900 rounded-xl max-w-lg mx-auto shadow-sm border border-gray-100">
          <div className="flex items-center gap-3 mb-6 justify-center text-emerald-600">
            <CheckCircle className="w-8 h-8" />
            <h2 className="text-2xl font-bold">Godown Sale Complete</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 mb-6">
            <p><strong>Invoice:</strong> {completedSale.invoice_number}</p>
            <p><strong>Customer:</strong> {completedSale.customer_name}</p>
            <p><strong>Date:</strong> {format(new Date(completedSale.created_at), 'Pp')}</p>
          </div>
          <div className="border-t border-b border-gray-200 dark:border-gray-700 py-4 space-y-2">
            {completedSale.items.map((i, idx) => (
              <div key={idx} className="flex flex-col text-sm">
                <div className="flex justify-between">
                  <span>{i.product_name} x{i.quantity} @ ₹{i.unit_price}</span>
                  <span className="font-semibold">₹{(i.unit_price * i.quantity).toFixed(2)}</span>
                </div>
                {i.discount > 0 && (
                  <div className="flex justify-between text-red-500 text-xs">
                    <span>Discount</span>
                    <span>-₹{i.discount.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-bold border-b border-dashed border-gray-200 dark:border-gray-700 pb-1 mt-1">
                  <span>Subtotal</span>
                  <span>₹{i.total_price.toFixed(2)}</span>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 text-right">
            <p className="text-xl font-bold text-primary-600 dark:text-primary-400">Total: ₹{completedSale.total_amount.toFixed(2)}</p>
          </div>
          <button onClick={() => { setShowInvoice(false); setDiscount(0); }} className="mt-6 w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors">
            New Sale
          </button>
        </div>
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertCircle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to use the Godown POS.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 bg-gray-50 dark:bg-gray-950 overflow-hidden relative">

      {/* PAYMENT MODAL */}
      {isPayModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-md w-full p-6 space-y-5 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => setIsPayModalOpen(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white border-b pb-2">Complete Payment</h3>

            <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg text-center border border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Due</p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white">₹{grandTotal.toFixed(2)}</p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">Customer Name</label>
                <input type="text" value={customerName} onChange={(e) => setCustomerName(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white" placeholder="Walk-in Customer" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">Mobile Number</label>
                <input type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white" placeholder="Enter mobile number" />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => setQuickPay('CASH')} className={clsx("text-xs font-bold py-2 rounded border-2 transition-all", totalPaid === grandTotal && paymentSplits[0]?.mode === 'CASH' ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400" : "border-gray-200 hover:border-primary-300 dark:border-gray-700 dark:text-gray-300")}>
                Pay All Cash
              </button>
              <button onClick={() => setQuickPay('UPI')} className={clsx("text-xs font-bold py-2 rounded border-2 transition-all", totalPaid === grandTotal && paymentSplits[0]?.mode === 'UPI' ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400" : "border-gray-200 hover:border-primary-300 dark:border-gray-700 dark:text-gray-300")}>
                Pay All UPI
              </button>
              <button onClick={() => setQuickPay('CARD')} className={clsx("text-xs font-bold py-2 rounded border-2 transition-all", totalPaid === grandTotal && paymentSplits[0]?.mode === 'CARD' ? "border-primary-600 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400" : "border-gray-200 hover:border-primary-300 dark:border-gray-700 dark:text-gray-300")}>
                Pay All Card
              </button>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 dark:text-gray-400">Payment Breakdown</label>

              {paymentSplits.map((split, idx) => {
                const isLastRow = idx === paymentSplits.length - 1;
                return (
                  <div key={idx} className="flex items-center gap-2">
                    <select
                      value={split.mode}
                      onChange={(e) => updateSplitMode(idx, e.target.value)}
                      className="w-24 text-xs border border-gray-300 dark:border-gray-700 rounded px-2 py-2 dark:bg-gray-800 dark:text-white"
                    >
                      <option value="CASH">Cash</option>
                      <option value="UPI">UPI</option>
                      <option value="CARD">Card</option>
                      <option value="CHEQUE">Cheque</option>
                    </select>

                    <input
                      type="number"
                      value={split.amount === 0 ? '' : split.amount}
                      onChange={(e) => updateSplitAmount(idx, e.target.value)}
                      placeholder="0.00"
                      className="flex-1 text-xs border border-gray-300 dark:border-gray-700 rounded px-2 py-2 dark:bg-gray-800 dark:text-white focus:outline-none focus:ring-1 focus:ring-primary-500"
                    />

                    {paymentSplits.length > 1 && (
                      <button onClick={() => removeSplitRow(idx)} className="p-1.5 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}

                    {isLastRow && (
                      <button
                        onClick={addSplitRow}
                        className={clsx(
                          "p-1.5 rounded transition-colors border-2 flex items-center justify-center",
                          remaining <= 0
                            ? "border-gray-200 text-gray-300 cursor-not-allowed dark:border-gray-700"
                            : "border-primary-200 text-primary-600 hover:bg-primary-50 dark:border-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/20"
                        )}
                        title={remaining > 0 ? "Add split for remaining amount" : "Bill fully paid"}
                        disabled={remaining <= 0}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <div className={clsx(
              "p-3 rounded-lg text-center text-sm font-semibold border",
              remaining > 0 ? "bg-red-50 border-red-200 text-red-600 dark:bg-red-900/20 dark:border-red-800 dark:text-red-400" : "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400"
            )}>
              {remaining > 0 ? `Remaining: ₹${remaining.toFixed(2)}` : 'Payment Complete'}
            </div>

            <button
              onClick={handleCheckout}
              disabled={checkingOut || !isPaymentValid}
              className={clsx(
                "w-full flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg text-white font-bold text-sm transition-colors",
                (checkingOut || !isPaymentValid) ? "bg-gray-400 cursor-not-allowed" : "bg-primary-600 hover:bg-primary-700 active:scale-95"
              )}
            >
              {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
              {checkingOut ? 'Processing...' : 'Confirm & Pay'}
            </button>
          </div>
        </div>
      )}

      {/* PRINT MODAL */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4 relative">
            <button onClick={() => setIsPrintModalOpen(false)} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white border-b pb-2">Checkout & Print Godown Bill</h3>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">Customer Name</label>
                <input type="text" value={printCustomerName} onChange={(e) => setPrintCustomerName(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white" placeholder="Enter customer name" />
              </div>
              <div>
                <label className="text-xs font-semibold text-gray-600 dark:text-gray-400 block mb-1">Mobile Number</label>
                <input type="tel" value={printCustomerPhone} onChange={(e) => setPrintCustomerPhone(e.target.value)} className="w-full border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 dark:bg-gray-800 dark:text-white" placeholder="Enter mobile number" />
              </div>
            </div>

            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto space-y-2">
              <p className="text-[10px] font-bold text-gray-500">Selected Items ({selectedItems.length})</p>
              {(() => {
                const selectedCartItems = cart.filter(i => selectedItems.includes(i.scanId));
                const modalGroups = {};
                selectedCartItems.forEach(item => {
                  const qty = Number(item.quantity) || 0;
                  if (!modalGroups[item.productId]) {
                    modalGroups[item.productId] = { name: item.name, bottle_size: item.bottle_size, qty: 0, lineTotal: 0 };
                  }
                  modalGroups[item.productId].qty += qty;
                  modalGroups[item.productId].lineTotal += (item.sale_price - (item.discount || 0)) * qty;
                });
                return Object.entries(modalGroups).map(([id, g]) => (
                  <div key={id} className="flex justify-between text-xs">
                    <span className="text-gray-800 dark:text-white">{g.name} {g.bottle_size ? `(${g.bottle_size})` : ''} x{g.qty}</span>
                    <span className="font-bold text-primary-600 dark:text-primary-400">₹{g.lineTotal.toFixed(2)}</span>
                  </div>
                ));
              })()}
            </div>

            <button onClick={confirmPrint} disabled={printing} className="w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed">
              {printing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
              {printing ? 'Processing...' : 'Print & Checkout'}
            </button>
          </div>
        </div>
      )}

      {/* LEFT PANEL */}
      <div className="w-[280px] flex-shrink-0 bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 flex flex-col overflow-hidden">
        {/* Barcode Scan Box */}
        <div className="p-3 border-b border-gray-100 dark:border-gray-800 flex-shrink-0">
          <div className="p-3 border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-xl bg-gray-50 dark:bg-gray-800/50 flex flex-col items-center justify-center text-center">
            <Barcode className="w-4 h-4 text-gray-400 mb-1" />
            <h3 className="text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Barcode Scan</h3>
            <input
              ref={barcodeRef}
              value={barcodeValue}
              onChange={e => setBarcodeValue(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleBarcodeInput()}
              placeholder="Scan or type barcode..."
              className="w-full text-center text-xs bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary-500 font-mono"
              autoFocus
            />
          </div>
        </div>

        {/* Recently Scanned */}
        <div className="p-3 flex-1 overflow-y-auto">
          <h5 className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">Recently Scanned</h5>
          {recentlyScanned.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-gray-300 dark:text-gray-600">
              <Package className="w-10 h-10 mb-2" />
              <p className="text-[10px] text-center">Scan a barcode to see<br />product details here</p>
            </div>
          ) : (
            <div className="space-y-2">
              {recentlyScanned.map((product) => {
                const cartCount = getProductCartCount(product.id);
                return (
                  <div key={`${product.id}-${product.scanTime}`} className="border rounded-lg p-2 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800 transition-all">
                    <div className="flex gap-3">
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono text-gray-500 dark:text-gray-400">B.No:{product.id}</span>
                          <span className="text-[9px] text-gray-500 dark:text-gray-400">{format(new Date(), 'dd/MM/yy')}</span>
                        </div>
                        <p className="text-[11px] font-bold text-gray-900 dark:text-white truncate">{product.name}</p>
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-primary-600 dark:text-primary-400">MRP: ₹{product.sale_price}</span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] text-gray-500 dark:text-gray-400 flex items-center gap-0.5"><Layers className="w-2.5 h-2.5" /> {product.godown_stock}</span>
                            {cartCount > 0 && (
                              <span className="text-[9px] font-bold bg-primary-600 text-white px-1.5 py-0.5 rounded-full">{cartCount} in bill</span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-lg bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 flex-shrink-0 flex items-center justify-center overflow-hidden">
                        {product.image_url ? <img src={product.image_url} alt="" className="w-full h-full object-cover" /> : <Package className="w-6 h-6 text-amber-500 dark:text-amber-400" />}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Product Search List */}
        <div className="border-t border-gray-100 dark:border-gray-800 p-3 max-h-[200px] flex flex-col flex-shrink-0">
          <div className="relative mb-2">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
            <input type="text" placeholder="Search godown stock..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
          </div>
          <div className="space-y-1 overflow-y-auto flex-1">
            {loadingProducts ? (
              <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-gray-400" /></div>
            ) : (
              filteredProducts.map(p => {
                const cartCount = getProductCartCount(p.id);
                return (
                  <button key={p.id} onClick={() => addToCart(p)} className="w-full flex items-center gap-2 p-1.5 rounded-lg text-left hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors">
                    <div className="w-7 h-7 rounded-md bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-[7px] font-bold text-gray-500">{p.category?.slice(0, 2)}</div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                      <p className="text-[8px] text-gray-400">Stock: {p.godown_stock} {cartCount > 0 && `· ${cartCount} in bill`}</p>
                    </div>
                    <p className="text-[10px] font-bold text-gray-600 dark:text-gray-300">₹{p.sale_price}</p>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* RIGHT PANEL */}
      <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-gray-950 overflow-hidden">

        {error && (
          <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-200 dark:border-red-800 flex items-center gap-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}
          </div>
        )}

        {/* Table Header */}
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-4 h-4 text-primary-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Godown Bill</h2>
            <span className="px-2 py-0.5 bg-primary-50 dark:bg-primary-900/30 text-primary-700 dark:text-primary-400 text-xs font-bold rounded-full">
              {cart.length} {cart.length === 1 ? 'item' : 'items'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
              <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">Grand Total:</span>
              <span className="text-sm font-bold text-primary-600 dark:text-primary-400">₹{grandTotal.toFixed(2)}</span>
            </div>

            <button onClick={handleSavePDF} disabled={cart.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-3.5 h-3.5" /> Save PDF
            </button>

            <button onClick={handleBulkPrint} disabled={selectedItems.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Printer className="w-3.5 h-3.5" /> Print & Checkout
            </button>

            <button onClick={handleBulkWhatsApp} disabled={selectedItems.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-semibold hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Send className="w-3.5 h-3.5" /> WhatsApp
            </button>
          </div>
        </div>

        {/* Table Area */}
        <div className="flex-1 overflow-y-auto px-4">
          {cart.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-300 dark:text-gray-600">
              <ShoppingCart className="w-16 h-16 mb-4 opacity-30" />
              <p className="text-sm font-medium">No items in the bill</p>
              <p className="text-xs mt-1">Scan a barcode or select an item from the left</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse mt-4">
              <thead>
                <tr className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-800">
                  <th className="pb-2 pr-4 w-10 text-center">
                    <input type="checkbox" checked={selectedItems.length === cart.length && cart.length > 0} onChange={toggleSelectAll} className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                  </th>
                  <th className="pb-2 pr-4 w-12">Photo</th>
                  <th className="pb-2 pr-4">Name</th>
                  <th className="pb-2 pr-4 text-center w-16">Qty</th>
                  <th className="pb-2 pr-4 text-right w-14">MRP</th>
                  <th className="pb-2 pr-4 text-center w-16">Dis.</th>
                  <th className="pb-2 pr-4 text-right w-14">Total</th>
                  <th className="pb-2 text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {[...cart].reverse().map((item) => {
                  const itemDiscount = item.discount || 0;
                  const qty = Number(item.quantity) || 0;
                  const lineTotal = (item.sale_price - itemDiscount) * qty;
                  const isSelected = selectedItems.includes(item.scanId);

                  return (
                    <tr key={item.scanId} className={clsx("group hover:bg-gray-50 dark:hover:bg-gray-900/40 transition-colors", isSelected && "bg-primary-50/50 dark:bg-primary-900/10")}>
                      <td className="py-1.5 pr-2 text-center">
                        <input type="checkbox" checked={isSelected} onChange={() => toggleSelectItem(item.scanId)} className="w-4 h-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500 cursor-pointer" />
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="w-8 h-8 rounded-lg overflow-hidden bg-pink-100 dark:bg-pink-900/30 border border-pink-200 dark:border-pink-800 flex items-center justify-center">
                          {item.image_url ? <img src={item.image_url} alt="" className="w-full h-full object-cover" /> : <span className="text-[8px] font-bold text-pink-600 dark:text-pink-400">{item.category?.slice(0, 3)}</span>}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <p className="text-[12px] font-semibold text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-[10px] text-gray-400">{item.bottle_size || ''} {item.traditional_name ? `· ${item.traditional_name}` : ''}</p>
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={() => updateQuantity(item.scanId, -1)} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold">−</button>
                          <input
                            ref={el => qtyInputRefs.current[item.scanId] = el}
                            type="number"
                            value={item.quantity}
                            onChange={(e) => handleManualQuantityChange(item.scanId, e.target.value)}
                            onBlur={() => handleQuantityBlur(item.scanId)}
                            onKeyDown={(e) => handleQtyKeyDown(e, item.scanId)}
                            className="w-9 text-center text-[11px] border border-gray-200 dark:border-gray-700 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-gray-50 dark:bg-gray-800"
                          />
                          <button onClick={() => updateQuantity(item.scanId, 1)} className="w-5 h-5 flex items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700 text-xs font-bold">+</button>
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <span className="text-[12px] font-medium text-gray-700 dark:text-gray-300">₹{item.sale_price}</span>
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex justify-center">
                          <input
                            ref={el => discInputRefs.current[item.scanId] = el}
                            type="number"
                            value={itemDiscount}
                            onChange={(e) => updateItemDiscount(item.scanId, e.target.value)}
                            onKeyDown={handleDiscKeyDown}
                            className="w-12 text-center text-[10px] border border-gray-200 dark:border-gray-700 rounded-md px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-gray-50 dark:bg-gray-800"
                          />
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <span className="text-[12px] font-bold text-gray-900 dark:text-white">₹{lineTotal.toFixed(2)}</span>
                      </td>
                      <td className="py-1.5 pr-2 text-center">
                        <button onClick={() => removeFromCart(item.scanId)} className="p-1 rounded text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors" title="Remove this item">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Checkout Footer */}
        <div className="border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 p-4 flex items-center justify-between flex-shrink-0">
          <div className="flex-1 pr-4">
            <div className="flex gap-2 text-xs">
              <input type="text" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer Name" className="w-1/2 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs" />
              <input type="tel" value={customerPhone} onChange={e => setCustomerPhone(e.target.value)} placeholder="Phone (Optional)" className="w-1/2 border border-gray-200 dark:border-gray-700 rounded px-2 py-1.5 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary-500 text-xs" />
            </div>
          </div>

          <button
            onClick={openPayModal}
            disabled={cart.length === 0}
            className={clsx(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-bold text-sm transition-colors",
              cart.length === 0 ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed" : "bg-primary-600 hover:bg-primary-700 active:scale-95"
            )}
          >
            <CreditCard className="w-4 h-4" />
            Pay ₹{grandTotal.toFixed(2)}
          </button>
        </div>

      </div>
    </div>
  );
}