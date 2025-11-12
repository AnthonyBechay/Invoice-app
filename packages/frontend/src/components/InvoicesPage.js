import React, { useState, useEffect, useMemo, useRef } from 'react';
import { documentsAPI, paymentsAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton, ListItemSkeleton } from './LoadingSkeleton';
import Papa from 'papaparse';

const InvoicesPage = ({ navigateTo }) => {
    console.log("InvoicesPage: Component rendering");
    const [invoices, setInvoices] = useState([]);
    const [cancelledInvoices, setCancelledInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [displayLimit, setDisplayLimit] = useState(30);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [showCancelledModal, setShowCancelledModal] = useState(false);
    const [confirmCancel, setConfirmCancel] = useState(null);
    const [showPaymentRefundModal, setShowPaymentRefundModal] = useState(false);
    const [pendingCancelInvoice, setPendingCancelInvoice] = useState(null);

    // Payment modal state
    const [showPaymentModal, setShowPaymentModal] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState(null);
    const [paymentAmount, setPaymentAmount] = useState('');
    const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
    const [paymentMethod, setPaymentMethod] = useState('cash');
    const [paymentReference, setPaymentReference] = useState('');
    const [paymentNote, setPaymentNote] = useState('');
    const [clientBalance, setClientBalance] = useState(0);
    const [payFromAccount, setPayFromAccount] = useState(false);
    const [payments, setPayments] = useState([]);
    const [isSubmittingPayment, setIsSubmittingPayment] = useState(false);
    const fileInputRef = useRef(null);

    // Calculate payment status (moved outside useEffect for reuse in useMemo)
    const getPaymentStatus = (invoice) => {
        const totalPaid = invoice.totalPaid || 0;
        const total = invoice.total || 0;

        if (totalPaid >= total) {
            return { status: 'paid', label: 'Paid', color: 'bg-green-100 text-green-800' };
        } else if (totalPaid > 0) {
            return { status: 'partial', label: `Partial ($${totalPaid.toFixed(2)})`, color: 'bg-yellow-100 text-yellow-800' };
        } else {
            const dateObj = invoice.date instanceof Date ? invoice.date : new Date(invoice.date);
            const daysSinceIssued = Math.floor((new Date() - dateObj) / (1000 * 60 * 60 * 24));
            if (daysSinceIssued > 30) {
                return { status: 'overdue', label: 'Overdue', color: 'bg-red-100 text-red-800' };
            }
            return { status: 'unpaid', label: 'Unpaid', color: 'bg-gray-100 text-gray-800' };
        }
    };

    useEffect(() => {
        console.log("InvoicesPage: useEffect running");
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            console.log("InvoicesPage: Fetching invoices and payments");
            setLoading(true);

            // Fetch invoices and payments in parallel
            const [invoicesData, paymentsData] = await Promise.all([
                documentsAPI.getAll('invoice'),
                paymentsAPI.getAll()
            ]);

            console.log("InvoicesPage: Received", invoicesData.length, "invoices and", paymentsData.length, "payments");

            // Calculate totalPaid for each invoice from payments
            invoicesData.forEach((doc) => {
                const invoicePayments = paymentsData.filter(p => p.documentId === doc.id);
                doc.totalPaid = invoicePayments.reduce((sum, p) => sum + p.amount, 0);
            });

            // Separate active and cancelled invoices
            const activeDocs = [];
            const cancelledDocs = [];

            invoicesData.forEach((doc) => {
                // Convert date strings to Date objects for compatibility
                if (doc.date) {
                    doc.date = new Date(doc.date);
                }

                if (doc.status === 'CANCELLED') {
                    cancelledDocs.push(doc);
                } else {
                    activeDocs.push(doc);
                }
            });

            console.log("InvoicesPage: Processing - active:", activeDocs.length, "cancelled:", cancelledDocs.length);

            // Sort by payment status first (unpaid, partial, paid), then by date (newest first)
            activeDocs.sort((a, b) => {
                const statusA = getPaymentStatus(a);
                const statusB = getPaymentStatus(b);

                // Define priority: unpaid (0) < partial (1) < paid (2)
                const getStatusPriority = (status) => {
                    if (status.status === 'unpaid' || status.status === 'overdue') return 0;
                    if (status.status === 'partial') return 1;
                    return 2; // paid
                };

                const priorityA = getStatusPriority(statusA);
                const priorityB = getStatusPriority(statusB);

                // If different priorities, sort by priority
                if (priorityA !== priorityB) {
                    return priorityA - priorityB;
                }

                // If same priority, sort by date (newest first)
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateB - dateA;
            });

            cancelledDocs.sort((a, b) => {
                const dateA = a.updatedAt ? new Date(a.updatedAt) : (a.createdAt ? new Date(a.createdAt) : new Date());
                const dateB = b.updatedAt ? new Date(b.updatedAt) : (b.createdAt ? new Date(b.createdAt) : new Date());
                return dateB - dateA;
            });

            console.log("InvoicesPage: Setting invoices - active:", activeDocs.length, "cancelled:", cancelledDocs.length);

            // Convert payment dates to Date objects
            paymentsData.forEach(payment => {
                if (payment.paymentDate) {
                    payment.paymentDate = new Date(payment.paymentDate);
                }
                if (payment.settledAt) {
                    payment.settledAt = new Date(payment.settledAt);
                }
            });

            setInvoices(activeDocs);
            setCancelledInvoices(cancelledDocs);
            setPayments(paymentsData);
        } catch (error) {
            console.error("InvoicesPage: Error fetching data:", error);
        } finally {
            setLoading(false);
        }
    };

    // Calculate client account balance (unallocated payments)
    const getClientBalance = (clientId) => {
        const clientPayments = payments.filter(p => p.clientId === clientId && !p.documentId);
        return clientPayments.reduce((sum, p) => sum + p.amount, 0);
    };

    // Handle payment modal
    const openPaymentModal = (invoice) => {
        setSelectedInvoice(invoice);
        const remaining = invoice.total - (invoice.totalPaid || 0);
        const balance = getClientBalance(invoice.client.id);
        setClientBalance(balance);
        setPaymentAmount(remaining.toFixed(2));
        setPaymentNote('');
        setPaymentDate(new Date().toISOString().split('T')[0]);
        setPayFromAccount(false);
        setShowPaymentModal(true);
    };

    // Handle add payment
    const handleAddPayment = async () => {
        // Prevent double submission
        if (isSubmittingPayment) {
            console.log('Payment submission already in progress, ignoring duplicate request');
            return;
        }

        if (!selectedInvoice || !paymentAmount || parseFloat(paymentAmount) <= 0) return;

        setIsSubmittingPayment(true);

        try {
            const amount = parseFloat(paymentAmount);

            const outstanding = selectedInvoice.total - (selectedInvoice.totalPaid || 0);
            const amountToPay = Math.min(amount, outstanding); // Cap to outstanding amount
            const remainder = amount - amountToPay; // Amount that exceeds outstanding

            if (payFromAccount) {
                // Pay from client account balance
                if (clientBalance < amountToPay) {
                    alert(`Insufficient client balance. Available: $${clientBalance.toFixed(2)}, Required: $${amountToPay.toFixed(2)}`);
                    setIsSubmittingPayment(false);
                    return;
                }

                // Get unallocated payments for this client (FIFO)
                const clientPayments = payments.filter(p => p.clientId === selectedInvoice.client.id && !p.documentId);
                clientPayments.sort((a, b) => {
                    const dateA = new Date(a.paymentDate);
                    const dateB = new Date(b.paymentDate);
                    return dateA - dateB;
                });

                // Allocate payments to invoice (FIFO)
                let remainingToSettle = amountToPay;

                for (const payment of clientPayments) {
                    if (remainingToSettle <= 0) break;

                    const amountToAllocate = Math.min(payment.amount, remainingToSettle);

                    if (amountToAllocate === payment.amount) {
                        // Full payment allocated
                        await paymentsAPI.update(payment.id, {
                            documentId: selectedInvoice.id,
                            invoiceNumber: selectedInvoice.documentNumber || '',
                            notes: (payment.notes || '') + ` | Allocated to invoice ${selectedInvoice.documentNumber || selectedInvoice.id}`
                        });
                        remainingToSettle -= amountToAllocate;
                    } else {
                        // Partial payment - split
                        await paymentsAPI.update(payment.id, {
                            amount: amountToAllocate,
                            documentId: selectedInvoice.id,
                            invoiceNumber: selectedInvoice.documentNumber || '',
                            notes: (payment.notes || '') + ` | Partially allocated to invoice ${selectedInvoice.documentNumber || selectedInvoice.id}`
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
                        clientId: selectedInvoice.client.id,
                        clientName: selectedInvoice.clientName || selectedInvoice.client?.name || '',
                        amount: remainder,
                        documentId: null,
                        invoiceNumber: '',
                        paymentDate: new Date(paymentDate).toISOString(),
                        paymentMethod: paymentMethod,
                        notes: (paymentNote || '') + ` | Excess payment added to client account (invoice fully paid)`
                    });
                }
            } else {
                // Add new payment to the payments collection (allocated to this invoice)
                const paymentData = {
                    clientId: selectedInvoice.client.id,
                    clientName: selectedInvoice.clientName || selectedInvoice.client?.name || '',
                    documentId: selectedInvoice.id,
                    invoiceNumber: selectedInvoice.documentNumber || '',
                    amount: amountToPay,
                    paymentDate: new Date(paymentDate).toISOString(),
                    paymentMethod: paymentMethod,
                    notes: paymentNote || ''
                };

                await paymentsAPI.create(paymentData);

                // If there's a remainder, add it to client account
                if (remainder > 0) {
                    await paymentsAPI.create({
                        clientId: selectedInvoice.client.id,
                        clientName: selectedInvoice.clientName || selectedInvoice.client?.name || '',
                        amount: remainder,
                        documentId: null,
                        invoiceNumber: '',
                        paymentDate: new Date(paymentDate).toISOString(),
                        paymentMethod: paymentMethod,
                        notes: (paymentNote || '') + ` | Excess payment added to client account (invoice fully paid)`
                    });
                }
            }

            // Refresh data to get updated payment status
            await fetchData();

            // Reset form and close modal
            setShowPaymentModal(false);
            setSelectedInvoice(null);
            setPaymentAmount('');
            setPaymentNote('');
            setPaymentReference('');
            setPaymentMethod('cash');
            setPaymentDate(new Date().toISOString().split('T')[0]);
            setPayFromAccount(false);
        } catch (error) {
            console.error("Error adding payment: ", error);
            alert("Error adding payment. Please try again.");
        } finally {
            // Re-enable submission after operation completes
            setIsSubmittingPayment(false);
        }
    };

    // Handle cancel payment - redirect to payments page for management
    const handleCancelPayment = async (invoice, paymentIndex) => {
        alert('To manage payments, please go to the Payments page in the sidebar.');
    };

    const handleCancelInvoice = async (invoiceId) => {
        // Check if invoice has payments
        const invoice = invoices.find(inv => inv.id === invoiceId);
        const hasPaidAmount = invoice && (invoice.totalPaid || 0) > 0;

        if (hasPaidAmount) {
            // Show payment refund modal
            setPendingCancelInvoice(invoice);
            setShowPaymentRefundModal(true);
            setConfirmCancel(null);
        } else {
            // No payments, just cancel
            await cancelInvoiceNow(invoiceId, false);
        }
    };

    const [cancellingInvoiceIds, setCancellingInvoiceIds] = useState(new Set());

    const cancelInvoiceNow = async (invoiceId, movePaymentsToClientAccount) => {
        // Prevent double-click
        if (cancellingInvoiceIds.has(invoiceId)) {
            return;
        }

        setCancellingInvoiceIds(prev => new Set(prev).add(invoiceId));

        try {
            await documentsAPI.update(invoiceId, {
                status: 'CANCELLED'
            });

            if (movePaymentsToClientAccount) {
                // Get all payments for this invoice
                const invoicePayments = payments.filter(p => p.documentId === invoiceId);

                // Move payments to client account (unallocate them)
                for (const payment of invoicePayments) {
                    await paymentsAPI.update(payment.id, {
                        documentId: null,
                        invoiceNumber: '',
                        notes: (payment.notes || '') + ' | Moved to client account due to invoice cancellation'
                    });
                }
            }

            // Refresh data
            await fetchData();

            setConfirmCancel(null);
            setShowPaymentRefundModal(false);
            setPendingCancelInvoice(null);
        } catch (error) {
            console.error("Error cancelling invoice: ", error);
            alert("Error cancelling invoice. Please try again.");
        } finally {
            setCancellingInvoiceIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(invoiceId);
                return newSet;
            });
        }
    };

    const handleRestoreInvoice = async (invoiceId) => {
        try {
            await documentsAPI.update(invoiceId, {
                status: 'DRAFT'
            });

            // Refresh data
            await fetchData();
        } catch (error) {
            console.error("Error restoring invoice: ", error);
            alert("Error restoring invoice. Please try again.");
        }
    };

    const handlePermanentDelete = async (invoiceId) => {
        if (!window.confirm('Are you sure you want to permanently delete this invoice? This action cannot be undone.')) {
            return;
        }

        try {
            await documentsAPI.delete(invoiceId);

            // Refresh data
            await fetchData();
        } catch (error) {
            console.error("Error permanently deleting invoice: ", error);
            alert("Error deleting invoice. Please try again.");
        }
    };

    // Filter invoices based on debounced search query
    const filteredInvoices = useMemo(() => {
        return invoices.filter(doc => {
            const search = debouncedSearchQuery.toLowerCase();
            const dateObj = doc.date instanceof Date ? doc.date : new Date(doc.date);
            const dateStr = dateObj.toLocaleDateString();
            const paymentStatus = getPaymentStatus(doc);

            return (
                doc.documentNumber.toLowerCase().includes(search) ||
                doc.client.name.toLowerCase().includes(search) ||
                dateStr.includes(search) ||
                doc.total.toString().includes(search) ||
                paymentStatus.label.toLowerCase().includes(search) ||
                (doc.proformaNumber && doc.proformaNumber.toLowerCase().includes(search))
            );
        });
    }, [invoices, debouncedSearchQuery]);

    // If searching, show all results; otherwise limit to displayLimit (default 30)
    const displayedInvoices = searchQuery ? filteredInvoices : filteredInvoices.slice(0, displayLimit);

    // Calculate only unpaid amount (optimized with useMemo to prevent recalculation)
    const totalUnpaidAmount = useMemo(() => {
        return invoices.reduce((sum, doc) => {
            const totalPaid = doc.totalPaid || 0;
            const unpaid = Math.max(0, (doc.total || 0) - totalPaid);
            return sum + unpaid;
        }, 0);
    }, [invoices]);

    // Export invoices to CSV
    const handleExportCSV = () => {
        const csvData = invoices.map(doc => {
            const itemsJSON = JSON.stringify(doc.items || []);
            const mandaysJSON = doc.mandays ? JSON.stringify(doc.mandays) : '';
            const realMandaysJSON = doc.realMandays ? JSON.stringify(doc.realMandays) : '';

            return {
                'Document Number': doc.documentNumber || '',
                'Client Name': doc.client?.name || doc.clientName || '',
                'Date': (doc.date instanceof Date ? doc.date : new Date(doc.date)).toLocaleDateString(),
                'Subtotal': doc.subtotal || 0,
                'VAT Amount': doc.taxAmount || 0,
                'Total': doc.total || 0,
                'Total Paid': doc.totalPaid || 0,
                'Labor Price': doc.laborPrice || 0,
                'Mandays': mandaysJSON,
                'Real Mandays': realMandaysJSON,
                'Notes': doc.notes || '',
                'Status': doc.status || 'DRAFT',
                'Items JSON': itemsJSON
            };
        });

        const csv = Papa.unparse(csvData);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `invoices_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Import invoices from CSV
    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                try {
                    // Fetch clients and stock items for matching (they should already be imported)
                    let clients = [];
                    try {
                        const { clientsAPI } = await import('../services/api');
                        clients = await clientsAPI.getAll();
                    } catch (e) {
                        console.warn('Could not fetch clients, will match by name only');
                    }
                    
                    let stockItems = [];
                    try {
                        const { stockAPI } = await import('../services/api');
                        stockItems = await stockAPI.getAll();
                    } catch (e) {
                        console.warn('Could not fetch stock items');
                    }

                    const validDocuments = await Promise.all(
                        results.data
                            .filter(row => row['Document Number'] && row['Document Number'].trim() !== '')
                            .map(async (row) => {
                                // Parse items JSON - handle misaligned fields due to date splitting
                                let items = [];
                                try {
                                    // Get all row values to find Items JSON even if misaligned
                                    const allRowValues = Object.values(row);
                                    let itemsJson = row['Items JSON'] || '';
                                    
                                    // Search through ALL fields to find the one containing JSON array
                                    // This handles cases where date splitting causes misalignment
                                    if (!itemsJson || (!itemsJson.trim().startsWith('[') && !itemsJson.trim().startsWith('{'))) {
                                        for (const fieldValue of allRowValues) {
                                            if (fieldValue && typeof fieldValue === 'string') {
                                                const trimmed = fieldValue.trim();
                                                // Check if this looks like a JSON array/object with items
                                                if ((trimmed.startsWith('[') || trimmed.startsWith('{')) &&
                                                    (trimmed.includes('name') || trimmed.includes('qty') || trimmed.includes('unitPrice'))) {
                                                    itemsJson = trimmed;
                                                    console.log('Found Items JSON in misaligned field:', itemsJson);
                                                    break;
                                                }
                                                // Also check for unquoted format: [{name:value,qty:1}]
                                                if (trimmed.includes('name:') && (trimmed.includes('qty:') || trimmed.includes('unitPrice:'))) {
                                                    itemsJson = trimmed;
                                                    console.log('Found Items JSON (unquoted format) in misaligned field:', itemsJson);
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                    
                                    // Clean up the JSON string
                                    itemsJson = itemsJson.trim();
                                    // Remove surrounding quotes if present
                                    if ((itemsJson.startsWith('"') && itemsJson.endsWith('"')) || 
                                        (itemsJson.startsWith("'") && itemsJson.endsWith("'"))) {
                                        itemsJson = itemsJson.slice(1, -1);
                                    }
                                    // Replace escaped quotes
                                    itemsJson = itemsJson.replace(/""/g, '"');
                                    
                                    // Try to parse as JSON
                                    if (itemsJson && itemsJson.startsWith('[')) {
                                        try {
                                            items = JSON.parse(itemsJson);
                                        } catch (e) {
                                            // If parsing fails, try to fix unquoted format
                                            // Pattern: [{name:Flexible 40 cm ,qty:1,unitPrice:4}]
                                            console.log('JSON parse failed, attempting to fix unquoted format:', itemsJson);
                                            // Fix unquoted keys: name: -> "name":
                                            itemsJson = itemsJson.replace(/([{,\[]\s*)(\w+)\s*:/g, '$1"$2":');
                                            // Fix unquoted string values (values that aren't numbers and aren't already quoted)
                                            // Match: : value, or : value} or : value]
                                            itemsJson = itemsJson.replace(/:\s*([^",\d\[\]{}][^,}\]]*?)([,}\]])/g, (match, value, end) => {
                                                const trimmedValue = value.trim();
                                                // If value is not a number and not already quoted
                                                if (trimmedValue && isNaN(parseFloat(trimmedValue))) {
                                                    // Escape any quotes in the value
                                                    const escapedValue = trimmedValue.replace(/"/g, '\\"');
                                                    return ': "' + escapedValue + '"' + end;
                                                }
                                                return match;
                                            });
                                            items = JSON.parse(itemsJson);
                                            console.log('Successfully fixed and parsed JSON:', items);
                                        }
                                    } else if (itemsJson && itemsJson.includes('name')) {
                                        // Try to fix common JSON issues - handle unquoted keys
                                        // First, ensure it's wrapped in array brackets if not
                                        if (!itemsJson.startsWith('[')) {
                                            itemsJson = '[' + itemsJson + ']';
                                        }
                                        // Fix unquoted keys
                                        itemsJson = itemsJson.replace(/([{,\[]\s*)(\w+)\s*:/g, '$1"$2":');
                                        // Fix unquoted string values
                                        itemsJson = itemsJson.replace(/:\s*([^",\d\[\]{}][^,}\]]*?)([,}\]])/g, (match, value, end) => {
                                            const trimmedValue = value.trim();
                                            if (trimmedValue && isNaN(parseFloat(trimmedValue))) {
                                                const escapedValue = trimmedValue.replace(/"/g, '\\"');
                                                return ': "' + escapedValue + '"' + end;
                                            }
                                            return match;
                                        });
                                        items = JSON.parse(itemsJson);
                                    }
                                    
                                    // Ensure items is an array
                                    if (!Array.isArray(items)) {
                                        items = [];
                                    }
                                    
                                    // Filter out empty items
                                    items = items.filter(item => item && (item.name || item.qty || item.quantity));
                                    
                                    console.log('Parsed items:', items.length, items);
                                } catch (e) {
                                    console.error('Error parsing items JSON:', e);
                                    console.warn('Raw value:', row['Items JSON'], 'All row values:', Object.values(row));
                                    items = [];
                                }

                                let mandays = null;
                                let realMandays = null;
                                try {
                                    if (row['Mandays'] && row['Mandays'].trim() !== '') {
                                        mandays = JSON.parse(row['Mandays']);
                                    }
                                } catch (e) { }
                                try {
                                    if (row['Real Mandays'] && row['Real Mandays'].trim() !== '') {
                                        realMandays = JSON.parse(row['Real Mandays']);
                                    }
                                } catch (e) { }

                                // Find client by name (should already be imported)
                                const clientName = (row['Client Name'] || '').trim();
                                let clientId = null;
                                
                                if (clientName && clients.length > 0) {
                                    const existingClient = clients.find(c => 
                                        c.name && c.name.trim().toLowerCase() === clientName.toLowerCase()
                                    );
                                    
                                    if (existingClient) {
                                        clientId = existingClient.id;
                                    }
                                    // Don't create clients - they should already be imported
                                }
                                
                                const documentItems = await Promise.all(items.map(async (item) => {
                                    // Try to match stock item by name - improved matching
                                    let stockId = null;
                                    if (item.name && stockItems.length > 0) {
                                        // Normalize the item name for matching
                                        const normalizeName = (name) => {
                                            return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
                                        };
                                        
                                        const itemNameNormalized = normalizeName(item.name);
                                        
                                        // Try exact match first
                                        let matchedStock = stockItems.find(s => 
                                            s.name && normalizeName(s.name) === itemNameNormalized
                                        );
                                        
                                        // If no exact match, try partial match (contains)
                                        if (!matchedStock) {
                                            matchedStock = stockItems.find(s => 
                                                s.name && normalizeName(s.name).includes(itemNameNormalized) || 
                                                itemNameNormalized.includes(normalizeName(s.name))
                                            );
                                        }
                                        
                                        if (matchedStock) {
                                            stockId = matchedStock.id;
                                            console.log(`Matched stock item: "${item.name}" -> "${matchedStock.name}" (ID: ${matchedStock.id})`);
                                        } else {
                                            console.warn(`Could not match stock item: "${item.name}"`);
                                        }
                                    }
                                    
                                    return {
                                        stockId: stockId,
                                        name: item.name || '',
                                        description: item.description || '',
                                        quantity: parseFloat(item.qty || item.quantity || 0),
                                        unitPrice: parseFloat(item.unitPrice || 0),
                                        total: parseFloat(item.total || (item.qty || item.quantity || 0) * (item.unitPrice || 0))
                                    };
                                }));

                                // Add labor price as item ONLY if there are no other items
                                // Labor should be stored in laborPrice field, not as an item
                                const laborPrice = parseFloat(row['Labor Price'] || 0);
                                // Only add labor as item if there are no stock items (items array is empty)
                                if (laborPrice > 0 && documentItems.length === 0) {
                                    documentItems.push({
                                        stockId: null,
                                        name: 'Labor',
                                        description: 'Labor',
                                        quantity: 1,
                                        unitPrice: laborPrice,
                                        total: laborPrice
                                    });
                                }

                                if (mandays && typeof mandays === 'object') {
                                    const mandaysDays = mandays.days || 0;
                                    const mandaysPeople = mandays.people || 0;
                                    const mandaysCostPerDay = mandays.costPerDay || 0;
                                    const mandaysTotal = mandaysDays * mandaysPeople * mandaysCostPerDay;
                                    if (mandaysTotal > 0) {
                                        documentItems.push({
                                            stockId: null,
                                            name: 'Mandays',
                                            description: `Mandays (${mandaysDays} days × ${mandaysPeople} people × $${mandaysCostPerDay}/day)`,
                                            quantity: 1,
                                            unitPrice: mandaysTotal,
                                            total: mandaysTotal
                                        });
                                    }
                                }

                                const subtotal = documentItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                                const vatAmount = parseFloat(row['VAT Amount'] || 0);
                                const total = subtotal + vatAmount;

                                let notes = (row['Notes'] || '').trim();
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

                                // Parse status - ensure it's a valid DocumentStatus
                                let status = (row['Status'] || 'DRAFT').trim().toUpperCase();
                                const validStatuses = ['DRAFT', 'SENT', 'PAID', 'CANCELLED', 'CONVERTED'];
                                if (!validStatuses.includes(status)) {
                                    status = 'DRAFT';
                                }

                                // Parse date correctly
                                // Date might be split like "November 1, 2025 at 12:00:00 AM UTC+2"
                                // Or might be incorrectly parsed as "2001-11-01,2025 at 12:00:00 AM UTC+2"
                                let dateStr = row['Date'] || '';
                                let documentDate = new Date();
                                if (dateStr) {
                                    try {
                                        // Check if date contains comma and year pattern (means it was split)
                                        if (dateStr.includes(',') && dateStr.match(/\d{4}/)) {
                                            // Try to extract the correct year (should be 2025, not 2001)
                                            const yearMatch = dateStr.match(/(\d{4})/g);
                                            if (yearMatch && yearMatch.length > 0) {
                                                // Find the year that's in the 2000-2100 range
                                                const validYear = yearMatch.find(y => parseInt(y) >= 2000 && parseInt(y) < 2100);
                                                if (validYear) {
                                                    // Reconstruct date string
                                                    const monthMatch = dateStr.match(/(\w+)\s+(\d+)/);
                                                    if (monthMatch) {
                                                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                                                          'July', 'August', 'September', 'October', 'November', 'December'];
                                                        const monthName = monthMatch[1];
                                                        const day = parseInt(monthMatch[2]);
                                                        const year = parseInt(validYear);
                                                        const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
                                                        
                                                        if (monthIndex !== -1) {
                                                            documentDate = new Date(year, monthIndex, day);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        
                                        // If still not parsed, try standard parsing
                                        if (isNaN(documentDate.getTime())) {
                                            // Remove "at" and timezone info
                                            let cleanDateStr = dateStr.split('at')[0].trim();
                                            // Parse the date string - handle "Month Day, Year" format
                                            const dateMatch = cleanDateStr.match(/(\w+)\s+(\d+),?\s+(\d+)/);
                                            if (dateMatch) {
                                                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                                                  'July', 'August', 'September', 'October', 'November', 'December'];
                                                const monthName = dateMatch[1];
                                                const day = parseInt(dateMatch[2]);
                                                const year = parseInt(dateMatch[3]);
                                                const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
                                                
                                                if (monthIndex !== -1 && year >= 2000 && year < 2100) {
                                                    documentDate = new Date(year, monthIndex, day);
                                                } else {
                                                    documentDate = new Date(cleanDateStr);
                                                }
                                            } else {
                                                documentDate = new Date(cleanDateStr);
                                            }
                                        }
                                        
                                        // Validate the parsed date
                                        if (isNaN(documentDate.getTime()) || documentDate.getFullYear() < 2000 || documentDate.getFullYear() >= 2100) {
                                            documentDate = new Date();
                                        }
                                    } catch (e) {
                                        documentDate = new Date();
                                    }
                                }

                                // Parse VAT Applied
                                const vatApplied = (row['VAT Applied'] || '').toString().toLowerCase() === 'yes' || 
                                                   (row['VAT Applied'] || '').toString().toLowerCase() === 'true';

                                return {
                                    type: 'INVOICE',
                                    documentNumber: row['Document Number'] || '',
                                    clientId: clientId,
                                    clientName: clientName,
                                    date: documentDate.toISOString(),
                                    subtotal: subtotal,
                                    taxRate: 0,
                                    taxAmount: vatAmount,
                                    total: total,
                                    laborPrice: laborPrice,
                                    mandays: mandays,
                                    realMandays: realMandays,
                                    vatApplied: vatApplied,
                                    notes: notes,
                                    status: status,
                                    items: documentItems
                                };
                            })
                    );

                    if (validDocuments.length === 0) {
                        alert('No valid invoices found in CSV file');
                        return;
                    }

                    await documentsAPI.batchCreate(validDocuments);
                    await fetchData();
                    alert(`Successfully imported ${validDocuments.length} invoices`);
                } catch (err) {
                    console.error('Error importing invoices:', err);
                    alert('Failed to import invoices: ' + (err.message || 'Unknown error'));
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

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Invoices</h1>
                <div className="flex gap-2">
                    <button
                        onClick={handleExportCSV}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Export invoices to CSV"
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Import invoices from CSV"
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
                        onClick={() => setShowCancelledModal(true)}
                        className="bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Cancelled ({cancelledInvoices.length})
                    </button>
                    <div className="text-sm text-gray-600 flex items-center">
                        Total: {invoices.length} active invoices
                    </div>
                </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search by invoice number, client name, date, amount, or payment status..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* Payment Summary - Only show unpaid */}
            <div className="grid grid-cols-1 md:grid-cols-1 gap-4 mb-6">
                {loading ? (
                    <div className="bg-red-50 p-4 rounded-lg animate-pulse">
                        <div className="h-4 bg-red-200 rounded w-1/2 mb-2"></div>
                        <div className="h-8 bg-red-200 rounded w-3/4"></div>
                    </div>
                ) : (
                    <div className="bg-red-50 p-4 rounded-lg">
                        <p className="text-sm text-red-600">Total Outstanding (Unpaid)</p>
                        <p className="text-2xl font-bold text-red-800">${totalUnpaidAmount.toFixed(2)}</p>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    {loading ? (
                        <TableSkeleton rows={5} columns={7} />
                    ) : displayedInvoices.length === 0 ? (
                        <p className="text-gray-500">
                            {debouncedSearchQuery ? 'No invoices found matching your search.' : 'No invoices found.'}
                        </p>
                    ) : (
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                <tr>
                                    <th className="py-3 px-6 text-left">Number</th>
                                    <th className="py-3 px-6 text-left">Client</th>
                                    <th className="py-3 px-6 text-center">Date</th>
                                    <th className="py-3 px-6 text-right">Total</th>
                                    <th className="py-3 px-6 text-right">Paid</th>
                                    <th className="py-3 px-6 text-center">Payment Status</th>
                                    <th className="py-3 px-6 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm font-light">
                                {displayedInvoices.map(doc => {
                                    const paymentStatus = getPaymentStatus(doc);
                                    const remaining = doc.total - (doc.totalPaid || 0);
                                    
                                    return (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left font-medium">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                            <td className="py-3 px-6 text-center">{(doc.date instanceof Date ? doc.date : new Date(doc.date)).toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${(doc.totalPaid || 0).toFixed(2)}</td>
                                            <td className="py-3 px-6 text-center">
                                                <span className={`px-2 py-1 text-xs rounded-full ${paymentStatus.color}`}>
                                                    {paymentStatus.label}
                                                </span>
                                            </td>
                                            <td className="py-3 px-6 text-center">
                                                <div className="flex item-center justify-center gap-1">
                                                    <button
                                                        onClick={() => navigateTo('viewDocument', doc)}
                                                        className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                    >
                                                        View
                                                    </button>
                                                    {remaining > 0 && (
                                                        <button
                                                            onClick={() => openPaymentModal(doc)}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                            title="Add payment to this invoice"
                                                        >
                                                            Add Payment
                                                        </button>
                                                    )}
                                                    <button 
                                                        onClick={() => setConfirmCancel(doc.id)} 
                                                        disabled={cancellingInvoiceIds.has(doc.id)}
                                                        className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                        title="Cancel Invoice"
                                                    >
                                                        {cancellingInvoiceIds.has(doc.id) ? 'Cancelling...' : 'Cancel'}
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
                {!debouncedSearchQuery && filteredInvoices.length > displayLimit && (
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
                                `Load More Invoices (${filteredInvoices.length - displayLimit} remaining)`
                            )}
                        </button>
                    </div>
                )}
            </div>

            {/* Payment Refund Modal */}
            {showPaymentRefundModal && pendingCancelInvoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-lg">
                        <h3 className="text-lg font-bold mb-4 text-orange-600">⚠️ Invoice Has Payments</h3>
                        <div className="mb-6">
                            <p className="mb-4">This invoice has received <strong className="text-green-600">${(pendingCancelInvoice.totalPaid || 0).toFixed(2)}</strong> in payments.</p>
                            <p className="mb-4">What would you like to do with these payments?</p>

                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                                <p className="text-sm text-blue-800">
                                    <strong>Option 1:</strong> Move payments to client account balance<br/>
                                    → Payments remain on record and can be used to settle other invoices
                                </p>
                            </div>

                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <p className="text-sm text-red-800">
                                    <strong>Option 2:</strong> Payment was reimbursed externally<br/>
                                    → Keeps payment history but marks invoice as cancelled
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-col gap-2">
                            <button
                                onClick={() => cancelInvoiceNow(pendingCancelInvoice.id, true)}
                                disabled={cancellingInvoiceIds.has(pendingCancelInvoice.id)}
                                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {cancellingInvoiceIds.has(pendingCancelInvoice.id) ? 'Processing...' : 'Move to Client Account Balance'}
                            </button>
                            <button
                                onClick={() => cancelInvoiceNow(pendingCancelInvoice.id, false)}
                                disabled={cancellingInvoiceIds.has(pendingCancelInvoice.id)}
                                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {cancellingInvoiceIds.has(pendingCancelInvoice.id) ? 'Processing...' : 'Payment Reimbursed (Keep History Only)'}
                            </button>
                            <button
                                onClick={() => {
                                    setShowPaymentRefundModal(false);
                                    setPendingCancelInvoice(null);
                                }}
                                className="w-full px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
                            >
                                Cancel (Keep Invoice Active)
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancel Confirmation Modal */}
            {confirmCancel && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
                        <h3 className="text-lg font-bold mb-4">Confirm Cancel Invoice</h3>
                        <p className="mb-6">Are you sure you want to cancel this invoice? This will remove it from financial reports and move it to the cancelled invoices history.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmCancel(null)}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg transition-colors"
                            >
                                Keep Invoice
                            </button>
                            <button
                                onClick={() => handleCancelInvoice(confirmCancel)}
                                disabled={cancellingInvoiceIds.has(confirmCancel)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {cancellingInvoiceIds.has(confirmCancel) ? 'Cancelling...' : 'Cancel Invoice'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancelled Invoices Modal */}
            {showCancelledModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Cancelled Invoices History</h2>
                            <button onClick={() => setShowCancelledModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {cancelledInvoices.length === 0 ? (
                                <p className="text-gray-500">No cancelled invoices.</p>
                            ) : (
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                        <tr>
                                            <th className="py-3 px-6 text-left">Number</th>
                                            <th className="py-3 px-6 text-left">Client</th>
                                            <th className="py-3 px-6 text-center">Original Date</th>
                                            <th className="py-3 px-6 text-center">Cancelled On</th>
                                            <th className="py-3 px-6 text-right">Total</th>
                                            <th className="py-3 px-6 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-600 text-sm font-light">
                                        {cancelledInvoices.map(doc => (
                                            <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                                <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                                <td className="py-3 px-6 text-left">{doc.client.name}</td>
                                                <td className="py-3 px-6 text-center">{(doc.date instanceof Date ? doc.date : new Date(doc.date)).toLocaleDateString()}</td>
                                                <td className="py-3 px-6 text-center">
                                                    {doc.updatedAt ? (doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt)).toLocaleDateString() : (doc.createdAt ? (doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt)).toLocaleDateString() : 'Unknown')}
                                                </td>
                                                <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                                <td className="py-3 px-6 text-center">
                                                    <div className="flex item-center justify-center gap-2">
                                                        <button
                                                            onClick={() => navigateTo('viewDocument', doc)}
                                                            className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            View
                                                        </button>
                                                        <button
                                                            onClick={() => handleRestoreInvoice(doc.id)}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm('Are you sure you want to permanently delete this invoice? This action cannot be undone and will remove it from the database.')) {
                                                                    handlePermanentDelete(doc.id);
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

            {/* Payment Modal */}
            {showPaymentModal && selectedInvoice && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-6 py-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h2 className="text-2xl font-bold">Add Payment</h2>
                                    <p className="text-green-100 text-sm mt-1">
                                        Invoice #{selectedInvoice.invoiceNumber} - {selectedInvoice.client.name}
                                    </p>
                                </div>
                                <button
                                    onClick={() => {
                                        setShowPaymentModal(false);
                                        setSelectedInvoice(null);
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
                            {/* Invoice Summary */}
                            <div className="bg-gradient-to-br from-gray-50 to-gray-100 p-4 rounded-lg mb-6 border border-gray-200">
                                <div className="grid grid-cols-4 gap-4 text-sm">
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Invoice Total</p>
                                        <p className="text-xl font-bold text-gray-900">${selectedInvoice.total.toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Paid</p>
                                        <p className="text-xl font-bold text-green-600">${(selectedInvoice.totalPaid || 0).toFixed(2)}</p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Outstanding</p>
                                        <p className="text-xl font-bold text-red-600">
                                            ${(selectedInvoice.total - (selectedInvoice.totalPaid || 0)).toFixed(2)}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-gray-600 font-medium mb-1">Client Balance</p>
                                        <p className="text-xl font-bold text-blue-600">${clientBalance.toFixed(2)}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Payment Source Selection */}
                            {clientBalance > 0 && (
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
                                                Pay from Client Account Balance (${clientBalance.toFixed(2)} available)
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            )}

                            {/* Payment Form */}
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-2">
                                        Payment Amount * 
                                        <span className="text-xs text-gray-500 ml-2">
                                            (Max: ${(selectedInvoice.total - (selectedInvoice.totalPaid || 0)).toFixed(2)})
                                        </span>
                                    </label>
                                    <input
                                        type="number"
                                        value={paymentAmount}
                                        onChange={(e) => setPaymentAmount(e.target.value)}
                                        step="0.01"
                                        min="0.01"
                                        className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent text-lg"
                                        placeholder="0.00"
                                        required
                                    />
                                    {paymentAmount && parseFloat(paymentAmount) > (selectedInvoice.total - (selectedInvoice.totalPaid || 0)) && (
                                        <p className="text-xs text-blue-600 mt-1 font-medium">
                                            ⓘ Excess amount (${(parseFloat(paymentAmount) - (selectedInvoice.total - (selectedInvoice.totalPaid || 0))).toFixed(2)}) will be added to client account
                                        </p>
                                    )}
                                    <p className="text-xs text-gray-500 mt-1">
                                        Outstanding: ${(selectedInvoice.total - (selectedInvoice.totalPaid || 0)).toFixed(2)}
                                        {payFromAccount && ` | Available balance: $${clientBalance.toFixed(2)}`}
                                    </p>
                                </div>

                                {!payFromAccount && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Payment Date *
                                            </label>
                                            <input
                                                type="date"
                                                value={paymentDate}
                                                onChange={(e) => setPaymentDate(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                required
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Payment Method *
                                            </label>
                                            <select
                                                value={paymentMethod}
                                                onChange={(e) => setPaymentMethod(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                            >
                                                <option value="cash">Cash</option>
                                                <option value="bank_transfer">Bank Transfer</option>
                                                <option value="check">Check</option>
                                                <option value="credit_card">Credit Card</option>
                                                <option value="other">Other</option>
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Reference / Transaction ID
                                            </label>
                                            <input
                                                type="text"
                                                value={paymentReference}
                                                onChange={(e) => setPaymentReference(e.target.value)}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                placeholder="e.g., Check #1234, Transfer ID"
                                            />
                                        </div>

                                        <div>
                                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                                Notes
                                            </label>
                                            <textarea
                                                value={paymentNote}
                                                onChange={(e) => setPaymentNote(e.target.value)}
                                                rows={3}
                                                className="w-full px-4 py-3 border-2 border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
                                                placeholder="Additional notes about this payment"
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="bg-gray-50 px-6 py-4 flex justify-end space-x-3 border-t">
                            <button
                                onClick={() => {
                                    setShowPaymentModal(false);
                                    setSelectedInvoice(null);
                                }}
                                className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition-colors font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddPayment}
                                disabled={!paymentAmount || parseFloat(paymentAmount) <= 0 || isSubmittingPayment}
                                className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:from-green-700 hover:to-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium shadow-md"
                            >
                                {isSubmittingPayment ? 'Processing...' : 'Add Payment'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default InvoicesPage;
