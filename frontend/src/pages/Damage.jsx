import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { AlertTriangle, Search, Package, Plus, Loader2, Store, X, Save, Camera } from 'lucide-react';
import { format } from 'date-fns';
import { searchProducts, updateProduct } from '../apiservices/inventoryapi';
import { createDamageRecord, getDamages } from '../apiservices/damageapi';

const SIZE_ML_MAP = {
  '90ml': 90, '180ml': 180, '200ml': 200, '250ml': 250, '275ml': 275, '300ml': 300,
  '330ml': 330, '375ml': 375, '500ml': 500, '650ml': 650, '750ml': 750,
  '1000ml': 1000, '2000ml': 2000,
};

const DAMAGE_REASONS = [
  'Broken Bottle', 'Leakage', 'Expired', 'Spoilage', 
  'Theft/Loss', 'Transport Damage', 'Other'
];

export default function Damage() {
  const { user } = useAuth();
  const [companyId] = useState(() => localStorage.getItem('selectedCompanyId') || null);
  const companyName = localStorage.getItem('selectedCompanyName') || 'Unknown Company';
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const fileInputRef = useRef(null);
  
  // Form State
  const [damageDate, setDamageDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [reason, setReason] = useState('');
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [damageSource, setDamageSource] = useState('COUNTER'); // NEW STATE
  
  // Product Search State
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState(null);
  
  // UI & Data State
  const [damages, setDamages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const dropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  useEffect(() => {
    if (companyId) fetchDamages();
  }, [companyId]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchDamages = async () => {
    setLoading(true);
    try {
      const data = await getDamages(companyId); 
      setDamages(data || []);
    } catch (err) {
      setError('Failed to load damage records');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchChange = async (val) => {
    setSearchQuery(val);
    if (val.length > 1) {
      setIsSearching(true);
      try {
        const results = await searchProducts(val, companyId);
        setSearchResults(results);
        setShowDropdown(results.length > 0);
      } catch (err) {
        console.error(err);
      } finally {
        setIsSearching(false);
      }
    } else {
      setSearchResults([]);
      setShowDropdown(false);
    }
  };

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setPreviewUrl('');
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const selectProduct = (product) => {
    setSelectedProduct(product);
    setSearchQuery(product.name);
    setShowDropdown(false);
    setQuantity('');
    setDamageSource('COUNTER'); // Reset to counter when new product selected
  };

  const resetForm = () => {
    setSelectedProduct(null);
    setSearchQuery('');
    setQuantity('');
    setReason('');
    setNotes('');
    setDamageSource('COUNTER');
    removeImage();
    setDamageDate(format(new Date(), 'yyyy-MM-dd'));
    setTimeout(() => searchInputRef.current?.focus(), 100);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!selectedProduct) return alert('Please select a product.');
    const qty = Number(quantity);
    if (!qty || qty <= 0) return alert('Please enter a valid quantity.');

    // Check stock based on selected source
    const availableStock = damageSource === 'COUNTER' 
      ? (Number(selectedProduct.counter_stock) || 0) 
      : (Number(selectedProduct.godown_stock) || 0);

    if (qty > availableStock) {
      return alert(`Insufficient ${damageSource.toLowerCase()} stock! Available: ${availableStock}`);
    }

    setSaving(true);

    try {
      // 1. Create Damage Record in Backend
      const damagePayload = {
        company_id: Number(companyId),
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        brand: selectedProduct.brand,
        category: selectedProduct.category,
        bottle_size: selectedProduct.bottle_size,
        quantity: qty,
        reason,
        notes,
        damage_date: damageDate,
        damage_source: damageSource, // NEW FIELD
        recorded_by: user?.id || null,
      };
      await createDamageRecord(damagePayload, selectedFile);

      // 2. Deduct Stock from Inventory
      const currentTotalStock = Number(selectedProduct.current_stock) || 0;
      const stockUpdatePayload = {
        current_stock: currentTotalStock - qty, // Always deduct from total
      };

      // Deduct from specific location
      if (damageSource === 'COUNTER') {
        stockUpdatePayload.counter_stock = availableStock - qty;
      } else {
        stockUpdatePayload.godown_stock = availableStock - qty;
      }

      await updateProduct(selectedProduct.id, stockUpdatePayload);

      setSuccess(`Successfully recorded ${qty} damaged units from ${damageSource} for ${selectedProduct.name}.`);
      resetForm();
      fetchDamages();
    } catch (err) {
      setError(err.message || 'Failed to save damage record.');
    } finally {
      setSaving(false);
    }
  };

  // Calculations
  const sizeInMl = SIZE_ML_MAP[selectedProduct?.bottle_size] || 0;
  const damagedBL = (Number(quantity) || 0) * sizeInMl / 1000;
  const damagedLPL = selectedProduct?.category === 'BEER' ? 0 : damagedBL * 0.75;
  
  // Dynamic available stock based on source
  const availableStock = selectedProduct 
    ? (damageSource === 'COUNTER' ? (selectedProduct.counter_stock || 0) : (selectedProduct.godown_stock || 0))
    : 0;

  if (!companyId) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <AlertTriangle className="w-12 h-12 text-amber-500" />
        <h3 className="text-lg font-semibold text-gray-700 dark:text-gray-200">No Company Selected</h3>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-gray-800 dark:text-gray-100 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            Damage Management
          </h2>
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
            <Store className="w-3.5 h-3.5 text-primary-500" />
            <span className="text-xs font-semibold text-primary-700 dark:text-primary-300">{companyName}</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-800">
          <Save className="w-4 h-4 text-green-500 flex-shrink-0" />
          <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
        </div>
      )}

      {/* Damage Entry Form */}
      <div className="card p-6 border dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100 mb-6 flex items-center gap-2">
          <Plus className="w-5 h-5" /> Record New Damage
        </h3>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Date</label>
              <input type="date" value={damageDate} onChange={e => setDamageDate(e.target.value)} className="input-field" required />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Reason *</label>
              <select value={reason} onChange={e => setReason(e.target.value)} className="input-field" required>
                <option value="">Select Reason</option>
                {DAMAGE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Search Product *</label>
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={e => handleSearchChange(e.target.value)}
                    placeholder="Scan barcode or type name..."
                    className="input-field pl-10"
                    required
                  />
                  {isSearching && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-blue-500" />}
                </div>
                {showDropdown && (
                  <div className="absolute z-40 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                    {searchResults.map(p => (
                      <button key={p.id} type="button" onClick={() => selectProduct(p)} className="w-full text-left px-4 py-2.5 hover:bg-blue-50 dark:hover:bg-blue-900/20 border-b border-gray-100 dark:border-gray-700 text-sm transition-colors">
                        <span className="font-medium text-gray-800 dark:text-gray-100">{p.name}</span>
                        <span className="ml-2 text-xs text-gray-500">C:{p.counter_stock || 0} | G:{p.godown_stock || 0}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Selected Product Details & Quantity Input */}
          {selectedProduct && (
            <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-sm font-bold text-gray-800 dark:text-gray-100">{selectedProduct.name}</h4>
                  <p className="text-xs text-gray-500">{selectedProduct.brand} • {selectedProduct.category} • {selectedProduct.bottle_size}</p>
                </div>
             <button type="button" onClick={() => { setSelectedProduct(null); setSearchQuery(''); }} className="p-1 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-red-500">
                  <X className="w-4 h-4" />
                </button>
              </div>
              
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4 items-end">
                {/* NEW: Damage Source Selector */}
                <div>
                  <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-1">Source *</label>
                  <select 
                    value={damageSource} 
                    onChange={e => { setDamageSource(e.target.value); setQuantity(''); }} 
                    className="input-field text-xs font-bold"
                  >
                    <option value="COUNTER">Counter</option>
                    <option value="GODOWN">Godown</option>
                  </select>
                </div>

                {/* NEW: Dynamic Available Stock */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Available ({damageSource})</label>
                  <p className={`text-lg font-bold ${availableStock <= 0 ? 'text-red-500' : 'text-gray-800 dark:text-gray-100'}`}>
                    {availableStock}
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-gray-500 mb-1">Damage Qty *</label>
                  <input 
                    type="number" 
                    min="1" 
                    max={availableStock} 
                    value={quantity} 
                    onChange={e => setQuantity(e.target.value)} 
                    className="input-field text-red-600 font-bold" 
                    required 
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Bulk Liters (BL)</label>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{damagedBL.toFixed(3)}</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">LP Liters (LPL)</label>
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">{damagedLPL.toFixed(3)}</p>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <input type="text" value={notes} onChange={e => setNotes(e.target.value)} className="input-field text-xs" placeholder="Optional..." />
                </div>
              </div>

              {/* Image Upload Section (Correctly outside the grid) */}
              <div className="mt-4 pt-3 border-t border-amber-200 dark:border-amber-700">
                <label className="block text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Damage Photo (Optional)</label>
                <div className="flex items-center gap-4">
                  <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    onChange={handleFileChange}
                    className="hidden"
                  />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 hover:border-blue-400 hover:text-blue-500 transition-colors"
                  >
                    <Camera className="w-5 h-5" />
                    <span className="text-xs font-medium">{selectedFile ? 'Change Photo' : 'Upload Photo'}</span>
                  </button>
                  
                  {previewUrl && (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 shadow-sm">
                      <img src={previewUrl} alt="Damage Preview" className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={removeImage}
                        className="absolute top-0 right-0 bg-red-500 text-white p-0.5 rounded-bl-lg"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex justify-end">
            <button type="submit" disabled={saving || !selectedProduct} className="btn-primary flex items-center gap-2 px-6">
              {saving ? <><Loader2 className="w-4 h-4 animate-spin" /> Deducting Stock...</> : <><AlertTriangle className="w-4 h-4" /> Save Damage Record</>}
            </button>
          </div>
        </form>
      </div>

      {/* Damage History Table */}
      <div className="card border dark:border-slate-700 shadow-sm">
        <div className="p-4 border-b border-gray-100 dark:border-gray-800">
          <h3 className="text-sm font-bold text-gray-700 dark:text-gray-200">Damage History</h3>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
        ) : damages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-gray-400">
            <Package className="w-10 h-10 mb-2" />
            <p className="text-sm">No damage records found.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-800/50 text-left">
                <tr>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Product Name</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Source</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">Qty</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Reason</th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Image</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {damages.map((d, idx) => (
                  <tr key={d.id || idx} className="hover:bg-gray-50 dark:hover:bg-gray-800/30">
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-400">{d.damage_date || '-'}</td>
                    <td className="px-4 py-3 font-medium text-gray-800 dark:text-gray-100">{d.product_name}</td>
                    <td className="px-4 py-3">
                       <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                         d.damage_source === 'GODOWN' 
                           ? 'bg-purple-100 dark:bg-purple-900/30 text-purple-600' 
                           : 'bg-blue-100 dark:bg-blue-900/30 text-blue-600'
                       }`}>
                         {d.damage_source || 'COUNTER'}
                       </span>
                    </td>
                    <td className="px-4 py-3 text-right font-bold text-red-600">-{d.quantity}</td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-900/30 text-red-600">
                        {d.reason}
                      </span>
                    </td>
<td className="px-4 py-3">
  {d.image_url ? (
    <img 
      src={`${import.meta.env.VITE_API_BASE}${d.image_url}`} 
      alt="Damage" 
      className="w-12 h-12 object-cover rounded-md border border-gray-200 dark:border-gray-700 cursor-pointer hover:opacity-80 transition"
      onClick={() => window.open(`${import.meta.env.VITE_API_BASE}${d.image_url}`, '_blank')}
    />
  ) : (
    <span className="text-xs text-gray-400">No photo</span>
  )}
</td>           </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}