import React, { useState, useEffect, useMemo } from 'react';
import { documentsAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import { useAuth } from '../contexts/AuthContext';

const ProformasPage = ({ navigateTo }) => {
    const { user } = useAuth();
    const [proformas, setProformas] = useState([]);
    const [cancelledProformas, setCancelledProformas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showCancelledModal, setShowCancelledModal] = useState(false);
    const [historyInvoices, setHistoryInvoices] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [historyFilter, setHistoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1, hasMore: false });
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [convertingIds, setConvertingIds] = useState(new Set()); // Track converting proformas

    const fetchProformas = async (page = 1, append = false) => {
        console.log("ProformasPage: Fetching proformas, page:", page);
        if (!append) setLoading(true);
        else setIsLoadingMore(true);

        try {
            // Fetch proformas with pagination
            const response = await documentsAPI.getAll('proforma', null, 50, page, debouncedSearchQuery || '');
            
            // Handle both old format (array) and new format (object with data property)
            const allProformas = response.data || response;
            const paginationInfo = response.pagination || { page, limit: 50, total: null, totalPages: null, hasMore: allProformas.length > 0 };
            
            console.log("ProformasPage: Received", allProformas.length, "documents, pagination:", paginationInfo);

            const activeDocs = [];
            const cancelledDocs = [];

            allProformas.forEach((doc) => {
                // Check if it's converted to invoice - exclude from all lists to avoid double counting
                if (doc.status === 'CONVERTED' || doc.convertedTo) {
                    // Skip converted proformas from all lists
                    return;
                }

                if (doc.status === 'CANCELLED') {
                    cancelledDocs.push(doc);
                } else {
                    activeDocs.push(doc);
                }
            });

            // Update state
            if (append) {
                setProformas(prev => [...prev, ...activeDocs]);
                setCancelledProformas(prev => [...prev, ...cancelledDocs]);
            } else {
                setProformas(activeDocs);
                setCancelledProformas(cancelledDocs);
            }
            
            setPagination(paginationInfo);
            setCurrentPage(page);
        } catch (error) {
            console.error("ProformasPage: Error fetching proformas:", error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    };

    useEffect(() => {
        console.log("ProformasPage: useEffect running");
        fetchProformas(1, false);
    }, []);

    // Refetch when search query changes
    useEffect(() => {
        if (debouncedSearchQuery !== undefined) {
            fetchProformas(1, false);
        }
    }, [debouncedSearchQuery]);


    const fetchHistoryInvoices = async (loadMore = false) => {
        if (!user) return;
        setHistoryLoading(true);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        try {
            // Fetch invoices with pagination (last 30 days)
            const response = await documentsAPI.getAll('INVOICE', null, 100, 1, '');
            const allInvoices = response.data || response;
            
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
            await fetchProformas(1, false);

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

    const [deletingProformaIds, setDeletingProformaIds] = useState(new Set());

    const handleDeleteProforma = async (proformaId) => {
        if (!user) return;

        // Prevent double-click
        if (deletingProformaIds.has(proformaId)) {
            return;
        }

        if (!window.confirm('Are you sure you want to cancel this proforma? You can restore it later from the cancelled proformas.')) {
            return;
        }

        setDeletingProformaIds(prev => new Set(prev).add(proformaId));
        setLoading(true);

        try {
            // Cancel the proforma (set status to CANCELLED) instead of deleting
            await documentsAPI.update(proformaId, {
                status: 'CANCELLED'
            });
            setConfirmDelete(null);
            await fetchProformas(1, false);
        } catch (error) {
            console.error("Error cancelling proforma: ", error);
            alert('Error cancelling proforma. Please try again.');
        } finally {
            setLoading(false);
            setDeletingProformaIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(proformaId);
                return newSet;
            });
        }
    };

    const handleRestoreProforma = async (proformaId) => {
        if (!user) return;

        try {
            await documentsAPI.update(proformaId, {
                status: 'DRAFT'
            });
            await fetchProformas(1, false);
        } catch (error) {
            console.error("Error restoring proforma: ", error);
        }
    };

    const handlePermanentDelete = async (proformaId) => {
        if (!user) return;
        
        if (!window.confirm('Are you sure you want to permanently delete this proforma? This action cannot be undone and will remove it from the database.')) {
            return;
        }
        
        try {
            await documentsAPI.delete(proformaId);
            await fetchProformas(1, false);
            alert('Proforma permanently deleted.');
        } catch (error) {
            console.error("Error permanently deleting proforma: ", error);
            alert('Error deleting proforma. Please try again.');
        }
    };

    const filteredHistoryInvoices = historyInvoices.filter(invoice => {
        const filter = historyFilter.toLowerCase();
        const clientName = invoice.client?.name || invoice.clientName || '';
        return (
            invoice.documentNumber.toLowerCase().includes(filter) ||
            clientName.toLowerCase().includes(filter)
        );
    });

    // Filter proformas based on debounced search query - memoized
    // Note: Server-side search is now used, but we keep client-side filter for immediate feedback
    const filteredProformas = useMemo(() => {
        if (!debouncedSearchQuery) return proformas;
        const search = debouncedSearchQuery.toLowerCase();
        return proformas.filter(doc => {
            const dateStr = new Date(doc.date).toLocaleDateString();
            const clientName = doc.client?.name || doc.clientName || '';
            return (
                doc.documentNumber.toLowerCase().includes(search) ||
                clientName.toLowerCase().includes(search) ||
                dateStr.includes(search) ||
                doc.total.toString().includes(search)
            );
        });
    }, [proformas, debouncedSearchQuery]);

    // Use filtered proformas directly (pagination handled server-side)
    const displayedProformas = filteredProformas;

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
                        onClick={() => setShowCancelledModal(true)}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Cancelled ({cancelledProformas.length})
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
                                        <td className="py-3 px-6 text-left">{doc.client?.name || doc.clientName || 'N/A'}</td>
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
                                                    disabled={deletingProformaIds.has(doc.id) || convertingIds.has(doc.id)}
                                                    className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
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
                
                {/* Load More Button - show when there are more pages */}
                {pagination.hasMore && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => {
                                fetchProformas(currentPage + 1, true);
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
                                `Load More Proformas`
                            )}
                        </button>
                        {pagination.total !== null && (
                            <p className="text-sm text-gray-500 mt-2">
                                Showing {displayedProformas.length} of {pagination.total} proformas
                            </p>
                        )}
                        {pagination.total === null && (
                            <p className="text-sm text-gray-500 mt-2">
                                Showing {displayedProformas.length} proformas
                            </p>
                        )}
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
                        <h3 className="text-lg font-bold mb-4">Confirm Cancel</h3>
                        <p className="mb-6">Are you sure you want to cancel this proforma? You can restore it later from the cancelled proformas.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteProforma(confirmDelete)}
                                disabled={deletingProformaIds.has(confirmDelete) || loading}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {deletingProformaIds.has(confirmDelete) ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancelled Proformas Modal */}
            {showCancelledModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Cancelled Proformas</h2>
                            <button onClick={() => setShowCancelledModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {cancelledProformas.length === 0 ? (
                                <p className="text-gray-500">No cancelled proformas.</p>
                            ) : (
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                        <tr>
                                            <th className="py-3 px-6 text-left">Number</th>
                                            <th className="py-3 px-6 text-left">Client</th>
                                            <th className="py-3 px-6 text-center">Date</th>
                                            <th className="py-3 px-6 text-center">Cancelled On</th>
                                            <th className="py-3 px-6 text-right">Total</th>
                                            <th className="py-3 px-6 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-600 text-sm font-light">
                                        {cancelledProformas.map(doc => (
                                            <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                                <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                                <td className="py-3 px-6 text-left">{doc.client?.name || doc.clientName || 'N/A'}</td>
                                                <td className="py-3 px-6 text-center">
                                                    {(doc.date instanceof Date ? doc.date : new Date(doc.date)).toLocaleDateString()}
                                                </td>
                                                <td className="py-3 px-6 text-center">
                                                    {doc.updatedAt ? (doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt)).toLocaleDateString() : (doc.createdAt ? (doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt)).toLocaleDateString() : 'Unknown')}
                                                </td>
                                                <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                                <td className="py-3 px-6 text-center">
                                                    <div className="flex item-center justify-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                handleRestoreProforma(doc.id);
                                                                setShowCancelledModal(false);
                                                            }}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm('Are you sure you want to permanently delete this proforma? This action cannot be undone.')) {
                                                                    handlePermanentDelete(doc.id);
                                                                    setShowCancelledModal(false);
                                                                }
                                                            }}
                                                            className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Delete Permanently
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
                                            <td className="py-3 px-6 text-left">{doc.client?.name || doc.clientName || 'N/A'}</td>
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
