import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { collection, query, where, onSnapshot, addDoc, updateDoc, doc, getDocs, orderBy, deleteDoc, limit as firestoreLimit, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { migratePayments, verifyMigration } from '../utils/paymentMigration';
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
    const [migrationStatus, setMigrationStatus] = useState(null);
    const [showMigrationModal, setShowMigrationModal] = useState(false);

    // Form state
    const [formData, setFormData] = useState({
        clientId: '',
        documentId: '',
        amount: '',
        paymentDate: new Date().toISOString().split('T')[0],
        paymentMethod: 'cash',
        reference: '',
        notes: '',
        paymentType: 'toDocument' // 'toDocument' or 'toClient' (unallocated)
    });
    const [clientFilter, setClientFilter] = useState('all'); // Filter payments by client
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
    const [displayedPaymentsLimit, setDisplayedPaymentsLimit] = useState(20); // Show first 20, can load more
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
            if (!auth.currentUser) return;
            const settingsRef = doc(db, 'settings', auth.currentUser.uid);
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    setUserSettings(docSnap.data());
                }
            } catch (error) {
                console.error("Error fetching user settings:", error);
            }
        };
        fetchUserSettings();
    }, []);

    useEffect(() => {
        let unsubscribePayments = null;

        const fetchData = async () => {
            try {
                if (!auth.currentUser) return;

                // OPTIMIZATION: Fetch all data in PARALLEL instead of sequentially
                const fetchPromises = [];

                // 1. Check migration status (deferred - only if needed)
                fetchPromises.push(
                    verifyMigration(auth.currentUser.uid)
                        .then(status => setMigrationStatus(status))
                        .catch(err => console.error('Migration check failed:', err))
                );

                // 2. Fetch clients in parallel
                fetchPromises.push(
                    (async () => {
                        try {
                            const clientsQuery = query(
                                collection(db, `clients/${auth.currentUser.uid}/userClients`),
                                orderBy('name'),
                                firestoreLimit(200) // REDUCED: From 500 to 200 for faster load
                            );
                            const clientsSnapshot = await getDocs(clientsQuery);
                            const clientsData = clientsSnapshot.docs.map(doc => ({
                                id: doc.id,
                                ...doc.data()
                            }));
                            setClients(clientsData);
                        } catch (error) {
                            // Fallback if index not available
                            const clientsQuery = query(
                                collection(db, `clients/${auth.currentUser.uid}/userClients`),
                                firestoreLimit(200)
                            );
                            const clientsSnapshot = await getDocs(clientsQuery);
                            const clientsData = clientsSnapshot.docs.map(doc => ({
                                id: doc.id,
                                ...doc.data()
                            })).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                            setClients(clientsData);
                        }
                    })()
                );

                // 3. Fetch documents in parallel - REDUCED LIMIT
                fetchPromises.push(
                    (async () => {
                        try {
                            const documentsQuery = query(
                                collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
                                orderBy('date', 'desc'),
                                firestoreLimit(50) // REDUCED: From 200 to 50 - only need recent invoices for dropdown
                            );
                            const documentsSnapshot = await getDocs(documentsQuery);
                            const documentsData = documentsSnapshot.docs
                                .map(doc => ({
                                    id: doc.id,
                                    ...doc.data()
                                }))
                                .filter(doc => doc.type === 'invoice') // Filter invoices in memory
                                .sort((a, b) => {
                                    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                                    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                                    return dateB - dateA;
                                });
                            setDocuments(documentsData);
                        } catch (error) {
                            // Fallback if index not available
                            console.warn('Documents query failed, using fallback:', error);
                            const fallbackQuery = query(
                                collection(db, `documents/${auth.currentUser.uid}/userDocuments`),
                                firestoreLimit(50)
                            );
                            const documentsSnapshot = await getDocs(fallbackQuery);
                            const documentsData = documentsSnapshot.docs
                                .map(doc => ({
                                    id: doc.id,
                                    ...doc.data()
                                }))
                                .filter(doc => doc.type === 'invoice')
                                .sort((a, b) => {
                                    const dateA = a.date?.toDate ? a.date.toDate() : new Date(a.date);
                                    const dateB = b.date?.toDate ? b.date.toDate() : new Date(b.date);
                                    return dateB - dateA;
                                });
                            setDocuments(documentsData);
                        }
                    })()
                );

                // 4. Set up payments listener IMMEDIATELY (in parallel with other fetches)
                // OPTIMIZATION: Don't wait for clients/documents - set up listener right away
                const paymentsQuery = query(
                    collection(db, 'payments'),
                    where('userId', '==', auth.currentUser.uid),
                    orderBy('paymentDate', 'desc'),
                    firestoreLimit(50) // REDUCED: From 100 to 50 for faster initial load
                );

                unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
                    const paymentsData = snapshot.docs.map(doc => ({
                        id: doc.id,
                        ...doc.data()
                    }));
                    // No need for additional sorting - already sorted by query
                    setPayments(paymentsData);
                    setLoading(false); // Set loading false as soon as payments arrive
                }, (error) => {
                    console.error('Error fetching payments:', error);
                    // Fallback: fetch without orderBy if index not available
                    if (error.code === 'failed-precondition') {
                        const fallbackQuery = query(
                            collection(db, 'payments'),
                            where('userId', '==', auth.currentUser.uid),
                            firestoreLimit(50) // REDUCED: Match primary query limit
                        );
                        const fallbackUnsubscribe = onSnapshot(fallbackQuery, (snapshot) => {
                            const paymentsData = snapshot.docs.map(doc => ({
                                id: doc.id,
                                ...doc.data()
                            }));
                            // Sort in JavaScript since index not available
                            paymentsData.sort((a, b) => {
                                const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate);
                                const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate);
                                return dateB - dateA;
                            });
                            setPayments(paymentsData);
                            setLoading(false);
                        });
                        unsubscribePayments = fallbackUnsubscribe;
                    } else {
                        setLoading(false);
                    }
                });

                // Note: We don't await fetchPromises here - let clients/documents load in background
                // This allows the page to become interactive as soon as payments data arrives

            } catch (error) {
                console.error('Error fetching data:', error);
                setFeedback({ type: 'error', message: 'Failed to load data' });
                setLoading(false);
            }
        };

        fetchData();

        return () => {
            if (unsubscribePayments) unsubscribePayments();
        };
    }, []);

    const handleMigration = async () => {
        if (!auth.currentUser) return;
        
        setLoading(true);
        setFeedback({ type: '', message: '' });
        
        try {
            const result = await migratePayments(auth.currentUser.uid);
            if (result.success) {
                setFeedback({ 
                    type: 'success', 
                    message: `Migration completed successfully! Migrated ${result.migratedCount} payments.` 
                });
                setShowMigrationModal(false);
                
                // Refresh migration status
                const migrationCheck = await verifyMigration(auth.currentUser.uid);
                setMigrationStatus(migrationCheck);
            } else {
                setFeedback({ type: 'error', message: `Migration failed: ${result.error}` });
            }
        } catch (error) {
            console.error('Migration error:', error);
            setFeedback({ type: 'error', message: 'Migration failed. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeletePayment = async (paymentId, documentId) => {
        if (!window.confirm('Are you sure you want to delete this payment?')) return;
        
        setLoading(true);
        setFeedback({ type: '', message: '' });
        
        try {
            // Delete the payment
            await deleteDoc(doc(db, 'payments', paymentId));
            
            // Update document payment status
            await updateDocumentPaymentStatus(documentId);
            
            setFeedback({ type: 'success', message: 'Payment deleted successfully!' });
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

            // Payment type is auto-detected: if documentId exists, it's toDocument, otherwise toClient
            const paymentType = formData.documentId ? 'toDocument' : 'toClient';

            if (parseFloat(formData.amount) <= 0) {
                setFeedback({ type: 'error', message: 'Payment amount must be greater than 0.' });
                setLoading(false);
                return;
            }

            const paymentData = {
                userId: auth.currentUser.uid, // CRITICAL: Add userId for data isolation
                clientId: formData.clientId,
                documentId: paymentType === 'toDocument' ? formData.documentId : null,
                amount: parseFloat(formData.amount),
                paymentDate: new Date(formData.paymentDate),
                paymentMethod: formData.paymentMethod,
                reference: formData.reference,
                notes: formData.notes,
                settledToDocument: paymentType === 'toDocument', // true if allocated to document, false if on client account
                createdAt: new Date(),
                updatedAt: new Date()
            };


            if (editingPayment) {
                // Update existing payment
                await updateDoc(doc(db, 'payments', editingPayment.id), paymentData);
                setFeedback({ type: 'success', message: 'Payment updated successfully!' });
            } else {
                // Add new payment
                await addDoc(collection(db, 'payments'), paymentData);

                if (paymentType === 'toDocument') {
                    setFeedback({ type: 'success', message: 'Payment added and allocated to invoice successfully!' });
                } else {
                    setFeedback({ type: 'success', message: 'Payment added to client account successfully!' });
                }
            }

            // Update document payment status if payment is allocated to document
            if (paymentType === 'toDocument' && formData.documentId) {
                await updateDocumentPaymentStatus(formData.documentId);
            }

            // Reset form
            setFormData({
                clientId: '',
                documentId: '',
                amount: '',
                paymentDate: new Date().toISOString().split('T')[0],
                paymentMethod: 'cash',
                reference: '',
                notes: '',
                paymentType: 'toDocument'
            });
            setSelectedClient(null);
            setClientSearchTerm('');
            setShowAddForm(false);
            setEditingPayment(null);
        } catch (error) {
            console.error('Error saving payment:', error);
            setFeedback({ type: 'error', message: 'Failed to save payment' });
        } finally {
            setLoading(false);
        }
    };

    const updateDocumentPaymentStatus = async (documentId) => {
        try {
            // NOTE: Firebase composite indexes removed, using client-side filtering
            // Get all user payments, then filter by documentId in memory
            const paymentsQuery = query(
                collection(db, 'payments'),
                where('userId', '==', auth.currentUser.uid)
            );
            const allPaymentsSnapshot = await getDocs(paymentsQuery);

            // Filter for this specific document client-side
            const filteredPayments = allPaymentsSnapshot.docs.filter(doc => doc.data().documentId === documentId);

            let totalPaid = 0;
            filteredPayments.forEach(doc => {
                totalPaid += doc.data().amount;
            });

            // Update the document with correct path
            const documentRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, documentId);
            await updateDoc(documentRef, {
                totalPaid: totalPaid,
                paid: totalPaid >= (documents.find(d => d.id === documentId)?.total || 0),
                lastPaymentDate: new Date(),
                updatedAt: new Date()
            });
        } catch (error) {
            console.error('Error updating document payment status:', error);
        }
    };

    const getClientName = (payment) => {
        // First try to get from payment data (for migrated payments)
        if (payment.clientName) {
            return payment.clientName;
        }
        // Then try to find in clients list
        const client = clients.find(c => c.id === payment.clientId);
        return client ? client.name : `Client ID: ${payment.clientId}`;
    };

    const getDocumentInfo = (documentId) => {
        const document = documents.find(d => d.id === documentId);
        if (!document) return { type: 'Unknown', number: 'N/A', total: 0 };
        
        return {
            type: document.type || 'Invoice',
            number: document.invoiceNumber || document.proformaNumber || document.documentNumber || 'N/A',
            total: document.total || 0
        };
    };

    const getFilteredDocuments = (clientId) => {
        // IMPORTANT: Only show invoices for payment allocation (not proformas)
        // Proformas should not have payments - payments should be added to client account instead
        // Also exclude fully paid/settled invoices
        if (!clientId) {
            // Show all active unpaid invoices if no client selected
            const filtered = documents.filter(doc => {
                const totalPaid = doc.totalPaid || 0;
                const outstanding = doc.total - totalPaid;
                return (
                    doc.type === 'invoice' && // Only invoices
                    !doc.cancelled &&
                    !doc.deleted &&
                    !doc.transformedToInvoice &&
                    !doc.convertedToInvoice &&
                    !doc.converted &&
                    outstanding > 0.01 // Has outstanding balance (not fully paid)
                );
            });
            return filtered;
        }

        // Show only unpaid invoices for the selected client
        const filtered = documents.filter(doc => {
            const totalPaid = doc.totalPaid || 0;
            const outstanding = doc.total - totalPaid;
            return (
                doc.type === 'invoice' && // Only invoices
                doc.client && doc.client.id === clientId &&
                !doc.cancelled &&
                !doc.deleted &&
                !doc.transformedToInvoice &&
                !doc.convertedToInvoice &&
                !doc.converted &&
                outstanding > 0.01 // Has outstanding balance (not fully paid)
            );
        });
        return filtered;
    };

    // Memoized filtered payments
    const filteredPayments = useMemo(() => {
        let filtered = [...payments]; // Create copy to avoid mutating

        // Filter by client if selected
        if (clientFilter !== 'all') {
            filtered = filtered.filter(payment => payment.clientId === clientFilter);
        }

        // Filter by search term if provided
        if (paymentSearchTerm) {
            const search = paymentSearchTerm.toLowerCase();
            filtered = filtered.filter(payment => {
                const clientName = getClientName(payment).toLowerCase();
                const docInfo = payment.documentId ? getDocumentInfo(payment.documentId) : null;
                const amount = payment.amount.toString();
                const method = payment.paymentMethod.toLowerCase();
                const reference = (payment.reference || '').toLowerCase();
                const notes = (payment.notes || '').toLowerCase();

                return clientName.includes(search) ||
                       amount.includes(search) ||
                       method.includes(search) ||
                       reference.includes(search) ||
                       notes.includes(search) ||
                       (docInfo && docInfo.number.toLowerCase().includes(search));
            });
        }

        // Sort by date (newest first)
        filtered.sort((a, b) => {
            const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate);
            const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate);
            return dateB - dateA;
        });

        // If no search term, limit to first N, otherwise show all search results
        if (!paymentSearchTerm) {
            return filtered.slice(0, displayedPaymentsLimit);
        }

        return filtered;
    }, [payments, clientFilter, paymentSearchTerm, displayedPaymentsLimit]);

    // Memoized client payments lookup
    const getClientPayments = useCallback((clientId) => {
        return payments.filter(payment => payment.clientId === clientId);
    }, [payments]);

    // Memoized client documents lookup
    const getClientDocuments = useCallback((clientId) => {
        // Only return invoices (not proformas)
        return documents.filter(doc =>
            doc.type === 'invoice' && // Only invoices
            doc.client && doc.client.id === clientId &&
            !doc.cancelled &&
            !doc.deleted &&
            !doc.transformedToInvoice &&
            !doc.convertedToInvoice &&
            !doc.converted
        );
    }, [documents]);

    // Memoized client account balances
    const clientBalancesMap = useMemo(() => {
        const balances = {};
        clients.forEach(client => {
            const clientPayments = payments.filter(payment => payment.clientId === client.id);
            const unallocatedPayments = clientPayments
                .filter(payment => !payment.settledToDocument)
                .reduce((sum, payment) => sum + payment.amount, 0);
            balances[client.id] = unallocatedPayments;
        });
        return balances;
    }, [payments, clients]);

    // Calculate client account balance (unallocated payments)
    const getClientAccountBalance = useCallback((clientId) => {
        return clientBalancesMap[clientId] || 0;
    }, [clientBalancesMap]);

    // Get total outstanding amount for a client (across all invoices)
    const getClientOutstandingAmount = useCallback((clientId) => {
        const clientDocs = getClientDocuments(clientId);
        return clientDocs.reduce((sum, doc) => {
            const outstanding = doc.total - (doc.totalPaid || 0);
            return sum + Math.max(0, outstanding);
        }, 0);
    }, [getClientDocuments]);

    const getOutstandingAmount = (documentId) => {
        const document = documents.find(d => d.id === documentId);
        if (!document) return 0;
        const totalPaid = document.totalPaid || 0;
        return Math.max(0, document.total - totalPaid);
    };

    // PDF generation for payment receipt
    const handleGenerateReceiptPDF = async () => {
        if (!selectedPaymentForView || !receiptPrintRef.current) return;

        // Check if iOS and in standalone mode
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

        if (isIOS && isStandalone && navigator.share) {
            try {
                setIsGeneratingReceiptPDF(true);

                const filename = `Payment-Receipt-${selectedPaymentForView.id.substring(0, 8)}.pdf`;
                const element = receiptPrintRef.current;
                const a4WidthPx = 794; // A4 width in pixels at 96 DPI

                // Store original styles
                const originalWidth = element.style.width;
                const originalMaxWidth = element.style.maxWidth;
                const originalMargin = element.style.margin;
                const originalPadding = element.style.padding;

                // Set fixed A4 width for consistent capture
                element.style.width = a4WidthPx + 'px';
                element.style.maxWidth = a4WidthPx + 'px';
                element.style.margin = '0';
                element.style.padding = '32px';

                // Force layout recalculation
                element.offsetHeight;
                
                // Wait for logo image to load if present
                const logoImg = element.querySelector('img');
                if (logoImg && logoImg.src) {
                    await new Promise((resolve, reject) => {
                        if (logoImg.complete) {
                            resolve();
                        } else {
                            logoImg.onload = resolve;
                            logoImg.onerror = resolve; // Continue even if logo fails to load
                            setTimeout(resolve, 500); // Timeout after 500ms
                        }
                    });
                }
                
                await new Promise(resolve => setTimeout(resolve, 300));

                const elementWidth = element.offsetWidth || a4WidthPx;
                const elementHeight = element.scrollHeight || element.offsetHeight;

                // Capture as canvas
                const canvas = await html2canvas(element, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    width: elementWidth,
                    height: elementHeight,
                    windowWidth: elementWidth,
                    windowHeight: elementHeight,
                    removeContainer: false,
                    allowTaint: true,
                    imageTimeout: 15000,
                    onclone: (clonedDoc) => {
                        const clonedElement = clonedDoc.querySelector('.print-receipt-content');
                        if (clonedElement) {
                            clonedElement.style.width = elementWidth + 'px';
                            clonedElement.style.maxWidth = elementWidth + 'px';
                            clonedElement.style.margin = '0';
                            clonedElement.style.padding = '32px';
                            clonedElement.style.boxSizing = 'border-box';
                            
                            // Ensure header layout is horizontal
                            const header = clonedElement.querySelector('header');
                            if (header) {
                                header.style.display = 'flex';
                                header.style.flexDirection = 'row';
                                header.style.justifyContent = 'space-between';
                            }
                            
                            // Ensure logo images load
                            const images = clonedElement.querySelectorAll('img');
                            images.forEach(img => {
                                if (img.src && !img.complete) {
                                    // Force load
                                    const src = img.src;
                                    img.src = '';
                                    img.src = src;
                                }
                            });
                        }
                    }
                });

                // Restore original styles
                element.style.width = originalWidth;
                element.style.maxWidth = originalMaxWidth;
                element.style.margin = originalMargin;
                element.style.padding = originalPadding;

                const imgData = canvas.toDataURL('image/png', 1.0);
                const a4Width = 210; // mm
                const a4Height = 297; // mm

                const pixelsPerMm = canvas.width / a4Width;
                const imgWidthMm = a4Width;
                const imgHeightMm = canvas.height / pixelsPerMm;

                // Create PDF
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                // Add image to PDF - single page (receipts are usually short)
                // Only add single page, receipts shouldn't need multiple pages
                pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMm, Math.min(imgHeightMm, a4Height), undefined, 'FAST');

                const pdfBlob = pdf.output('blob');
                const file = new File([pdfBlob], filename, { type: 'application/pdf' });

                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `Payment Receipt`,
                        text: `Payment Receipt for ${getClientName(selectedPaymentForView)}`,
                        files: [file]
                    });
                } else {
                    // Fallback: download
                    const url = URL.createObjectURL(pdfBlob);
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    URL.revokeObjectURL(url);
                    alert('PDF generated! Check your downloads folder.');
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
            // For web, use print dialog
            window.print();
        }
    };

    const handleClientChange = (clientId) => {
        setFormData(prev => ({
            ...prev,
            clientId,
            documentId: '', // Reset document when client changes
            amount: '' // Reset amount when client changes
        }));
    };

    const handleDocumentChange = (documentId) => {
        const outstanding = getOutstandingAmount(documentId);
        const selectedDocument = documents.find(d => d.id === documentId);

        // Auto-select client when invoice is chosen
        if (selectedDocument && selectedDocument.client) {
            const client = clients.find(c => c.id === selectedDocument.client.id);
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
        // Prevent double-click
        if (settlementInProgress) return;

        try {
            setSettlementInProgress(true);
            setLoading(true);

            // Check if client has enough unallocated balance
            const clientBalance = getClientAccountBalance(clientId);
            const settleAmount = parseFloat(amount);

            if (clientBalance < settleAmount) {
                setFeedback({
                    type: 'error',
                    message: `Insufficient client balance. Available: $${clientBalance.toFixed(2)}, Required: $${settleAmount.toFixed(2)}`
                });
                setLoading(false);
                return;
            }

            // Get unallocated payments for this client
            const clientPayments = payments.filter(p => p.clientId === clientId && !p.settledToDocument);

            // Sort by date (oldest first)
            clientPayments.sort((a, b) => {
                const dateA = a.paymentDate?.toDate ? a.paymentDate.toDate() : new Date(a.paymentDate);
                const dateB = b.paymentDate?.toDate ? b.paymentDate.toDate() : new Date(b.paymentDate);
                return dateA - dateB;
            });

            // Allocate payments to this invoice (FIFO - First In First Out)
            let remainingToSettle = settleAmount;
            const paymentsToUpdate = [];

            for (const payment of clientPayments) {
                if (remainingToSettle <= 0) break;

                const amountToAllocate = Math.min(payment.amount, remainingToSettle);

                if (amountToAllocate === payment.amount) {
                    // Full payment allocated to this invoice
                    paymentsToUpdate.push({
                        id: payment.id,
                        updates: {
                            documentId: documentId,
                            settledToDocument: true,
                            settledAt: new Date(),
                            reference: payment.reference || `Settled to invoice`,
                            notes: (payment.notes || '') + ` | Allocated to invoice ${documentId}`,
                            updatedAt: new Date()
                        }
                    });
                    remainingToSettle -= amountToAllocate;
                } else {
                    // Partial payment - need to split
                    // Update original payment to allocated portion
                    paymentsToUpdate.push({
                        id: payment.id,
                        updates: {
                            amount: amountToAllocate,
                            documentId: documentId,
                            settledToDocument: true,
                            settledAt: new Date(),
                            reference: payment.reference || `Settled to invoice`,
                            notes: (payment.notes || '') + ` | Partially allocated to invoice`,
                            updatedAt: new Date()
                        }
                    });

                    // Create new payment for remaining unallocated amount
                    const remainingUnallocated = payment.amount - amountToAllocate;
                    const newPaymentData = {
                        ...payment,
                        userId: auth.currentUser.uid, // Ensure userId is set for split payment
                        amount: remainingUnallocated,
                        settledToDocument: false,
                        documentId: null,
                        notes: (payment.notes || '') + ` | Split from original payment`,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    };
                    delete newPaymentData.id;
                    await addDoc(collection(db, 'payments'), newPaymentData);

                    remainingToSettle = 0;
                }
            }

            // Update all allocated payments
            for (const paymentUpdate of paymentsToUpdate) {
                await updateDoc(doc(db, 'payments', paymentUpdate.id), paymentUpdate.updates);
            }

            // Update document payment status
            await updateDocumentPaymentStatus(documentId);

            setFeedback({
                type: 'success',
                message: `Invoice settled successfully! Allocated ${paymentsToUpdate.length} payment(s) from client account.`
            });
            setShowClientSettlement(false);
            setSelectedClientForSettlement(null);

        } catch (error) {
            console.error('Error settling document:', error);
            setFeedback({ type: 'error', message: 'Failed to settle invoice. Please try again.' });
        } finally {
            setLoading(false);
            setSettlementInProgress(false);
        }
    };

    return (
        <div className="max-w-7xl mx-auto">
            <div className="mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Payments</h1>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        {migrationStatus?.migrationNeeded && (
                            <button
                                onClick={() => setShowMigrationModal(true)}
                                className="flex-1 sm:flex-none bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-3 sm:px-4 rounded-lg shadow-md text-sm sm:text-base"
                            >
                                Migrate Old Payments
                            </button>
                        )}
                    </div>
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
                                                    client.email?.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                    client.location?.toLowerCase().includes(clientSearchTerm.toLowerCase())
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
                                                client.email?.toLowerCase().includes(clientSearchTerm.toLowerCase()) ||
                                                client.location?.toLowerCase().includes(clientSearchTerm.toLowerCase())
                                            ).length === 0 && (
                                                <div className="p-3 text-gray-500 text-center">No clients found</div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">
                                    Invoice (Optional)
                                </label>
                                <select
                                    name="documentId"
                                    value={formData.documentId}
                                    onChange={(e) => {
                                        handleDocumentChange(e.target.value);
                                        // Auto-detect payment type based on selection
                                        setFormData(prev => ({
                                            ...prev,
                                            documentId: e.target.value,
                                            paymentType: e.target.value ? 'toDocument' : 'toClient'
                                        }));
                                    }}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    disabled={!formData.clientId}
                                >
                                    <option value="">-- No Invoice (Add to Client Account) --</option>
                                    {getFilteredDocuments(formData.clientId).map(doc => {
                                        const docInfo = getDocumentInfo(doc.id);
                                        const outstanding = getOutstandingAmount(doc.id);
                                        return (
                                            <option key={doc.id} value={doc.id}>
                                                {docInfo.number} - {selectedClient?.name || 'Client'} - ${docInfo.total.toFixed(2)} (Due: ${outstanding.toFixed(2)})
                                            </option>
                                        );
                                    })}
                                </select>
                                <p className="text-xs text-gray-500 mt-1">
                                    {formData.documentId
                                        ? '✓ Payment will be allocated directly to the selected invoice'
                                        : '→ Payment will be added to client account balance for later allocation'}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount</label>
                                <input
                                    type="number"
                                    name="amount"
                                    value={formData.amount}
                                    onChange={handleInputChange}
                                    step="0.01"
                                    min="0"
                                    required
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="0.00"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Date</label>
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
                                <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method</label>
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

                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Reference</label>
                                <input
                                    type="text"
                                    name="reference"
                                    value={formData.reference}
                                    onChange={handleInputChange}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Transaction reference"
                                />
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
                                        paymentMethod: 'bank_transfer',
                                        reference: '',
                                        notes: ''
                                    });
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
                                        const unpaidInvoices = getClientDocuments(client.id).filter(doc => (doc.totalPaid || 0) < doc.total);

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
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                                <th className="px-3 sm:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan="8">
                                        <TableSkeleton rows={5} columns={8} />
                                    </td>
                                </tr>
                            ) : filteredPayments.length === 0 ? (
                                <tr>
                                    <td colSpan="8" className="px-6 py-8 text-center text-gray-500">
                                        {paymentSearchTerm ? 'No payments found matching your search.' : 'No payments found. Add your first payment above.'}
                                    </td>
                                </tr>
                            ) : (
                                filteredPayments.map(payment => {
                                const clientName = getClientName(payment);
                                const docInfo = payment.documentId ? getDocumentInfo(payment.documentId) : null;
                                const isAllocated = payment.settledToDocument;

                                return (
                                    <tr
                                        key={payment.id}
                                        className="hover:bg-indigo-50 cursor-pointer transition-colors"
                                        onClick={() => {
                                            setSelectedPaymentForView(payment);
                                            setShowPaymentReceipt(true);
                                        }}
                                    >
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {payment.paymentDate?.toDate ?
                                                payment.paymentDate.toDate().toLocaleDateString() :
                                                new Date(payment.paymentDate).toLocaleDateString()
                                            }
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
                                            {docInfo ? (
                                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                                    docInfo.type === 'Invoice' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'
                                                }`}>
                                                    {docInfo.type} #{docInfo.number}
                                                </span>
                                            ) : (
                                                <span className="text-gray-400">-</span>
                                            )}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                                            ${payment.amount.toFixed(2)}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900 capitalize">
                                            {payment.paymentMethod.replace('_', ' ')}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {payment.reference || '-'}
                                        </td>
                                        <td className="px-3 sm:px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex flex-col sm:flex-row gap-1 sm:gap-2" onClick={(e) => e.stopPropagation()}>
                                                <button
                                                    onClick={() => {
                                                        setEditingPayment(payment);

                                                        // Find and pre-select client
                                                        const client = clients.find(c => c.id === payment.clientId);
                                                        if (client) {
                                                            setSelectedClient(client);
                                                            setClientSearchTerm(client.name);
                                                        }

                                                        setFormData({
                                                            clientId: payment.clientId,
                                                            documentId: payment.documentId || '',
                                                            amount: payment.amount,
                                                            paymentDate: payment.paymentDate?.toDate ?
                                                                payment.paymentDate.toDate().toISOString().split('T')[0] :
                                                                new Date(payment.paymentDate).toISOString().split('T')[0],
                                                            paymentMethod: payment.paymentMethod,
                                                            reference: payment.reference || '',
                                                            notes: payment.notes || '',
                                                            paymentType: payment.settledToDocument ? 'toDocument' : 'toClient'
                                                        });
                                                        setShowAddForm(true);
                                                    }}
                                                    className="text-indigo-600 hover:text-indigo-900 text-xs sm:text-sm px-2 py-1 rounded hover:bg-indigo-50"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleDeletePayment(payment.id, payment.documentId)}
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
                {!paymentSearchTerm && filteredPayments.length < payments.filter(p => clientFilter === 'all' || p.clientId === clientFilter).length && (
                    <div className="px-4 sm:px-6 py-4 border-t border-gray-200 text-center">
                        <button
                            onClick={() => setDisplayedPaymentsLimit(prev => prev + 20)}
                            className="w-full sm:w-auto px-6 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors text-sm sm:text-base"
                        >
                            Load More Payments ({payments.filter(p => clientFilter === 'all' || p.clientId === clientFilter).length - filteredPayments.length} remaining)
                        </button>
                    </div>
                )}
            </div>

            {/* Payment Receipt Modal */}
            {showPaymentReceipt && selectedPaymentForView && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentReceipt(false)}>
                    <style>{`
                        @media print {
                            @page {
                                size: A4;
                                margin: 0;
                            }
                            body * {
                                visibility: hidden;
                            }
                            .print-receipt, .print-receipt * {
                                visibility: visible !important;
                            }
                            .print-receipt {
                                position: absolute;
                                left: 0;
                                top: 0;
                                width: 210mm;
                                max-width: 210mm;
                                margin: 0;
                                padding: 0;
                                background: white !important;
                            }
                            .print-receipt-content {
                                width: 210mm !important;
                                max-width: 210mm !important;
                                margin: 0 auto !important;
                                padding: 15mm !important;
                                box-sizing: border-box;
                            }
                            .print-hidden {
                                display: none !important;
                            }
                            .print-receipt header {
                                display: flex !important;
                                flex-direction: row !important;
                                justify-content: space-between !important;
                                align-items: flex-start !important;
                            }
                        }
                    `}</style>
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-[794px] max-h-[90vh] overflow-y-auto print-receipt" onClick={(e) => e.stopPropagation()} style={{ margin: '0 auto' }}>
                        {/* Receipt Header */}
                        <div className="bg-indigo-600 text-white px-8 py-6 flex justify-between items-center print:bg-white print:text-black print:border-b-2 print:border-gray-300 print-hidden">
                            <h2 className="text-xl font-bold">Payment Receipt</h2>
                            <div className="flex gap-2">
                                {/* Show Share button for iOS standalone mode */}
                                {(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) && navigator.share ? (
                                    <button 
                                        onClick={handleGenerateReceiptPDF}
                                        disabled={isGeneratingReceiptPDF}
                                        className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                    >
                                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                        </svg>
                                        {isGeneratingReceiptPDF ? 'Generating...' : 'Share PDF'}
                                    </button>
                                ) : null}
                                <button onClick={() => window.print()} className="bg-blue-500 hover:bg-blue-600 text-white font-medium py-2 px-4 rounded-lg transition-colors flex items-center gap-2">
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"></path>
                                    </svg>
                                    Print / PDF
                                </button>
                                <button onClick={() => setShowPaymentReceipt(false)} className="text-white hover:text-gray-200">
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>

                        {/* Receipt Content */}
                        <div ref={receiptPrintRef} className="print-receipt-content bg-white p-8" style={{ maxWidth: '794px', margin: '0 auto' }}>
                            {/* Company Header with Logo */}
                            <header className="flex flex-row justify-between items-start pb-4 border-b-2 border-gray-300 mb-6">
                                <div className="flex-shrink-0">
                                    {userSettings?.logoUrl ? (
                                        <img src={userSettings.logoUrl} alt="Company Logo" className="h-12 w-auto" />
                                    ) : (
                                        <div className="text-2xl font-bold text-indigo-600">{userSettings?.companyName || 'Your Company'}</div>
                                    )}
                                    <p className="text-sm text-gray-600 mt-2">{userSettings?.companyAddress || ''}</p>
                                    <p className="text-sm text-gray-600">{userSettings?.companyPhone || ''}</p>
                                </div>
                                <div className="text-right flex-shrink-0">
                                    <h3 className="text-2xl font-bold text-indigo-600 mb-1">Payment Receipt</h3>
                                    <p className="text-sm text-gray-600">Receipt #{selectedPaymentForView.id.substring(0, 8).toUpperCase()}</p>
                                </div>
                            </header>

                            {/* Payment Details */}
                            <div className="grid grid-cols-2 gap-6 mb-6">
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-600 mb-2">PAYMENT FROM</h4>
                                    <p className="text-lg font-medium text-gray-900">{getClientName(selectedPaymentForView)}</p>
                                    {clients.find(c => c.id === selectedPaymentForView.clientId) && (
                                        <div className="text-sm text-gray-600 mt-1">
                                            {clients.find(c => c.id === selectedPaymentForView.clientId)?.email && (
                                                <p>{clients.find(c => c.id === selectedPaymentForView.clientId)?.email}</p>
                                            )}
                                            {clients.find(c => c.id === selectedPaymentForView.clientId)?.location && (
                                                <p>{clients.find(c => c.id === selectedPaymentForView.clientId)?.location}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                                <div>
                                    <h4 className="text-sm font-semibold text-gray-600 mb-2">PAYMENT DATE</h4>
                                    <p className="text-lg font-medium text-gray-900">
                                        {selectedPaymentForView.paymentDate?.toDate ?
                                            selectedPaymentForView.paymentDate.toDate().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) :
                                            new Date(selectedPaymentForView.paymentDate).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
                                        }
                                    </p>
                                </div>
                            </div>

                            {/* Payment Amount - Highlighted */}
                            <div className="bg-green-50 border-2 border-green-200 rounded-lg p-6 mb-6">
                                <div className="text-center">
                                    <p className="text-sm font-semibold text-green-700 mb-1">AMOUNT PAID</p>
                                    <p className="text-4xl font-bold text-green-600">${selectedPaymentForView.amount.toFixed(2)}</p>
                                </div>
                            </div>

                            {/* Payment Info Table */}
                            <div className="border border-gray-300 rounded-lg overflow-hidden mb-6">
                                <table className="min-w-full">
                                    <tbody className="divide-y divide-gray-200">
                                        <tr>
                                            <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Payment Method</td>
                                            <td className="px-4 py-3 text-sm text-gray-900 capitalize">{selectedPaymentForView.paymentMethod.replace('_', ' ')}</td>
                                        </tr>
                                        <tr>
                                            <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Payment Type</td>
                                            <td className="px-4 py-3 text-sm text-gray-900">
                                                {selectedPaymentForView.settledToDocument ? (
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">
                                                        Invoice Payment
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex px-2 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                                        Client Account
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                        {selectedPaymentForView.documentId && (
                                            <tr>
                                                <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Invoice</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">
                                                    {getDocumentInfo(selectedPaymentForView.documentId)?.number || 'N/A'}
                                                </td>
                                            </tr>
                                        )}
                                        {selectedPaymentForView.reference && (
                                            <tr>
                                                <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Reference</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">{selectedPaymentForView.reference}</td>
                                            </tr>
                                        )}
                                        {selectedPaymentForView.notes && (
                                            <tr>
                                                <td className="px-4 py-3 bg-gray-50 text-sm font-semibold text-gray-700">Notes</td>
                                                <td className="px-4 py-3 text-sm text-gray-900">{selectedPaymentForView.notes}</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>

                            {/* Footer */}
                            <div className="text-center text-sm text-gray-500 mb-6">
                                <p>Thank you for your payment!</p>
                                <p className="mt-2">Generated on {new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
                            </div>

                            {/* Action Buttons - Moved to top header */}
                        </div>
                    </div>
                </div>
            )}

            {/* Migration Modal */}
            {showMigrationModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                    <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4">Migrate Old Payments</h3>
                        <p className="text-gray-600 mb-4">
                            We found {migrationStatus?.documentsWithOldPayments?.length || 0} documents with old payment data. 
                            This will migrate them to the new payment system.
                        </p>
                        <div className="flex justify-end space-x-3">
                            <button
                                onClick={() => setShowMigrationModal(false)}
                                className="px-4 py-2 text-gray-600 bg-gray-200 rounded-md hover:bg-gray-300"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleMigration}
                                disabled={loading}
                                className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 disabled:bg-yellow-300"
                            >
                                {loading ? 'Migrating...' : 'Migrate Now'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Client Settlement Modal */}
            {showClientSettlement && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-2xl max-w-5xl w-full max-h-[90vh] overflow-hidden flex flex-col">
                        {/* Header */}
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

                        {/* Content */}
                        <div className="p-6 overflow-y-auto flex-1">
                            <div className="space-y-6">
                                {/* Client Selector */}
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
                                        {/* Client Summary Cards */}
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
                                                        {getClientDocuments(selectedClientForSettlement.id).filter(doc => (doc.totalPaid || 0) < doc.total).length}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Invoices List */}
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
                                                        // Sort unpaid first, then by outstanding amount (highest first)
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
                                                                            {!isPaid && canSettle > 0 && (
                                                                                <span className="px-3 py-1 text-xs font-semibold rounded-full bg-orange-100 text-orange-800 animate-pulse">
                                                                                    Click to settle
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
                                                                                <span className="font-bold ml-2 text-green-600">${(doc.totalPaid || 0).toFixed(2)}</span>
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
                                                                                        e.stopPropagation();
                                                                                        setCustomSettlementAmounts({
                                                                                            ...customSettlementAmounts,
                                                                                            [doc.id]: e.target.value
                                                                                        });
                                                                                    }}
                                                                                    onClick={(e) => e.stopPropagation()}
                                                                                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                                                                    placeholder="0.00"
                                                                                />
                                                                                <p className="text-xs text-gray-500 mt-1">Max: ${canSettle.toFixed(2)}</p>
                                                                            </div>
                                                                        )}
                                                                        {isPartialSettlement && !isPaid && (
                                                                            <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-xs text-blue-700">
                                                                                <strong>Partial Settlement:</strong> Will allocate ${canSettle.toFixed(2)} from available balance.
                                                                                Remaining ${(outstanding - canSettle).toFixed(2)} will still be due.
                                                                            </div>
                                                                        )}
                                                                        {cannotSettle && !isPaid && (
                                                                            <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                                                                                ⚠ No available balance. Add payment to client account first.
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                    {!isPaid && canSettle > 0 && (
                                                                        <div className="flex-shrink-0">
                                                                            <button
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
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
                                                                                    {((customSettlementAmounts[doc.id] ? parseFloat(customSettlementAmounts[doc.id]) : canSettle) < outstanding) && <div className="text-xs opacity-90">(Partial)</div>}
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
