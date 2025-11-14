import React, { useState, useEffect, useCallback, useRef } from 'react';
import { clientsAPI, stockAPI, documentsAPI } from '../services/api';

const NewDocumentPage = ({ navigateTo, documentToEdit }) => {
    const [docType, setDocType] = useState('proforma');
    const [clients, setClients] = useState([]);
    const [selectedClient, setSelectedClient] = useState('');
    const [clientSearch, setClientSearch] = useState('');
    const [isClientDropdownVisible, setIsClientDropdownVisible] = useState(false);
    const clientDropdownRef = useRef(null);
    const itemDropdownRef = useRef(null);
    const [stockItems, setStockItems] = useState([]);
    const [selectedStockItem, setSelectedStockItem] = useState('');
    const [itemSearch, setItemSearch] = useState('');
    const [isItemDropdownVisible, setIsItemDropdownVisible] = useState(false);
    const [lineItems, setLineItems] = useState([]);
    const [laborPrice, setLaborPrice] = useState(0);
    const [mandays, setMandays] = useState({ days: 0, people: 0, costPerDay: 0 });
    const [realMandays, setRealMandays] = useState({ days: 0, people: 0, costPerDay: 0 });
    const [showMandays, setShowMandays] = useState(false);
    const [showRealMandays, setShowRealMandays] = useState(false);
    const [notes, setNotes] = useState('');
    const [vatApplied, setVatApplied] = useState(false);
    const [documentNumber, setDocumentNumber] = useState('');
    const [documentDate, setDocumentDate] = useState(new Date().toISOString().split('T')[0]);
    const [pageTitle, setPageTitle] = useState('Create New Document');
    const [mode, setMode] = useState('create');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Fetch initial data only once on mount or when documentToEdit changes
    useEffect(() => {
        let isMounted = true;
        
        const loadData = async () => {
            try {
                // Fetch clients and stock in parallel
                const [clientsResponse, stockResponse] = await Promise.all([
                    clientsAPI.getAll(),
                    stockAPI.getAll()
                ]);
                
                // Handle paginated response format
                const clientsData = clientsResponse.data || clientsResponse;
                const stockData = stockResponse.data || stockResponse;
                
                if (!isMounted) return;
                
                setClients(clientsData);
                setStockItems(stockData);
                
                if (documentToEdit) {
                    // Fetch full document with items if not already present
                    let fullDocument = documentToEdit;
                    if (!documentToEdit.items || !Array.isArray(documentToEdit.items)) {
                        if (documentToEdit.id) {
                            console.log("NewDocumentPage: Fetching full document with items for editing, ID:", documentToEdit.id);
                            try {
                                fullDocument = await documentsAPI.getById(documentToEdit.id);
                                console.log("NewDocumentPage: Received full document with items:", fullDocument.items?.length || 0, "items");
                            } catch (error) {
                                console.error("Error fetching full document for editing:", error);
                                // Fallback to the document we have
                            }
                        }
                    }

                    if (!isMounted) return;

                    setMode('edit');
                    setPageTitle(`Edit ${fullDocument.type === 'proforma' ? 'Proforma' : 'Invoice'}`);
                    setDocType(fullDocument.type);
                    setSelectedClient(fullDocument.clientId);
                    setClientSearch(fullDocument.clientName || fullDocument.client?.name || '');

                    // Map items properly for editing - use stockData directly from fetch
                    const mappedItems = (fullDocument.items || []).map(item => {
                        // Find the stock item if stockId exists - use stockData from fetch
                        let stockItem = null;
                        if (item.stockId && stockData.length > 0) {
                            stockItem = stockData.find(s => s.id === item.stockId);
                        }
                        
                        return {
                            id: item.stockId || item.id || item.itemId || null,
                            stockId: item.stockId || null,
                            itemId: item.stockId || item.id || item.itemId || null,
                            name: item.name || '',
                            description: item.description || '',
                            quantity: item.quantity || 0,
                            unitPrice: item.unitPrice || 0,
                            buyingPrice: item.buyingPrice || item.stock?.buyingPrice || stockItem?.buyingPrice || 0,
                            sellingPrice: item.unitPrice || stockItem?.sellingPrice || 0,
                            unit: item.unit || stockItem?.unit || '',
                            // Preserve stock data if available
                            ...(item.stock && {
                                partNumber: item.stock.partNumber,
                                sku: item.stock.sku,
                                brand: item.stock.brand,
                                model: item.stock.model,
                                specifications: item.stock.specifications
                            }),
                            // Also include stock data from stockItems if found
                            ...(stockItem && {
                                partNumber: stockItem.partNumber,
                                sku: stockItem.sku,
                                brand: stockItem.brand,
                                model: stockItem.model,
                                specifications: stockItem.specifications
                            })
                        };
                    });
                    setLineItems(mappedItems);

                    setLaborPrice(fullDocument.laborPrice || 0);
                    setNotes(fullDocument.notes || '');
                    setVatApplied(fullDocument.vatApplied || false);
                    setDocumentNumber(fullDocument.documentNumber);
                    if (fullDocument.date) {
                        const existingDate = new Date(fullDocument.date);
                        setDocumentDate(existingDate.toISOString().split('T')[0]);
                    }
                    if (fullDocument.mandays) {
                        setMandays(fullDocument.mandays);
                        setShowMandays(true);
                    }
                    if (fullDocument.realMandays) {
                        setRealMandays(fullDocument.realMandays);
                        setShowRealMandays(true);
                    }
                } else {
                    if (!isMounted) return;
                    
                    setMode('create');
                    setPageTitle('Create New Document');
                    setDocType('proforma');
                    
                    // Only fetch document number once when creating new document
                    documentsAPI.getNextNumber('proforma')
                        .then(data => {
                            if (isMounted) {
                                setDocumentNumber(data.documentNumber);
                            }
                        })
                        .catch(err => console.error("Error getting document number:", err));
                }
            } catch (error) {
                console.error("Error fetching initial data:", error);
            }
        };
        
        loadData();
        
        return () => {
            isMounted = false;
        };
    }, [documentToEdit]); // Only depend on documentToEdit, not stockItems or fetchInitialData

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target)) {
                setIsClientDropdownVisible(false);
            }
            if (itemDropdownRef.current && !itemDropdownRef.current.contains(event.target)) {
                setIsItemDropdownVisible(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleAddItemToList = (item) => {
        if (item) {
            setLineItems([...lineItems, {
                ...item,
                id: item.id, // Stock item ID - used as stockId when saving
                stockId: item.id, // Explicitly set stockId
                itemId: item.id, // For backward compatibility
                quantity: 1,
                unitPrice: item.sellingPrice || 0,
                unit: item.unit || ''  // Include unit from stock item
            }]);
            setItemSearch('');
            setSelectedStockItem('');
            setIsItemDropdownVisible(false);
        }
    };

    const handleLineItemChange = (index, field, value) => {
        const updatedItems = [...lineItems];
        const numValue = parseFloat(value);
        if (!isNaN(numValue) || value === '') {
            updatedItems[index][field] = numValue;
            setLineItems(updatedItems);
        }
    };

    const handleRemoveLineItem = (index) => {
        setLineItems(lineItems.filter((_, i) => i !== index));
    };

    const calculateMandalsCost = () => {
        return mandays.days * mandays.people * mandays.costPerDay;
    };

    const calculateRealMandaysCost = () => {
        return realMandays.days * realMandays.people * realMandays.costPerDay;
    };

    const calculateSubtotal = () => {
        const itemsTotal = lineItems.reduce((acc, item) => acc + ((item.quantity || 0) * (item.unitPrice || 0)), 0);
        const mandaysCost = showMandays ? calculateMandalsCost() : 0;
        return itemsTotal + parseFloat(laborPrice || 0) + mandaysCost;
    };

    const subtotal = calculateSubtotal();
    const vatAmount = vatApplied ? subtotal * 0.11 : 0;
    const total = subtotal + vatAmount;

    const handleSaveDocument = async () => {
        if (!selectedClient || (lineItems.length === 0 && parseFloat(laborPrice || 0) === 0 && (!showMandays || calculateMandalsCost() === 0) && (!showRealMandays || calculateRealMandaysCost() === 0))) {
            const modal = document.getElementById('error-modal');
            modal.classList.remove('hidden');
            setTimeout(() => modal.classList.add('hidden'), 3000);
            return;
        }

        if (isSubmitting) {
            console.log('Document submission already in progress, ignoring duplicate request');
            return;
        }

        setIsSubmitting(true);

        const clientData = clients.find(c => c.id === selectedClient);

        // Clean items data - only send DocumentItem fields
        // Ensure stockId is properly set (use stockId first, then id, then itemId)
        const cleanedItems = lineItems.map(item => ({
            stockId: item.stockId || item.id || item.itemId || null,
            name: item.name || '',
            description: item.description || '',
            quantity: parseFloat(item.quantity) || 0,
            unitPrice: parseFloat(item.unitPrice) || 0,
            total: (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0)
        }));

        const documentData = {
            clientId: clientData.id,
            clientName: clientData.name,
            date: new Date(documentDate + 'T00:00:00').toISOString(),
            items: cleanedItems,
            laborPrice: parseFloat(laborPrice || 0),
            mandays: showMandays ? mandays : null,
            realMandays: showRealMandays ? realMandays : null,
            notes,
            subtotal,
            taxRate: vatApplied ? 0.11 : 0,
            taxAmount: vatAmount,
            total,
            type: docType.toUpperCase(),
        };

        try {
            if (mode === 'edit') {
                await documentsAPI.update(documentToEdit.id, { ...documentData, documentNumber });
                navigateTo(docType === 'invoice' ? 'invoices' : 'proformas');
            } else {
                const newDocData = await documentsAPI.getNextNumber(docType);
                await documentsAPI.create({ ...documentData, documentNumber: newDocData.documentNumber });
                navigateTo(docType === 'invoice' ? 'invoices' : 'proformas');
            }
        } catch (error) {
            console.error("Error saving document:", error);
            alert('Error saving document. Please try again.');
            setIsSubmitting(false);
        }
    };

    // Filter items based on search - comprehensive search across all fields
    const filteredItems = stockItems.filter(item => {
        const search = itemSearch.toLowerCase();
        return (
            item.name?.toLowerCase().includes(search) ||
            item.description?.toLowerCase().includes(search) ||
            item.brand?.toLowerCase().includes(search) ||
            item.model?.toLowerCase().includes(search) ||
            item.category?.toLowerCase().includes(search) ||
            item.partNumber?.toLowerCase().includes(search) ||
            item.sku?.toLowerCase().includes(search) ||
            item.specifications?.toLowerCase().includes(search) ||
            item.voltage?.toLowerCase().includes(search) ||
            item.power?.toLowerCase().includes(search) ||
            item.material?.toLowerCase().includes(search) ||
            item.supplier?.toLowerCase().includes(search) ||
            item.sellingPrice?.toString().includes(search) ||
            item.buyingPrice?.toString().includes(search)
        );
    });

    return (
        <div className="w-full max-w-full mx-0 px-0">
            <style>{`@media print {.no-print {display: none;}.buying-price-col {display: none;}}`}</style>
            <div id="error-modal" className="hidden fixed top-5 right-5 bg-red-500 text-white py-2 px-4 rounded-lg shadow-lg z-50 no-print">
                Please select a client and add at least one item, labor charge, display mandays, or real mandays cost.
            </div>

            <div className="bg-white min-h-screen p-2 sm:p-4 md:p-6 lg:p-8">
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-800 mb-4 sm:mb-6 no-print">{pageTitle}</h1>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6 sm:mb-8 no-print">
                    <div className="w-full sm:w-auto">
                        <h2 className="text-xl sm:text-2xl font-bold text-gray-800 uppercase">{docType}</h2>
                        <p className="text-gray-500 text-sm sm:text-base">{documentNumber}</p>
                        <div className="mt-2">
                            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                            <input
                                type="date"
                                value={documentDate}
                                onChange={(e) => setDocumentDate(e.target.value)}
                                className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md text-sm sm:text-base"
                            />
                        </div>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full sm:w-auto">
                        {mode === 'create' && (
                            <select value={docType} onChange={(e) => setDocType(e.target.value)} className="w-full sm:w-auto p-2 border border-gray-300 rounded-md text-sm sm:text-base">
                                <option value="proforma">Proforma</option>
                                <option value="invoice">Invoice</option>
                            </select>
                        )}
                        <label htmlFor="vat" className="flex items-center gap-2 text-sm sm:text-base font-medium text-gray-700 cursor-pointer">
                            <input type="checkbox" id="vat" checked={vatApplied} onChange={(e) => setVatApplied(e.target.checked)} className="h-5 w-5 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500" />
                            <span>Apply VAT (11%)</span>
                        </label>
                    </div>
                </div>

                <div className="mb-6 sm:mb-8 no-print relative" ref={clientDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Select Client</label>
                    <input
                        type="text"
                        value={clientSearch}
                        onChange={e => {
                            setClientSearch(e.target.value);
                            setSelectedClient('');
                            setIsClientDropdownVisible(true);
                        }}
                        onFocus={() => setIsClientDropdownVisible(true)}
                        placeholder="Search or select a client"
                        className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-sm sm:text-base"
                    />
                    {isClientDropdownVisible && (
                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                            {clients
                                .filter(c => c.name.toLowerCase().includes(clientSearch.toLowerCase()))
                                .map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => {
                                            setSelectedClient(c.id);
                                            setClientSearch(c.name);
                                            setIsClientDropdownVisible(false);
                                        }}
                                        className="p-2 hover:bg-gray-100 cursor-pointer"
                                    >
                                        {c.name}
                                    </div>
                                ))}
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto mb-6 sm:mb-8">
                    <table className="min-w-full">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-2 px-2 sm:px-4 text-left text-xs sm:text-sm font-semibold text-gray-600">Item/Part #</th>
                                <th className="py-2 px-2 sm:px-4 text-left text-xs sm:text-sm font-semibold text-gray-600">Description</th>
                                <th className="py-2 px-2 sm:px-4 text-center text-xs sm:text-sm font-semibold text-gray-600">Qty</th>
                                <th className="py-2 px-2 sm:px-4 text-right text-xs sm:text-sm font-semibold text-gray-500 buying-price-col">
                                    <div className="flex items-center justify-end gap-1">
                                        <span>Cost</span>
                                        <span className="text-xs">(ref)</span>
                                    </div>
                                </th>
                                <th className="py-2 px-2 sm:px-4 text-left text-xs sm:text-sm font-semibold text-green-700">
                                    <div className="flex items-center gap-1">
                                        <span>Selling Price</span>
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                    </div>
                                </th>
                                <th className="py-2 px-2 sm:px-4 text-right text-xs sm:text-sm font-semibold text-gray-600">Total</th>
                                <th className="py-2 px-2 sm:px-4 text-center text-xs sm:text-sm font-semibold text-gray-600 no-print"></th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((item, index) => (
                                <tr key={index} className="border-b hover:bg-gray-50">
                                    <td className="py-2 px-2 sm:px-4 text-xs sm:text-sm">
                                        <div className="font-medium">{item.partNumber || '-'}</div>
                                        {item.sku && <div className="text-xs text-gray-500">SKU: {item.sku}</div>}
                                    </td>
                                    <td className="py-2 px-2 sm:px-4">
                                        <div className="font-medium text-xs sm:text-sm">{item.name}</div>
                                        <div className="text-xs text-gray-600">
                                            {item.brand && `${item.brand}`}
                                            {item.model && ` ${item.model}`}
                                            {(item.brand || item.model) && item.specifications && ' - '}
                                            {item.specifications}
                                        </div>
                                    </td>
                                    <td className="py-2 px-2 sm:px-4 text-center">
                                        <div className="flex flex-col items-center gap-1">
                                            <input
                                                type="number"
                                                value={item.quantity}
                                                onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                                                className="w-16 sm:w-20 p-1 border border-gray-300 rounded-md text-xs sm:text-sm text-center"
                                                min="0"
                                                step="0.01"
                                            />
                                            {item.unit && (
                                                <span className="text-xs text-gray-500">{item.unit}</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="py-2 px-2 sm:px-4 text-right buying-price-col">
                                        <div className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 rounded text-xs sm:text-sm text-gray-500">
                                            <span className="text-xs">$</span>
                                            <span>{(item.buyingPrice || 0).toFixed(2)}</span>
                                        </div>
                                    </td>
                                    <td className="py-2 px-2 sm:px-4">
                                        <div className="flex items-center gap-1">
                                            <span className="text-green-600 font-medium text-xs sm:text-sm">$</span>
                                            <input
                                                type="number"
                                                value={item.unitPrice}
                                                onChange={(e) => handleLineItemChange(index, 'unitPrice', e.target.value)}
                                                className="w-20 sm:w-24 p-1 border-2 border-green-300 rounded-md text-xs sm:text-sm font-medium text-green-700 focus:border-green-500 focus:ring-1 focus:ring-green-500"
                                                min="0"
                                                step="0.01"
                                            />
                                        </div>
                                        {item.buyingPrice > 0 && item.unitPrice > 0 && item.quantity > 0 && (
                                            <div className="text-xs mt-1">
                                                {item.unitPrice > item.buyingPrice ? (
                                                    <span className="text-green-600">
                                                        +${((item.unitPrice - item.buyingPrice) * (item.quantity || 0)).toFixed(2)} profit
                                                    </span>
                                                ) : item.unitPrice < item.buyingPrice ? (
                                                    <span className="text-red-600">
                                                        -${((item.buyingPrice - item.unitPrice) * (item.quantity || 0)).toFixed(2)} loss
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-500">No margin</span>
                                                )}
                                            </div>
                                        )}
                                    </td>
                                    <td className="py-2 px-2 sm:px-4 text-right font-semibold text-xs sm:text-sm text-gray-800">
                                        ${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}
                                    </td>
                                    <td className="py-2 px-2 sm:px-4 text-center no-print">
                                        <button onClick={() => handleRemoveLineItem(index)} className="text-red-500 hover:text-red-700 p-1">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 sm:h-5 sm:w-5" viewBox="0 0 20 20" fill="currentColor">
                                                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clipRule="evenodd" />
                                            </svg>
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                {/* Add Item form - moved after the items list */}
                <div className="mb-6 sm:mb-8 p-3 sm:p-4 border rounded-lg bg-gray-50 no-print" ref={itemDropdownRef}>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Add Item from Stock</label>
                    <div className="relative">
                        <input
                            type="text"
                            value={itemSearch}
                            onChange={(e) => {
                                setItemSearch(e.target.value);
                                setIsItemDropdownVisible(true);
                            }}
                            onFocus={() => setIsItemDropdownVisible(true)}
                            placeholder="Search by name, brand, model, part#, specs, voltage, material, or price..."
                            className="w-full p-2 sm:p-3 border border-gray-300 rounded-md text-sm sm:text-base"
                        />
                        {isItemDropdownVisible && filteredItems.length > 0 && (
                            <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-80 overflow-y-auto">
                                {filteredItems.map(item => (
                                    <div
                                        key={item.id}
                                        onClick={() => handleAddItemToList(item)}
                                        className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div className="flex-1">
                                                <div className="font-medium text-sm">{item.name}</div>
                                                <div className="text-xs text-gray-600 mt-1">
                                                    {item.brand && <span className="font-medium">{item.brand}</span>}
                                                    {item.model && <span> {item.model}</span>}
                                                    {(item.brand || item.model) && (item.category || item.partNumber) && <span> • </span>}
                                                    {item.category && <span className="text-gray-500">{item.category}</span>}
                                                    {item.partNumber && <span> • Part #: {item.partNumber}</span>}
                                                </div>
                                                {item.specifications && <div className="text-xs text-gray-500 mt-1">{item.specifications}</div>}
                                                {(item.voltage || item.power || item.material) && (
                                                    <div className="text-xs text-gray-500 mt-1">
                                                        {item.voltage && <span>⚡ {item.voltage}</span>}
                                                        {item.voltage && item.power && <span> • </span>}
                                                        {item.power && <span>🔋 {item.power}</span>}
                                                        {(item.voltage || item.power) && item.material && <span> • </span>}
                                                        {item.material && <span>📦 {item.material}</span>}
                                                    </div>
                                                )}
                                            </div>
                                            <div className="ml-3 text-right">
                                                <div className="text-sm font-semibold text-green-600">${(item.sellingPrice || 0).toFixed(2)}</div>
                                                <div className="text-xs text-gray-400">Cost: ${(item.buyingPrice || 0).toFixed(2)}</div>
                                                {item.quantity !== undefined && (
                                                    <div className="text-xs text-gray-500 mt-1">Stock: {item.quantity} {item.unit}</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {/* Display Mandays Section */}
                <div className="mb-6 sm:mb-8 p-3 sm:p-4 border rounded-lg bg-green-50 no-print">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-4">
                        <label className="text-sm font-medium text-gray-700">Add Display Mandays (Shown to Client)</label>
                        <button
                            type="button"
                            onClick={() => setShowMandays(!showMandays)}
                            className="text-green-600 hover:text-green-800 text-sm font-medium whitespace-nowrap"
                        >
                            {showMandays ? 'Remove Display Mandays' : '+ Add Display Mandays'}
                        </button>
                    </div>
                    {showMandays && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Number of Days</label>
                                <input
                                    type="number"
                                    value={mandays.days}
                                    onChange={(e) => setMandays({...mandays, days: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm sm:text-base"
                                    placeholder="e.g., 5"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Number of People</label>
                                <input
                                    type="number"
                                    value={mandays.people}
                                    onChange={(e) => setMandays({...mandays, people: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm sm:text-base"
                                    placeholder="e.g., 3"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Cost per Day per Person</label>
                                <input
                                    type="number"
                                    value={mandays.costPerDay}
                                    onChange={(e) => setMandays({...mandays, costPerDay: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm sm:text-base"
                                    placeholder="e.g., 100"
                                />
                            </div>
                        </div>
                    )}
                    {showMandays && calculateMandalsCost() > 0 && (
                        <div className="mt-3 p-2 bg-white rounded">
                            <span className="text-sm text-gray-600">Display Mandays Revenue: </span>
                            <span className="font-bold text-green-600">${calculateMandalsCost().toFixed(2)}</span>
                            <span className="text-xs text-gray-500 ml-2">
                                ({mandays.days} days × {mandays.people} people × ${mandays.costPerDay}/day)
                            </span>
                            <div className="text-xs text-gray-500 mt-1">
                                <strong>Note:</strong> This amount is shown to the client and counts as your profit.
                            </div>
                        </div>
                    )}
                </div>

                {/* Real Mandays Section */}
                <div className="mb-6 sm:mb-8 p-3 sm:p-4 border rounded-lg bg-red-50 no-print">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 sm:gap-4 mb-4">
                        <label className="text-sm font-medium text-gray-700">Add Real Mandays Cost (Internal Only)</label>
                        <button
                            type="button"
                            onClick={() => setShowRealMandays(!showRealMandays)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium whitespace-nowrap"
                        >
                            {showRealMandays ? 'Remove Real Mandays' : '+ Add Real Mandays'}
                        </button>
                    </div>
                    {showRealMandays && (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Number of Days</label>
                                <input
                                    type="number"
                                    value={realMandays.days}
                                    onChange={(e) => setRealMandays({...realMandays, days: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm sm:text-base"
                                    placeholder="e.g., 3"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Number of People</label>
                                <input
                                    type="number"
                                    value={realMandays.people}
                                    onChange={(e) => setRealMandays({...realMandays, people: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm sm:text-base"
                                    placeholder="e.g., 2"
                                />
                            </div>
                            <div>
                                <label className="block text-xs text-gray-600 mb-1">Cost per Day per Person</label>
                                <input
                                    type="number"
                                    value={realMandays.costPerDay}
                                    onChange={(e) => setRealMandays({...realMandays, costPerDay: parseFloat(e.target.value) || 0})}
                                    className="w-full p-2 border border-gray-300 rounded-md text-sm sm:text-base"
                                    placeholder="e.g., 80"
                                />
                            </div>
                        </div>
                    )}
                    {showRealMandays && calculateRealMandaysCost() > 0 && (
                        <div className="mt-3 p-2 bg-white rounded">
                            <span className="text-sm text-gray-600">Real Mandays Cost: </span>
                            <span className="font-bold text-red-600">${calculateRealMandaysCost().toFixed(2)}</span>
                            <span className="text-xs text-gray-500 ml-2">
                                ({realMandays.days} days × {realMandays.people} people × ${realMandays.costPerDay}/day)
                            </span>
                            <div className="text-xs text-gray-500 mt-1">
                                <strong>Note:</strong> This cost is hidden from the client and used for internal profit calculations.
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex flex-col lg:flex-row justify-between gap-4 sm:gap-6">
                    <div className="w-full lg:w-1/2">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Notes / Description</label>
                        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows="3" className="w-full p-2 sm:p-3 border rounded-md text-sm sm:text-base"></textarea>
                    </div>
                    <div className="w-full lg:w-1/3 lg:mt-0">
                        <div className="flex justify-between items-center py-1 sm:py-2">
                            <span className="font-medium text-gray-600 text-sm sm:text-base">Labor Price:</span>
                            <input type="number" value={laborPrice} onChange={(e) => setLaborPrice(e.target.value)} className="w-24 sm:w-32 p-1 sm:p-2 border rounded-md text-right text-sm sm:text-base" />
                        </div>
                        {showMandays && calculateMandalsCost() > 0 && (
                            <div className="flex justify-between py-1 sm:py-2">
                                <span className="font-medium text-gray-600 text-sm sm:text-base">Display Mandays:</span>
                                <span className="font-medium text-green-600 text-sm sm:text-base">${calculateMandalsCost().toFixed(2)}</span>
                            </div>
                        )}
                        {showRealMandays && calculateRealMandaysCost() > 0 && (
                            <div className="flex justify-between py-1 sm:py-2">
                                <span className="font-medium text-gray-600 text-sm sm:text-base">Real Mandays Cost:</span>
                                <span className="font-medium text-red-600 text-sm sm:text-base">${calculateRealMandaysCost().toFixed(2)}</span>
                            </div>
                        )}
                        <div className="flex justify-between py-2 mt-2 border-t-2 border-gray-300">
                            <span className="font-medium text-gray-700 text-sm sm:text-base">Subtotal:</span>
                            <span className="font-medium text-gray-800 text-sm sm:text-base">${subtotal.toFixed(2)}</span>
                        </div>
                        {vatApplied && (
                        <div className="flex justify-between py-1 text-gray-600 text-sm sm:text-base">
                            <span>VAT (11%):</span>
                            <span>${vatAmount.toFixed(2)}</span>
                        </div>
                        )}
                        <div className="flex justify-between py-2 sm:py-3 mt-2 border-t-2 border-gray-300">
                            <span className="text-lg sm:text-xl font-bold text-gray-900">Total:</span>
                            <span className="text-lg sm:text-xl font-bold text-gray-900">${total.toFixed(2)}</span>
                        </div>
                    </div>
                </div>

                <div className="mt-6 sm:mt-10 flex flex-col sm:flex-row justify-end gap-3 sm:gap-4 no-print">
                    <button
                        onClick={() => {
                            if (documentToEdit) {
                                navigateTo(documentToEdit.type === 'invoice' ? 'invoices' : 'proformas');
                            } else {
                                navigateTo(docType === 'invoice' ? 'invoices' : 'proformas');
                            }
                        }}
                        className="w-full sm:w-auto bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors text-sm sm:text-base"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSaveDocument}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto bg-green-500 hover:bg-green-600 text-white font-bold py-2 sm:py-3 px-4 sm:px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                    >
                        {isSubmitting ? 'Saving...' : (mode === 'edit' ? 'Update' : 'Save')} {docType === 'proforma' ? 'Proforma' : 'Invoice'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default NewDocumentPage;
