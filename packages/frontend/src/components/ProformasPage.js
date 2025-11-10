import React, { useState, useEffect, useMemo, useRef } from 'react';
import { documentsAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import { useAuth } from '../contexts/AuthContext';
import Papa from 'papaparse';

const ProformasPage = ({ navigateTo }) => {
    const { user } = useAuth();
    const [proformas, setProformas] = useState([]);
    const [deletedProformas, setDeletedProformas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showDeletedModal, setShowDeletedModal] = useState(false);
    const [historyInvoices, setHistoryInvoices] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [historyFilter, setHistoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [displayLimit, setDisplayLimit] = useState(30);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [convertingIds, setConvertingIds] = useState(new Set()); // Track converting proformas
    const fileInputRef = useRef(null);

    const fetchProformas = async () => {
        console.log("ProformasPage: Fetching proformas");
        setLoading(true);

        try {
            // Fetch all proformas (both active and deleted)
            const allProformas = await documentsAPI.getAll('proforma');
            console.log("ProformasPage: Received", allProformas.length, "documents");

            const activeDocs = [];
            const deletedDocs = [];

            allProformas.forEach((doc) => {
                // Check if it's converted to invoice - exclude from all lists to avoid double counting
                if (doc.status === 'CONVERTED' || doc.convertedTo) {
                    // Skip converted proformas from all lists
                    return;
                }

                if (doc.deleted === true || doc.cancelled === true || doc.status === 'CANCELLED') {
                    deletedDocs.push(doc);
                } else {
                    activeDocs.push(doc);
                }
            });

            // Sort by date descending
            activeDocs.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateB - dateA;
            });
            deletedDocs.sort((a, b) => {
                const dateA = a.deletedAt ? new Date(a.deletedAt) : new Date();
                const dateB = b.deletedAt ? new Date(b.deletedAt) : new Date();
                return dateB - dateA;
            });

            console.log("ProformasPage: Setting proformas - active:", activeDocs.length, "deleted:", deletedDocs.length);
            setProformas(activeDocs);
            setDeletedProformas(deletedDocs);
        } catch (error) {
            console.error("ProformasPage: Error fetching proformas:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        console.log("ProformasPage: useEffect running");
        fetchProformas();
    }, []);


    const fetchHistoryInvoices = async (loadMore = false) => {
        if (!user) return;
        setHistoryLoading(true);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        try {
            // Fetch all invoices and filter by date
            const allInvoices = await documentsAPI.getAll('INVOICE');
            
            // Filter by date (last 30 days)
            let newInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.date);
                return invDate >= thirtyDaysAgo;
            });
            
            // Sort by date desc
            newInvoices.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateB - dateA;
            });

            // Pagination (limit to 10 per load)
            if (loadMore) {
                const currentCount = historyInvoices.length;
                newInvoices = newInvoices.slice(currentCount, currentCount + 10);
            } else {
                newInvoices = newInvoices.slice(0, 10);
            }

            const newLastVisible = newInvoices.length > 0 ? newInvoices[newInvoices.length - 1] : null;
            setLastVisible(newLastVisible);

            setHistoryInvoices(prev => loadMore ? [...prev, ...newInvoices] : newInvoices);
            setHasMore(newInvoices.length === 10);
        } catch (error) {
            console.error("Error fetching invoice history: ", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleOpenHistoryModal = () => {
        setShowHistoryModal(true);
        setHistoryInvoices([]);
        setLastVisible(null);
        setHasMore(true);
        fetchHistoryInvoices();
    };

    const handleExportCSV = () => {
        // Prepare CSV data
        const csvData = proformas.map(doc => {
            // Serialize items to JSON string for CSV
            const itemsJSON = JSON.stringify(doc.items || []);
            const mandaysJSON = doc.mandays ? JSON.stringify(doc.mandays) : '';
            const realMandaysJSON = doc.realMandays ? JSON.stringify(doc.realMandays) : '';

            return {
                'Document Number': doc.documentNumber || '',
                'Client Name': doc.client?.name || doc.clientName || '',
                'Date': new Date(doc.date).toLocaleDateString(),
                'Subtotal': doc.subtotal || 0,
                'VAT Amount': doc.taxAmount || 0,
                'Total': doc.total || 0,
                'Labor Price': doc.laborPrice || 0,
                'Mandays': mandaysJSON,
                'Real Mandays': realMandaysJSON,
                'Notes': doc.notes || '',
                'Status': doc.status || 'DRAFT',
                'Items JSON': itemsJSON
            };
        });

        // Convert to CSV using PapaParse
        const csv = Papa.unparse(csvData);

        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `proformas_export_${new Date().toISOString().split('T')[0]}.csv`);
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
                    const validDocuments = results.data
                        .filter(row => row['Document Number'] && row['Document Number'].trim() !== '')
                        .map(row => {
                            // Parse items JSON
                            let items = [];
                            try {
                                items = JSON.parse(row['Items JSON'] || '[]');
                            } catch (e) {
                                items = [];
                            }

                            // Parse mandays and realMandays if they exist
                            let mandays = null;
                            let realMandays = null;
                            try {
                                if (row['Mandays'] && row['Mandays'].trim() !== '') {
                                    mandays = JSON.parse(row['Mandays']);
                                }
                            } catch (e) {
                                // Ignore
                            }
                            try {
                                if (row['Real Mandays'] && row['Real Mandays'].trim() !== '') {
                                    realMandays = JSON.parse(row['Real Mandays']);
                                }
                            } catch (e) {
                                // Ignore
                            }

                            // Find client by name
                            const clientName = row['Client Name'] || '';
                            
                            // Build items array with laborPrice and mandays as items
                            const documentItems = [...items];
                            
                            // Add labor price as item if exists
                            const laborPrice = parseFloat(row['Labor Price'] || 0);
                            if (laborPrice > 0) {
                                documentItems.push({
                                    name: 'Labor',
                                    description: 'Labor',
                                    quantity: 1,
                                    unitPrice: laborPrice,
                                    total: laborPrice
                                });
                            }
                            
                            // Add mandays as item if exists
                            if (mandays && typeof mandays === 'object') {
                                const mandaysDays = mandays.days || 0;
                                const mandaysPeople = mandays.people || 0;
                                const mandaysCostPerDay = mandays.costPerDay || 0;
                                const mandaysTotal = mandaysDays * mandaysPeople * mandaysCostPerDay;
                                if (mandaysTotal > 0) {
                                    documentItems.push({
                                        name: 'Mandays',
                                        description: `Mandays (${mandaysDays} days × ${mandaysPeople} people × $${mandaysCostPerDay}/day)`,
                                        quantity: 1,
                                        unitPrice: mandaysTotal,
                                        total: mandaysTotal
                                    });
                                }
                            }

                            // Calculate subtotal from items
                            const subtotal = documentItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                            const vatAmount = parseFloat(row['VAT Amount'] || 0);
                            const total = subtotal + vatAmount;

                            // Add realMandays to notes if exists
                            let notes = row['Notes'] || '';
                            if (realMandays && typeof realMandays === 'object') {
                                const realMandaysDays = realMandays.days || 0;
                                const realMandaysPeople = realMandays.people || 0;
                                const realMandaysCostPerDay = realMandays.costPerDay || 0;
                                const realMandaysTotal = realMandaysDays * realMandaysPeople * realMandaysCostPerDay;
                                if (realMandaysTotal > 0) {
                                    const realMandaysNote = `[Real Mandays Cost: ${realMandaysDays} days × ${realMandaysPeople} people × $${realMandaysCostPerDay}/day = $${realMandaysTotal}]`;
                                    notes = notes ? `${notes}\n\n${realMandaysNote}` : realMandaysNote;
                                }
                            }

                            return {
                                type: 'PROFORMA',
                                documentNumber: row['Document Number'] || '',
                                clientName: clientName,
                                date: new Date(row['Date'] || new Date()).toISOString(),
                                subtotal: subtotal,
                                taxRate: 0,
                                taxAmount: vatAmount,
                                total: total,
                                notes: notes,
                                status: (row['Status'] || 'DRAFT').toUpperCase(),
                                items: documentItems
                            };
                        });

                    if (validDocuments.length === 0) {
                        alert('No valid proformas found in CSV file');
                        return;
                    }

                    await documentsAPI.batchCreate(validDocuments);
                    await fetchProformas();
                    alert(`Successfully imported ${validDocuments.length} proformas`);
                } catch (err) {
                    console.error('Error importing proformas:', err);
                    alert('Failed to import proformas: ' + (err.message || 'Unknown error'));
                }
            },
            error: (error) => {
                console.error('CSV parsing error:', error);
                alert('Failed to parse CSV file');
            }
        });

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleConvertToInvoice = async (proforma) => {
        if (!user) return;

        // Prevent double click
        if (convertingIds.has(proforma.id)) {
            console.log('Conversion already in progress for this proforma');
            return;
        }

        // Add to converting set
        setConvertingIds(prev => new Set(prev).add(proforma.id));

        try {
            // Convert proforma to invoice using API (backend will generate invoice number)
            await documentsAPI.convertToInvoice(proforma.id);

            // Refresh proformas list
            await fetchProformas();

            // Navigate to invoices page
            navigateTo('invoices');
        } catch (error) {
            console.error("Error converting proforma to invoice: ", error);
            alert('Error converting proforma to invoice. Please try again.');
            // Remove from converting set on error
            setConvertingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(proforma.id);
                return newSet;
            });
        }
    };

    const handleDeleteProforma = async (proformaId) => {
        if (!user) return;
        
        try {
            await documentsAPI.update(proformaId, {
                status: 'cancelled'
            });
            setConfirmDelete(null);
            await fetchProformas();
        } catch (error) {
            console.error("Error deleting proforma: ", error);
        }
    };

    const handleRestoreProforma = async (proformaId) => {
        if (!user) return;
        
        try {
            await documentsAPI.update(proformaId, {
                status: 'draft'
            });
            await fetchProformas();
        } catch (error) {
            console.error("Error restoring proforma: ", error);
        }
    };

    const handlePermanentDelete = async (proformaId) => {
        if (!user) return;
        
        try {
            await documentsAPI.delete(proformaId);
            await fetchProformas();
        } catch (error) {
            console.error("Error permanently deleting proforma: ", error);
        }
    };

    const filteredHistoryInvoices = historyInvoices.filter(invoice => {
        const filter = historyFilter.toLowerCase();
        return (
            invoice.documentNumber.toLowerCase().includes(filter) ||
            invoice.client.name.toLowerCase().includes(filter)
        );
    });

    // Filter proformas based on debounced search query - memoized
    const filteredProformas = useMemo(() => {
        return proformas.filter(doc => {
            const search = debouncedSearchQuery.toLowerCase();
            const dateStr = new Date(doc.date).toLocaleDateString();
            return (
                doc.documentNumber.toLowerCase().includes(search) ||
                doc.client.name.toLowerCase().includes(search) ||
                dateStr.includes(search) ||
                doc.total.toString().includes(search)
            );
        });
    }, [proformas, debouncedSearchQuery]);

    // Limit displayed proformas - memoized
    const displayedProformas = useMemo(() => {
        return filteredProformas.slice(0, displayLimit);
    }, [filteredProformas, displayLimit]);

    // Calculate statistics - memoized
    const totalAmount = useMemo(() => {
        return displayedProformas.reduce((sum, doc) => sum + (doc.total || 0), 0);
    }, [displayedProformas]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Proformas</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigateTo('newDocument')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105"
                    >
                        + Add New Document
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Export proformas to CSV"
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Import proformas from CSV"
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
                    <button
                        onClick={() => setShowDeletedModal(true)}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Cancelled ({deletedProformas.length})
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search by proforma number, client name, date, or amount..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* Proforma Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {loading ? (
                    <>
                        <div className="bg-yellow-50 p-4 rounded-lg animate-pulse">
                            <div className="h-4 bg-yellow-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-yellow-200 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-yellow-200 rounded w-full"></div>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg animate-pulse">
                            <div className="h-4 bg-blue-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-blue-200 rounded w-1/3 mb-2"></div>
                            <div className="h-3 bg-blue-200 rounded w-full"></div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-yellow-50 p-4 rounded-lg">
                            <p className="text-sm text-yellow-600">Total Proforma Value</p>
                            <p className="text-2xl font-bold text-yellow-800">${totalAmount.toFixed(2)}</p>
                            <p className="text-xs text-yellow-600 mt-1">Active proformas (not yet converted to invoices)</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <p className="text-sm text-blue-600">Total Active Proformas</p>
                            <p className="text-2xl font-bold text-blue-800">{displayedProformas.length}</p>
                            <p className="text-xs text-blue-600 mt-1">Convert proformas to invoices to enable payments</p>
                        </div>
                    </>
                )}
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-blue-700">
                            <strong>Note:</strong> Proformas are temporary quotes and cannot receive direct payments.
                            To accept payments, either:
                            <br/>• Add payment to client account (via Payments page), or
                            <br/>• Convert the proforma to an invoice first
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    {loading ? (
                        <TableSkeleton rows={5} columns={5} />
                    ) : displayedProformas.length === 0 ? (
                        <p className="text-gray-500">
                            {debouncedSearchQuery ? 'No proformas found matching your search.' : 'No proformas found.'}
                        </p>
                    ) : (
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <tr>
                                <th className="py-3 px-6 text-left">Number</th>
                                <th className="py-3 px-6 text-left">Client</th>
                                <th className="py-3 px-6 text-center">Date</th>
                                <th className="py-3 px-6 text-right">Total</th>
                                <th className="py-3 px-6 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {displayedProformas.map(doc => {
                                return (
                                    <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                        <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                        <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                        <td className="py-3 px-6 text-center">{new Date(doc.date).toLocaleDateString()}</td>
                                        <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                        <td className="py-3 px-6 text-center">
                                            <div className="flex item-center justify-center gap-1">
                                                <button
                                                    onClick={() => navigateTo('viewDocument', doc)}
                                                    className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    onClick={() => navigateTo('newDocument', doc)}
                                                    className="text-gray-600 hover:text-purple-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleConvertToInvoice(doc)}
                                                    disabled={convertingIds.has(doc.id)}
                                                    className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Convert to Invoice"
                                                >
                                                    {convertingIds.has(doc.id) ? 'Converting...' : 'Convert'}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(doc.id)}
                                                    className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    )}
                </div>
                
                {/* Load More Button - only show when not searching */}
                {!debouncedSearchQuery && filteredProformas.length > displayLimit && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => {
                                setIsLoadingMore(true);
                                setTimeout(() => {
                                    setDisplayLimit(prev => prev + 30);
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
                                `Load More Proformas (${filteredProformas.length - displayLimit} remaining)`
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
                        <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
                        <p className="mb-6">Are you sure you want to delete this proforma? You can restore it later from the deleted items.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteProforma(confirmDelete)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Deleted Proformas Modal */}
            {showDeletedModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Cancelled Proformas</h2>
                            <button onClick={() => setShowDeletedModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {deletedProformas.length === 0 ? (
                                <p className="text-gray-500">No deleted proformas.</p>
                            ) : (
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                        <tr>
                                            <th className="py-3 px-6 text-left">Number</th>
                                            <th className="py-3 px-6 text-left">Client</th>
                                            <th className="py-3 px-6 text-center">Deleted On</th>
                                            <th className="py-3 px-6 text-right">Total</th>
                                            <th className="py-3 px-6 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-600 text-sm font-light">
                                        {deletedProformas.map(doc => (
                                            <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                                <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                                <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                                <td className="py-3 px-6 text-center">
                                                    {doc.deletedAt ? new Date(doc.deletedAt).toLocaleDateString() : 'Unknown'}
                                                </td>
                                                <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                                <td className="py-3 px-6 text-center">
                                                    <div className="flex item-center justify-center gap-2">
                                                        <button
                                                            onClick={() => handleRestoreProforma(doc.id)}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => handlePermanentDelete(doc.id)}
                                                            className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Permanent Delete
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Invoice History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Invoice History (Last 30 Days)</h2>
                            <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="p-4">
                            <input
                                type="text"
                                placeholder="Filter by invoice # or client name..."
                                value={historyFilter}
                                onChange={e => setHistoryFilter(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg mb-4"
                            />
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {historyLoading && historyInvoices.length === 0 ? <p>Loading history...</p> :
                             filteredHistoryInvoices.length === 0 ? <p>No invoices found in the last 30 days.</p> :
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                    <tr>
                                        <th className="py-3 px-6 text-left">Number</th>
                                        <th className="py-3 px-6 text-left">Client</th>
                                        <th className="py-3 px-6 text-center">Date</th>
                                        <th className="py-3 px-6 text-right">Total</th>
                                        <th className="py-3 px-6 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-600 text-sm font-light">
                                    {filteredHistoryInvoices.map(doc => (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-3 px-6 text-center">{new Date(doc.date).toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-center">
                                                <button 
                                                    onClick={() => navigateTo('viewDocument', doc)} 
                                                    className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-3 rounded-lg text-sm"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            }
                        </div>
                        <div className="p-4 border-t">
                            {hasMore && (
                                <button
                                    onClick={() => fetchHistoryInvoices(true)}
                                    disabled={historyLoading}
                                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded w-full disabled:bg-blue-300"
                                >
                                    {historyLoading ? 'Loading...' : 'Show More'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProformasPage;
