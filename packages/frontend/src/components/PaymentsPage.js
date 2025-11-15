import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { paymentsAPI, clientsAPI, documentsAPI, settingsAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const PaymentsPage = ({ navigateTo }) => {
    const [payments, setPayments] = useState([]);
    const [clients, setClients] = useState([]);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddForm, setShowAddForm] = useState(false);
    const [editingPayment, setEditingPayment] = useState(null);
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    // Form state
    const [formData, setFormData] = useState({
        clientId: '',
        documentId: '',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        notes: ''
    });
    const [payFromAccount, setPayFromAccount] = useState(false);
    const [clientFilter, setClientFilter] = useState('all');
    const [selectedClientForSettlement, setSelectedClientForSettlement] = useState(null);
    const [showClientBalances, setShowClientBalances] = useState(false);
    const [settlementInProgress, setSettlementInProgress] = useState(false);
    const [customSettlementAmounts, setCustomSettlementAmounts] = useState({});
    const [clientSearchTerm, setClientSearchTerm] = useState('');
    const [isClientDropdownVisible, setIsClientDropdownVisible] = useState(false);
    const [selectedClient, setSelectedClient] = useState(null);
    const clientDropdownRef = React.useRef(null);
    const [selectedPaymentForView, setSelectedPaymentForView] = useState(null);
    const [showPaymentReceipt, setShowPaymentReceipt] = useState(false);
    const [paymentSearchTerm, setPaymentSearchTerm] = useState('');
    const debouncedPaymentSearch = useDebounce(paymentSearchTerm, 300);
    const [userSettings, setUserSettings] = useState(null);
    const [isGeneratingReceiptPDF, setIsGeneratingReceiptPDF] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const receiptPrintRef = useRef(null);

    // Handle click outside client dropdown
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (clientDropdownRef.current && !clientDropdownRef.current.contains(event.target)) {
                setIsClientDropdownVisible(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    // Fetch user settings for receipt
    useEffect(() => {
        const fetchUserSettings = async () => {
            try {
                const settings = await settingsAPI.get();
                setUserSettings(settings);
            } catch (error) {
                console.error("Error fetching user settings:", error);
            }
        };
        fetchUserSettings();
    }, []);

    // Fetch data on mount and when search changes
    useEffect(() => {
        let isMounted = true;
        const loadData = async () => {
            if (isMounted) {
                await fetchData(true);
            }
        };
        loadData();
        return () => {
            isMounted = false;
        };
    }, [debouncedPaymentSearch, fetchData]); // Include fetchData in dependencies since it's memoized

    // Refresh data when page becomes visible (handles case when payments added from other pages)
    useEffect(() => {
        let refreshTimeout;
        const handleVisibilityChange = () => {
            if (!document.hidden) {
                // Debounce refresh to avoid too many calls
                clearTimeout(refreshTimeout);
                refreshTimeout = setTimeout(() => {
                    fetchData(true);
                }, 500);
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
            clearTimeout(refreshTimeout);
        };
    }, [fetchData]); // Include fetchData since it's memoized

    const [displayedPaymentsLimit, setDisplayedPaymentsLimit] = useState(20);
    const [allPayments, setAllPayments] = useState([]); // Store all fetched payments
    const [hasMorePayments, setHasMorePayments] = useState(false);
    const [paymentStatusFilter, setPaymentStatusFilter] = useState('all'); // 'all', 'unpaid', 'partial', 'paid'
    
    // Use ref to track current limit without causing re-renders or dependency issues
    const displayedPaymentsLimitRef = useRef(20);
    
    // Update ref whenever state changes
    useEffect(() => {
        displayedPaymentsLimitRef.current = displayedPaymentsLimit;
    }, [displayedPaymentsLimit]);

    // Memoize fetchData to prevent infinite loops - only depends on debouncedPaymentSearch
    const fetchData = useCallback(async (resetLimit = true) => {
        try {
            setLoading(true);
            const limit = 20; // Load 20 at a time
            // Use ref to get current limit without including it in dependencies
            const currentPage = resetLimit ? 1 : Math.floor((displayedPaymentsLimitRef.current || 20) / 20) + 1;
            
            const [paymentsResponse, clientsResponse, documentsResponse] = await Promise.all([
                paymentsAPI.getAll(null, limit, currentPage, debouncedPaymentSearch || ''), // Use search term for server-side search
                clientsAPI.getAll('', 100, 1), // Fetch first 100 clients
                documentsAPI.getAll('invoice', null, 100, 1, '') // Fetch first 100 invoices
            ]);

            // Handle paginated response format
            const paymentsData = paymentsResponse.data || paymentsResponse;
            const pagination = paymentsResponse.pagination;
            const clientsData = clientsResponse.data || clientsResponse;
            const documentsData = documentsResponse.data || documentsResponse;

            if (resetLimit) {
                setAllPayments(Array.isArray(paymentsData) ? paymentsData : []);
                setPayments(Array.isArray(paymentsData) ? paymentsData : []);
                setDisplayedPaymentsLimit(limit);
                displayedPaymentsLimitRef.current = limit;
            } else {
                // Append for load more
                const newPayments = Array.isArray(paymentsData) ? paymentsData : [];
                setAllPayments(prev => [...prev, ...newPayments]);
                setPayments(prev => [...prev, ...newPayments]);
                setDisplayedPaymentsLimit(prev => {
                    const newLimit = prev + limit;
                    displayedPaymentsLimitRef.current = newLimit;
                    return newLimit;
                });
            }
            
            setHasMorePayments(pagination?.hasMore || false);
            setClients(clientsData);
            setDocuments(documentsData);
        } catch (error) {
            console.error('Error fetching data:', error);
            setFeedback({ type: 'error', message: 'Failed to load data' });
        } finally {
            setLoading(false);
        }
    }, [debouncedPaymentSearch]); // Only depend on debouncedPaymentSearch to prevent infinite loops

    const [deletingPaymentIds, setDeletingPaymentIds] = useState(new Set());

    const handleDeletePayment = async (paymentId) => {
        // Prevent double-click
        if (deletingPaymentIds.has(paymentId)) {
            return;
        }

        if (!window.confirm('Are you sure you want to delete this payment?')) return;

        setDeletingPaymentIds(prev => new Set(prev).add(paymentId));
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            await paymentsAPI.delete(paymentId);
            setFeedback({ type: 'success', message: 'Payment deleted successfully!' });
            await fetchData(true); // Refresh data
        } catch (error) {
            console.error('Error deleting payment:', error);
            setFeedback({ type: 'error', message: 'Failed to delete payment' });
        } finally {
            setLoading(false);
            setDeletingPaymentIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(paymentId);
                return newSet;
            });
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Prevent double submission
        if (loading || isSubmitting) {
            return;
        }
        
        setLoading(true);
        setIsSubmitting(true);
        setFeedback({ type: '', message: '' });

        try {
            // Validate required fields
            if (!formData.clientId || !formData.amount) {
                setFeedback({ type: 'error', message: 'Please select a client and enter an amount.' });
                setLoading(false);
                setIsSubmitting(false);
                return;
            }

            const amount = parseFloat(formData.amount);
            if (isNaN(amount) || amount <= 0) {
                setFeedback({ type: 'error', message: 'Payment amount must be greater than 0.' });
                setLoading(false);
                setIsSubmitting(false);
                return;
            }

            const client = clients.find(c => c.id === formData.clientId);
            const clientName = client ? client.name : '';
            const clientBalance = getClientAccountBalance(formData.clientId);

            // Handle payment from client account balance
            if (payFromAccount && formData.documentId) {
                // Validate that client has sufficient balance
                if (clientBalance < amount) {
                    setFeedback({
                        type: 'error',
                        message: `Cannot settle invoice: Insufficient client balance. Available: $${clientBalance.toFixed(2)}, Required: $${amount.toFixed(2)}. Please add more funds to client account first.`
                    });
                    setLoading(false);
                    setIsSubmitting(false);
                    return;
                }
                
                // Also validate that amount doesn't exceed outstanding
                const outstandingAmount = getOutstandingAmount(formData.documentId);
                if (amount > outstandingAmount) {
                    setFeedback({
                        type: 'error',
                        message: `Cannot settle more than outstanding amount. Outstanding: $${outstandingAmount.toFixed(2)}, Attempted: $${amount.toFixed(2)}`
                    });
                    setLoading(false);
                    setIsSubmitting(false);
                    return;
                }

                // Get unallocated payments for this client (FIFO)
                const clientPayments = payments.filter(p => p.clientId === formData.clientId && !p.documentId);
                clientPayments.sort((a, b) => {
                    const dateA = new Date(a.paymentDate);
                    const dateB = new Date(b.paymentDate);
                    return dateA - dateB;
                });

                const amountToSettle = Math.min(amount, outstandingAmount); // Cap to outstanding amount
                const remainder = amount - amountToSettle; // Amount that exceeds outstanding

                // Allocate payments to invoice (FIFO)
                let remainingToSettle = amountToSettle;

                for (const payment of clientPayments) {
                    if (remainingToSettle <= 0) break;

                    const amountToAllocate = Math.min(payment.amount, remainingToSettle);

                    if (amountToAllocate === payment.amount) {
                        // Full payment allocated
                        const doc = documents.find(d => d.id === formData.documentId);
                        await paymentsAPI.update(payment.id, {
                            documentId: formData.documentId,
                            invoiceNumber: doc ? doc.documentNumber : '',
                            notes: (payment.notes || '') + ` | Allocated to invoice ${doc ? doc.documentNumber : ''}`
                        });
                        remainingToSettle -= amountToAllocate;
                    } else {
                        // Partial payment - split
                        const doc = documents.find(d => d.id === formData.documentId);
                        await paymentsAPI.update(payment.id, {
                            amount: amountToAllocate,
                            documentId: formData.documentId,
                            invoiceNumber: doc ? doc.documentNumber : '',
                            notes: (payment.notes || '') + ` | Partially allocated to invoice ${doc ? doc.documentNumber : ''}`
                        });

                        // Create new payment for remaining unallocated amount
                        const remainingUnallocated = payment.amount - amountToAllocate;
                        await paymentsAPI.create({
                            clientId: payment.clientId,
                            clientName: payment.clientName || '',
                            amount: remainingUnallocated,
                            documentId: null,
                            invoiceNumber: '',
                            paymentDate: payment.paymentDate,
                            paymentMethod: payment.paymentMethod,
                            notes: (payment.notes || '') + ` | Split from original payment`
                        });
                        remainingToSettle = 0;
                    }
                }

                // If there's a remainder (amount exceeded outstanding), add it to client account
                if (remainder > 0) {
                    await paymentsAPI.create({
                        clientId: formData.clientId,
                        clientName: clientName,
                        amount: remainder,
                        documentId: null,
                        invoiceNumber: '',
                        paymentDate: new Date(formData.paymentDate).toISOString(),
                        paymentMethod: formData.paymentMethod,
                        notes: (formData.notes || '') + ` | Excess payment added to client account (invoice fully paid)`
                    });
                }

                setFeedback({ 
                    type: 'success', 
                    message: `$${amountToSettle.toFixed(2)} settled to invoice${remainder > 0 ? `, $${remainder.toFixed(2)} added to client account` : ''}` 
                });
            } else {
                // Regular payment (new payment or to client account)
                // Validate amount against outstanding if invoice is selected
                if (formData.documentId) {
                    const outstanding = getOutstandingAmount(formData.documentId);
                    const amountToPay = Math.min(amount, outstanding); // Cap to outstanding
                    const remainder = amount - amountToPay; // Amount that exceeds outstanding

                    let invoiceNumber = '';
                    const doc = documents.find(d => d.id === formData.documentId);
                    invoiceNumber = doc ? doc.documentNumber : '';

                    // Create payment for invoice (capped to outstanding)
                    const paymentData = {
                        clientId: formData.clientId,
                        clientName: clientName,
                        documentId: formData.documentId,
                        invoiceNumber: invoiceNumber,
                        amount: amountToPay,
                        paymentDate: new Date(formData.paymentDate).toISOString(),
                        paymentMethod: formData.paymentMethod,
                        notes: formData.notes || ''
                    };

                    await paymentsAPI.create(paymentData);

                    // If there's a remainder, add it to client account
                    if (remainder > 0) {
                        await paymentsAPI.create({
                            clientId: formData.clientId,
                            clientName: clientName,
                            amount: remainder,
                            documentId: null,
                            invoiceNumber: '',
                            paymentDate: new Date(formData.paymentDate).toISOString(),
                            paymentMethod: formData.paymentMethod,
                            notes: (formData.notes || '') + ` | Excess payment added to client account (invoice fully paid)`
                        });
                    }

                    setFeedback({ 
                        type: 'success', 
                        message: `$${amountToPay.toFixed(2)} paid to invoice${remainder > 0 ? `, $${remainder.toFixed(2)} added to client account` : ''}` 
                    });
                } else {
                    // Payment to client account
                    const paymentData = {
                        clientId: formData.clientId,
                        clientName: clientName,
                        documentId: null,
                        invoiceNumber: '',
                        amount: amount,
                        paymentDate: new Date(formData.paymentDate).toISOString(),
                        paymentMethod: formData.paymentMethod,
                        notes: formData.notes || ''
                    };

                    if (editingPayment) {
                        await paymentsAPI.update(editingPayment.id, paymentData);
                        setFeedback({ type: 'success', message: 'Payment updated successfully!' });
                    } else {
                        await paymentsAPI.create(paymentData);
                        setFeedback({ type: 'success', message: 'Payment added to client account successfully!' });
                    }
                }
            }

            // Reset form
            setFormData({
                clientId: '',
                documentId: '',
                amount: '',
                paymentDate: new Date().toISOString().split('T')[0],
                paymentMethod: 'cash',
                notes: ''
            });
            setPayFromAccount(false);
            setSelectedClient(null);
            setClientSearchTerm('');
            setShowAddForm(false);
            setEditingPayment(null);

            await fetchData(true); // Refresh data
        } catch (error) {
            console.error('Error saving payment:', error);
            setFeedback({ type: 'error', message: 'Failed to save payment: ' + (error.message || 'Unknown error') });
        } finally {
            setLoading(false);
            setIsSubmitting(false);
        }
    };

    const getClientName = (payment) => {
        if (payment.clientName) {
            return payment.clientName;
        }
        const client = clients.find(c => c.id === payment.clientId);
        return client ? client.name : `Client ID: ${payment.clientId}`;
    };

    const getDocumentInfo = (documentId) => {
        const document = documents.find(d => d.id === documentId);
        if (!document) return { type: 'Unknown', number: 'N/A', total: 0 };

        return {
            type: document.type || 'Invoice',
            number: document.documentNumber || 'N/A',
            total: document.total || 0
        };
    };

    const getFilteredDocuments = (clientId) => {
        if (!clientId) {
            // If no client selected, return empty array (user must select client first)
            return [];
        }

        // Return unpaid invoices for the selected client
        return documents.filter(doc => {
            const type = (doc.type || '').toLowerCase();
            const isInvoice = type === 'invoice' || type === 'invoices';
            const isNotCancelled = doc.status !== 'CANCELLED' && !doc.deleted;
            
            // Check if invoice is unpaid
            const totalPaid = payments
                .filter(p => p.documentId === doc.id)
                .reduce((sum, p) => sum + (p.amount || 0), 0);
            const isUnpaid = (doc.total || 0) > totalPaid;
            
            return isInvoice && 
                   doc.clientId === clientId && 
                   isNotCancelled && 
                   isUnpaid;
        });
    };

    // Helper to get payment status for a payment
    const getPaymentStatus = useCallback((payment) => {
        if (!payment.documentId) return 'unallocated'; // Payment to client account
        
        const doc = documents.find(d => d.id === payment.documentId);
        if (!doc) return 'unknown';
        
        const totalPaid = payments
            .filter(p => p.documentId === payment.documentId)
            .reduce((sum, p) => sum + (p.amount || 0), 0);
        
        if (totalPaid >= doc.total) return 'paid';
        if (totalPaid > 0) return 'partial';
        return 'unpaid';
    }, [documents, payments]);

    // Memoized filtered payments with status filter
    const allFilteredPayments = useMemo(() => {
        let filtered = [...payments];

        // Filter by client if selected
        if (clientFilter !== 'all') {
            filtered = filtered.filter(payment => payment.clientId === clientFilter);
        }

        // Filter by payment status
        if (paymentStatusFilter !== 'all') {
            filtered = filtered.filter(payment => {
                const status = getPaymentStatus(payment);
                if (paymentStatusFilter === 'unpaid') {
                    return status === 'unpaid';
                } else if (paymentStatusFilter === 'partial') {
                    return status === 'partial';
                } else if (paymentStatusFilter === 'paid') {
                    return status === 'paid';
                }
                return true;
            });
        }

        // Sort by date (newest first) or by payment status
        filtered.sort((a, b) => {
            if (paymentStatusFilter === 'unpaid') {
                // Unpaid first, then partial, then paid
                const statusA = getPaymentStatus(a);
                const statusB = getPaymentStatus(b);
                const statusOrder = { 'unpaid': 0, 'partial': 1, 'paid': 2, 'unallocated': 3, 'unknown': 4 };
                if (statusOrder[statusA] !== statusOrder[statusB]) {
                    return statusOrder[statusA] - statusOrder[statusB];
                }
            } else if (paymentStatusFilter === 'partial') {
                // Partial first
                const statusA = getPaymentStatus(a);
                const statusB = getPaymentStatus(b);
                if (statusA === 'partial' && statusB !== 'partial') return -1;
                if (statusA !== 'partial' && statusB === 'partial') return 1;
            } else if (paymentStatusFilter === 'paid') {
                // Last paid first (most recent paid)
                const statusA = getPaymentStatus(a);
                const statusB = getPaymentStatus(b);
                if (statusA === 'paid' && statusB === 'paid') {
                    const dateA = a.paymentDate ? new Date(a.paymentDate) : new Date(0);
                    const dateB = b.paymentDate ? new Date(b.paymentDate) : new Date(0);
                    return dateB - dateA; // Most recent first
                }
                if (statusA === 'paid' && statusB !== 'paid') return -1;
                if (statusA !== 'paid' && statusB === 'paid') return 1;
            }
            
            // Default: sort by date (newest first)
            const dateA = a.paymentDate ? new Date(a.paymentDate) : new Date(0);
            const dateB = b.paymentDate ? new Date(b.paymentDate) : new Date(0);
            return dateB - dateA;
        });

        return filtered;
    }, [payments, clientFilter, paymentStatusFilter, getPaymentStatus, documents]);

    // Displayed payments (limited by displayedPaymentsLimit)
    const filteredPayments = useMemo(() => {
        return allFilteredPayments.slice(0, displayedPaymentsLimit);
    }, [allFilteredPayments, displayedPaymentsLimit]);

    // Memoized client payments lookup
    const getClientPayments = useCallback((clientId) => {
        return payments.filter(payment => payment.clientId === clientId);
    }, [payments]);

    // Memoized client documents lookup
    const getClientDocuments = useCallback((clientId) => {
        return documents.filter(doc =>
            doc.type?.toUpperCase() === 'INVOICE' &&
            doc.clientId === clientId &&
            doc.status?.toUpperCase() !== 'CANCELLED'
        );
    }, [documents]);

    // Calculate client account balance (payments without documentId)
    const getClientAccountBalance = useCallback((clientId) => {
        const clientPayments = payments.filter(p => p.clientId === clientId && !p.documentId);
        return clientPayments.reduce((sum, payment) => sum + payment.amount, 0);
    }, [payments]);

    // Get total outstanding amount for a client (across all invoices)
    const getClientOutstandingAmount = useCallback((clientId) => {
        const clientDocs = getClientDocuments(clientId);
        const totalInvoiced = clientDocs.reduce((sum, doc) => sum + doc.total, 0);
        const totalPaid = payments
            .filter(p => p.clientId === clientId)
            .reduce((sum, p) => sum + p.amount, 0);
        return Math.max(0, totalInvoiced - totalPaid);
    }, [getClientDocuments, payments]);

    const getOutstandingAmount = (documentId) => {
        const document = documents.find(d => d.id === documentId);
        if (!document) return 0;
        const totalPaid = payments
            .filter(p => p.documentId === documentId)
            .reduce((sum, p) => sum + p.amount, 0);
        return Math.max(0, document.total - totalPaid);
    };

    const handleClientChange = (clientId) => {
        setFormData(prev => ({
            ...prev,
            clientId,
            documentId: '',
            amount: ''
        }));
    };

    const handleDocumentChange = (documentId) => {
        const outstanding = getOutstandingAmount(documentId);
        const selectedDocument = documents.find(d => d.id === documentId);

        // Auto-select client when invoice is chosen
        if (selectedDocument && selectedDocument.clientId) {
            const client = clients.find(c => c.id === selectedDocument.clientId);
            if (client) {
                setSelectedClient(client);
                setClientSearchTerm(client.name);
                setFormData(prev => ({
                    ...prev,
                    clientId: client.id,
                    documentId,
                    amount: outstanding > 0 ? outstanding.toFixed(2) : ''
                }));
                return;
            }
        }

        setFormData(prev => ({
            ...prev,
            documentId,
            amount: outstanding > 0 ? outstanding.toFixed(2) : ''
        }));
    };

    const handleClientChangeWithAutoFill = (clientId) => {
        handleClientChange(clientId);
        
        // Auto-fill amount with total outstanding if there's only one unpaid invoice
        const unpaidInvoices = getClientDocuments(clientId).filter(doc => {
            const paid = payments.filter(p => p.documentId === doc.id).reduce((sum, p) => sum + p.amount, 0);
            return paid < doc.total;
        });
        
        if (unpaidInvoices.length === 1) {
            const outstanding = getOutstandingAmount(unpaidInvoices[0].id);
            setFormData(prev => ({
                ...prev,
                clientId,
                documentId: unpaidInvoices[0].id,
                amount: outstanding > 0 ? outstanding.toFixed(2) : ''
            }));
        } else if (unpaidInvoices.length > 1) {
            // If multiple invoices, don't auto-select but show them in dropdown
            setFormData(prev => ({
                ...prev,
                clientId,
                documentId: '',
                amount: ''
            }));
        }
    };

    const handleSettleDocument = async (clientId, documentId, amount) => {
        if (settlementInProgress) return;

        try {
            setSettlementInProgress(true);
            setLoading(true);

            const clientBalance = getClientAccountBalance(clientId);
            const settleAmount = parseFloat(amount);
            const outstanding = getOutstandingAmount(documentId);

            // Validate client has sufficient balance
            if (clientBalance < settleAmount) {
                setFeedback({
                    type: 'error',
                    message: `Cannot settle invoice: Insufficient client balance. Available: $${clientBalance.toFixed(2)}, Required: $${settleAmount.toFixed(2)}. Please add more funds to client account first.`
                });
                setLoading(false);
                setSettlementInProgress(false);
                return;
            }

            // Validate amount doesn't exceed outstanding
            if (settleAmount > outstanding) {
                setFeedback({
                    type: 'error',
                    message: `Cannot settle more than outstanding amount. Outstanding: $${outstanding.toFixed(2)}, Attempted: $${settleAmount.toFixed(2)}`
                });
                setLoading(false);
                setSettlementInProgress(false);
                return;
            }

            // Get unallocated payments for this client
            const clientPayments = payments.filter(p => p.clientId === clientId && !p.documentId);
            clientPayments.sort((a, b) => new Date(a.paymentDate) - new Date(b.paymentDate));

            // Allocate payments to this invoice (FIFO)
            let remainingToSettle = settleAmount;

            for (const payment of clientPayments) {
                if (remainingToSettle <= 0) break;

                if (payment.amount <= remainingToSettle) {
                    // Full payment allocated
                    const doc = documents.find(d => d.id === documentId);
                    await paymentsAPI.update(payment.id, {
                        ...payment,
                        documentId: documentId,
                        invoiceNumber: doc ? doc.documentNumber : '',
                        notes: (payment.notes || '') + ` | Allocated to invoice`
                    });
                    remainingToSettle -= payment.amount;
                } else {
                    // Partial payment - split it
                    // Update original to allocated amount
                    const doc = documents.find(d => d.id === documentId);
                    await paymentsAPI.update(payment.id, {
                        ...payment,
                        amount: remainingToSettle,
                        documentId: documentId,
                        invoiceNumber: doc ? doc.documentNumber : '',
                        notes: (payment.notes || '') + ` | Partially allocated to invoice`
                    });

                    // Create new payment for remaining
                    const remainingAmount = payment.amount - remainingToSettle;
                    await paymentsAPI.create({
                        clientId: payment.clientId,
                        clientName: payment.clientName,
                        documentId: null,
                        invoiceNumber: '',
                        amount: remainingAmount,
                        paymentDate: payment.paymentDate,
                        paymentMethod: payment.paymentMethod,
                        notes: (payment.notes || '') + ` | Split from original payment`
                    });

                    remainingToSettle = 0;
                }
            }

            setFeedback({
                type: 'success',
                message: `Invoice settled successfully!`
            });
            setShowClientSettlement(false);
            setSelectedClientForSettlement(null);

            await fetchData(true); // Refresh data
        } catch (error) {
            console.error('Error settling document:', error);
            setFeedback({ type: 'error', message: 'Failed to settle invoice. Please try again.' });
        } finally {
            setLoading(false);
            setSettlementInProgress(false);
        }
    };

    // PDF generation for payment receipt
    const handleGenerateReceiptPDF = async () => {
        if (!selectedPaymentForView || !receiptPrintRef.current) return;

        try {
            setIsGeneratingReceiptPDF(true);
            const filename = `Payment-Receipt-${selectedPaymentForView.id.substring(0, 8)}.pdf`;
            const element = receiptPrintRef.current;
            const a4WidthPx = 794;

            // Store original styles
            const originalWidth = element.style.width;
            const originalMaxWidth = element.style.maxWidth;
            const originalMargin = element.style.margin;
            const originalPadding = element.style.padding;

            // Set fixed A4 width for consistent capture
            element.style.width = a4WidthPx + 'px';
            element.style.maxWidth = a4WidthPx + 'px';
            element.style.margin = '0 auto';
            element.style.padding = '32px';
            
            // Force layout recalculation
            element.offsetHeight;

            // Wait for logo image to load if present
            const logoImg = element.querySelector('img');
            if (logoImg && logoImg.src) {
                await new Promise((resolve, reject) => {
                    if (logoImg.complete && logoImg.naturalHeight !== 0) {
                        resolve();
                    } else {
                        logoImg.onload = resolve;
                        logoImg.onerror = resolve; // Continue even if logo fails
                        setTimeout(resolve, 1000); // Timeout after 1s
                    }
                });
            }

            // Wait for layout to update
            await new Promise(resolve => setTimeout(resolve, 500));

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff',
                allowTaint: false,
                imageTimeout: 20000,
                onclone: (clonedDoc) => {
                    // Ensure logo loads in cloned document
                    const clonedElement = clonedDoc.querySelector('.print-area');
                    if (clonedElement) {
                        clonedElement.style.width = a4WidthPx + 'px';
                        clonedElement.style.maxWidth = a4WidthPx + 'px';
                        clonedElement.style.margin = '0 auto';
                        clonedElement.style.padding = '32px';
                        
                        const clonedLogo = clonedElement.querySelector('img');
                        if (clonedLogo && clonedLogo.src) {
                            clonedLogo.style.display = 'block';
                        }
                    }
                }
            });

            // Restore original styles
            element.style.width = originalWidth;
            element.style.maxWidth = originalMaxWidth;
            element.style.margin = originalMargin;
            element.style.padding = originalPadding;

            const imgData = canvas.toDataURL('image/png', 1.0);
            const pdf = new jsPDF({
                orientation: 'portrait',
                unit: 'mm',
                format: 'a4'
            });

            const a4Width = 210;
            const a4Height = 297;
            const pixelsPerMm = canvas.width / a4Width;
            const imgHeightMm = canvas.height / pixelsPerMm;

            // Only add one page - fit content to single page
            if (imgHeightMm <= a4Height) {
                pdf.addImage(imgData, 'PNG', 0, 0, a4Width, imgHeightMm, undefined, 'FAST');
            } else {
                // If content is taller than one page, scale it down to fit
                const scale = a4Height / imgHeightMm;
                pdf.addImage(imgData, 'PNG', 0, 0, a4Width, a4Height, undefined, 'FAST');
            }

            const pdfBlob = pdf.output('blob');
            const file = new File([pdfBlob], filename, { type: 'application/pdf' });

            const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
            const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

            if (isIOS && isStandalone && navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                try {
                    await navigator.share({
                        title: `Payment Receipt`,
                        text: `Payment Receipt for ${getClientName(selectedPaymentForView)}`,
                        files: [file]
                    });
                } catch (shareError) {
                    if (shareError.name !== 'AbortError') {
                        // Fallback to download
                        const url = URL.createObjectURL(pdfBlob);
                        const link = document.createElement('a');
                        link.href = url;
                        link.download = filename;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    }
                }
            } else {
                // Download PDF
                const url = URL.createObjectURL(pdfBlob);
                const link = document.createElement('a');
                link.href = url;
                link.download = filename;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('PDF generation error:', error);
                alert('Failed to generate PDF. Please try again.');
            }
        } finally {
            setIsGeneratingReceiptPDF(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <style>{`
                @media print {
                    /* Hide everything except print area */
                    body > *:not(.print-area-container) {
                        display: none !important;
                    }
                    .print-area-container {
                        display: block !important;
                        position: relative !important;
                    }
                    .print-area {
                        position: relative !important;
                        left: auto !important;
                        top: auto !important;
                        width: 100% !important;
                        max-width: 794px !important;
                        margin: 0 auto !important;
                        padding: 20px !important;
                        background: white !important;
                        page-break-after: avoid;
                        page-break-inside: avoid;
                    }
                    /* Hide modal overlay and buttons */
                    .fixed,
                    button,
                    .bg-black,
                    .bg-opacity-50,
                    .no-print {
                        display: none !important;
                    }
                    @page {
                        margin: 1cm;
                        size: A4;
                    }
                }
            `}</style>
            <div className="mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Payments</h1>
                </div>
            </div>

            {feedback.message && (
                <div className={`mb-6 p-4 rounded-md ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedback.message}
                </div>
            )}

            {/* Client Filter */}
            <div className="bg-white p-4 rounded-lg shadow-lg mb-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 w-full sm:w-auto">
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Filter by Client:</label>
                        <select
                            value={clientFilter}
                            onChange={(e) => setClientFilter(e.target.value)}
                            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Clients</option>
                            {clients.map(client => (
                                <option key={client.id} value={client.id}>{client.name}</option>
                            ))}
                        </select>
                        <label className="text-sm font-medium text-gray-700 whitespace-nowrap">Payment Status:</label>
                        <select
                            value={paymentStatusFilter}
                            onChange={(e) => setPaymentStatusFilter(e.target.value)}
                            className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Payments</option>
                            <option value="unpaid">Unpaid Invoices</option>
                            <option value="partial">Partially Paid</option>
                            <option value="paid">Fully Paid (Last Paid First)</option>
                        </select>
                    </div>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => {
                                setShowAddForm(true);
                                setPayFromAccount(false);
                            }}
                            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg shadow-md text-sm sm:text-base"
                        >
                            Add Payment
                        </button>
                    </div>
                </div>
            </div>

            {/* Add/Edit Payment Form Modal */}
            {showAddForm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">{editingPayment ? 'Edit Payment' : 'Add New Payment'}</h2>
                                    {formData.clientId && selectedClient && (
                                        <p className="text-indigo-100 text-sm mt-1">
                                            {selectedClient.name} {formData.documentId ? `- Invoice #${documents.find(d => d.id === formData.documentId)?.documentNumber || ''}` : ''}
                                        </p>
                                    )}
                                </div>
                                <button
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setEditingPayment(null);
                                        setFormData({
                                            clientId: '',
                                            documentId: '',
                                            amount: '',
                                            paymentDate: new Date().toISOString().split('T')[0],
                                            paymentMethod: 'cash',
                                            notes: ''
                                        });
                                        setPayFromAccount(false);
                                        setSelectedClient(null);
                                        setClientSearchTerm('');
                                    }}
                                    className="text-white hover:text-gray-200 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1">
                            {/* Client Balance Summary */}
                            {formData.clientId && (
                                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-4 rounded-lg mb-6 border-2 border-blue-200">
                                    <div className="grid grid-cols-2 gap-4 text-sm">
                                        <div>
                                            <p className="text-gray-600 font-medium mb-1">Client Balance</p>
                                            <p className="text-2xl font-bold text-blue-600">${getClientAccountBalance(formData.clientId).toFixed(2)}</p>
                                        </div>
                                        {formData.documentId && (
                                            <div>
                                                <p className="text-gray-600 font-medium mb-1">Outstanding</p>
                                                <p className="text-2xl font-bold text-red-600">${getOutstandingAmount(formData.documentId).toFixed(2)}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Payment Source Selection */}
                            {formData.clientId && formData.documentId && getClientAccountBalance(formData.clientId) > 0 && (
                                <div className="mb-6 bg-blue-50 border-2 border-blue-200 rounded-lg p-4">
                                    <p className="text-sm font-semibold text-blue-900 mb-3">Payment Source</p>
                                    <div className="space-y-2">
                                        <label className="flex items-center cursor-pointer">
                                            <input
                                                type="radio"
                                                name="paymentSource"
                                                checked={!payFromAccount}
                                                onChange={() => setPayFromAccount(false)}
                                                className="mr-2"
                                            />
                                            <span className="text-sm text-gray-700">New Payment (Cash/Bank Transfer/etc.)</span>
                                        </label>
                                        <label className="flex items-center cursor-pointer">
                                            <input
                                                type="radio"
                                                name="paymentSource"
                                                checked={payFromAccount}
                                                onChange={() => setPayFromAccount(true)}
                                                className="mr-2"
                                            />
                                            <span className="text-sm text-gray-700">
                                                Settle from Client Balance (${getClientAccountBalance(formData.clientId).toFixed(2)} available)
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div ref={clientDropdownRef}>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Client *</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        placeholder="Search clients by name, email, or location..."
                                        value={selectedClient ? selectedClient.name : clientSearchTerm}
                                        onChange={(e) => {
                                            setClientSearchTerm(e.target.value);
                                            setSelectedClient(null);
                                            setFormData(prev => ({ ...prev, clientId: '', documentId: '' }));
                                            setIsClientDropdownVisible(true);
                                        }}
                                        onFocus={() => setIsClientDropdownVisible(true)}
                                        required
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                    {isClientDropdownVisible && (
                                        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-300 rounded-md shadow-lg max-h-60 overflow-y-auto">
                                            {clients
                                                .filter(client => {
                                                    // Only show clients with unpaid invoices
                                                    const unpaidInvoices = getClientDocuments(client.id).filter(doc => {
                                                        const paid = payments.filter(p => p.documentId === doc.id).reduce((sum, p) => sum + p.amount, 0);
                                                        return paid < doc.total;
                                                    });
                                                    const hasUnpaidInvoices = unpaidInvoices.length > 0;
                                                    
                                                    // Also filter by search term
                                                    const matchesSearch = client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                        (client.email && client.email.toLowerCase().includes(clientSearchTerm.toLowerCase())) ||
                                                        (client.location && client.location.toLowerCase().includes(clientSearchTerm.toLowerCase()));
                                                    
                                                    return hasUnpaidInvoices && matchesSearch;
                                                })
                                                .map(client => {
                                                    const balance = getClientAccountBalance(client.id);
                                                    const unpaidInvoices = getClientDocuments(client.id).filter(doc => {
                                                        const paid = payments.filter(p => p.documentId === doc.id).reduce((sum, p) => sum + p.amount, 0);
                                                        return paid < doc.total;
                                                    });
                                                    const totalOutstanding = unpaidInvoices.reduce((sum, doc) => {
                                                        const paid = payments.filter(p => p.documentId === doc.id).reduce((sum, p) => sum + p.amount, 0);
                                                        return sum + (doc.total - paid);
                                                    }, 0);
                                                    
                                                    return (
                                                        <div
                                                            key={client.id}
                                                            onClick={() => {
                                                                setSelectedClient(client);
                                                                setClientSearchTerm(client.name);
                                                                handleClientChangeWithAutoFill(client.id);
                                                                setIsClientDropdownVisible(false);
                                                            }}
                                                            className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                                                        >
                                                            <div className="font-medium">{client.name}</div>
                                                            <div className="text-sm text-gray-600">
                                                                {client.email && `${client.email} | `}
                                                                {client.location && `${client.location} | `}
                                                                <span className="text-red-600 font-semibold">Outstanding: ${totalOutstanding.toFixed(2)}</span>
                                                                {balance > 0 && <span className="text-green-600 font-semibold ml-2">Balance: ${balance.toFixed(2)}</span>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            {clients.filter(client => {
                                                const unpaidInvoices = getClientDocuments(client.id).filter(doc => {
                                                    const paid = payments.filter(p => p.documentId === doc.id).reduce((sum, p) => sum + p.amount, 0);
                                                    return paid < doc.total;
                                                });
                                                const hasUnpaidInvoices = unpaidInvoices.length > 0;
                                                const matchesSearch = client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                    (client.email && client.email.toLowerCase().includes(clientSearchTerm.toLowerCase())) ||
                                                    (client.location && client.location.toLowerCase().includes(clientSearchTerm.toLowerCase()));
                                                return hasUnpaidInvoices && matchesSearch;
                                            }).length === 0 && (
                                                <div className="p-3 text-gray-500 text-center">No clients with unpaid invoices found</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Invoice (Optional - Leave empty to add to client account)
                                </label>
                                <select
                                    name="documentId"
                                    value={formData.documentId}
                                    onChange={(e) => handleDocumentChange(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    disabled={!formData.clientId}
                                >
                                    <option value="">-- No Invoice (Add to Client Account) --</option>
                                    {getFilteredDocuments(formData.clientId).length === 0 && formData.clientId ? (
                                        <option value="" disabled>No unpaid invoices for this client</option>
                                    ) : (
                                        getFilteredDocuments(formData.clientId).map(doc => {
                                            const docInfo = getDocumentInfo(doc.id);
                                            const outstanding = getOutstandingAmount(doc.id);
                                            return (
                                                <option key={doc.id} value={doc.id}>
                                                    {docInfo.number} - ${docInfo.total.toFixed(2)} (Due: ${outstanding.toFixed(2)})
                                                </option>
                                            );
                                        })
                                    )}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.documentId
                                        ? '✓ Payment will be allocated directly to the selected invoice'
                                        : '→ Payment will be added to client account balance for later allocation'}
                                </p>
                                {!formData.clientId && (
                                    <p className="text-xs text-yellow-600 mt-1">
                                        ⚠ Please select a client first to see their unpaid invoices
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Amount * 
                                    {formData.documentId && (
                                        <span className="text-xs text-gray-500 ml-2">
                                            (Max: ${getOutstandingAmount(formData.documentId).toFixed(2)})
                                        </span>
                                    )}
                                    {payFromAccount && formData.clientId && (
                                        <span className="text-xs text-blue-600 ml-2">
                                            (Available Balance: ${getClientAccountBalance(formData.clientId).toFixed(2)})
                                        </span>
                                    )}
                                </label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    min="0.01"
                                    max={payFromAccount && formData.clientId ? getClientAccountBalance(formData.clientId) : undefined}
                                    required
                                    className={`w-full px-3 py-2 border rounded-md focus:outline-none focus:ring-2 ${
                                        payFromAccount && formData.clientId && formData.amount && 
                                        parseFloat(formData.amount) > getClientAccountBalance(formData.clientId)
                                            ? 'border-red-500 focus:ring-red-500' 
                                            : 'border-gray-300 focus:ring-indigo-500'
                                    }`}
                                    placeholder="0.00"
                                />
                                {payFromAccount && formData.clientId && formData.amount && 
                                 parseFloat(formData.amount) > getClientAccountBalance(formData.clientId) && (
                                    <p className="text-xs text-red-600 mt-1 font-medium">
                                        ⚠ Amount exceeds client balance! Available: ${getClientAccountBalance(formData.clientId).toFixed(2)}
                                    </p>
                                )}
                                {formData.documentId && formData.amount && !payFromAccount && 
                                 parseFloat(formData.amount) > getOutstandingAmount(formData.documentId) && (
                                    <p className="text-xs text-blue-600 mt-1 font-medium">
                                        ⓘ Excess amount (${(parseFloat(formData.amount) - getOutstandingAmount(formData.documentId)).toFixed(2)}) will be added to client account
                                    </p>
                                )}
                                {formData.documentId && (
                                    <p className="text-xs text-gray-500 mt-1">
                                        Outstanding amount: ${getOutstandingAmount(formData.documentId).toFixed(2)}
                                    </p>
                                )}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date *</label>
                                <input
                                    type="date"
                                    name="paymentDate"
                                    value={formData.paymentDate}
                                    onChange={handleInputChange}
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
                                <select
                                    name="paymentMethod"
                                    value={formData.paymentMethod}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="cash">Cash</option>
                                    <option value="bank_transfer">Bank Transfer</option>
                                    <option value="check">Check</option>
                                    <option value="credit_card">Credit Card</option>
                                    <option value="other">Other</option>
                                </select>
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                            <textarea
                                name="notes"
                                value={formData.notes}
                                onChange={handleInputChange}
                                rows={3}
                                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                placeholder="Additional notes"
                            />
                        </div>

                                <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4 pt-4 border-t mt-4">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowAddForm(false);
                                            setEditingPayment(null);
                                            setFormData({
                                                clientId: '',
                                                documentId: '',
                                                amount: '',
                                                paymentDate: new Date().toISOString().split('T')[0],
                                                paymentMethod: 'cash',
                                                notes: ''
                                            });
                                            setPayFromAccount(false);
                                            setSelectedClient(null);
                                            setClientSearchTerm('');
                                        }}
                                        className="w-full sm:w-auto px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        disabled={loading || isSubmitting}
                                        className="w-full sm:w-auto px-6 py-2 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-md hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed font-medium"
                                    >
                                        {loading || isSubmitting ? 'Processing...' : (editingPayment ? 'Update Payment' : payFromAccount && formData.documentId ? 'Settle Payment' : 'Add Payment')}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* Client Balances Summary */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden mb-6">
                <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
                    <h2 className="text-lg font-semibold text-gray-800">Client Account Balances</h2>
                    <button
                        onClick={() => setShowClientBalances(!showClientBalances)}
                        className="text-indigo-600 hover:text-indigo-800 text-sm font-medium"
                    >
                        {showClientBalances ? 'Hide' : 'Show'}
                    </button>
                </div>
                {showClientBalances && (
                    <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-gray-200">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Unallocated Balance</th>
                                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Total Outstanding</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Unpaid Invoices</th>
                                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-200">
                                {loading ? (
                                    <tr>
                                        <td colSpan="5">
                                            <TableSkeleton rows={3} columns={5} />
                                        </td>
                                    </tr>
                                ) : (
                                    clients
                                        .filter(client => getClientAccountBalance(client.id) > 0)
                                        .map(client => {
                                        const balance = getClientAccountBalance(client.id);
                                        const outstanding = getClientOutstandingAmount(client.id);
                                        const unpaidInvoices = getClientDocuments(client.id).filter(doc => {
                                            const paid = payments.filter(p => p.documentId === doc.id).reduce((sum, p) => sum + p.amount, 0);
                                            return paid < doc.total;
                                        });

                                        return (
                                            <tr key={client.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                    {client.name}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-bold text-green-600 text-right">
                                                    ${balance.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-semibold text-red-600 text-right">
                                                    ${outstanding.toFixed(2)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">
                                                    {unpaidInvoices.length}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-center">
                                                    {balance > 0 && outstanding > 0 && (
                                                        <span className="text-indigo-600 font-medium">Use "Add Payment" to settle</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                                {!loading && clients.filter(client => getClientAccountBalance(client.id) > 0).length === 0 && (
                                    <tr>
                                        <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                                            No clients with unallocated balance
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Client Stats when filtering */}
            {clientFilter !== 'all' && (
                <div className="bg-gradient-to-r from-indigo-50 to-blue-50 border border-indigo-200 rounded-lg p-4 mb-6">
                    <h3 className="text-lg font-semibold text-indigo-900 mb-3">
                        {loading ? 'Loading...' : (clients.find(c => c.id === clientFilter)?.name || 'Client')} - Payment Summary
                    </h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Total Paid</p>
                            <p className="text-xl font-bold text-green-600">
                                ${getClientPayments(clientFilter).reduce((sum, p) => sum + p.amount, 0).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Unallocated Balance</p>
                            <p className="text-xl font-bold text-blue-600">
                                ${getClientAccountBalance(clientFilter).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Total Outstanding</p>
                            <p className="text-xl font-bold text-red-600">
                                ${getClientOutstandingAmount(clientFilter).toFixed(2)}
                            </p>
                        </div>
                        <div className="bg-white rounded-lg p-3 shadow-sm">
                            <p className="text-xs text-gray-600">Payments Count</p>
                            <p className="text-xl font-bold text-gray-800">
                                {getClientPayments(clientFilter).length}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Payments List */}
            <div className="bg-white rounded-lg shadow-lg overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                        <h2 className="text-lg font-semibold text-gray-800">Payment History</h2>
                        <input
                            type="text"
                            placeholder="Search payments..."
                            value={paymentSearchTerm}
                            onChange={(e) => setPaymentSearchTerm(e.target.value)}
                            className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Client</th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Type</th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Invoice</th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Method</th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="7">
                                        <TableSkeleton rows={5} columns={7} />
                                    </td>
                                </tr>
                            ) : filteredPayments.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                                        {paymentSearchTerm ? 'No payments found matching your search.' : 'No payments found. Add your first payment above.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredPayments.map(payment => {
                                const clientName = getClientName(payment);
                                const isAllocated = !!payment.documentId;

                                return (
                                    <tr 
                                        key={payment.id} 
                                        className="hover:bg-indigo-50 transition-colors cursor-pointer"
                                        onClick={() => {
                                            setSelectedPaymentForView(payment);
                                            setShowPaymentReceipt(true);
                                        }}
                                    >
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : 'N/A'}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {clientName}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                isAllocated ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                                            }`}>
                                                {isAllocated ? 'Invoice Payment' : 'Client Account'}
                                            </span>
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {payment.invoiceNumber || '-'}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                                            ${payment.amount.toFixed(2)}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                                            {(payment.paymentMethod || '').replace('_', ' ')}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => {
                                                        setEditingPayment(payment);
                                                        const client = clients.find(c => c.id === payment.clientId);
                                                        if (client) {
                                                            setSelectedClient(client);
                                                            setClientSearchTerm(client.name);
                                                        }
                                                        setFormData({
                                                            clientId: payment.clientId,
                                                            documentId: payment.documentId || '',
                                                            amount: payment.amount,
                                                            paymentDate: new Date(payment.paymentDate).toISOString().split('T')[0],
                                                            paymentMethod: payment.paymentMethod || 'cash',
                                                            notes: payment.notes || ''
                                                        });
                                                        setShowAddForm(true);
                                                    }}
                                                    className="text-indigo-600 hover:text-indigo-900 text-xs sm:text-sm px-2 py-1 rounded hover:bg-indigo-50"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePayment(payment.id)}
                                                    disabled={deletingPaymentIds.has(payment.id)}
                                                    className="text-red-600 hover:text-red-900 text-xs sm:text-sm px-2 py-1 rounded hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    {deletingPaymentIds.has(payment.id) ? 'Deleting...' : 'Delete'}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }))}
                        </tbody>
                    </table>
                </div>

                {/* Load More Button */}
                {hasMorePayments && !debouncedPaymentSearch && (
                    <div className="px-4 sm:px-6 py-4 border-t border-gray-200 text-center">
                        <button
                            onClick={() => fetchData(false)}
                            disabled={loading}
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm sm:text-base disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Loading...' : 'Load More Payments'}
                        </button>
                    </div>
                )}
                {!hasMorePayments && filteredPayments.length < allFilteredPayments.length && (
                    <div className="px-4 sm:px-6 py-4 border-t border-gray-200 text-center">
                        <button
                            onClick={() => setDisplayedPaymentsLimit(prev => prev + 20)}
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm sm:text-base"
                        >
                            Show More ({allFilteredPayments.length - filteredPayments.length} remaining)
                        </button>
                    </div>
                )}
            </div>


            {/* Payment Receipt Modal */}
            {showPaymentReceipt && selectedPaymentForView && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">Payment Receipt</h2>
                                    <p className="text-green-100 text-sm mt-1">
                                        Payment #{selectedPaymentForView.id.substring(0, 8)}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowPaymentReceipt(false);
                                        setSelectedPaymentForView(null);
                                    }}
                                    className="text-white hover:text-gray-200 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 print-area-container">
                            <div ref={receiptPrintRef} className="print-area bg-white p-6 rounded-lg" style={{ maxWidth: '794px', margin: '0 auto' }}>
                                {/* Company Info */}
                                <div className="text-center mb-6 border-b pb-4">
                                    {userSettings?.logo && (
                                        <div className="mb-4 flex justify-center">
                                            <img 
                                                src={userSettings.logo} 
                                                alt="Company Logo" 
                                                className="h-16 w-auto max-w-xs"
                                                onLoad={(e) => {
                                                    // Ensure logo is loaded before PDF generation
                                                    e.target.style.display = 'block';
                                                }}
                                                onError={(e) => {
                                                    e.target.style.display = 'none';
                                                }}
                                            />
                                        </div>
                                    )}
                                    <h1 className="text-2xl font-bold text-gray-800">{userSettings?.companyName || 'Company Name'}</h1>
                                    {userSettings?.companyAddress && (
                                        <p className="text-gray-600 text-sm mt-1">{userSettings.companyAddress}</p>
                                    )}
                                    {userSettings?.companyPhone && (
                                        <p className="text-gray-600 text-sm">{userSettings.companyPhone}</p>
                                    )}
                                </div>

                                {/* Receipt Title */}
                                <h2 className="text-xl font-bold text-gray-800 mb-4 text-center">PAYMENT RECEIPT</h2>

                                {/* Payment Details */}
                                <div className="space-y-3 mb-6">
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Receipt Number:</span>
                                        <span className="font-semibold">{selectedPaymentForView.id.substring(0, 8).toUpperCase()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Date:</span>
                                        <span className="font-semibold">{new Date(selectedPaymentForView.paymentDate).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Client:</span>
                                        <span className="font-semibold">{getClientName(selectedPaymentForView)}</span>
                                    </div>
                                    {selectedPaymentForView.invoiceNumber && (
                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Invoice Number:</span>
                                            <span className="font-semibold">{selectedPaymentForView.invoiceNumber}</span>
                                        </div>
                                    )}
                                    <div className="flex justify-between">
                                        <span className="text-gray-600">Payment Method:</span>
                                        <span className="font-semibold capitalize">{(selectedPaymentForView.paymentMethod || '').replace('_', ' ')}</span>
                                    </div>
                                    <div className="flex justify-between border-t pt-3 mt-3">
                                        <span className="text-lg font-bold text-gray-800">Amount Paid:</span>
                                        <span className="text-lg font-bold text-green-600">${selectedPaymentForView.amount.toFixed(2)}</span>
                                    </div>
                                    {selectedPaymentForView.notes && (
                                        <div className="mt-4 pt-4 border-t">
                                            <p className="text-gray-600 text-sm"><strong>Notes:</strong></p>
                                            <p className="text-gray-700 text-sm">{selectedPaymentForView.notes}</p>
                                        </div>
                                    )}
                                </div>

                                {/* Footer */}
                                <div className="mt-8 pt-4 border-t text-center text-gray-500 text-xs">
                                    <p>Thank you for your payment!</p>
                                    <p className="mt-2">{userSettings?.companyName || 'Company Name'}</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
                            <button
                                onClick={() => {
                                    setShowPaymentReceipt(false);
                                    setSelectedPaymentForView(null);
                                }}
                                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                            >
                                Close
                            </button>
                            <button
                                onClick={() => window.print()}
                                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-all font-medium shadow-md"
                            >
                                Print
                            </button>
                            {selectedPaymentForView?.documentId && navigateTo && (
                                <button
                                    onClick={async () => {
                                        const doc = documents.find(d => d.id === selectedPaymentForView.documentId);
                                        if (doc) {
                                            setShowPaymentReceipt(false);
                                            setSelectedPaymentForView(null);
                                            // Fetch full document and navigate
                                            try {
                                                const fullDoc = await documentsAPI.getById(doc.id);
                                                navigateTo('viewDocument', fullDoc);
                                            } catch (error) {
                                                console.error('Error fetching document:', error);
                                                navigateTo('viewDocument', doc);
                                            }
                                        }
                                    }}
                                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-all font-medium shadow-md"
                                >
                                    View {documents.find(d => d.id === selectedPaymentForView.documentId)?.type === 'INVOICE' ? 'Invoice' : 'Proforma'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentsPage;
