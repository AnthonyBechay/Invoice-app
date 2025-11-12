import React, { useState, useEffect, useRef } from 'react';
import { stockAPI, suppliersAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import Papa from 'papaparse';

const StockPage = () => {
    const [items, setItems] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        description: '',
        category: '',
        buyingPrice: 0,
        sellingPrice: 0,
        unit: '',
        quantity: 0,
        minQuantity: 0,
        brand: '',
        model: '',
        partNumber: '',
        sku: '',
        specifications: '',
        voltage: '',
        power: '',
        material: '',
        size: '',
        weight: '',
        color: '',
        supplierId: '',
        supplier: '',
        supplierCode: '',
        warranty: '',
        notes: ''
    });
    const [editingItem, setEditingItem] = useState(null);
    const fileInputRef = useRef(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchItems();
    }, [debouncedSearchTerm]);

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const data = await suppliersAPI.getAll();
            setSuppliers(data);
        } catch (err) {
            console.error('Error fetching suppliers:', err);
        }
    };

    const fetchItems = async () => {
        try {
            setLoading(true);
            const data = await stockAPI.getAll(debouncedSearchTerm);
            setItems(data);
        } catch (err) {
            console.error('Error fetching stock items:', err);
            setError('Failed to fetch stock items');
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewItem({ ...newItem, [name]: value });
    };

    const handleSaveItem = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setError('');

        const itemData = {
            ...newItem,
            buyingPrice: parseFloat(newItem.buyingPrice) || 0,
            sellingPrice: parseFloat(newItem.sellingPrice) || 0,
            quantity: parseFloat(newItem.quantity) || 0,
            minQuantity: parseFloat(newItem.minQuantity) || 0,
            supplierId: newItem.supplierId || null,
        };

        try {
            if (editingItem) {
                const updated = await stockAPI.update(editingItem.id, itemData);
                setItems(items.map(item => item.id === editingItem.id ? updated : item));
                setEditingItem(null);
            } else {
                const created = await stockAPI.create(itemData);
                setItems([created, ...items]);
            }

            resetForm();
        } catch (err) {
            console.error('Error saving item:', err);
            setError('Failed to save item: ' + (err.message || 'Unknown error'));
        } finally {
            setIsSubmitting(false);
        }
    };

    const resetForm = () => {
        setNewItem({
            name: '',
            description: '',
            category: '',
            buyingPrice: 0,
            sellingPrice: 0,
            unit: '',
            quantity: 0,
            minQuantity: 0,
            brand: '',
            model: '',
            partNumber: '',
            sku: '',
            specifications: '',
            voltage: '',
            power: '',
            material: '',
            size: '',
            weight: '',
            color: '',
            supplierId: '',
            supplier: '',
            supplierCode: '',
            warranty: '',
            notes: ''
        });
        setShowForm(false);
        setEditingItem(null);
    };

    const handleEditItem = (item) => {
        setEditingItem(item);
        setNewItem({
            name: item.name || '',
            description: item.description || '',
            category: item.category || '',
            buyingPrice: item.buyingPrice || 0,
            sellingPrice: item.sellingPrice || item.unitPrice || 0,
            unit: item.unit || '',
            quantity: item.quantity || 0,
            minQuantity: item.minQuantity || 0,
            brand: item.brand || '',
            model: item.model || '',
            partNumber: item.partNumber || '',
            sku: item.sku || '',
            specifications: item.specifications || '',
            voltage: item.voltage || '',
            power: item.power || '',
            material: item.material || '',
            size: item.size || '',
            weight: item.weight || '',
            color: item.color || '',
            supplierId: item.supplierId || item.supplier?.id || '',
            supplier: item.supplier?.name || item.supplier || '',
            supplierCode: item.supplierCode || '',
            warranty: item.warranty || '',
            notes: item.notes || ''
        });
        setShowForm(true);
    };

    const [deletingItemIds, setDeletingItemIds] = useState(new Set());

    const handleDeleteItem = async (itemId) => {
        // Prevent double-click
        if (deletingItemIds.has(itemId)) {
            return;
        }

        if (!window.confirm('Are you sure you want to delete this item?')) return;

        setDeletingItemIds(prev => new Set(prev).add(itemId));

        try {
            await stockAPI.delete(itemId);
            setItems(items.filter(item => item.id !== itemId));
        } catch (err) {
            console.error('Error deleting item:', err);
            setError('Failed to delete item');
        } finally {
            setDeletingItemIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(itemId);
                return newSet;
            });
        }
    };

    const handleExportCSV = () => {
        const csvData = items.map(item => ({
            'Name': item.name || '',
            'Description': item.description || '',
            'Category': item.category || '',
            'Brand': item.brand || '',
            'Model': item.model || '',
            'Part Number': item.partNumber || '',
            'SKU': item.sku || '',
            'Buying Price': item.buyingPrice || 0,
            'Selling Price': item.sellingPrice || item.unitPrice || 0,
            'Unit': item.unit || '',
            'Quantity': item.quantity || 0,
            'Min Quantity': item.minQuantity || 0,
            'Specifications': item.specifications || '',
            'Voltage': item.voltage || '',
            'Power': item.power || '',
            'Material': item.material || '',
            'Size': item.size || '',
            'Weight': item.weight || '',
            'Color': item.color || '',
            'Supplier': item.supplier || '',
            'Supplier Code': item.supplierCode || '',
            'Warranty': item.warranty || '',
            'Notes': item.notes || ''
        }));

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `stock_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                try {
                    const validItems = results.data
                        .filter(row => row['Name'] && row['Name'].trim() !== '')
                        .map(row => ({
                            name: row['Name'] || '',
                            description: row['Description'] || '',
                            category: row['Category'] || '',
                            brand: row['Brand'] || '',
                            model: row['Model'] || '',
                            partNumber: row['Part Number'] || '',
                            sku: row['SKU'] || '',
                            buyingPrice: parseFloat(row['Buying Price']) || 0,
                            sellingPrice: parseFloat(row['Selling Price']) || 0,
                            unit: row['Unit'] || '',
                            quantity: parseFloat(row['Quantity']) || 0,
                            minQuantity: parseFloat(row['Min Quantity']) || 0,
                            specifications: row['Specifications'] || '',
                            voltage: row['Voltage'] || '',
                            power: row['Power'] || '',
                            material: row['Material'] || '',
                            size: row['Size'] || '',
                            weight: row['Weight'] || '',
                            color: row['Color'] || '',
                            supplier: row['Supplier'] || '',
                            supplierCode: row['Supplier Code'] || '',
                            warranty: row['Warranty'] || '',
                            notes: row['Notes'] || ''
                        }));

                    if (validItems.length === 0) {
                        alert('No valid items found in CSV file');
                        return;
                    }

                    await stockAPI.batchCreate(validItems);
                    await fetchItems();
                    alert(`Successfully imported ${validItems.length} items`);
                } catch (err) {
                    console.error('Error importing items:', err);
                    alert('Failed to import items: ' + (err.message || 'Unknown error'));
                }
            },
            error: (error) => {
                console.error('CSV parsing error:', error);
                alert('Failed to parse CSV file');
            }
        });

        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const categories = ['Electrical', 'Plumbing', 'HVAC', 'Tools', 'Hardware', 'Lighting', 'Other'];
    const units = ['Piece', 'KG', 'meter', 'roll', 'pack'];

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Stock Inventory</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        {showForm ? 'Cancel' : '+ Add New Item'}
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Export to CSV"
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Import from CSV"
                    >
                        Import CSV
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleImportCSV}
                        className="hidden"
                    />
                </div>
            </div>

            {error && (
                <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded-lg">
                    {error}
                </div>
            )}

            {showForm && (
                <form onSubmit={handleSaveItem} className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-bold mb-4">{editingItem ? 'Edit Item' : 'Add New Item'}</h2>

                    {/* Basic Information */}
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Basic Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    value={newItem.name}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                                <select
                                    name="category"
                                    value={newItem.category}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                >
                                    <option value="">Select category...</option>
                                    {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                </select>
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                                <textarea
                                    name="description"
                                    value={newItem.description}
                                    onChange={handleInputChange}
                                    rows="2"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Product Details */}
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Product Details</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                                <input
                                    type="text"
                                    name="brand"
                                    value={newItem.brand}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                                <input
                                    type="text"
                                    name="model"
                                    value={newItem.model}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Part Number</label>
                                <input
                                    type="text"
                                    name="partNumber"
                                    value={newItem.partNumber}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">SKU</label>
                                <input
                                    type="text"
                                    name="sku"
                                    value={newItem.sku}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Pricing & Inventory */}
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Pricing & Inventory</h3>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Buying Price</label>
                                <input
                                    type="number"
                                    name="buyingPrice"
                                    value={newItem.buyingPrice}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                                <select
                                    name="unit"
                                    value={newItem.unit}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                >
                                    <option value="">Select unit...</option>
                                    {units.map(u => <option key={u} value={u}>{u}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Selling Price {newItem.unit ? `per ${newItem.unit}` : ''} *
                                </label>
                                <input
                                    type="number"
                                    name="sellingPrice"
                                    value={newItem.sellingPrice}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    required
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Quantity</label>
                                <input
                                    type="number"
                                    name="quantity"
                                    value={newItem.quantity}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Min Quantity Alert</label>
                                <input
                                    type="number"
                                    name="minQuantity"
                                    value={newItem.minQuantity}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Technical Specifications */}
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Technical Specs</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Voltage</label>
                                <input
                                    type="text"
                                    name="voltage"
                                    value={newItem.voltage}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 220V, 12V DC"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Power</label>
                                <input
                                    type="text"
                                    name="power"
                                    value={newItem.power}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 1500W, 2HP"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Material</label>
                                <input
                                    type="text"
                                    name="material"
                                    value={newItem.material}
                                    onChange={handleInputChange}
                                    placeholder="e.g., Copper, PVC, Steel"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Size/Dimensions</label>
                                <input
                                    type="text"
                                    name="size"
                                    value={newItem.size}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 1/2 inch, 100x50mm"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Weight</label>
                                <input
                                    type="text"
                                    name="weight"
                                    value={newItem.weight}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 2.5kg, 5lbs"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Color</label>
                                <input
                                    type="text"
                                    name="color"
                                    value={newItem.color}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-sm font-medium text-gray-700 mb-1">Detailed Specifications</label>
                                <textarea
                                    name="specifications"
                                    value={newItem.specifications}
                                    onChange={handleInputChange}
                                    rows="2"
                                    placeholder="Additional technical details..."
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Supplier Information */}
                    <div className="mb-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-2 uppercase tracking-wide">Supplier Info</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier</label>
                                <select
                                    name="supplierId"
                                    value={newItem.supplierId || ''}
                                    onChange={(e) => {
                                        const selectedSupplier = suppliers.find(s => s.id === e.target.value);
                                        setNewItem({
                                            ...newItem,
                                            supplierId: e.target.value,
                                            supplier: selectedSupplier ? selectedSupplier.name : ''
                                        });
                                    }}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                >
                                    <option value="">Select supplier...</option>
                                    {suppliers.map(supplier => (
                                        <option key={supplier.id} value={supplier.id}>
                                            {supplier.name}
                                        </option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Supplier Code</label>
                                <input
                                    type="text"
                                    name="supplierCode"
                                    value={newItem.supplierCode}
                                    onChange={handleInputChange}
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Warranty</label>
                                <input
                                    type="text"
                                    name="warranty"
                                    value={newItem.warranty}
                                    onChange={handleInputChange}
                                    placeholder="e.g., 1 year, 24 months"
                                    className="w-full p-2 border border-gray-300 rounded-md"
                                />
                            </div>
                        </div>
                    </div>

                    {/* Notes */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                        <textarea
                            name="notes"
                            value={newItem.notes}
                            onChange={handleInputChange}
                            rows="2"
                            className="w-full p-2 border border-gray-300 rounded-md"
                        />
                    </div>

                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={resetForm}
                            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:bg-indigo-300"
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? 'Saving...' : (editingItem ? 'Update Item' : 'Add Item')}
                        </button>
                    </div>
                </form>
            )}

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search items by name, brand, category, part number, specifications..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full p-3 border border-gray-300 rounded-lg"
                />
            </div>

            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                {loading ? (
                    <TableSkeleton rows={5} columns={8} />
                ) : items.length === 0 ? (
                    <p className="p-6 text-gray-500 text-center">No items found. Add your first item to get started.</p>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full">
                            <thead className="bg-gray-200 text-gray-600 uppercase text-sm">
                                <tr>
                                    <th className="py-3 px-4 text-left">Part #</th>
                                    <th className="py-3 px-4 text-left">Name</th>
                                    <th className="py-3 px-4 text-left">Category</th>
                                    <th className="py-3 px-4 text-left">Brand/Model</th>
                                    <th className="py-3 px-4 text-right">Buying</th>
                                    <th className="py-3 px-4 text-right">Selling</th>
                                    <th className="py-3 px-4 text-center">Stock</th>
                                    <th className="py-3 px-4 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-sm">
                                {items.map((item) => (
                                    <tr key={item.id} className="border-b hover:bg-gray-50">
                                        <td className="py-3 px-4">
                                            <div className="font-medium">{item.partNumber || '-'}</div>
                                            {item.sku && <div className="text-xs text-gray-500">SKU: {item.sku}</div>}
                                        </td>
                                        <td className="py-3 px-4">
                                            <div className="font-medium">{item.name}</div>
                                            {item.description && <div className="text-xs text-gray-600">{item.description.substring(0, 50)}{item.description.length > 50 ? '...' : ''}</div>}
                                            {item.specifications && <div className="text-xs text-gray-500">{item.specifications.substring(0, 40)}{item.specifications.length > 40 ? '...' : ''}</div>}
                                        </td>
                                        <td className="py-3 px-4">{item.category || '-'}</td>
                                        <td className="py-3 px-4">
                                            {item.brand && <div className="font-medium">{item.brand}</div>}
                                            {item.model && <div className="text-xs text-gray-600">{item.model}</div>}
                                            {!item.brand && !item.model && '-'}
                                        </td>
                                        <td className="py-3 px-4 text-right text-gray-600">${(item.buyingPrice || 0).toFixed(2)}</td>
                                        <td className="py-3 px-4 text-right font-semibold text-green-600">${(item.sellingPrice || item.unitPrice || 0).toFixed(2)}</td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2 py-1 rounded text-xs ${item.quantity <= (item.minQuantity || 0) && item.minQuantity > 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
                                                {item.quantity} {item.unit}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <div className="flex justify-center gap-2">
                                                <button
                                                    onClick={() => handleEditItem(item)}
                                                    className="text-blue-600 hover:text-blue-800"
                                                    title="Edit"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                                                    </svg>
                                                </button>
                                                <button
                                                    onClick={() => handleDeleteItem(item.id)}
                                                    disabled={deletingItemIds.has(item.id)}
                                                    className="text-red-600 hover:text-red-800 disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Delete"
                                                >
                                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                                    </svg>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StockPage;
