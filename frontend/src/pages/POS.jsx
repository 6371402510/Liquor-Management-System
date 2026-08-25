import { useState, useEffect, useRef, useCallback } from 'react';
import { db } from '../db';
import {
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart,
  Printer, CheckCircle, X, Loader2, CreditCard, Banknote,
  Smartphone, Send, Package, Tag, Hash, Calendar, Layers, Download,
  AlertCircle, Store, Pencil
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { getPosProducts, processCheckout, updateSale, updateProductMrp, getCounterSales } from '../apiservices/sales-counter';
import { openUrl } from '@tauri-apps/plugin-opener'

function generateInvoiceNumber(companyId) {
  if (!companyId) return `INV-TEMP-${Date.now()}`;

  const storageKey = `pos_invoice_counter_${companyId}`;
  let lastNumber = parseInt(localStorage.getItem(storageKey) || '0', 10);
  lastNumber += 1;

  localStorage.setItem(storageKey, String(lastNumber));

  return `INV-${String(lastNumber).padStart(4, '0')}`;
}

let scanCounter = 0;
function generateScanId(productId) {
  scanCounter++;
  return `${productId}-scan-${Date.now()}-${scanCounter}`;
}

export default function POS() {
  // ─── PERSISTED STATE: Load from localStorage or use defaults ───
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
      const saved = localStorage.getItem('pos_cart');
      const parsed = saved ? JSON.parse(saved) : [];
      return parsed.map(i => ({ ...i, paymentMode: i.paymentMode || 'CASH' }));
    } catch { return []; }
  });

  const [search, setSearch] = useState('');
  const [paymentMode, setPaymentMode] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_paymentMode');
      return saved ? JSON.parse(saved) : 'CASH';
    } catch { return 'CASH'; }
  });

  const [customerName, setCustomerName] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_customerName');
      return saved ? JSON.parse(saved) : 'Walk-in Customer';
    } catch { return 'Walk-in Customer'; }
  });

  const [customerPhone, setCustomerPhone] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_customerPhone');
      return saved ? JSON.parse(saved) : '';
    } catch { return ''; }
  });

  const [discount, setDiscount] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_discount');
      return saved ? JSON.parse(saved) : 0;
    } catch { return 0; }
  });


  // Add these state variables after your existing state declarations
  const [paymentSplit, setPaymentSplit] = useState({
    cash: 0,
    card: 0,
    upi: 0
  });
  const [showPaymentSplit, setShowPaymentSplit] = useState(false);

  const [recentlyScanned, setRecentlyScanned] = useState([]);
  const [barcodeValue, setBarcodeValue] = useState('');
  const [showInvoice, setShowInvoice] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);
  const barcodeRef = useRef(null);

  const [editingSale, setEditingSale] = useState(null)  // { dbId, invoiceNumber, type, ... }
  const [updating, setUpdating] = useState(false)
  const [todayCounterSale, setTodayCounterSale] = useState(0);

  const [loadingProducts, setLoadingProducts] = useState(false);
  const [checkingOut, setCheckingOut] = useState(false);
  const [error, setError] = useState('');
  const [saleDate, setSaleDate] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_saleDate');
      return saved || format(new Date(), 'yyyy-MM-dd');
    } catch {
      return format(new Date(), 'yyyy-MM-dd');
    }
  });
  const [saleTime, setSaleTime] = useState(() => {
    try {
      const saved = localStorage.getItem('pos_saleTime');
      return saved || format(new Date(), 'HH:mm');
    } catch {
      return format(new Date(), 'HH:mm');
    }
  });


  const [selectedItems, setSelectedItems] = useState([]);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
  const [printCustomerName, setPrintCustomerName] = useState('');
  const [printCustomerPhone, setPrintCustomerPhone] = useState('');
  const [printing, setPrinting] = useState(false);
  const isTauri = () => '__TAURI_INTERNALS__' in window
  // ─── PERSISTENCE: Save to localStorage on change ───
  useEffect(() => { localStorage.setItem('pos_cart', JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem('pos_paymentMode', JSON.stringify(paymentMode)); }, [paymentMode]);
  useEffect(() => { localStorage.setItem('pos_customerName', JSON.stringify(customerName)); }, [customerName]);
  useEffect(() => { localStorage.setItem('pos_customerPhone', JSON.stringify(customerPhone)); }, [customerPhone]);
  useEffect(() => { localStorage.setItem('pos_discount', JSON.stringify(discount)); }, [discount]);

  useEffect(() => { if (companyId) fetchProducts(); }, [companyId]);
  // ═══════════════════════════════════════════════════════════════
  // NEW: Load edit data from sessionStorage on mount
  // ═══════════════════════════════════════════════════════════════
  // ═══════════════════════════════════════════════════════════════
  // NEW: Load edit data from sessionStorage on mount
  // ═══════════════════════════════════════════════════════════════
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem('editing_sale_data')
      if (raw) {
        const data = JSON.parse(raw)

        // ─── ADDED: Backup current cart before overwriting ───
        const currentCart = JSON.parse(localStorage.getItem('pos_cart') || '[]')
        if (currentCart.length > 0) {
          localStorage.setItem('pos_cart_backup', JSON.stringify(currentCart))
          // Also backup other fields
          localStorage.setItem('pos_customerName_backup', localStorage.getItem('pos_customerName') || '"Walk-in Customer"')
          localStorage.setItem('pos_customerPhone_backup', localStorage.getItem('pos_customerPhone') || '""')
          localStorage.setItem('pos_discount_backup', localStorage.getItem('pos_discount') || '0')
          localStorage.setItem('pos_paymentMode_backup', localStorage.getItem('pos_paymentMode') || '"CASH"')
        }

        setEditingSale(data)
        setCart(data.cartItems || [])
        setCustomerName(data.customerName || 'Walk-in Customer')
        setCustomerPhone(data.customerPhone || '')

        // Load sale date/time for editing
        if (data.saleDate) {
          const saleDateTime = new Date(data.saleDate)
          setSaleDate(format(saleDateTime, 'yyyy-MM-dd'))
          setSaleTime(format(saleDateTime, 'HH:mm'))
        }
      }
    } catch (err) {
      console.error('Failed to load edit data:', err)
      sessionStorage.removeItem('editing_sale_data')
    }
  }, [])
  // Cleanup: clear edit data when component unmounts
  // useEffect(() => {
  //   return () => {
  //     sessionStorage.removeItem('editing_sale_data')
  //   }
  // }, [])


  const fetchTodayCounterSale = async () => {
    if (!companyId) return;

    try {
      const today = format(new Date(), "yyyy-MM-dd");

      const sales = await getCounterSales(
        Number(companyId),
        today,
        today
      );

      const total = (sales || []).reduce(
        (sum, sale) => sum + (Number(sale.total_amount) || 0),
        0
      );

      setTodayCounterSale(total);
    } catch (err) {
      console.error("Failed to load today's sales", err);
    }
  };

  useEffect(() => {
    if (companyId) {
      fetchTodayCounterSale();
    }
  }, [companyId]);

  const fetchProducts = async (searchTerm = '') => {
    setLoadingProducts(true);
    try {
      const data = await getPosProducts(companyId, searchTerm);
      setProducts(data || []);
      setFilteredProducts(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoadingProducts(false);
    }
  };

  useEffect(() => {
    if (search.trim()) {
      const q = search.toLowerCase();
      setFilteredProducts(products.filter(p =>
        p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q)
      ));
    } else {
      setFilteredProducts(products);
    }
  }, [products, search]);

  useEffect(() => {
    setSelectedItems(prev => prev.filter(scanId => cart.some(item => item.scanId === scanId)));
  }, [cart]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (
        e.target.tagName === 'INPUT' ||
        e.target.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key.toLowerCase() === 'u') {
        if (recentlyScanned.length === 0) return;

        const lastScanned = recentlyScanned[0];

        const lastItem = cart
          .slice()
          .reverse()
          .find(item => item.productId === lastScanned.id);

        if (lastItem) {
          updateItemPaymentMode(lastItem.scanId, 'UPI');
        }
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => {
      window.removeEventListener('keydown', handleKeyPress);
    };
  }, [recentlyScanned, cart]);



  const updateQuantity = (scanId, qty) => {
    const newQty = Math.max(1, Number(qty) || 1);

    setCart(prev => {
      const currentItem = prev.find(i => i.scanId === scanId);
      if (!currentItem) return prev;

      // Find the product to get available counter stock
      const product = products.find(p => p.id === currentItem.productId);
      if (product) {
        // Calculate quantity of same product in other cart items
        const otherItemsQty = prev
          .filter(i => i.productId === currentItem.productId && i.scanId !== scanId)
          .reduce((sum, i) => sum + (i.quantity || 1), 0);

        // Max quantity allowed for this item
        const maxAllowed = (product.counter_stock || 0) - otherItemsQty;

        if (newQty > maxAllowed) {
          alert(`Only ${maxAllowed} ${product.name} available in counter stock!`);
          return prev; // Don't update if exceeding stock
        }
      }

      return prev.map(item =>
        item.scanId === scanId
          ? { ...item, quantity: newQty }
          : item
      );
    });
  };
  const addToCart = useCallback((product) => {
    setCart(prev => {
      // Calculate total quantity already in cart for this product
      const existingTotalQty = prev
        .filter(i => i.productId === product.id)
        .reduce((sum, i) => sum + (i.quantity || 1), 0);

      if (existingTotalQty >= (product.counter_stock || 0)) {
        alert(`Only ${product.counter_stock} ${product.name} available in counter stock!`);
        return prev;
      }

      return [...prev, {
        ...product,
        scanId: generateScanId(product.id),
        productId: product.id,
        quantity: 1,
        discount: 0,
        paymentMode: paymentMode,
      }];
    });

    setRecentlyScanned(prev => {
      const filtered = prev.filter(p => p.id !== product.id);
      return [{ ...product, scanTime: Date.now() }, ...filtered].slice(0, 15);
    });
  }, [paymentMode, products]);

  const updateItemPaymentMode = (scanId, mode) => {
    setCart(prev => prev.map(i => i.scanId === scanId ? { ...i, paymentMode: mode } : i));
  };

  const updateItemDiscount = (scanId, value) => {
    setCart(prev => prev.map(i => i.scanId === scanId ? { ...i, discount: Math.max(0, Number(value)) } : i));
  };

  const isPriceModified = (item) => {
    return item.originalPrice && item.originalPrice !== item.sale_price;
  };

  const updateItemPrice = async (scanId, newPrice) => {
    const price = Math.max(0, Number(newPrice) || 0);
    if (price <= 0) return;

    const item = cart.find(i => i.scanId === scanId);
    if (!item) return;

    if (item.sale_price === price) return;

    // Save original price on first change
    const originalPrice = item.originalPrice || item.sale_price;

    // Optimistic update: update ALL cart items with same product
    setCart(prev => prev.map(i =>
      i.productId === item.productId
        ? { ...i, sale_price: price, originalPrice: originalPrice }
        : i
    ));

    // Update products list for future scans
    setProducts(prev => prev.map(p =>
      p.id === item.productId
        ? { ...p, mrp: price, sale_price: price }
        : p
    ));
    setFilteredProducts(prev => prev.map(p =>
      p.id === item.productId
        ? { ...p, mrp: price, sale_price: price }
        : p
    ));
    setRecentlyScanned(prev => prev.map(p =>
      p.id === item.productId
        ? { ...p, mrp: price, sale_price: price }
        : p
    ));

    // Persist to inventory via backend
    try {
      await updateProductMrp(item.productId, Number(companyId), price);
    } catch (err) {
      // Revert on failure
      setCart(prev => prev.map(i =>
        i.productId === item.productId
          ? { ...i, sale_price: originalPrice, originalPrice: undefined }
          : i
      ));
      setProducts(prev => prev.map(p =>
        p.id === item.productId
          ? { ...p, mrp: originalPrice, sale_price: originalPrice }
          : p
      ));
      setFilteredProducts(prev => prev.map(p =>
        p.id === item.productId
          ? { ...p, mrp: originalPrice, sale_price: originalPrice }
          : p
      ));
      alert(`MRP update failed: ${err.message}`);
    }
  };

  const removeFromCart = (scanId) => {
    setCart(prev => prev.filter(i => i.scanId !== scanId));
  };

  const subtotal = cart.reduce(
    (s, i) => s + (i.sale_price * (i.quantity || 1)),
    0
  );
  const totalItemDiscount = cart.reduce(
    (s, i) => s + ((i.discount || 0) * (i.quantity || 1)),
    0
  );
  const globalDiscountAmount = Number(discount) || 0;
  const grandTotal = Math.max(0, subtotal - totalItemDiscount - globalDiscountAmount);
  const cashTotal = cart
    .filter(item => item.paymentMode === "CASH")
    .reduce((sum, item) => sum + ((item.sale_price - (item.discount || 0)) * (item.quantity || 1)), 0);

  const upiTotal = cart
    .filter(item => item.paymentMode === "UPI")
    .reduce((sum, item) => sum + ((item.sale_price - (item.discount || 0)) * (item.quantity || 1)), 0);

  const cardTotal = cart
    .filter(item => item.paymentMode === "CARD")
    .reduce((sum, item) => sum + ((item.sale_price - (item.discount || 0)) * (item.quantity || 1)), 0);

  const getProductCartCount = (productId) => {
    return cart
      .filter(i => i.productId === productId)
      .reduce((sum, i) => sum + (i.quantity || 1), 0);
  };

  const selectedTotal = cart
    .filter(item => selectedItems.includes(item.scanId))
    .reduce((sum, item) => sum + ((item.sale_price - (item.discount || 0)) * (item.quantity || 1)), 0);

