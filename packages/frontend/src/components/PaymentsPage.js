import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { paymentsAPI, clientsAPI, documentsAPI, settingsAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const PaymentsPage = () => {
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
    const [clientFilter, setClientFilter] = useState('all');
    const [showClientSettlement, setShowClientSettlement] = useState(false);
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
    const [displayedPaymentsLimit, setDisplayedPaymentsLimit] = useState(50);
    const [userSettings, setUserSettings] = useState(null);
    const [isGeneratingReceiptPDF, setIsGeneratingReceiptPDF] = useState(false);
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

    // Fetch all data
    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [paymentsData, clientsData, documentsData] = await Promise.all([
                paymentsAPI.getAll(),
                clientsAPI.getAll(),
                documentsAPI.getAll('invoice') // Only fetch invoices
            ]);

            setPayments(paymentsData);
            setClients(clientsData);
            setDocuments(documentsData);
        } catch (error) {
            console.error('Error fetching data:', error);
            setFeedback({ type: 'error', message: 'Failed to load data' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePayment = async (paymentId) => {
        if (!window.confirm('Are you sure you want to delete this payment?')) return;

        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            await paymentsAPI.delete(paymentId);
            setFeedback({ type: 'success', message: 'Payment deleted successfully!' });
            await fetchData(); // Refresh data
        } catch (error) {
            console.error('Error deleting payment:', error);
            setFeedback({ type: 'error', message: 'Failed to delete payment' });
        } finally {
            setLoading(false);
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
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            // Validate required fields
            if (!formData.clientId || !formData.amount) {
                setFeedback({ type: 'error', message: 'Please select a client and enter an amount.' });
                setLoading(false);
                return;
            }

            if (parseFloat(formData.amount) <= 0) {
                setFeedback({ type: 'error', message: 'Payment amount must be greater than 0.' });
                setLoading(false);
                return;
            }

            const client = clients.find(c => c.id === formData.clientId);
            const clientName = client ? client.name : '';

            let invoiceNumber = '';
            if (formData.documentId) {
                const doc = documents.find(d => d.id === formData.documentId);
                invoiceNumber = doc ? doc.documentNumber : '';
            }

            const paymentData = {
                clientId: formData.clientId,
                clientName: clientName,
                documentId: formData.documentId || null,
                invoiceNumber: invoiceNumber,
                amount: parseFloat(formData.amount),
                paymentDate: new Date(formData.paymentDate).toISOString(),
                paymentMethod: formData.paymentMethod,
                notes: formData.notes || ''
            };

            if (editingPayment) {
                await paymentsAPI.update(editingPayment.id, paymentData);
                setFeedback({ type: 'success', message: 'Payment updated successfully!' });
            } else {
                await paymentsAPI.create(paymentData);
                if (formData.documentId) {
                    setFeedback({ type: 'success', message: 'Payment added and allocated to invoice successfully!' });
                } else {
                    setFeedback({ type: 'success', message: 'Payment added to client account successfully!' });
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
            setSelectedClient(null);
            setClientSearchTerm('');
            setShowAddForm(false);
            setEditingPayment(null);

            await fetchData(); // Refresh data
        } catch (error) {
            console.error('Error saving payment:', error);
            setFeedback({ type: 'error', message: 'Failed to save payment' });
        } finally {
            setLoading(false);
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
            return documents.filter(doc =>
                doc.type === 'invoice' &&
                doc.status !== 'cancelled' &&
                doc.status !== 'paid'
            );
        }

        return documents.filter(doc =>
            doc.type === 'invoice' &&
            doc.clientId === clientId &&
            doc.status !== 'cancelled' &&
            doc.status !== 'paid'
        );
    };

    // Memoized filtered payments
    const filteredPayments = useMemo(() => {
        let filtered = [...payments];

        // Filter by client if selected
        if (clientFilter !== 'all') {
            filtered = filtered.filter(payment => payment.clientId === clientFilter);
        }

        // Filter by search term if provided
        if (debouncedPaymentSearch) {
            const search = debouncedPaymentSearch.toLowerCase();
            filtered = filtered.filter(payment => {
                const clientName = getClientName(payment).toLowerCase();
                const amount = payment.amount.toString();
                const method = (payment.paymentMethod || '').toLowerCase();
                const notes = (payment.notes || '').toLowerCase();
                const invoiceNumber = (payment.invoiceNumber || '').toLowerCase();

                return clientName.includes(search) ||
                       amount.includes(search) ||
                       method.includes(search) ||
                       notes.includes(search) ||
                       invoiceNumber.includes(search);
            });
        }

        // Sort by date (newest first)
        filtered.sort((a, b) => {
            const dateA = new Date(a.paymentDate);
            const dateB = new Date(b.paymentDate);
            return dateB - dateA;
        });

        return filtered.slice(0, displayedPaymentsLimit);
    }, [payments, clientFilter, debouncedPaymentSearch, displayedPaymentsLimit, clients, documents]);

    // Memoized client payments lookup
    const getClientPayments = useCallback((clientId) => {
        return payments.filter(payment => payment.clientId === clientId);
    }, [payments]);

    // Memoized client documents lookup
    const getClientDocuments = useCallback((clientId) => {
        return documents.filter(doc =>
            doc.type === 'invoice' &&
            doc.clientId === clientId &&
            doc.status !== 'cancelled'
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

    const handleSettleDocument = async (clientId, documentId, amount) => {
        if (settlementInProgress) return;

        try {
            setSettlementInProgress(true);
            setLoading(true);

            const clientBalance = getClientAccountBalance(clientId);
            const settleAmount = parseFloat(amount);

            if (clientBalance < settleAmount) {
                setFeedback({
                    type: 'error',
                    message: `Insufficient client balance. Available: $${clientBalance.toFixed(2)}, Required: $${settleAmount.toFixed(2)}`
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

            await fetchData(); // Refresh data
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

        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

        if (isIOS && isStandalone && navigator.share) {
            try {
                setIsGeneratingReceiptPDF(true);
                const filename = `Payment-Receipt-${selectedPaymentForView.id.substring(0, 8)}.pdf`;
                const element = receiptPrintRef.current;
                const a4WidthPx = 794;

                element.style.width = a4WidthPx + 'px';
                element.style.maxWidth = a4WidthPx + 'px';
                element.style.margin = '0';
                element.style.padding = '32px';
                element.offsetHeight;

                await new Promise(resolve => setTimeout(resolve, 300));

                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    allowTaint: true,
                    imageTimeout: 15000
                });

                const imgData = canvas.toDataURL('image/png', 1.0);
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                const a4Width = 210;
                const pixelsPerMm = canvas.width / a4Width;
                const imgHeightMm = canvas.height / pixelsPerMm;
                pdf.addImage(imgData, 'PNG', 0, 0, a4Width, Math.min(imgHeightMm, 297), undefined, 'FAST');

                const pdfBlob = pdf.output('blob');
                const file = new File([pdfBlob], filename, { type: 'application/pdf' });

                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `Payment Receipt`,
                        text: `Payment Receipt for ${getClientName(selectedPaymentForView)}`,
                        files: [file]
                    });
                } else {
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
        } else {
            window.print();
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
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
                    </div>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        <button
                            onClick={() => setShowClientSettlement(true)}
                            className="flex-1 sm:flex-none bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg shadow-md text-sm sm:text-base"
                        >
                            Client Settlement
                        </button>
                        <button
                            onClick={() => setShowAddForm(true)}
                            className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg shadow-md text-sm sm:text-base"
                        >
                            Add Payment
                        </button>
                    </div>
                </div>
            </div>

            {/* Add/Edit Payment Form */}
            {showAddForm && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 mb-4">
                        {editingPayment ? 'Edit Payment' : 'Add New Payment'}
                    </h2>
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
                                                .filter(client =>
                                                    client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                    (client.email && client.email.toLowerCase().includes(clientSearchTerm.toLowerCase())) ||
                                                    (client.location && client.location.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                                                )
                                                .map(client => {
                                                    const balance = getClientAccountBalance(client.id);
                                                    return (
                                                        <div
                                                            key={client.id}
                                                            onClick={() => {
                                                                setSelectedClient(client);
                                                                setClientSearchTerm(client.name);
                                                                handleClientChange(client.id);
                                                                setIsClientDropdownVisible(false);
                                                            }}
                                                            className="p-3 hover:bg-gray-100 cursor-pointer border-b"
                                                        >
                                                            <div className="font-medium">{client.name}</div>
                                                            <div className="text-sm text-gray-600">
                                                                {client.email && `${client.email} | `}
                                                                {client.location && `${client.location} | `}
                                                                {balance > 0 && <span className="text-green-600 font-semibold">Balance: ${balance.toFixed(2)}</span>}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            {clients.filter(client =>
                                                client.name.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                (client.email && client.email.toLowerCase().includes(clientSearchTerm.toLowerCase())) ||
                                                (client.location && client.location.toLowerCase().includes(clientSearchTerm.toLowerCase()))
                                            ).length === 0 && (
                                                <div className="p-3 text-gray-500 text-center">No clients found</div>
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
                                    {getFilteredDocuments(formData.clientId).map(doc => {
                                        const docInfo = getDocumentInfo(doc.id);
                                        const outstanding = getOutstandingAmount(doc.id);
                                        return (
                                            <option key={doc.id} value={doc.id}>
                                                {docInfo.number} - ${docInfo.total.toFixed(2)} (Due: ${outstanding.toFixed(2)})
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.documentId
                                        ? '✓ Payment will be allocated directly to the selected invoice'
                                        : '→ Payment will be added to client account balance for later allocation'}
                                </p>
                                <p className="text-xs text-yellow-600 mt-1">
                                    ⚠ Note: Payments cannot be made on proformas, only on invoices
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    min="0.01"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="0.00"
                                />
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

                        <div className="flex flex-col sm:flex-row justify-end gap-2 sm:gap-4">
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
                                    setSelectedClient(null);
                                    setClientSearchTerm('');
                                }}
                                className="w-full sm:w-auto px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 disabled:bg-indigo-300"
                            >
                                {loading ? 'Saving...' : (editingPayment ? 'Update Payment' : 'Add Payment')}
                            </button>
                        </div>
                    </form>
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
                                                        <button
                                                            onClick={() => {
                                                                setSelectedClientForSettlement(client);
                                                                setShowClientSettlement(true);
                                                            }}
                                                            className="text-indigo-600 hover:text-indigo-900 font-medium"
                                                        >
                                                            Settle Invoices
                                                        </button>
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
                                    <tr key={payment.id} className="hover:bg-indigo-50 transition-colors">
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {new Date(payment.paymentDate).toLocaleDateString()}
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
                                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2">
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
                                                    className="text-red-600 hover:text-red-900 text-xs sm:text-sm px-2 py-1 rounded hover:bg-red-50"
                                                >
                                                    Delete
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
                {!debouncedPaymentSearch && filteredPayments.length < payments.length && (
                    <div className="px-4 sm:px-6 py-4 border-t border-gray-200 text-center">
                        <button
                            onClick={() => setDisplayedPaymentsLimit(prev => prev + 50)}
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm sm:text-base"
                        >
                            Load More Payments ({payments.length - filteredPayments.length} remaining)
                        </button>
                    </div>
                )}
            </div>

            {/* Client Settlement Modal */}
            {showClientSettlement && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">Client Settlement</h2>
                                    <p className="text-indigo-100 text-sm mt-1">Allocate client balance to outstanding invoices</p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowClientSettlement(false);
                                        setSelectedClientForSettlement(null);
                                    }}
                                    className="text-white hover:text-gray-200 transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="space-y-6">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">Select Client</label>
                                    <select
                                        value={selectedClientForSettlement?.id || ''}
                                        onChange={(e) => {
                                            const client = clients.find(c => c.id === e.target.value);
                                            setSelectedClientForSettlement(client);
                                        }}
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-lg"
                                    >
                                        <option value="">-- Choose a client to settle invoices --</option>
                                        {clients
                                            .filter(client => getClientAccountBalance(client.id) > 0 || getClientOutstandingAmount(client.id) > 0)
                                            .map(client => {
                                                const balance = getClientAccountBalance(client.id);
                                                const outstanding = getClientOutstandingAmount(client.id);
                                                return (
                                                    <option key={client.id} value={client.id}>
                                                        {client.name} | Balance: ${balance.toFixed(2)} | Outstanding: ${outstanding.toFixed(2)}
                                                    </option>
                                                );
                                            })}
                                    </select>
                                </div>

                                {selectedClientForSettlement && (
                                    <div className="space-y-6">
                                        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-5 rounded-xl border-2 border-indigo-200">
                                            <h3 className="font-bold text-lg text-gray-800 mb-4 flex items-center">
                                                <svg className="w-5 h-5 mr-2 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"></path>
                                                </svg>
                                                {selectedClientForSettlement.name}
                                            </h3>
                                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Available Balance</p>
                                                    <p className="text-2xl font-bold text-green-600">
                                                        ${getClientAccountBalance(selectedClientForSettlement.id).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Total Outstanding</p>
                                                    <p className="text-2xl font-bold text-red-600">
                                                        ${getClientOutstandingAmount(selectedClientForSettlement.id).toFixed(2)}
                                                    </p>
                                                </div>
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Total Invoices</p>
                                                    <p className="text-2xl font-bold text-gray-800">
                                                        {getClientDocuments(selectedClientForSettlement.id).length}
                                                    </p>
                                                </div>
                                                <div className="bg-white rounded-lg p-4 shadow-sm">
                                                    <p className="text-xs text-gray-600 font-medium mb-1">Unpaid Invoices</p>
                                                    <p className="text-2xl font-bold text-orange-600">
                                                        {getClientDocuments(selectedClientForSettlement.id).filter(doc => {
                                                            const paid = payments.filter(p => p.documentId === doc.id).reduce((sum, p) => sum + p.amount, 0);
                                                            return paid < doc.total;
                                                        }).length}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center">
                                                <svg className="w-5 h-5 mr-2 text-indigo-600" fill="currentColor" viewBox="0 0 20 20">
                                                    <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"></path>
                                                    <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd"></path>
                                                </svg>
                                                Click on an invoice to settle it
                                            </h3>
                                            <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                                                {getClientDocuments(selectedClientForSettlement.id)
                                                    .sort((a, b) => {
                                                        const outstandingA = getOutstandingAmount(a.id);
                                                        const outstandingB = getOutstandingAmount(b.id);
                                                        const isPaidA = outstandingA <= 0;
                                                        const isPaidB = outstandingB <= 0;
                                                        if (isPaidA !== isPaidB) return isPaidA ? 1 : -1;
                                                        return outstandingB - outstandingA;
                                                    })
                                                    .map(doc => {
                                                        const outstanding = getOutstandingAmount(doc.id);
                                                        const isPaid = outstanding <= 0;
                                                        const docInfo = getDocumentInfo(doc.id);
                                                        const clientBalance = getClientAccountBalance(selectedClientForSettlement.id);
                                                        const canSettle = Math.min(outstanding, clientBalance);
                                                        const isPartialSettlement = canSettle > 0 && canSettle < outstanding;
                                                        const cannotSettle = clientBalance <= 0;

                                                        return (
                                                            <div
                                                                key={doc.id}
                                                                className={`p-4 rounded-lg border-2 transition-all ${
                                                                    isPaid
                                                                        ? 'bg-green-50 border-green-300 opacity-60'
                                                                        : cannotSettle
                                                                        ? 'bg-gray-50 border-gray-300 opacity-60'
                                                                        : 'bg-white border-orange-300 hover:border-indigo-500 hover:shadow-lg'
                                                                }`}
                                                            >
                                                                <div className="flex items-start justify-between gap-4">
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center gap-2 mb-2 flex-wrap">
                                                                            <span className="px-3 py-1 text-sm font-semibold rounded-full bg-indigo-100 text-indigo-800">
                                                                                Invoice #{docInfo.number}
                                                                            </span>
                                                                            {isPaid && (
                                                                                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                                                    ✓ Paid
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <div className="grid grid-cols-3 gap-3 text-sm mb-3">
                                                                            <div>
                                                                                <span className="text-gray-600">Total:</span>
                                                                                <span className="font-bold ml-2 text-gray-900">${docInfo.total.toFixed(2)}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-gray-600">Paid:</span>
                                                                                <span className="font-bold ml-2 text-green-600">${(docInfo.total - outstanding).toFixed(2)}</span>
                                                                            </div>
                                                                            <div>
                                                                                <span className="text-gray-600">Outstanding:</span>
                                                                                <span className={`font-bold ml-2 ${isPaid ? 'text-green-600' : 'text-red-600'}`}>
                                                                                    ${outstanding.toFixed(2)}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        {!isPaid && canSettle > 0 && (
                                                                            <div className="mt-2">
                                                                                <label className="block text-xs font-medium text-gray-700 mb-1">Settlement Amount</label>
                                                                                <input
                                                                                    type="number"
                                                                                    step="0.01"
                                                                                    min="0.01"
                                                                                    max={canSettle}
                                                                                    value={customSettlementAmounts[doc.id] || canSettle.toFixed(2)}
                                                                                    onChange={(e) => {
                                                                                        setCustomSettlementAmounts({
                                                                                            ...customSettlementAmounts,
                                                                                            [doc.id]: e.target.value
                                                                                        });
                                                                                    }}
                                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                    placeholder="0.00"
                                                                                />
                                                                                <p className="text-xs text-gray-500 mt-1">Max: ${canSettle.toFixed(2)}</p>
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {!isPaid && canSettle > 0 && (
                                                                        <div className="flex-shrink-0">
                                                                            <button
                                                                                onClick={() => {
                                                                                    const settleAmount = customSettlementAmounts[doc.id] ? parseFloat(customSettlementAmounts[doc.id]) : canSettle;
                                                                                    if (settleAmount > 0 && settleAmount <= canSettle) {
                                                                                        handleSettleDocument(selectedClientForSettlement.id, doc.id, settleAmount);
                                                                                    }
                                                                                }}
                                                                                disabled={settlementInProgress}
                                                                                className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white font-semibold rounded-lg hover:from-green-700 hover:to-green-800 shadow-md hover:shadow-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                                                                            >
                                                                                <div className="text-center">
                                                                                    <div className="text-sm">{settlementInProgress ? 'Settling...' : 'Settle'}</div>
                                                                                    <div className="text-lg">${(customSettlementAmounts[doc.id] ? parseFloat(customSettlementAmounts[doc.id]) : canSettle).toFixed(2)}</div>
                                                                                </div>
                                                                            </button>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default PaymentsPage;
