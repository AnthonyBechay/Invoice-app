import React, { useState, useEffect, useRef } from 'react';
import { stockAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import Papa from 'papaparse';

const StockPage = () => {
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState({
        name: '',
        description: '',
        unit: '',
        unitPrice: 0,
        quantity: 0
    });
    const [editingItem, setEditingItem] = useState(null);
    const fileInputRef = useRef(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchItems();
    }, [debouncedSearchTerm]);

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
            unitPrice: parseFloat(newItem.unitPrice) || 0,
            quantity: parseFloat(newItem.quantity) || 0,
        };

        try {
            if (editingItem) {
                const updated = await stockAPI.update(editingItem.id, itemData);
                setItems(items.map(item => item.id === editingItem.id ? updated : item));
                setEditingItem(null);
            } else {
                const created = await stockAPI.create(itemData);
                setItems([...items, created]);
            }

            setNewItem({ name: '', description: '', unit: '', unitPrice: 0, quantity: 0 });
            setShowForm(false);
        } catch (err) {
            console.error('Error saving item:', err);
            setError('Failed to save item');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditItem = (item) => {
        setEditingItem(item);
        setNewItem({
            name: item.name || '',
            description: item.description || '',
            unit: item.unit || '',
            unitPrice: item.unitPrice || 0,
            quantity: item.quantity || 0
        });
        setShowForm(true);
    };

    const handleDeleteItem = async (itemId) => {
        if (!window.confirm('Are you sure you want to delete this item?')) return;

        try {
            await stockAPI.delete(itemId);
            setItems(items.filter(item => item.id !== itemId));
        } catch (err) {
            console.error('Error deleting item:', err);
            setError('Failed to delete item');
        }
    };

    const handleCancelEdit = () => {
        setShowForm(false);
        setEditingItem(null);
        setNewItem({ name: '', description: '', unit: '', unitPrice: 0, quantity: 0 });
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                try {
                    const validItems = results.data
                        .filter(row => row.name && row.name.trim() !== '')
                        .map(row => ({
                            name: row.name || '',
                            description: row.description || '',
                            unit: row.unit || '',
                            unitPrice: parseFloat(row.unitPrice || row['unit price'] || row['Unit Price'] || 0),
                            quantity: parseFloat(row.quantity || row.Quantity || 0)
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
                    alert('Failed to import items');
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

    const handleExportCSV = () => {
        const csv = Papa.unparse(items.map(item => ({
            'Name': item.name || '',
            'Description': item.description || '',
            'Unit': item.unit || '',
            'Unit Price': item.unitPrice || 0,
            'Quantity': item.quantity || 0
        })));

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `stock_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    if (loading && items.length === 0) {
        return (
            <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Stock Items</h1>
                <TableSkeleton />
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Stock Items</h1>
                <div className="flex space-x-3">
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors font-medium"
                    >
                        {showForm ? 'Cancel' : '+ Add Item'}
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportCSV}
                        accept=".csv"
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors font-medium"
                    >
                        Import CSV
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors font-medium"
                        disabled={items.length === 0}
                    >
                        Export CSV
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h2 className="text-xl font-semibold mb-4">{editingItem ? 'Edit Stock Item' : 'Add New Stock Item'}</h2>
                    <form onSubmit={handleSaveItem}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                type="text"
                                name="name"
                                placeholder="Item Name *"
                                value={newItem.name}
                                onChange={handleInputChange}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                                disabled={isSubmitting}
                            />
                            <input
                                type="text"
                                name="description"
                                placeholder="Description"
                                value={newItem.description}
                                onChange={handleInputChange}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                            <input
                                type="text"
                                name="unit"
                                placeholder="Unit (e.g., pcs, kg, box)"
                                value={newItem.unit}
                                onChange={handleInputChange}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                            <input
                                type="number"
                                name="unitPrice"
                                placeholder="Unit Price"
                                value={newItem.unitPrice}
                                onChange={handleInputChange}
                                step="0.01"
                                min="0"
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                            <input
                                type="number"
                                name="quantity"
                                placeholder="Quantity"
                                value={newItem.quantity}
                                onChange={handleInputChange}
                                step="0.01"
                                min="0"
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="mt-4 flex space-x-3">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow-md transition-colors disabled:bg-indigo-300"
                            >
                                {isSubmitting ? 'Saving...' : (editingItem ? 'Update Item' : 'Add Item')}
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                disabled={isSubmitting}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg shadow-md transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <input
                    type="text"
                    placeholder="Search stock items..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Unit Price</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {items.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                                        {searchTerm ? 'No items found matching your search' : 'No stock items yet. Add your first item to get started!'}
                                    </td>
                                </tr>
                            ) : (
                                items.map((item) => (
                                    <tr key={item.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{item.name}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500">{item.description || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.unit || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${item.unitPrice?.toFixed(2) || '0.00'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.quantity || 0}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                            <button
                                                onClick={() => handleEditItem(item)}
                                                className="text-indigo-600 hover:text-indigo-900"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteItem(item.id)}
                                                className="text-red-600 hover:text-red-900"
                                            >
                                                Delete
                                            </button>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-4 text-sm text-gray-600">
                Showing {items.length} item{items.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
};

export default StockPage;