const handleBarcodeInput = async () => {
  const input = barcodeValue.trim();
  if (!input) return;

  // ─── 1st: Try exact barcode match ───
  let product = products.find(p => p.barcode === input);

  // ─── 2nd: Try exact sort_key match (the NEW feature) ───
  if (!product) {
    product = products.find(p => p.sort_key === input);
  }

  // ─── 3rd: Try local DB barcode ───
  if (!product) {
    try {
      product = await db.products.where('barcode').equals(input).first();
    } catch (err) {
      console.error("Local DB search failed:", err);
    }
  }

  // ─── 4th: Try local DB sort_key ───
  if (!product) {
    try {
      product = await db.products.where('sort_key').equals(input).first();
    } catch (err) {
      console.error("Local DB sort_key search failed:", err);
    }
  }

  if (product) {
    addToCart(product);
  } else {
    alert('Product not found or not in counter stock');
  }

  setBarcodeValue('');
};

  const clearPersistedSale = () => {
    // ─── ADDED: Check if we need to restore backup ───
    const backupCart = localStorage.getItem('pos_cart_backup')
    if (backupCart) {
      try {
        const parsed = JSON.parse(backupCart)
        if (parsed.length > 0) {
          // Restore backed up cart
          setCart(parsed)
          localStorage.setItem('pos_cart', backupCart)

          // Restore other fields
          setCustomerName(JSON.parse(localStorage.getItem('pos_customerName_backup') || '"Walk-in Customer"'))
          setCustomerPhone(JSON.parse(localStorage.getItem('pos_customerPhone_backup') || '""'))
          setDiscount(Number(JSON.parse(localStorage.getItem('pos_discount_backup') || '0')))
          setPaymentMode(JSON.parse(localStorage.getItem('pos_paymentMode_backup') || '"CASH"'))

          // Clear backups
          localStorage.removeItem('pos_cart_backup')
          localStorage.removeItem('pos_customerName_backup')
          localStorage.removeItem('pos_customerPhone_backup')
          localStorage.removeItem('pos_discount_backup')
          localStorage.removeItem('pos_paymentMode_backup')

          // Clear edit state
          setEditingSale(null)
          sessionStorage.removeItem('editing_sale_data')
          setSaleDate(format(new Date(), 'yyyy-MM-dd'))
          setSaleTime(format(new Date(), 'HH:mm'))
          return  // Don't clear the cart!
        }
      } catch (err) {
        console.error('Failed to restore backup:', err)
        localStorage.removeItem('pos_cart_backup')
      }
    }

    // No backup exists, clear everything
    setCart([]);
    setCustomerName('Walk-in Customer');
    setCustomerPhone('');
    setDiscount(0);
    setPaymentMode('CASH');
    setSaleDate(format(new Date(), 'yyyy-MM-dd'));
    setSaleTime(format(new Date(), 'HH:mm'));
    setEditingSale(null);
    sessionStorage.removeItem('editing_sale_data');
  };
  const cancelEdit = () => {
    // clearPersistedSale already handles backup restoration now
    clearPersistedSale()
  }

  // ─── Process EACH item in cart as a SEPARATE BILL ───
  const handleCheckout = async () => {
    if (!cart.length) return;
    setCheckingOut(true);
    setError('');

    try {
      // ═══════════════════════════════════════════════════════
      // AGGREGATE ALL ITEMS BY PRODUCT ID (single bill)
      // ═══════════════════════════════════════════════════════
      const aggregated = {};
      cart.forEach(item => {
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
        aggregated[key].quantity += (item.quantity || 1);
        aggregated[key].discount += ((item.discount || 0) * (item.quantity || 1));
      });

      // Recalculate total_price for each aggregated item
      Object.values(aggregated).forEach(item => {
        item.total_price = (item.unit_price * item.quantity) - item.discount;
      });

      // Determine payment mode from cart items
      const modes = [...new Set(cart.map(i => i.paymentMode || 'CASH'))];
      const paymentMode = modes.length > 1 ? 'MIXED' : modes[0];

      if (editingSale) {
        // ═══════════════════════════════════════════════════════
        // EDIT MODE: Update existing sale, single invoice
        // ═══════════════════════════════════════════════════════
        setUpdating(true);

        const newSaleDate = `${saleDate}T${saleTime || '00:00'}:00`;

        const payload = {
          invoice_number: editingSale.invoiceNumber,  // Keep original
          company_id: Number(companyId),
          customer_name: customerName,
          customer_phone: customerPhone,
          total_amount: grandTotal,
          payment_mode: paymentMode,
          created_at: newSaleDate,
          items: Object.values(aggregated).map(item => ({
            ...item,
            company_id: Number(companyId),
          })),
        };

        await updateSale(editingSale.dbId, payload);

        setCompletedSale({
          invoice_number: editingSale.invoiceNumber,
          customer_name: customerName,
          created_at: newSaleDate,
          total_amount: grandTotal,
          items: Object.values(aggregated).map(g => ({
            product_name: g.product_name,
            quantity: g.quantity,
            unit_price: g.unit_price,
            discount: g.discount,
            total_price: g.total_price,
          })),
          isEdit: true,
        });

        setShowInvoice(true);
        setRecentlyScanned([]);
        setSelectedItems([]);
        sessionStorage.removeItem('editing_sale_data');
        setEditingSale(null);
        clearPersistedSale();
        fetchProducts();

      } else {
        // ═══════════════════════════════════════════════════════
        // NORMAL MODE: Single invoice with ALL items
        // ═══════════════════════════════════════════════════════
        const invoiceNumber = generateInvoiceNumber(companyId);

        const payload = {
          invoice_number: invoiceNumber,
          company_id: Number(companyId),
          customer_name: customerName,
          customer_phone: customerPhone,
          total_amount: grandTotal,
          payment_mode: paymentMode,
          items: Object.values(aggregated).map(item => ({
            ...item,
            company_id: Number(companyId),
          })),
        };

        await processCheckout(payload);
        await fetchTodayCounterSale();

        setCompletedSale({
          invoice_number: invoiceNumber,
          customer_name: customerName,
          created_at: new Date().toISOString(),
          total_amount: grandTotal,
          items: Object.values(aggregated).map(g => ({
            product_name: g.product_name,
            quantity: g.quantity,
            unit_price: g.unit_price,
            discount: g.discount,
            total_price: g.total_price,
          })),
        });

        setShowInvoice(true);
        setRecentlyScanned([]);
        setSelectedItems([]);
        clearPersistedSale();
        fetchProducts();
      }
    } catch (err) {
      setError(err.message || (editingSale ? 'Update failed.' : 'Checkout failed. Check counter stock.'));
    } finally {
      setCheckingOut(false);
      setUpdating(false);
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


  // Add this function before your handleBulkPrint function
  const handlePaymentSplitChange = (field, value) => {
    const numValue = Math.max(0, Number(value) || 0);
    const totalAmount = selectedTotal || grandTotal;

    setPaymentSplit(prev => {
      const newSplit = { ...prev, [field]: numValue };

      // Auto-calculate UPI if cash is entered
      if (field === 'cash') {
        const remaining = totalAmount - numValue - newSplit.card;
        newSplit.upi = Math.max(0, remaining);
      }
      // Auto-calculate UPI if card is entered
      else if (field === 'card') {
        const remaining = totalAmount - numValue - newSplit.cash;
        newSplit.upi = Math.max(0, remaining);
      }

      // Validate total doesn't exceed grand total
      const enteredTotal = newSplit.cash + newSplit.card + newSplit.upi;
      if (enteredTotal > totalAmount) {
        // Adjust UPI to match exact total
        newSplit.upi = Math.max(0, totalAmount - newSplit.cash - newSplit.card);
      }

      return newSplit;
    });
  };

  const resetPaymentSplit = () => {
    setPaymentSplit({ cash: 0, card: 0, upi: 0 });
  };
  // Replace your existing handleBulkPrint function with this updated version
  const handleBulkPrint = () => {
    if (selectedItems.length === 0) return alert('Please select items to print.');
    setPrintCustomerName(customerName === 'Walk-in Customer' ? '' : customerName);
    setPrintCustomerPhone(customerPhone);
    setShowPaymentSplit(true); // Show payment split section
    setIsPrintModalOpen(true);
    resetPaymentSplit(); // Reset payment split when opening modal
  };

  // Replace your existing confirmPrint function with this updated version
  const confirmPrint = async () => {
    const itemsToPrint = cart.filter(i => selectedItems.includes(i.scanId));
    if (!itemsToPrint.length) return;

    // Validate payment split matches total
    const totalEntered = paymentSplit.cash + paymentSplit.card + paymentSplit.upi;
    const totalAmount = selectedTotal || grandTotal;
    if (totalEntered !== totalAmount) {
      alert(`Payment split (₹${totalEntered.toFixed(2)}) must equal total amount (₹${totalAmount.toFixed(2)})`);
      return;
    }

    const cName = printCustomerName || 'Walk-in Customer';
    const cPhone = printCustomerPhone || 'N/A';

    setPrinting(true);

    try {
      let lastInvoiceNumber = '';

      for (const item of itemsToPrint) {
        const invNum = generateInvoiceNumber(companyId);
        lastInvoiceNumber = invNum;

        const payload = {
          invoice_number: invNum,
          company_id: Number(companyId),
          customer_name: cName,
          customer_phone: cPhone === 'N/A' ? '' : cPhone,
          total_amount: item.sale_price - (item.discount || 0),
          payment_mode: item.paymentMode || 'CASH',
          items: [{
            product_id: item.productId,
            product_name: item.name,
            quantity: item.quantity,
            unit_price: item.sale_price,
            discount: item.discount || 0,
            total_price: (item.sale_price - (item.discount || 0)) * item.quantity,
            company_id: Number(companyId)
          }],
        };
        await processCheckout(payload);
      }

      const printGroups = {};
let totalAmountCalc = 0;
itemsToPrint.forEach(item => {
    if (!printGroups[item.productId]) {
        printGroups[item.productId] = { name: item.name, sale_price: item.sale_price, qty: 0, totalDiscount: 0, lineTotal: 0 };
    }
    const itemQty = item.quantity || 1;  // ✅ Get actual quantity
    printGroups[item.productId].qty += itemQty;  // ✅ Use actual quantity
    printGroups[item.productId].totalDiscount += (item.discount || 0) * itemQty;  // ✅ Multiply discount by qty
    printGroups[item.productId].lineTotal += (item.sale_price - (item.discount || 0)) * itemQty;  // ✅ Multiply by qty
    totalAmountCalc += (item.sale_price - (item.discount || 0)) * itemQty;  // ✅ Multiply by qty
});

      let itemsHtml = '';

      Object.values(printGroups).forEach(g => {
        const discountHtml = g.totalDiscount > 0
          ? `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>Discount</span><span>-₹${g.totalDiscount.toFixed(2)}</span></div>`
          : '';

        itemsHtml += `
        <div style="margin-bottom:6px;">
          <div style="font-weight:bold; text-transform:uppercase; font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${g.name}</div>
          <div style="display:flex; justify-content:space-between; font-size:11px;">
            <span>₹${g.sale_price.toFixed(2)} x ${g.qty}</span>
            <span>₹${(g.sale_price * g.qty).toFixed(2)}</span>
          </div>
          ${discountHtml}
        </div>
      `;
      });

      const invoiceNumber = lastInvoiceNumber;
      const printDate = format(new Date(), 'dd/MM/yyyy hh:mm a');

      // ─── PREPARE COMPANY DETAILS ───
      const cAddress = companyDetails.address || '';
      const cEmail = companyDetails.email || '';
      const cExcise = companyDetails.exciseLicenseNo || '';
      const cTrade = companyDetails.tradeLicenseNo || '';
      const cGstin = companyDetails.gstin || '';

      // ─── PREPARE PAYMENT BREAKDOWN HTML ───
      let paymentBreakdownHtml = '';
      if (paymentSplit.cash > 0) {
        paymentBreakdownHtml += `
        <div style="display:flex; justify-content:space-between; font-size:11px;">
          <span>💰 Cash</span>
          <span>₹${paymentSplit.cash.toFixed(2)}</span>
        </div>
      `;
      }
      if (paymentSplit.card > 0) {
        paymentBreakdownHtml += `
        <div style="display:flex; justify-content:space-between; font-size:11px;">
          <span>💳 Card</span>
          <span>₹${paymentSplit.card.toFixed(2)}</span>
        </div>
      `;
      }
      if (paymentSplit.upi > 0) {
        paymentBreakdownHtml += `
        <div style="display:flex; justify-content:space-between; font-size:11px;">
          <span>📱 UPI</span>
          <span>₹${paymentSplit.upi.toFixed(2)}</span>
        </div>
      `;
      }

      // ─── USE IFRAME INSTEAD OF window.open() ───
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
          <title>Receipt</title>
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

              <p style="margin:4px 0 0 0; font-size:10px; font-weight:bold;">SALE BILL</p>
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
                <span>₹${totalAmountCalc.toFixed(2)}</span>
              </div>
            </div>

            <!-- Payment Breakdown -->
            ${paymentBreakdownHtml ? `
              <div style="border-top:1px dashed #000; margin-top:8px; padding-top:6px;">
                <div style="font-weight:bold; font-size:11px; margin-bottom:4px;">PAYMENT MODE:</div>
                ${paymentBreakdownHtml}
              </div>
            ` : ''}

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
      setShowPaymentSplit(false);
      resetPaymentSplit();
      fetchProducts();

    } catch (err) {
      alert(err.message || 'Checkout/Print failed. Check counter stock.');
    } finally {
      setPrinting(false);
    }
  };
  const handleBulkWhatsApp = async () => {
    if (selectedItems.length === 0) return alert('Please select items to send.');

    // 1. Load PDF library safely
    let html2pdf;
    try {
      html2pdf = (await import('html2pdf.js')).default;
    } catch (e) {
      alert("PDF library failed to load. Please check your internet connection and try again.");
      return;
    }

    const itemsToSend = cart.filter(i => selectedItems.includes(i.scanId));

    // 2. Group items safely (prevent NaN errors)
    const waGroups = {};
itemsToSend.forEach(item => {
    if (!waGroups[item.productId]) {
        waGroups[item.productId] = {
            name: item.name || 'Item',
            sale_price: Number(item.sale_price) || 0,
            qty: 0,
            totalDiscount: 0,
            lineTotal: 0
        };
    }
    const itemQty = item.quantity || 1;  // ✅ Get actual quantity
    waGroups[item.productId].qty += itemQty;  // ✅ Use actual quantity
    waGroups[item.productId].totalDiscount += (Number(item.discount) || 0) * itemQty;  // ✅ Multiply by qty
    waGroups[item.productId].lineTotal += ((Number(item.sale_price) || 0) - (Number(item.discount) || 0)) * itemQty;  // ✅ Multiply by qty
});

    // 3. Build Bill HTML (exact same style as your thermal print bill)
    let itemsHtml = '';
    let totalAmount = 0;

    Object.values(waGroups).forEach(g => {
      totalAmount += g.lineTotal;
      const discountHtml = g.totalDiscount > 0
        ? `<div style="display:flex; justify-content:space-between; font-size:11px;"><span>Discount</span><span>-₹${g.totalDiscount.toFixed(2)}</span></div>`
        : '';

      itemsHtml += `
        <div style="margin-bottom:6px;">
          <div style="font-weight:bold; text-transform:uppercase; font-size:12px;">${g.name}</div>
          <div style="display:flex; justify-content:space-between; font-size:11px;">
            <span>₹${g.sale_price.toFixed(2)} x ${g.qty}</span>
            <span>₹${(g.sale_price * g.qty).toFixed(2)}</span>
          </div>
          ${discountHtml}
        </div>
      `;
    });

    const invoiceNumber = generateInvoiceNumber(companyId);
    const printDate = format(new Date(), 'dd/MM/yyyy hh:mm a');
    const cName = customerName === 'Walk-in Customer' ? 'Walk-in Customer' : customerName;
    const cPhone = customerPhone || 'N/A';
    const cAddress = companyDetails.address || '';
    const cEmail = companyDetails.email || '';
    const cExcise = companyDetails.exciseLicenseNo || '';

    // 4. Create hidden container to render the bill
    const container = document.createElement('div');
    container.style.width = '280px';
    container.style.fontFamily = "'Courier New', monospace";
    container.style.fontSize = '12px';
    container.style.lineHeight = '1.4';
    container.style.padding = '10px 5px';
    container.style.background = 'white';
    container.style.color = 'black';
    container.innerHTML = `
      <div style="text-align:center; margin-bottom:5px;">
        <h2 style="margin:0; font-size:16px; text-transform:uppercase; letter-spacing:1px;">${companyName}</h2>
        ${cAddress ? `<p style="margin:2px 0 0 0; font-size:10px;">${cAddress}</p>` : ''}
        ${cEmail ? `<p style="margin:2px 0 0 0; font-size:10px;">Email: ${cEmail}</p>` : ''}
        ${cExcise ? `<p style="margin:2px 0 0 0; font-size:11px; font-weight:bold;">Shop Lic No: ${cExcise}</p>` : ''}
        <p style="margin:4px 0 0 0; font-size:10px; font-weight:bold;">SALE BILL</p>
      </div>
      <div style="border-top:1px dashed #000; margin:8px 0;"></div>
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
      ${itemsHtml}
      <div style="border-top:1px dashed #000; margin-top:8px; padding-top:6px;">
        <div style="display:flex; justify-content:space-between; font-weight:bold; font-size:15px;">
          <span>TOTAL</span>
          <span>₹${totalAmount.toFixed(2)}</span>
        </div>
      </div>
      <div style="border-top:1px dashed #000; margin-top:15px; padding-top:5px; text-align:center; font-size:9px;">
        <p style="margin:0 0 4px 0; font-weight:bold;">Goods once sold will not be taken back.</p>
        <p style="margin:0 0 4px 0;">Please check items before leaving.</p>
        <p style="margin:0 0 4px 0; font-weight:bold;">Thank You. Visit Again.</p>
      </div>
    `;

    // Add to DOM so html2pdf can read it
    document.body.appendChild(container);

    try {
      // 5. Generate PDF (using 'a4' to prevent jsPDF crash)
      const pdfBlob = await html2pdf()
        .set({
          margin: [10, 10, 10, 10],
          filename: `Bill-${invoiceNumber}.pdf`,
          image: { type: 'jpeg', quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff' },
          jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        })
        .from(container)
        .outputPdf('blob');

      // 6. Auto-download the PDF to user's computer/phone
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bill-${invoiceNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // 7. Auto-open WhatsApp with message
      let waPhone = (customerPhone || '').replace(/\D/g, '');
      if (waPhone.length === 10) waPhone = '91' + waPhone;

      const waMsg = `Here is your bill for ₹${totalAmount.toFixed(2)} (Attached PDF)`;
      const waUrl = waPhone
        ? `https://wa.me/${waPhone}?text=${encodeURIComponent(waMsg)}`
        : `https://wa.me/?text=${encodeURIComponent(waMsg)}`;

      if (isTauri()) {
        await openUrl(waUrl);
      } else {
        window.open(waUrl, '_blank');
      }

      // 8. Alert user to attach the downloaded file
      alert(`✅ Bill PDF downloaded successfully!\n\n📌 WhatsApp is now open. Please click the 📎 (attachment/icon) icon in WhatsApp and select "Bill-${invoiceNumber}.pdf" from your Downloads folder to send it.`);

    } catch (err) {
      console.error('WhatsApp PDF failed:', err);
      alert('Failed to generate PDF: ' + err.message);
    } finally {
      // 9. Clean up hidden container from DOM
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
    }
  };

  const handleSavePDF = () => {
    if (cart.length === 0) return alert('Cart is empty.');

    const cName = customerName || 'Walk-in Customer';
    const cPhone = customerPhone || 'N/A';
    const invoiceNumber = generateInvoiceNumber(companyId);

    const pdfGroups = {};
cart.forEach(item => {
    if (!pdfGroups[item.productId]) {
        pdfGroups[item.productId] = { name: item.name, sale_price: item.sale_price, qty: 0, totalDiscount: 0 };
    }
    const itemQty = item.quantity || 1;  // ✅ Get actual quantity
    pdfGroups[item.productId].qty += itemQty;  // ✅ Use actual quantity
    pdfGroups[item.productId].totalDiscount += (item.discount || 0) * itemQty;  // ✅ Multiply by qty
});

    let itemsHtml = '';

    Object.values(pdfGroups).forEach(g => {
      const lineTotal = (g.sale_price * g.qty) - g.totalDiscount;
      const discountHtml = g.totalDiscount > 0
        ? `<tr><td colspan="3" style="text-align:right; padding:4px 8px; color:#d9534f; font-size:0.9em;">Discount</td><td style="padding:4px 8px; text-align:right; color:#d9534f;">-₹${g.totalDiscount.toFixed(2)}</td></tr>`
        : '';

      itemsHtml += `
        <tr>
          <td style="padding:8px; border-bottom:1px solid #eee;">${g.name}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;">${g.qty}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">₹${g.sale_price}</td>
          <td style="padding:8px; border-bottom:1px solid #eee; text-align:right; font-weight:bold;">₹${lineTotal.toFixed(2)}</td>
        </tr>
        ${discountHtml}
      `;
    });

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
          <title>Invoice ${invoiceNumber}</title>
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
                <div class="title">SALE BILL</div>
                <p><strong>Invoice #:</strong> ${invoiceNumber}</p>
                <p><strong>Date:</strong> ${format(new Date(), 'dd/MM/yyyy hh:mm a')}</p>
              </div>
              <div style="text-align: right;">
                <p><strong>Customer:</strong> ${cName}</p>
                <p><strong>Phone:</strong> ${cPhone}</p>
                <p><strong>Payment:</strong> Mixed</p>
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
  }; // ← FIXED: properly closed handleSavePDF

  if (showInvoice && completedSale) {
    return (
      <div className="p-6 flex-1 overflow-y-auto">
        <div className="p-8 bg-white dark:bg-gray-900 rounded-xl max-w-lg mx-auto shadow-sm border border-gray-100">
          <div className={clsx("flex items-center gap-3 mb-6 justify-center", completedSale.isEdit ? "text-amber-600" : "text-emerald-600")}>
            <CheckCircle className="w-8 h-8" />
            <h2 className="text-2xl font-bold">{completedSale.isEdit ? 'Sale Updated' : 'Sale Complete'}</h2>
          </div>
          <div className="space-y-2 text-sm text-gray-700 dark:text-gray-300 mb-6">
            <p><strong>{completedSale.isEdit ? 'Invoice Updated:' : 'Invoices:'}</strong> {completedSale.invoice_number}</p>
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
          {/* <button
            onClick={() => {
              setShowInvoice(false);
              setDiscount(0);
              setEditingSale(null);
              sessionStorage.removeItem('editing_sale_data');
            }}
            className="mt-6 w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            {completedSale.isEdit ? 'Back to POS' : 'New Sale'}
          </button> */}

          <button
            onClick={() => {
              setShowInvoice(false);
              // ─── After edit complete, start fresh ───
              clearPersistedSale();  // This now clears both localStorage cart AND sessionStorage
            }}
            className="mt-6 w-full px-4 py-2.5 bg-primary-600 text-white rounded-lg font-semibold hover:bg-primary-700 transition-colors"
          >
            {completedSale.isEdit ? 'New Sale' : 'New Sale'}
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
        <p className="text-sm text-gray-500 text-center max-w-md">Please select a company to use the Point of Sale.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 min-h-0 bg-gray-50 dark:bg-gray-950 overflow-hidden relative">
      {/* ═══ EDIT MODE BANNER ═══ */}
      {editingSale && (
        <div className="absolute top-0 left-0 right-0 z-40 bg-amber-500 text-white px-4 py-2 flex items-center justify-between shadow-lg">
          <div className="flex items-center gap-2">
            <Pencil className="w-4 h-4" />
            <span className="text-sm font-bold">
              Editing Invoice: {editingSale.invoiceNumber}
            </span>
            <span className="text-xs bg-amber-600 px-2 py-0.5 rounded-full">
              {editingSale.cartItems?.length || 0} items loaded
            </span>
          </div>
          <button
            onClick={cancelEdit}
            className="flex items-center gap-1 px-3 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-semibold transition-colors"
          >
            <X className="w-4 h-4" /> Cancel Edit
          </button>
        </div>
      )}

      {/* PRINT MODAL */}
      {isPrintModalOpen && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl max-w-sm w-full p-6 space-y-4 relative max-h-[90vh] overflow-y-auto">
            <button onClick={() => { setIsPrintModalOpen(false); setShowPaymentSplit(false); }} className="absolute top-3 right-3 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <X className="w-5 h-5" />
            </button>

            <h3 className="text-lg font-bold text-gray-900 dark:text-white border-b pb-2">Checkout & Print Bill</h3>

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

            {/* ═══ PAYMENT SPLIT SECTION ═══ */}
            <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg border border-blue-200 dark:border-blue-800 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-blue-800 dark:text-blue-300 flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  Payment Split
                </h4>
                <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  ₹{(selectedTotal || grandTotal).toFixed(2)}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {/* CASH FIELD */}
                <div>
                  <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1 mb-1">
                    <Banknote className="w-3 h-3 text-green-600" />
                    CASH
                  </label>
                  <input
                    type="number"
                    value={paymentSplit.cash || ''}
                    onChange={(e) => handlePaymentSplitChange('cash', e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-green-300 dark:border-green-700 rounded-lg px-2 py-2 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-green-500 dark:bg-gray-800 dark:text-white"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* CARD FIELD */}
                <div>
                  <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1 mb-1">
                    <CreditCard className="w-3 h-3 text-purple-600" />
                    CARD
                  </label>
                  <input
                    type="number"
                    value={paymentSplit.card || ''}
                    onChange={(e) => handlePaymentSplitChange('card', e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-purple-300 dark:border-purple-700 rounded-lg px-2 py-2 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-gray-800 dark:text-white"
                    min="0"
                    step="0.01"
                  />
                </div>

                {/* UPI FIELD (Auto-calculated) */}
                <div>
                  <label className="text-[10px] font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-1 mb-1">
                    <Smartphone className="w-3 h-3 text-orange-600" />
                    UPI
                  </label>
                  <input
                    type="number"
                    value={paymentSplit.upi || ''}
                    onChange={(e) => handlePaymentSplitChange('upi', e.target.value)}
                    placeholder="0.00"
                    className="w-full border border-orange-300 dark:border-orange-700 rounded-lg px-2 py-2 text-sm text-center font-semibold focus:outline-none focus:ring-2 focus:ring-orange-500 dark:bg-gray-800 dark:text-white"
                    min="0"
                    step="0.01"
                  />
                </div>
              </div>

              {/* Payment Summary */}
              <div className="bg-white dark:bg-gray-800 rounded-lg p-2 border border-blue-100 dark:border-blue-900">
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>Entered:</span>
                  <span className="font-mono">₹{(paymentSplit.cash + paymentSplit.card + paymentSplit.upi).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mt-1">
                  <span>Remaining:</span>
                  <span className={`font-mono font-bold ${(selectedTotal || grandTotal) - (paymentSplit.cash + paymentSplit.card + paymentSplit.upi) === 0 ? 'text-green-600' : 'text-red-600'}`}>
                    ₹{Math.max(0, (selectedTotal || grandTotal) - (paymentSplit.cash + paymentSplit.card + paymentSplit.upi)).toFixed(2)}
                  </span>
                </div>
              </div>

              {/* Quick Fill Buttons */}
              <div className="flex gap-2">
                <button
                  onClick={() => setPaymentSplit({ cash: selectedTotal || grandTotal, card: 0, upi: 0 })}
                  className="flex-1 text-xs bg-green-100 hover:bg-green-200 dark:bg-green-900/30 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400 py-1.5 px-2 rounded-lg font-semibold transition-colors"
                >
                  All Cash
                </button>
                <button
                  onClick={() => setPaymentSplit({ cash: 0, card: selectedTotal || grandTotal, upi: 0 })}
                  className="flex-1 text-xs bg-purple-100 hover:bg-purple-200 dark:bg-purple-900/30 dark:hover:bg-purple-900/50 text-purple-700 dark:text-purple-400 py-1.5 px-2 rounded-lg font-semibold transition-colors"
                >
                  All Card
                </button>
                <button
                  onClick={() => setPaymentSplit({ cash: 0, card: 0, upi: selectedTotal || grandTotal })}
                  className="flex-1 text-xs bg-orange-100 hover:bg-orange-200 dark:bg-orange-900/30 dark:hover:bg-orange-900/50 text-orange-700 dark:text-orange-400 py-1.5 px-2 rounded-lg font-semibold transition-colors"
                >
                  All UPI
                </button>
              </div>
            </div>

            {/* Selected Items Preview */}
           <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto space-y-2">
  <p className="text-[10px] font-bold text-gray-500">Selected Items</p>
  {(() => {
    const selectedCartItems = cart.filter(i => selectedItems.includes(i.scanId));
    const modalGroups = {};
    selectedCartItems.forEach(item => {
      if (!modalGroups[item.productId]) {
        modalGroups[item.productId] = { name: item.name, qty: 0, lineTotal: 0 };
      }
      const itemQty = item.quantity || 1;  // ✅ Get actual quantity
      modalGroups[item.productId].qty += itemQty;  // ✅ Use actual quantity
      modalGroups[item.productId].lineTotal += (item.sale_price - (item.discount || 0)) * itemQty;  // ✅ Multiply by qty
    });
    return Object.entries(modalGroups).map(([id, g]) => (
      <div key={id} className="flex justify-between text-xs">
        <span className="text-gray-700 dark:text-gray-300">{g.name} x{g.qty}</span>
        <span className="font-semibold">₹{g.lineTotal.toFixed(2)}</span>
      </div>
    ));
  })()}
</div>

            {/* Print Button */}
            <button
              onClick={confirmPrint}
              disabled={printing || (paymentSplit.cash + paymentSplit.card + paymentSplit.upi) !== (selectedTotal || grandTotal)}
              className="w-full py-2.5 bg-primary-600 hover:bg-primary-700 disabled:bg-gray-400 disabled:cursor-not-allowed text-white rounded-lg font-semibold transition-colors flex items-center justify-center gap-2"
            >
              {printing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Printer className="w-4 h-4" />
                  Print Bill
                </>
              )}
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
                          <span className="text-[12px] font-mono text-green-600 font-semibold  dark:text-green-400">B.No:{product.id}</span>
                          <span className="text-[10px] text-green-500 font-semibold  dark:text-green-400">{format(new Date(), 'dd/MM/yy')}</span>
                        </div>
                        <p className="text-[11px] font-bold text-gray-900 dark:text-white truncate">{product.name}</p>
                        <div className="flex items-center justify-between">
                          <span className={clsx(
                            "text-[10px] font-semibold",
                            isPriceModified(product) ? "text-amber-600 dark:text-amber-400" : "text-primary-600 dark:text-primary-400"
                          )}>
                            MRP: ₹{product.sale_price}
                            {isPriceModified(product) && (
                              <span className="ml-1 text-[9px] text-gray-400 line-through font-normal">
                                ₹{product.originalPrice?.toFixed(2)}
                              </span>
                            )}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[11px] text-green-500 dark:text-green-400 flex items-center gap-0.5"><Layers className="w-2.5 h-2.5" /> {product.counter_stock}</span>
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
            <input type="text" placeholder="Search counter stock..." value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500" />
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
                      <p className="text-[12px] font-semibold text-gray-800 dark:text-gray-200 truncate">{p.name}</p>
                      <p className="text-[12px] font-semibold text-blue-700 dark:text-white ">Stock: {p.counter_stock} {cartCount > 0 && `· ${cartCount} in bill`}</p>
                    </div>
                    <p className="text-[12px] font-bold text-gray-600 dark:text-gray-300">₹{p.sale_price}</p>
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

        {/* ─── EDIT MODE: Date/Time Picker ─── */}
        {editingSale && (
          <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-4 h-4 text-amber-600" />
              <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                Modify Sale Date & Time
              </span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1">Date</label>
                <input
                  type="date"
                  value={saleDate}
                  onChange={(e) => setSaleDate(e.target.value)}
                  className="w-full border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div className="flex-1">
                <label className="text-[10px] font-medium text-gray-500 dark:text-gray-400 block mb-1">Time</label>
                <input
                  type="time"
                  value={saleTime}
                  onChange={(e) => setSaleTime(e.target.value)}
                  className="w-full border border-amber-300 dark:border-amber-700 rounded-lg px-3 py-1.5 text-xs bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Table Header */}
        <div className="px-4 py-2 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-white dark:bg-gray-900">
          <div className="flex items-center gap-3">
            <ShoppingCart className="w-4 h-4 text-primary-600" />
            <h2 className="text-sm font-bold text-gray-900 dark:text-white">Current Bill</h2>
            <span className="px-3 py-1 rounded-lg bg-green-50 border border-green-200 text-[30px] font-bold dark:text-green-600">
              {cart.length} {cart.length === 1 ? 'item' : ''}
            </span>
          </div>



          <div className="flex items-center gap-3">

            {/* Payment Summary */}
            <div className="flex items-center gap-2">

              <div className="px-3 py-1 rounded-lg bg-green-50 border border-green-200">
                <div className="text-[12px] text-green-600 font-bold">
                  SAVE BILL
                </div>
                <div className="text-sm font-bold text-green-700">
                  ₹{todayCounterSale.toLocaleString()}
                </div>
              </div>

              <div className="px-3 py-1 rounded-lg bg-emerald-50 border border-emerald-200">
                <div className="text-[12px] text-emerald-600 font-bold">
                  CASH
                </div>
                <div className="text-sm font-bold text-emerald-700">
                  ₹{cashTotal.toFixed(2)}
                </div>
              </div>

              <div className="px-3 py-1 rounded-lg bg-blue-50 border border-blue-200">
                <div className="text-[12px] text-blue-600 font-bold">
                  UPI
                </div>
                <div className="text-sm font-bold text-blue-700">
                  ₹{upiTotal.toFixed(2)}
                </div>
              </div>

              <div className="px-3 py-1 rounded-lg bg-purple-50 border border-purple-200">
                <div className="text-[12px] text-purple-600 font-bold">
                  CARD
                </div>
                <div className="text-sm font-bold text-purple-700">
                  ₹{cardTotal.toFixed(2)}
                </div>
              </div>

            </div>
            <div className="px-3 py-1 rounded-lg bg-purple-50 border border-purple-200">
              <div className="text-[12px] text-purple-600 font-bold">
                Grand Total:
              </div>
              <div className="text-sm font-bold text-purple-700">
                ₹{grandTotal.toFixed(2)}
              </div>
            </div>

            <div className="px-3 py-1 rounded-lg bg-amber-50 border border-amber-200">
              <div className="text-[12px] text-amber-600 font-bold flex items-center gap-1">
                Selected:
                <span className="text-[10px] font-normal text-amber-500">({selectedItems.length})</span>
              </div>
              <div className="text-sm font-bold text-amber-700">
                ₹{selectedTotal.toFixed(2)}
              </div>
            </div>

            {/* Grand Total */}
            {/* <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-700">
                <span className="text-xs font-semibold text-gray-600 dark:text-gray-400">
                  Grand Total:
                </span>
                <span className="text-sm font-bold text-primary-600 dark:text-primary-400">
                  ₹{grandTotal.toFixed(2)}
                </span>
              </div> */}



            <button onClick={handleSavePDF} disabled={cart.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-600 text-white rounded-lg text-xs font-semibold hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Download className="w-3.5 h-3.5" /> Save PDF
            </button>

            <button onClick={handleBulkPrint} disabled={selectedItems.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Printer className="w-3.5 h-3.5" /> Print
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
                  <th className="pb-2 pr-4 text-center w-10">Qty</th>
                  <th className="pb-2 pr-4 text-right w-14">MRP</th>
                  <th className="pb-2 pr-4 text-center w-14">Dis.</th>
                  <th className="pb-2 pr-4 text-center w-28">Payment</th>
                  <th className="pb-2 pr-4 text-right w-14">Total</th>
                  <th className="pb-2 text-center w-20">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {[...cart].reverse().map((item) => {
                  const itemDiscount = item.discount || 0;
                  const lineTotal =
                    (item.sale_price * item.quantity) -
                    ((item.discount || 0) * item.quantity);
                  const isSelected = selectedItems.includes(item.scanId);
                  const currentPayMode = item.paymentMode || 'CASH';

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
                        <p className="text-[15px] font-semibold text-gray-900 dark:text-white">{item.name}</p>
                        <p className="text-[12px] text-gray-400">{item.bottle_size || ''} {item.traditional_name ? `· ${item.traditional_name}` : ''}</p>
                      </td>
                      <td className="py-1.5 pr-2 text-center">
                        <input
                          type="number"
                          min="1"
                          value={item.quantity}
                          onChange={(e) =>
                            updateQuantity(item.scanId, e.target.value)
                          }
                          className="w-20 text-center text-[15px] border border-gray-200 dark:border-gray-700 rounded-md px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-gray-50 dark:bg-gray-800"
                        />
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        {/* ─── EDITABLE MRP ─── */}
                        <div className="flex flex-col items-end min-w-[100px]">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-gray-400">₹</span>
                            <input
                              type="number"
                              value={item.sale_price}
                              onChange={(e) => updateItemPrice(item.scanId, e.target.value)}
                              onBlur={(e) => {
                                const val = Math.max(0, Number(e.target.value) || 0);
                                if (val <= 0 && item.originalPrice) {
                                  updateItemPrice(item.scanId, item.originalPrice);
                                }
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
                              step="0.01"
                              min="0"
                              className={clsx(
                                "w-[65px] text-right text-[13px] font-bold px-1.5 py-0.5 rounded ",
                                "focus:outline-none focus:ring-2 focus:ring-primary-500",
                                isPriceModified(item)
                                  ? "bg-amber-50 dark:bg-black border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400"
                                  : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-800 dark:text-gray-200"
                              )}
                            />
                          </div>
                          {/* {isPriceModified(item) && (
    <span className="text-[9px] text-amber-500 line-through">
      was ₹{(item.originalPrice || 0).toFixed(2)}
    </span>
  )}
  <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400 mt-0.5">
    = ₹{((item.sale_price - (item.discount || 0)) * (item.quantity || 1)).toFixed(2)}
  </span> */}
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex justify-center">
                          <input type="number" value={itemDiscount} onChange={(e) => updateItemDiscount(item.scanId, e.target.value)} className="w-14 text-center text-[15px] border border-gray-200 dark:border-gray-700 rounded-md px-1 py-1 focus:outline-none focus:ring-1 focus:ring-primary-500 bg-gray-50 dark:bg-gray-800" />
                        </div>
                      </td>
                      <td className="py-1.5 pr-2">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            onClick={() => updateItemPaymentMode(item.scanId, 'CASH')}
                            className={clsx("px-2 py-0.5 text-[15px] font-bold rounded transition-colors", currentPayMode === 'CASH' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700')}
                          >
                            Cash
                          </button>
                          <button
                            onClick={() => updateItemPaymentMode(item.scanId, 'UPI')}
                            className={clsx("px-2 py-0.5 text-[15px] font-bold rounded transition-colors", currentPayMode === 'UPI' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700')}
                          >
                            UPI
                          </button>
                          <button
                            onClick={() => updateItemPaymentMode(item.scanId, 'CARD')}
                            className={clsx("px-2 py-0.5 text-[15px] font-bold rounded transition-colors", currentPayMode === 'CARD' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700')}
                          >
                            Card
                          </button>
                        </div>
                      </td>
                      <td className="py-1.5 pr-2 text-right">
                        <span className="text-[15px] font-bold text-gray-900 dark:text-white">₹{lineTotal.toFixed(2)}</span>
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
            onClick={handleCheckout}
            disabled={cart.length === 0 || checkingOut}
            className={clsx(
              "flex items-center gap-2 px-6 py-2.5 rounded-lg text-white font-bold text-sm transition-colors",
              (cart.length === 0 || checkingOut) ? "bg-gray-300 dark:bg-gray-700 cursor-not-allowed" : "bg-primary-600 hover:bg-primary-700 active:scale-95"
            )}
          >
            {checkingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <CreditCard className="w-4 h-4" />}
            {checkingOut ? 'Processing...' : `Pay All ₹${grandTotal.toFixed(2)}`}
          </button>
        </div>

      </div>
    </div>
  );
}