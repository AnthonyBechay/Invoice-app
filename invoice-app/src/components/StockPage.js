import React, { useState, useEffect, useRef, useMemo } from 'react';
import { collection, query, onSnapshot, addDoc, updateDoc, deleteDoc, doc, runTransaction, writeBatch } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import Papa from 'papaparse';

// Helper function to get the next sequential ID
const getNextItemId = async (userId) => {
    const counterRef = doc(db, `counters/${userId}/itemCounter`, 'counter');
    try {
        const newId = await runTransaction(db, async (transaction) => {
            const counterDoc = await transaction.get(counterRef);
            if (!counterDoc.exists()) {
                transaction.set(counterRef, { lastId: 1 });
                return 1;
            }
            const newLastId = counterDoc.data().lastId + 1;
            transaction.update(counterRef, { lastId: newLastId });
            return newLastId;
        });
        return newId;
    } catch (e) {
        console.error("Transaction failed: ", e);
        throw e; // Rethrow the error to be handled by the caller
    }
};


const StockPage = () => {
    console.log("StockPage: Component rendering");
    const [items, setItems] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [displayLimit, setDisplayLimit] = useState(50);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newItem, setNewItem] = useState({ 
        name: '', 
        category: '', 
        subCategory: '', 
        brand: '', 
        partNumber: '', 
        specs: '', 
        type: '', 
        color: '', 
        buyingPrice: 0, 
        sellingPrice: 0,
        customField1: '',  // New custom field
        customField2: ''   // New custom field
    });
    const [editingItem, setEditingItem] = useState(null); // To hold the item being edited
    const fileInputRef = useRef(null);
    const [importLoading, setImportLoading] = useState(false); // Loading state for CSV import
    const [isSubmitting, setIsSubmitting] = useState(false); // Prevent double submission

    useEffect(() => {
        console.log("StockPage: useEffect running");
        
        // Use auth state listener to wait for auth to be ready
        const unsubscribeAuth = onAuthStateChanged(auth, (currentUser) => {
            console.log("StockPage: Auth state changed, user:", currentUser?.uid || "null");
            
            if (!currentUser) {
                console.log("StockPage: No authenticated user");
                setLoading(false);
                return;
            }
            
            console.log("StockPage: Fetching items for user:", currentUser.uid);
            
            // Query without orderBy to get all items, including those without itemId
            // We'll sort client-side to handle items without itemId gracefully
            const q = query(
                collection(db, `items/${currentUser.uid}/userItems`)
            );
            const unsubscribe = onSnapshot(q, (querySnapshot) => {
            console.log("StockPage: Received snapshot with", querySnapshot.size, "documents");
            const itemsList = [];
            querySnapshot.forEach((doc) => {
                itemsList.push({ id: doc.id, ...doc.data() });
            });
            // Sort items by their auto-increment ID (if exists), otherwise by document ID
            itemsList.sort((a, b) => {
                // If both have itemId, sort by itemId
                if (a.itemId !== undefined && b.itemId !== undefined) {
                    return a.itemId - b.itemId;
                }
                // If only a has itemId, a comes first
                if (a.itemId !== undefined) return -1;
                // If only b has itemId, b comes first
                if (b.itemId !== undefined) return 1;
                // If neither has itemId, sort by document ID
                return a.id.localeCompare(b.id);
            });
                console.log("StockPage: Setting items list with", itemsList.length, "items");
                setItems(itemsList);
                setLoading(false);
            }, (error) => {
                console.error("StockPage: Error fetching items: ", error);
                console.error("StockPage: Error code:", error.code);
                console.error("StockPage: Error message:", error.message);
                setLoading(false);
            });
            
            return () => {
                unsubscribe();
            };
        });
        
        return () => {
            unsubscribeAuth();
        };
    }, []);

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setNewItem({ ...newItem, [name]: value });
    };

    const handleSaveItem = async (e) => {
        e.preventDefault();
        if (!auth.currentUser) return;

        // Prevent double submission
        if (isSubmitting) {
            console.log('Item submission already in progress, ignoring duplicate request');
            return;
        }

        setIsSubmitting(true);

        const itemData = {
            ...newItem,
            buyingPrice: parseFloat(newItem.buyingPrice) || 0,
            sellingPrice: parseFloat(newItem.sellingPrice) || 0,
        };

        try {
            if (editingItem) {
                // Update existing item
                const itemRef = doc(db, `items/${auth.currentUser.uid}/userItems`, editingItem.id);
                await updateDoc(itemRef, itemData);
                setEditingItem(null);
            } else {
                // Add new item with auto-incremented ID
                const newItemId = await getNextItemId(auth.currentUser.uid);
                itemData.itemId = newItemId;
                await addDoc(collection(db, `items/${auth.currentUser.uid}/userItems`), itemData);
            }
            resetForm();
        } catch (error) {
            console.error("Error saving item: ", error);
            alert('Error saving item. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEdit = (item) => {
        setNewItem(item);
        setEditingItem(item);
        setShowForm(true);
    };

    const handleDelete = async (itemId) => {
        if (window.confirm("Are you sure you want to delete this item?")) {
            if (!auth.currentUser) return;
            try {
                const itemRef = doc(db, `items/${auth.currentUser.uid}/userItems`, itemId);
                await deleteDoc(itemRef);
            } catch (error) {
                console.error("Error deleting item: ", error);
            }
        }
    };

    const resetForm = () => {
        setNewItem({ 
            name: '', 
            category: '', 
            subCategory: '', 
            brand: '', 
            partNumber: '', 
            specs: '', 
            type: '', 
            color: '', 
            buyingPrice: 0, 
            sellingPrice: 0,
            customField1: '',
            customField2: ''
        });
        setEditingItem(null);
        setShowForm(false);
    };

    const handleExport = () => {
        const csv = Papa.unparse(items.map(({ id, ...item }) => item)); // Exclude firestore id from export
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", "stock-items.csv");
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImport = (event) => {
        const file = event.target.files[0];
        if (!file) return;
        
        setImportLoading(true); // Show loading indicator

        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: async (results) => {
                if (!auth.currentUser) return;
                const batch = writeBatch(db);
                const itemsCollection = collection(db, `items/${auth.currentUser.uid}/userItems`);

                for (const row of results.data) {
                    try {
                        const newItemId = await getNextItemId(auth.currentUser.uid);
                        const newItemRef = doc(itemsCollection); // Create a new doc reference
                        const itemData = {
                            ...row,
                            itemId: newItemId,
                            buyingPrice: parseFloat(row.buyingPrice) || 0,
                            sellingPrice: parseFloat(row.sellingPrice) || 0,
                            customField1: row.customField1 || '',
                            customField2: row.customField2 || ''
                        }
                        batch.set(newItemRef, itemData);
                    } catch(error) {
                        console.error("Error preparing batch for import:", error);
                        setImportLoading(false);
                        alert('Import failed. Please check the console for details.');
                        return; // Stop the import process
                    }
                }

                try {
                    await batch.commit();
                    setImportLoading(false);
                    alert('Import successful!');
                } catch (error) {
                    console.error("Error importing data: ", error);
                    setImportLoading(false);
                    alert('Import failed. Please check the console for details.');
                }
            },
            error: (error) => {
                console.error("Error parsing CSV:", error);
                setImportLoading(false);
                alert('Failed to parse CSV file.');
            }
        });
        // Reset file input
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };


    const fields = [
        { name: 'name', placeholder: 'Item Name', required: true },
        { name: 'partNumber', placeholder: 'Part Number' },
        { name: 'brand', placeholder: 'Brand' },
        { name: 'specs', placeholder: 'Specs' },
        { name: 'category', placeholder: 'Category' },
        { name: 'subCategory', placeholder: 'Sub Category' },
        { name: 'type', placeholder: 'Type' },
        { name: 'color', placeholder: 'Color' },
        { name: 'buyingPrice', placeholder: 'Buying Price', type: 'number' },
        { name: 'sellingPrice', placeholder: 'Selling Price', type: 'number' },
        { name: 'customField1', placeholder: 'Custom Field 1' },
        { name: 'customField2', placeholder: 'Custom Field 2' }
    ];

    // Filter items based on debounced search - memoized
    const filteredItems = useMemo(() => {
        return items.filter(item => {
            const searchTermLower = debouncedSearchTerm.toLowerCase();
            // Search in all fields including custom fields
            return Object.values(item).some(value =>
                typeof value === 'string' && value.toLowerCase().includes(searchTermLower)
            );
        });
    }, [items, debouncedSearchTerm]);

    // Limit displayed items - memoized
    const displayedItems = useMemo(() => {
        return filteredItems.slice(0, displayLimit);
    }, [filteredItems, displayLimit]);

    return (
        <div>
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Stock Items</h1>
            <div className="flex justify-end mb-6 space-x-2">
                <input type="file" ref={fileInputRef} onChange={handleImport} accept=".csv" className="hidden" id="csv-importer" />
                <button 
                    onClick={() => document.getElementById('csv-importer').click()} 
                    disabled={importLoading}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {importLoading ? 'Importing...' : 'Import CSV'}
                </button>
                <button onClick={handleExport} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">Export CSV</button>
                <button onClick={() => { setShowForm(!showForm); if (editingItem) resetForm(); } } className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                    {showForm ? 'Cancel' : '+ Add New Item'}
                </button>
            </div>
            
            {importLoading && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                    <div className="flex items-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-t-2 border-b-2 border-blue-500 mr-3"></div>
                        <span className="text-blue-700">Processing CSV file, please wait...</span>
                    </div>
                </div>
            )}

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">{editingItem ? 'Edit Stock Item' : 'Add New Stock Item'}</h2>
                    <form onSubmit={handleSaveItem}>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {fields.map(field => (
                                <div key={field.name}>
                                    <label htmlFor={field.name} className="block text-sm font-medium text-gray-700">{field.placeholder}</label>
                                    <input
                                        id={field.name}
                                        type={field.type || 'text'}
                                        name={field.name}
                                        value={newItem[field.name]}
                                        onChange={handleInputChange}
                                        placeholder={field.placeholder}
                                        required={field.required}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                    />
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 flex justify-end">
                            <button type="submit" disabled={isSubmitting} className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed">
                                {isSubmitting ? 'Saving...' : 'Save Item'}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="mb-4">
                    <input
                        type="text"
                        placeholder="Search items..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full px-4 py-2 border rounded-lg"
                    />
                </div>
                 <div className="overflow-x-auto">
                    {loading ? (
                        <TableSkeleton rows={5} columns={8} />
                    ) : displayedItems.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">
                            {debouncedSearchTerm ? 'No items found matching your search.' : 'No items found.'}
                        </p>
                    ) : (
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                <tr>
                                    <th className="py-3 px-6 text-left">ID</th>
                                    <th className="py-3 px-6 text-left">Name</th>
                                    <th className="py-3 px-6 text-left">Part Number</th>
                                    <th className="py-3 px-6 text-left">Brand</th>
                                    <th className="py-3 px-6 text-left">Specs</th>
                                    <th className="py-3 px-6 text-right">Buying Price</th>
                                    <th className="py-3 px-6 text-right">Selling Price</th>
                                    <th className="py-3 px-6 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm font-light">
                                {displayedItems.map(item => (
                                <tr key={item.id} className="border-b border-gray-200 hover:bg-gray-100">
                                    <td className="py-3 px-6 text-left font-bold">{item.itemId}</td>
                                    <td className="py-3 px-6 text-left font-medium">{item.name}</td>
                                    <td className="py-3 px-6 text-left">{item.partNumber}</td>
                                    <td className="py-3 px-6 text-left">{item.brand}</td>
                                    <td className="py-3 px-6 text-left">{item.specs}</td>
                                    <td className="py-3 px-6 text-right">${(item.buyingPrice || 0).toFixed(2)}</td>
                                    <td className="py-3 px-6 text-right">${(item.sellingPrice || 0).toFixed(2)}</td>
                                    <td className="py-3 px-6 text-center">
                                        <div className="flex item-center justify-center">
                                            <button onClick={() => handleEdit(item)} className="w-4 mr-2 transform hover:text-purple-500 hover:scale-110">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.5L15.232 5.232z" /></svg>
                                            </button>
                                            <button onClick={() => handleDelete(item.id)} className="w-4 mr-2 transform hover:text-red-500 hover:scale-110">
                                                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
                
                {/* Load More Button - only show when not searching */}
                {!debouncedSearchTerm && filteredItems.length > displayLimit && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => {
                                setIsLoadingMore(true);
                                setTimeout(() => {
                                    setDisplayLimit(prev => prev + 50);
                                    setIsLoadingMore(false);
                                }, 300);
                            }}
                            disabled={isLoadingMore}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                        >
                            {isLoadingMore ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                    Loading...
                                </>
                            ) : (
                                `Load More Items (${filteredItems.length - displayLimit} remaining)`
                            )}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

export default StockPage;
