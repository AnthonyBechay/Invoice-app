import React, { useRef, useEffect, useState } from 'react';
import { settingsAPI, documentsAPI } from '../services/api';
import { COMPANY_INFO } from '../config';
import { pdf } from '@react-pdf/renderer';
import DocumentPDF from './DocumentPDF';

const ViewDocumentPage = ({ documentToView, navigateTo, previousPage }) => {
    const printRef = useRef();
    const [userSettings, setUserSettings] = useState(null);
    const [isConverting, setIsConverting] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
    const [fullDocument, setFullDocument] = useState(null);
    const [isLoadingDocument, setIsLoadingDocument] = useState(false);
    const [logoLoaded, setLogoLoaded] = useState(false);
    const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
    const [showPdfViewer, setShowPdfViewer] = useState(false);

    // Fetch full document with items if not already present
    useEffect(() => {
        const fetchFullDocument = async () => {
            if (!documentToView) return;
            
            // Check if items are already included (even if empty array, that's valid)
            if (documentToView.items !== undefined && documentToView.items !== null && Array.isArray(documentToView.items)) {
                // Items are present (even if empty), use the document as-is
                setFullDocument(documentToView);
                return;
            }

            // Items are missing, fetch the full document
            if (documentToView.id) {
                setIsLoadingDocument(true);
                try {
                    console.log("ViewDocumentPage: Fetching full document with items for ID:", documentToView.id);
                    const fullDoc = await documentsAPI.getById(documentToView.id);
                    console.log("ViewDocumentPage: Received full document with items:", fullDoc.items?.length || 0, "items");
                    setFullDocument(fullDoc);
                } catch (error) {
                    console.error("Error fetching full document:", error);
                    // Fallback to the document we have
                    setFullDocument(documentToView);
                } finally {
                    setIsLoadingDocument(false);
                }
            } else {
                // No ID, use what we have
                setFullDocument(documentToView);
            }
        };

        fetchFullDocument();
    }, [documentToView]);

    useEffect(() => {
        if (fullDocument) {
            const originalTitle = document.title;
            const { type, documentNumber, clientName } = fullDocument;
            document.title = `${type}-${documentNumber}-${clientName}`;

            // Cleanup function to reset title
            return () => {
                document.title = originalTitle;
            };
        }
    }, [fullDocument]);

    useEffect(() => {
        const fetchUserSettings = async () => {
            try {
                const settings = await settingsAPI.get();
                setUserSettings(settings);
                
                // Preload logo if available
                if (settings?.logo) {
                    const img = new Image();
                    img.src = settings.logo;
                    img.onload = () => setLogoLoaded(true);
                    img.onerror = () => setLogoLoaded(true);
                }
            } catch (error) {
                console.error("Error fetching user settings:", error);
            }
        };
        fetchUserSettings();
    }, []);

    const handleShare = async (e) => {
        try {
            setIsGeneratingPDF(true);

            // Generate PDF using react-pdf
            const blob = await pdf(
                <DocumentPDF document={fullDocument} userSettings={userSettings} />
            ).toBlob();

            // Clean up old blob URL if exists
            if (pdfBlobUrl) {
                URL.revokeObjectURL(pdfBlobUrl);
            }

            // Create blob URL and show viewer
            const url = URL.createObjectURL(blob);
            setPdfBlobUrl(url);
            setShowPdfViewer(true);

        } catch (error) {
            console.error('PDF generation error:', error);
            alert('Failed to generate PDF. Please try again.');
        } finally {
            setIsGeneratingPDF(false);
        }
    };

    // Helper to detect mobile device
    const isMobileDevice = () => {
        return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
    };

    // Download PDF from viewer - improved for mobile browsers
    const handleDownloadPDF = async () => {
        if (!pdfBlobUrl || !fullDocument) return;

        try {
            const { type, documentNumber, clientName } = fullDocument;
            const filename = `${type}-${documentNumber}-${clientName}.pdf`;

            // Fetch the blob
            const response = await fetch(pdfBlobUrl);
            const blob = await response.blob();

            // For mobile browsers, especially Android Chrome, use a different approach
            if (isMobileDevice()) {
                // Create object URL from blob
                const url = URL.createObjectURL(blob);
                
                // Try to open in new tab/window (Android Chrome can handle this)
                const newWindow = window.open(url, '_blank');
                
                // If popup blocked, fall back to download link
                if (!newWindow || newWindow.closed || typeof newWindow.closed === 'undefined') {
                    // Popup blocked, use download link
                    const link = document.createElement('a');
                    link.href = url;
                    link.download = filename;
                    link.style.display = 'none';
                    document.body.appendChild(link);
                    link.click();
                    
                    // Clean up after a delay
                    setTimeout(() => {
                        document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    }, 100);
                } else {
                    // Clean up URL after window opens
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                }
            } else {
                // Desktop: use standard download
                const link = document.createElement('a');
                link.href = pdfBlobUrl;
                link.download = filename;
                link.style.display = 'none';
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }
        } catch (error) {
            console.error('Download error:', error);
            alert('Failed to download PDF. Please try again.');
        }
    };

    // Share PDF from viewer (mobile) - improved for Android Chrome
    const handleSharePDF = async () => {
        if (!pdfBlobUrl || !fullDocument) return;

        try {
            const { type, documentNumber, clientName } = fullDocument;
            const filename = `${type}-${documentNumber}-${clientName}.pdf`;

            // Fetch the blob from the URL
            const response = await fetch(pdfBlobUrl);
            const blob = await response.blob();
            const file = new File([blob], filename, { type: 'application/pdf' });

            // Check if Web Share API is supported (with files)
            if (navigator.share) {
                try {
                    // Try sharing with file first (works on Android Chrome 89+)
                    if (navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({
                            title: `${type} ${documentNumber}`,
                            text: `${type} ${documentNumber} for ${clientName}`,
                            files: [file]
                        });
                        return; // Success, exit
                    }
                } catch (shareError) {
                    // If file sharing fails, try without files (text-only share)
                    if (shareError.name !== 'AbortError') {
                        console.log('File sharing not supported, trying text-only share:', shareError);
                        
                        // Try text-only share as fallback
                        try {
                            await navigator.share({
                                title: `${type} ${documentNumber}`,
                                text: `${type} ${documentNumber} for ${clientName}\n\nOpen the PDF viewer to download the file.`
                            });
                            return; // Success with text share
                        } catch (textShareError) {
                            if (textShareError.name !== 'AbortError') {
                                console.log('Text share also failed, falling back to download:', textShareError);
                            }
                        }
                    } else {
                        // User cancelled, just return
                        return;
                    }
                }
            }

            // Fallback: Use download method (works on all browsers)
            // On mobile, this will open the PDF in a new tab which users can then save/share
            await handleDownloadPDF();
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.error('Share error:', error);
                // Fallback to download if share fails
                await handleDownloadPDF();
            }
        }
    };

    // Close PDF viewer
    const handleClosePdfViewer = () => {
        setShowPdfViewer(false);
        if (pdfBlobUrl) {
            URL.revokeObjectURL(pdfBlobUrl);
            setPdfBlobUrl(null);
        }
    };

    const handlePrint = () => {
        // If PDF viewer is open, print the PDF instead of the page
        if (showPdfViewer && pdfBlobUrl) {
            // On mobile, especially Android Chrome, opening the PDF in a new tab allows printing
            if (isMobileDevice()) {
                handleDownloadPDF(); // This will open PDF in new tab, user can then print from there
                return;
            }
            
            // On desktop, try to print the iframe content
            try {
                const iframe = document.querySelector('iframe[title="Document PDF"]');
                if (iframe && iframe.contentWindow) {
                    iframe.contentWindow.print();
                } else {
                    // Fallback: open PDF in new window for printing
                    window.open(pdfBlobUrl, '_blank');
                }
            } catch (error) {
                console.error('Print error:', error);
                // Fallback: open PDF in new window
                window.open(pdfBlobUrl, '_blank');
            }
            return;
        }

        // Check if iOS and in standalone mode (Add to Home Screen)
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

        // For iOS standalone, the Share button should be shown instead, so this shouldn't be called
        // But if it is, just try to print anyway
        if (isIOS && isStandalone) {
            // Try to use print - might work in some cases
            try {
                window.print();
            } catch (error) {
                console.error('Print error on iOS:', error);
                // If print fails, suggest using Share button
                alert('Print not available. Please use the "Share / Save PDF" button above.');
            }
            return;
        }

        // For other devices, use print dialog
        try {
            window.print();
        } catch (error) {
            console.error('Print error:', error);
            // Fallback: scroll to top
            if (printRef.current) {
                printRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                alert('Please use your browser\'s Print function (Ctrl+P / Cmd+P) to save as PDF.');
            }
        }
    };

    const handleConvertToInvoice = async () => {
        if (!fullDocument || fullDocument.type !== 'proforma') return;

        // Prevent double click
        if (isConverting) {
            console.log('Conversion already in progress');
            return;
        }

        setIsConverting(true);

        try {
            await documentsAPI.convertToInvoice(fullDocument.id);
            // Navigate to invoices page
            navigateTo('invoices');
        } catch (error) {
            console.error("Error converting proforma to invoice:", error);
            alert('Error converting proforma to invoice. Please try again.');
            setIsConverting(false);
        }
    };

    if (!documentToView) {
        return <p>No document selected.</p>;
    }

    if (isLoadingDocument) {
        return (
            <div className="flex justify-center items-center h-screen">
                <div className="animate-spin rounded-full h-32 w-32 border-t-2 border-b-2 border-blue-500"></div>
            </div>
        );
    }

    if (!fullDocument) {
        return <p>Loading document...</p>;
    }

    const { type, documentNumber, clientName, date, items, laborPrice, mandays, notes, vatApplied, subtotal, taxAmount, vatAmount, total } = fullDocument;
    // Use taxAmount (new field) or fall back to vatAmount (old field) for backward compatibility
    const displayVatAmount = taxAmount || vatAmount || 0;

    // Debug logging
    console.log("ViewDocumentPage: Rendering document with items:", items?.length || 0, "items");
    console.log("ViewDocumentPage: Items data:", items);

    // Parse client data - handle both old format (client object) and new format (clientName, etc.)
    const clientInfo = {
        name: clientName || fullDocument.client?.name || 'Unknown Client',
        address: fullDocument.clientAddress || fullDocument.client?.address || '',
        location: fullDocument.clientLocation || fullDocument.client?.location || '',
        phone: fullDocument.clientPhone || fullDocument.client?.phone || fullDocument.client?.phoneNumber || '',
        vatNumber: fullDocument.clientVatNumber || fullDocument.client?.vatNumber || ''
    };

    // Use user settings if available, otherwise fall back to config defaults
    const companyInfo = {
        name: userSettings?.companyName || COMPANY_INFO.name,
        address: userSettings?.companyAddress || COMPANY_INFO.address,
        phone: userSettings?.companyPhone || COMPANY_INFO.phone,
        vatNumber: userSettings?.companyVatNumber || COMPANY_INFO.vatNumber,
        logo: userSettings?.logo ? (
            <div className="h-12 flex items-center">
                {!logoLoaded && COMPANY_INFO.logo && (
                    <div className="h-12 w-auto">{COMPANY_INFO.logo}</div>
                )}
                <img 
                    src={userSettings.logo} 
                    alt="Company Logo" 
                    className={`h-12 w-auto ${logoLoaded ? 'block' : 'hidden'}`}
                    onLoad={() => setLogoLoaded(true)}
                    onError={() => setLogoLoaded(true)}
                />
            </div>
        ) : COMPANY_INFO.logo
    };

    // Parse date - handle both Date objects and ISO strings (PostgreSQL compatibility)
    const documentDate = date ? new Date(date) : new Date();

    return (
        <div>
            <style>
                {`
                @media print {
                    body * {
                        visibility: hidden;
                    }
                    .print-area, .print-area * {
                        visibility: visible;
                    }
                    .print-area {
                        position: absolute;
                        left: 0;
                        top: 0;
                        width: 100%;
                    }
                    .no-print {
                        display: none;
                    }
                    .buying-price-col {
                        display: none;
                    }
                }
                `}
            </style>
            <div className="no-print mb-6">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
                    <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">View Document</h1>
                    <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                        {type === 'proforma' && !fullDocument.convertedTo && (
                            <button
                                onClick={handleConvertToInvoice}
                                disabled={isConverting}
                                className="flex-1 sm:flex-none bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed text-sm sm:text-base"
                            >
                                {isConverting ? 'Converting...' : 'Convert to Invoice'}
                            </button>
                        )}
                        {/* Show Share button for iOS standalone mode, otherwise show Print */}
                        {(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)) && navigator.share ? (
                            <button
                                onClick={handleShare}
                                disabled={isGeneratingPDF}
                                className="flex-1 sm:flex-none bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 text-sm sm:text-base flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                </svg>
                                {isGeneratingPDF ? 'Generating PDF...' : 'Share / Save PDF'}
                            </button>
                        ) : (
                            <button onClick={handlePrint} className="flex-1 sm:flex-none bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 text-sm sm:text-base">
                                Print / Save PDF
                            </button>
                        )}
                        <button onClick={() => navigateTo(previousPage || (fullDocument.type === 'invoice' ? 'invoices' : 'proformas'))} className="flex-1 sm:flex-none bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 text-sm sm:text-base">
                            Back
                        </button>
                    </div>
                </div>
            </div>

            <div ref={printRef} className="print-area bg-white p-8 rounded-lg shadow-lg" style={{ maxWidth: '794px', margin: '0 auto' }}>
                {/* --- Header --- */}
                <header className="flex flex-row justify-between items-start pb-4 border-b-2 border-gray-200 mb-4">
                    <div className="flex-shrink-0">
                        {companyInfo.logo}
                    </div>
                    <div className="text-right flex-shrink-0">
                        <h1 className="text-2xl font-bold uppercase text-gray-800">{type}</h1>
                        <p className="text-gray-500 text-sm">{documentNumber}</p>
                    </div>
                </header>

                {/* --- Details --- */}
                <section className="grid grid-cols-2 gap-4 my-4">
                    <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Billed To</h3>
                        <p className="font-bold text-gray-800 text-sm">{clientInfo.name}</p>
                        {clientInfo.address && <p className="text-gray-600 text-xs">{clientInfo.address}</p>}
                        {clientInfo.location && <p className="text-gray-600 text-xs">{clientInfo.location}</p>}
                        {clientInfo.phone && <p className="text-gray-600 text-xs">{clientInfo.phone}</p>}
                        {clientInfo.vatNumber && <p className="text-gray-600 text-xs">VAT: {clientInfo.vatNumber}</p>}
                    </div>
                    <div className="text-left sm:text-right">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">From</h3>
                        <p className="font-bold text-gray-800 text-sm">{companyInfo.name}</p>
                        <p className="text-gray-600 text-xs">{companyInfo.address}</p>
                        <p className="text-gray-600 text-xs">{companyInfo.phone}</p>
                        {vatApplied && <p className="text-gray-600 text-xs">VAT #: {companyInfo.vatNumber}</p>}
                        <p className="mt-2 text-xs"><span className="font-semibold text-gray-500">Date:</span> {documentDate.toLocaleDateString()}</p>
                    </div>
                </section>

                {/* --- Notes --- */}
                {notes && (
                <section className="my-4">
                    <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Description of Work</h3>
                    <p className="text-gray-700 bg-gray-50 p-2 rounded-md text-xs">{notes}</p>
                </section>
                )}


                {/* --- Items Table --- */}
                <section className="my-4 overflow-x-auto">
                    <table className="w-full text-xs min-w-[600px]">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="py-1 px-2 text-left text-xs font-semibold text-gray-600">Description</th>
                                <th className="py-1 px-2 text-left text-xs font-semibold text-gray-600">Item/Part #</th>
                                <th className="py-1 px-2 text-center text-xs font-semibold text-gray-600">Qty</th>
                                <th className="py-1 px-2 text-right text-xs font-semibold text-gray-600">Unit Price</th>
                                <th className="py-1 px-2 text-right text-xs font-semibold text-gray-600">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items && Array.isArray(items) && items.length > 0 && items.map((item, index) => {
                                // Format all stock item details (without labels for brevity)
                                const stockDetails = [];
                                const stock = item.stock;
                                if (stock) {
                                    if (stock.brand) stockDetails.push(stock.brand);
                                    if (stock.model) stockDetails.push(stock.model);
                                    if (stock.description) stockDetails.push(stock.description);
                                    //if (stock.category) stockDetails.push(stock.category);
                                    if (stock.sku) stockDetails.push(stock.sku);
                                    if (stock.specifications) stockDetails.push(stock.specifications);
                                    if (stock.voltage) stockDetails.push(stock.voltage);
                                    if (stock.power) stockDetails.push(stock.power);
                                    if (stock.material) stockDetails.push(stock.material);
                                    if (stock.size) stockDetails.push(stock.size);
                                    if (stock.weight) stockDetails.push(stock.weight);
                                    if (stock.color) stockDetails.push(stock.color);
                                    //if (stock.supplier?.name || stock.supplierName) stockDetails.push(stock.supplier?.name || stock.supplierName);
                                    //if (stock.supplierCode) stockDetails.push(stock.supplierCode);
                                    //if (stock.warranty) stockDetails.push(stock.warranty);
                                    if (stock.unit) stockDetails.push(stock.unit);
                                }
                                const detailsText = stockDetails.length > 0 ? stockDetails.join(' • ') : (item.description || '');
                                
                                return (
                                    <tr key={index} className="border-b">
                                        <td className="py-1 px-2 text-xs">
                                            <div className="font-medium">{item.name || ''}</div>
                                            {detailsText && (
                                                <div className="text-gray-600 text-xs mt-0.5">{detailsText}</div>
                                            )}
                                        </td>
                                        <td className="py-1 px-2 text-xs">
                                            <div className="font-medium">{stock?.partNumber || item.partNumber || '-'}</div>
                                            {stock?.sku && <div className="text-gray-500 text-xs">SKU: {stock.sku}</div>}
                                        </td>
                                        <td className="py-1 px-2 text-center text-xs">{item.quantity || 0}</td>
                                        <td className="py-1 px-2 text-right text-xs">${(item.unitPrice || 0).toFixed(2)}</td>
                                        <td className="py-1 px-2 text-right font-medium text-xs">${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                            {(!items || !Array.isArray(items) || items.length === 0) && laborPrice === 0 && (!mandays || (mandays.days === 0 && mandays.people === 0)) && (
                                <tr>
                                    <td colSpan="5" className="py-4 px-2 text-center text-gray-500 text-xs">No items</td>
                                </tr>
                            )}
                            {laborPrice > 0 && (
                                <tr className="border-b">
                                    <td className="py-1 px-2 font-semibold text-xs">SERVICE-01</td>
                                    <td className="py-1 px-2 text-xs">Labor</td>
                                    <td className="py-1 px-2 text-center text-xs">1</td>
                                    <td className="py-1 px-2 text-right text-xs">${parseFloat(laborPrice).toFixed(2)}</td>
                                    <td className="py-1 px-2 text-right font-medium text-xs">${parseFloat(laborPrice).toFixed(2)}</td>
                                </tr>
                            )}
                            {mandays && (mandays.days > 0 || mandays.people > 0) && (
                                <tr className="border-b">
                                    <td className="py-1 px-2 font-semibold text-xs">MANDAYS-01</td>
                                    <td className="py-1 px-2 text-xs">Mandays ({mandays.days} days × {mandays.people} people × ${mandays.costPerDay}/day)</td>
                                    <td className="py-1 px-2 text-center text-xs">1</td>
                                    <td className="py-1 px-2 text-right text-xs">${(mandays.days * mandays.people * mandays.costPerDay).toFixed(2)}</td>
                                    <td className="py-1 px-2 text-right font-medium text-xs">${(mandays.days * mandays.people * mandays.costPerDay).toFixed(2)}</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </section>

                {/* --- Totals --- */}
                <section className="flex justify-end my-4">
                    <div className="w-full max-w-xs">
                         <div className="flex justify-between py-0.5 text-gray-600 text-xs">
                            <span>Subtotal:</span>
                            <span>${subtotal.toFixed(2)}</span>
                        </div>
                        {vatApplied && (
                        <div className="flex justify-between py-0.5 text-gray-600 text-xs">
                            <span>VAT (11%):</span>
                            <span>${displayVatAmount.toFixed(2)}</span>
                        </div>
                        )}
                        <div className="flex justify-between py-1 mt-1 border-t-2 border-gray-300">
                            <span className="text-sm font-bold text-gray-900">Total:</span>
                            <span className="text-sm font-bold text-gray-900">${total.toFixed(2)}</span>
                        </div>
                    </div>
                </section>

                {/* --- Footer --- */}
                <footer className="pt-4 mt-4 border-t-2 border-gray-200 text-center text-gray-500 text-xs">
                    <p>{userSettings?.footerMessage || 'Thank you for your business!'}</p>
                    <p>{companyInfo.name} | {companyInfo.address} | {companyInfo.phone}</p>
                </footer>
            </div>

            {/* PDF Viewer Modal */}
            {showPdfViewer && pdfBlobUrl && (
                <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
                    <div className="bg-white w-full h-full flex flex-col">
                        {/* Header */}
                        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-3 py-3 flex flex-col gap-3">
                            {/* Title and Close */}
                            <div className="flex justify-between items-center">
                                <h2 className="text-lg sm:text-xl font-bold">{fullDocument?.type}</h2>
                                <button
                                    onClick={handleClosePdfViewer}
                                    className="text-white hover:bg-white/20 p-2 rounded-lg transition-colors"
                                >
                                    <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                    </svg>
                                </button>
                            </div>

                            {/* Action Buttons */}
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSharePDF}
                                    className="flex-1 px-3 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium flex items-center justify-center gap-2 text-sm"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                    </svg>
                                    Share
                                </button>
                                <button
                                    onClick={handleDownloadPDF}
                                    className="flex-1 px-3 py-2 bg-white text-indigo-600 rounded-lg hover:bg-gray-100 transition-colors font-medium flex items-center justify-center gap-2 text-sm"
                                >
                                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                    </svg>
                                    Download
                                </button>
                            </div>
                        </div>

                        {/* PDF Viewer */}
                        <div className="flex-1 overflow-hidden">
                            <iframe
                                src={pdfBlobUrl}
                                className="w-full h-full border-0"
                                title="Document PDF"
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ViewDocumentPage;
