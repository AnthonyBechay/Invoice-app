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
    }, []); // Only fetch once on mount, search is handled client-side

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            const response = await suppliersAPI.getAll();
            // Handle paginated response format
            const data = response.data || response;
            setSuppliers(data);
        } catch (err) {
            console.error('Error fetching suppliers:', err);
        }
    };

    const [allItems, setAllItems] = useState([]);

    const fetchItems = async () => {
        try {
            setLoading(true);
            // Fetch all items without search filter for comprehensive client-side search
            const response = await stockAPI.getAll('');
            // Handle paginated response format
            const data = response.data || response;
            setAllItems(data);
            setItems(data);
        } catch (err) {
            console.error('Error fetching stock items:', err);
            setError('Failed to fetch stock items');
        } finally {
            setLoading(false);
        }
    };

    // Enhanced client-side search across all fields
    useEffect(() => {
        if (!debouncedSearchTerm) {
            setItems(allItems);
            return;
        }

        const search = debouncedSearchTerm.toLowerCase();
        const filtered = allItems.filter(item => {
            const searchableFields = [
                item.name,
                item.description,
                item.category,
                item.brand,
                item.model,
                item.partNumber,
                item.sku,
                item.specifications,
                item.voltage,
                item.power,
                item.material,
                item.size,
                item.weight,
                item.color,
                item.supplier?.name || item.supplier || item.supplierName,
                item.supplierCode,
                item.warranty,
                item.notes,
                item.unit,
                String(item.buyingPrice || ''),
                String(item.sellingPrice || ''),
                String(item.quantity || '')
            ];

            return searchableFields.some(field => 
                field && String(field).toLowerCase().includes(search)
            );
        });

        setItems(filtered);
    }, [debouncedSearchTerm, allItems]);

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
        if (items.length === 0) {
            alert('No items to export');
            return;
        }

        const csvData = items.map(item => ({
            'Name': item.name || '',
            'Description': item.description || '',
            'Category': item.category || '',
            'Brand': item.brand || '',
            'Model': item.model || '',
            'Part Number': item.partNumber || '',
            'SKU': item.sku || '',
            'Buying Price': (item.buyingPrice || 0).toFixed(2),
            'Selling Price': (item.sellingPrice || item.unitPrice || 0).toFixed(2),
            'Unit': item.unit || '',
            'Quantity': (item.quantity || 0).toFixed(2),
            'Min Quantity': (item.minQuantity || 0).toFixed(2),
            'Specifications': item.specifications || '',
            'Voltage': item.voltage || '',
            'Power': item.power || '',
            'Material': item.material || '',
            'Size': item.size || '',
            'Weight': item.weight || '',
            'Color': item.color || '',
            'Supplier': item.supplier?.name || item.supplier || item.supplierName || '',
            'Supplier Code': item.supplierCode || '',
            'Warranty': item.warranty || '',
            'Notes': item.notes || ''
        }));

        try {
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
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('Error exporting CSV:', err);
            alert('Failed to export CSV: ' + (err.message || 'Unknown error'));
        }
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Helper function to parse price strings (handles $, commas, etc.)
        const parsePrice = (value) => {
            if (!value || value === '') return 0;
            // Remove $ sign, commas, and whitespace, then parse
            const cleaned = String(value).replace(/[$,\s]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        };

        // Helper function to parse numeric values
        const parseNumber = (value) => {
            if (!value || value === '') return 0;
            const cleaned = String(value).replace(/[,\s]/g, '');
            const parsed = parseFloat(cleaned);
            return isNaN(parsed) ? 0 : parsed;
        };

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
                            buyingPrice: parsePrice(row['Buying Price']),
                            sellingPrice: parsePrice(row['Selling Price']),
                            unit: row['Unit'] || '',
                            quantity: parseNumber(row['Quantity']),
                            minQuantity: parseNumber(row['Min Quantity']),
                            specifications: row['Specifications'] || '',
                            voltage: row['Voltage'] || '',
                            power: row['Power'] || '',
                            material: row['Material'] || '',
                            size: row['Size'] || '',
                            weight: row['Weight'] || '',
                            color: row['Color'] || '',
                            supplierName: row['Supplier'] || '',
                            supplierCode: row['Supplier Code'] || '',
                            warranty: row['Warranty'] || '',
                            notes: row['Notes'] || ''
                        }));

                    if (validItems.length === 0) {
                        alert('No valid items found in CSV file');
                        return;
                    }

                    // Ensure we have all items loaded for duplicate detection
                    // If allItems is empty, fetch all items first
                    let existingItems = allItems.length > 0 ? allItems : items;
                    
                    // If we don't have all items, fetch them now
                    if (allItems.length === 0) {
                        try {
                            const response = await stockAPI.getAll('');
                            const data = response.data || response;
                            existingItems = data;
                            setAllItems(data); // Cache for future use
                        } catch (err) {
                            console.warn('Could not fetch all items for duplicate check, using current items:', err);
                        }
                    }
                    const duplicateItems = [];
                    const uniqueItems = [];
                    const seenInCSV = new Map(); // Track items we've seen in the CSV

                    // Helper to normalize fields for comparison - handles null, undefined, empty strings
                    const normalizeField = (val) => {
                        if (val === null || val === undefined || val === '') return '';
                        return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
                    };
                    
                    // Helper to normalize price for comparison
                    const normalizePrice = (price) => {
                        const num = parseFloat(price) || 0;
                        return num.toFixed(2);
                    };
                    
                    // Helper to check if two items are duplicates
                    const areItemsDuplicate = (item1, item2) => {
                        // Normalize all fields
                        const fields1 = {
                            name: normalizeField(item1.name),
                            description: normalizeField(item1.description),
                            category: normalizeField(item1.category),
                            brand: normalizeField(item1.brand),
                            model: normalizeField(item1.model),
                            partNumber: normalizeField(item1.partNumber),
                            sku: normalizeField(item1.sku),
                            buyingPrice: normalizePrice(item1.buyingPrice),
                            sellingPrice: normalizePrice(item1.sellingPrice),
                            unit: normalizeField(item1.unit),
                            specifications: normalizeField(item1.specifications),
                            voltage: normalizeField(item1.voltage),
                            power: normalizeField(item1.power),
                            material: normalizeField(item1.material),
                            size: normalizeField(item1.size),
                            weight: normalizeField(item1.weight),
                            color: normalizeField(item1.color),
                            supplierName: normalizeField(item1.supplierName || item1.supplier?.name || item1.supplier || ''),
                            supplierCode: normalizeField(item1.supplierCode),
                            warranty: normalizeField(item1.warranty),
                            notes: normalizeField(item1.notes)
                        };
                        
                        const fields2 = {
                            name: normalizeField(item2.name),
                            description: normalizeField(item2.description),
                            category: normalizeField(item2.category),
                            brand: normalizeField(item2.brand),
                            model: normalizeField(item2.model),
                            partNumber: normalizeField(item2.partNumber),
                            sku: normalizeField(item2.sku),
                            buyingPrice: normalizePrice(item2.buyingPrice),
                            sellingPrice: normalizePrice(item2.sellingPrice),
                            unit: normalizeField(item2.unit),
                            specifications: normalizeField(item2.specifications),
                            voltage: normalizeField(item2.voltage),
                            power: normalizeField(item2.power),
                            material: normalizeField(item2.material),
                            size: normalizeField(item2.size),
                            weight: normalizeField(item2.weight),
                            color: normalizeField(item2.color),
                            supplierName: normalizeField(item2.supplierName || item2.supplier?.name || item2.supplier || ''),
                            supplierCode: normalizeField(item2.supplierCode),
                            warranty: normalizeField(item2.warranty),
                            notes: normalizeField(item2.notes)
                        };
                        
                        // Compare all fields
                        return (
                            fields1.name === fields2.name &&
                            fields1.description === fields2.description &&
                            fields1.category === fields2.category &&
                            fields1.brand === fields2.brand &&
                            fields1.model === fields2.model &&
                            fields1.partNumber === fields2.partNumber &&
                            fields1.sku === fields2.sku &&
                            fields1.buyingPrice === fields2.buyingPrice &&
                            fields1.sellingPrice === fields2.sellingPrice &&
                            fields1.unit === fields2.unit &&
                            fields1.specifications === fields2.specifications &&
                            fields1.voltage === fields2.voltage &&
                            fields1.power === fields2.power &&
                            fields1.material === fields2.material &&
                            fields1.size === fields2.size &&
                            fields1.weight === fields2.weight &&
                            fields1.color === fields2.color &&
                            fields1.supplierName === fields2.supplierName &&
                            fields1.supplierCode === fields2.supplierCode &&
                            fields1.warranty === fields2.warranty &&
                            fields1.notes === fields2.notes
                        );
                    };

                    // Create a key for quick lookup (for CSV internal duplicates)
                    const getItemKey = (item) => {
                        return [
                            normalizeField(item.name),
                            normalizeField(item.description),
                            normalizeField(item.category),
                            normalizeField(item.brand),
                            normalizeField(item.model),
                            normalizeField(item.partNumber),
                            normalizeField(item.sku),
                            normalizePrice(item.buyingPrice),
                            normalizePrice(item.sellingPrice),
                            normalizeField(item.unit),
                            normalizeField(item.specifications),
                            normalizeField(item.voltage),
                            normalizeField(item.power),
                            normalizeField(item.material),
                            normalizeField(item.size),
                            normalizeField(item.weight),
                            normalizeField(item.color),
                            normalizeField(item.supplierName),
                            normalizeField(item.supplierCode),
                            normalizeField(item.warranty),
                            normalizeField(item.notes)
                        ].join('|||'); // Use triple separator to avoid conflicts
                    };

                    for (let i = 0; i < validItems.length; i++) {
                        const newItem = validItems[i];
                        let isDuplicate = false;

                        // First check if this item is a duplicate within the CSV itself
                        const itemKey = getItemKey(newItem);
                        if (seenInCSV.has(itemKey)) {
                            isDuplicate = true;
                            duplicateItems.push(newItem);
                            continue;
                        }

                        // Check against existing items in database
                        for (const existing of existingItems) {
                            if (areItemsDuplicate(newItem, {
                                name: existing.name,
                                description: existing.description,
                                category: existing.category,
                                brand: existing.brand,
                                model: existing.model,
                                partNumber: existing.partNumber,
                                sku: existing.sku,
                                buyingPrice: existing.buyingPrice,
                                sellingPrice: existing.sellingPrice,
                                unit: existing.unit,
                                specifications: existing.specifications,
                                voltage: existing.voltage,
                                power: existing.power,
                                material: existing.material,
                                size: existing.size,
                                weight: existing.weight,
                                color: existing.color,
                                supplierName: existing.supplier?.name || existing.supplier || existing.supplierName || '',
                                supplierCode: existing.supplierCode,
                                warranty: existing.warranty,
                                notes: existing.notes
                            })) {
                                isDuplicate = true;
                                break;
                            }
                        }

                        if (isDuplicate) {
                            duplicateItems.push(newItem);
                        } else {
                            uniqueItems.push(newItem);
                            seenInCSV.set(itemKey, true); // Mark as seen
                        }
                    }

                    // Log for debugging
                    console.log('Duplicate detection results:', {
                        total: validItems.length,
                        duplicates: duplicateItems.length,
                        unique: uniqueItems.length,
                        existingItemsCount: existingItems.length
                    });

                    if (duplicateItems.length > 0) {
                        const proceed = window.confirm(
                            `Found ${duplicateItems.length} duplicate item(s) out of ${validItems.length} total.\n\n` +
                            `Duplicates will be skipped.\n\n` +
                            `Proceed with importing ${uniqueItems.length} unique item(s)?`
                        );
                        if (!proceed) {
                            return;
                        }
                    }

                    if (uniqueItems.length === 0) {
                        alert(`All ${validItems.length} items in the CSV file are duplicates. No new items to import.`);
                        return;
                    }

                    await stockAPI.batchCreate(uniqueItems);
                    await fetchItems();
                    const message = `Successfully imported ${uniqueItems.length} item(s) out of ${validItems.length} total` + 
                        (duplicateItems.length > 0 ? ` (${duplicateItems.length} duplicate(s) skipped)` : '');
                    alert(message);
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

            {/* Modal for Add/Edit Item */}
            {showForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4 overflow-y-auto">
                    <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
                        <form onSubmit={handleSaveItem} className="p-6">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-xl font-bold">{editingItem ? 'Edit Item' : 'Add New Item'}</h2>
                                <button
                                    type="button"
                                    onClick={resetForm}
                                    className="text-gray-500 hover:text-gray-700 text-2xl font-bold"
                                >
                                    ×
                                </button>
                            </div>

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
                    </div>
                </div>
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
