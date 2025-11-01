import React, { useRef, useEffect, useState } from 'react';
import { collection, addDoc, updateDoc, doc, runTransaction, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { COMPANY_INFO } from '../config';

// Load html2canvas from CDN if not available
const loadHtml2Canvas = () => {
    return new Promise((resolve, reject) => {
        if (window.html2canvas) {
            resolve(window.html2canvas);
            return;
        }
        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
        script.onload = () => resolve(window.html2canvas);
        script.onerror = () => reject(new Error('Failed to load html2canvas'));
        document.head.appendChild(script);
    });
};

// Load jsPDF from CDN if not available
const loadJsPDF = () => {
    return new Promise((resolve, reject) => {
        // Check multiple possible locations
        if (window.jspdf && window.jspdf.jsPDF) {
            resolve(window.jspdf.jsPDF);
            return;
        }
        if (window.jsPDF) {
            resolve(window.jsPDF);
            return;
        }
        
        const script = document.createElement('script');
        // Try a more reliable CDN
        script.src = 'https://cdn.jsdelivr.net/npm/jspdf@2.5.1/dist/jspdf.umd.min.js';
        script.async = true;
        script.onload = () => {
            // Wait a bit for the library to initialize
            setTimeout(() => {
                // Check multiple possible exports
                if (window.jspdf && window.jspdf.jsPDF) {
                    resolve(window.jspdf.jsPDF);
                } else if (window.jsPDF) {
                    resolve(window.jsPDF);
                } else if (window.jspdf) {
                    // Sometimes it's just window.jspdf
                    resolve(window.jspdf);
                } else {
                    reject(new Error('jsPDF loaded but not found in window object'));
                }
            }, 100);
        };
        script.onerror = () => {
            // Try alternative CDN
            const altScript = document.createElement('script');
            altScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
            altScript.async = true;
            altScript.onload = () => {
                setTimeout(() => {
                    if (window.jspdf && window.jspdf.jsPDF) {
                        resolve(window.jspdf.jsPDF);
                    } else if (window.jsPDF) {
                        resolve(window.jsPDF);
                    } else if (window.jspdf) {
                        resolve(window.jspdf);
                    } else {
                        reject(new Error('jsPDF loaded from alternative CDN but not found'));
                    }
                }, 100);
            };
            altScript.onerror = () => reject(new Error('Failed to load jsPDF from both CDNs'));
            document.head.appendChild(altScript);
        };
        document.head.appendChild(script);
    });
};

const ViewDocumentPage = ({ documentToView, navigateTo }) => {
    const printRef = useRef();
    const [userSettings, setUserSettings] = useState(null);
    const [isConverting, setIsConverting] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        if (documentToView) {
            const originalTitle = document.title;
            const { type, documentNumber, client } = documentToView;
            document.title = `${type}-${documentNumber}-${client.name}`;

            // Cleanup function to reset title
            return () => {
                document.title = originalTitle;
            };
        }
    }, [documentToView]);

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

    const handleShare = async (e) => {
        // Check if iOS and in standalone mode (Add to Home Screen)
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        
        if (isIOS && isStandalone && navigator.share && printRef.current) {
            try {
                setIsGeneratingPDF(true);
                
                // Get the document title for filename
                const { type, documentNumber, client } = documentToView;
                const filename = `${type}-${documentNumber}-${client.name}.pdf`;
                
                console.log('Loading libraries...');
                // Load required libraries
                const html2canvas = await loadHtml2Canvas();
                console.log('html2canvas loaded');
                const jsPDFConstructor = await loadJsPDF();
                console.log('jsPDF loaded, constructor type:', typeof jsPDFConstructor);
                
                console.log('Capturing canvas...');
                // Capture the print area as canvas
                const canvas = await html2canvas(printRef.current, {
                    scale: 2,
                    useCORS: true,
                    logging: false,
                    backgroundColor: '#ffffff',
                    width: printRef.current.scrollWidth,
                    height: printRef.current.scrollHeight,
                    windowWidth: printRef.current.scrollWidth,
                    windowHeight: printRef.current.scrollHeight
                });
                console.log('Canvas captured:', canvas.width, 'x', canvas.height);
                
                // Convert canvas to image data
                const imgData = canvas.toDataURL('image/png');
                console.log('Image data generated, length:', imgData.length);
                
                // Calculate PDF dimensions (A4 aspect ratio)
                const pdfWidth = 210; // A4 width in mm
                const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
                console.log('PDF dimensions:', pdfWidth, 'x', pdfHeight);
                
                // Create PDF instance - handle different jsPDF exports
                let pdf;
                if (typeof jsPDFConstructor === 'function') {
                    pdf = new jsPDFConstructor({
                        orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
                        unit: 'mm',
                        format: [pdfWidth, pdfHeight]
                    });
                } else if (jsPDFConstructor && typeof jsPDFConstructor.jsPDF === 'function') {
                    const JsPDF = jsPDFConstructor.jsPDF;
                    pdf = new JsPDF({
                        orientation: pdfHeight > pdfWidth ? 'portrait' : 'landscape',
                        unit: 'mm',
                        format: [pdfWidth, pdfHeight]
                    });
                } else {
                    throw new Error('jsPDF constructor not found');
                }
                
                console.log('Adding image to PDF...');
                // Add image to PDF - limit size to avoid memory issues
                const maxHeight = 297; // A4 height in mm
                const actualHeight = pdfHeight > maxHeight ? maxHeight : pdfHeight;
                const actualWidth = (canvas.width * actualHeight) / canvas.height;
                
                pdf.addImage(imgData, 'PNG', 0, 0, actualWidth, actualHeight, undefined, 'FAST');
                
                console.log('Generating PDF blob...');
                // Generate PDF blob
                const pdfBlob = pdf.output('blob');
                console.log('PDF blob generated, size:', pdfBlob.size);
                
                // Create a File object for sharing
                const file = new File([pdfBlob], filename, { type: 'application/pdf' });
                
                console.log('Sharing PDF file...');
                // Share the PDF file
                if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                    await navigator.share({
                        title: `${type} ${documentNumber}`,
                        text: `${type} ${documentNumber} for ${client.name}`,
                        files: [file]
                    });
                    console.log('PDF shared successfully');
                } else {
                    console.log('Share API not available, downloading instead...');
                    // Fallback: download the PDF
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
                // User cancelled or share failed
                if (error.name !== 'AbortError') {
                    console.error('Share error details:', error);
                    console.error('Error stack:', error.stack);
                    console.error('Error message:', error.message);
                    
                    // Show user-friendly error message
                    let errorMessage = 'Failed to generate PDF. ';
                    if (error.message.includes('html2canvas')) {
                        errorMessage += 'Could not load image capture library.';
                    } else if (error.message.includes('jsPDF') || error.message.includes('jspdf')) {
                        errorMessage += 'Could not load PDF library.';
                    } else if (error.message.includes('canvas')) {
                        errorMessage += 'Could not capture document image.';
                    } else {
                        errorMessage += error.message || 'Unknown error occurred.';
                    }
                    
                    alert(errorMessage + '\n\nPlease try refreshing the page and try again.');
                }
            } finally {
                setIsGeneratingPDF(false);
            }
        } else {
            // For non-iOS or if Share API not available, just use regular print
            handlePrint();
        }
    };

    const handlePrint = () => {
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
        if (!auth.currentUser || documentToView.type !== 'proforma') return;
        
        // Prevent double click
        if (isConverting) {
            console.log('Conversion already in progress');
            return;
        }

        setIsConverting(true);
        
        try {
            // Get next invoice number
            const year = new Date().getFullYear();
            const counterRef = doc(db, `counters/${auth.currentUser.uid}/documentCounters`, 'invoiceCounter');
            const newInvoiceNumber = await runTransaction(db, async (transaction) => {
                const counterDoc = await transaction.get(counterRef);
                let newLastId = 1;
                if (counterDoc.exists()) {
                    newLastId = counterDoc.data().lastId + 1;
                }
                transaction.set(counterRef, { lastId: newLastId }, { merge: true });
                return `INV-${year}-${String(newLastId).padStart(3, '0')}`;
            });
            
            // Create new invoice document
            const invoiceData = {
                ...documentToView,
                type: 'invoice',
                documentNumber: newInvoiceNumber,
                proformaNumber: documentToView.documentNumber,
                convertedFrom: documentToView.id,
                date: new Date()
            };
            
            // Remove proforma-specific fields
            delete invoiceData.id;
            delete invoiceData.converted;
            
            // Add the new invoice
            await addDoc(collection(db, `documents/${auth.currentUser.uid}/userDocuments`), invoiceData);
            
            // Mark original proforma as converted
            const proformaRef = doc(db, `documents/${auth.currentUser.uid}/userDocuments`, documentToView.id);
            await updateDoc(proformaRef, {
                converted: true,
                convertedAt: new Date(),
                convertedToInvoiceNumber: newInvoiceNumber
            });
            
            // Navigate to invoices page
            navigateTo('invoices');
        } catch (error) {
            console.error("Error converting proforma to invoice: ", error);
            alert('Error converting proforma to invoice. Please try again.');
            setIsConverting(false);
        }
    };

    if (!documentToView) {
        return <p>No document selected.</p>;
    }

    const { type, documentNumber, client, date, items, laborPrice, mandays, notes, vatApplied, subtotal, vatAmount, total } = documentToView;

    // Use user settings if available, otherwise fall back to config defaults
    const companyInfo = {
        name: userSettings?.companyName || COMPANY_INFO.name,
        address: userSettings?.companyAddress || COMPANY_INFO.address,
        phone: userSettings?.companyPhone || COMPANY_INFO.phone,
        vatNumber: userSettings?.companyVatNumber || COMPANY_INFO.vatNumber,
        logo: userSettings?.logoUrl ? (
            <img src={userSettings.logoUrl} alt="Company Logo" className="h-12 w-auto" />
        ) : COMPANY_INFO.logo
    };

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
                        {type === 'proforma' && !documentToView.converted && (
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
                        <button onClick={() => navigateTo(documentToView.type === 'invoice' ? 'invoices' : 'proformas')} className="flex-1 sm:flex-none bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 text-sm sm:text-base">
                            Back
                        </button>
                    </div>
                </div>
            </div>

            <div ref={printRef} className="print-area bg-white p-4 sm:p-8 md:p-12 rounded-lg shadow-lg">
                {/* --- Header --- */}
                <header className="flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b-2 border-gray-200 gap-4">
                    <div>
                        {companyInfo.logo}
                    </div>
                    <div className="text-left sm:text-right w-full sm:w-auto">
                        <h1 className="text-xl sm:text-2xl font-bold uppercase text-gray-800">{type}</h1>
                        <p className="text-gray-500 text-sm">{documentNumber}</p>
                    </div>
                </header>

                {/* --- Details --- */}
                <section className="grid grid-cols-1 sm:grid-cols-2 gap-4 my-4">
                    <div>
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">Billed To</h3>
                        <p className="font-bold text-gray-800 text-sm">{client.name}</p>
                        {client.address && <p className="text-gray-600 text-xs">{client.address}</p>}
                        <p className="text-gray-600 text-xs">{client.location}</p>
                        <p className="text-gray-600 text-xs">{client.phone || client.phoneNumber}</p>
                        {client.vatNumber && <p className="text-gray-600 text-xs">VAT: {client.vatNumber}</p>}
                    </div>
                    <div className="text-left sm:text-right">
                        <h3 className="text-xs font-semibold text-gray-500 uppercase mb-1">From</h3>
                        <p className="font-bold text-gray-800 text-sm">{companyInfo.name}</p>
                        <p className="text-gray-600 text-xs">{companyInfo.address}</p>
                        <p className="text-gray-600 text-xs">{companyInfo.phone}</p>
                        {vatApplied && <p className="text-gray-600 text-xs">VAT #: {companyInfo.vatNumber}</p>}
                        <p className="mt-2 text-xs"><span className="font-semibold text-gray-500">Date:</span> {date.toDate().toLocaleDateString()}</p>
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
                                <th className="py-1 px-2 text-left text-xs font-semibold text-gray-600">Item/Part #</th>
                                <th className="py-1 px-2 text-left text-xs font-semibold text-gray-600">Description</th>
                                <th className="py-1 px-2 text-center text-xs font-semibold text-gray-600">Qty</th>
                                <th className="py-1 px-2 text-right text-xs font-semibold text-gray-600">Unit Price</th>
                                <th className="py-1 px-2 text-right text-xs font-semibold text-gray-600">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((item, index) => (
                                <tr key={index} className="border-b">
                                    <td className="py-1 px-2 text-xs">{item.partNumber}</td>
                                    <td className="py-1 px-2 text-xs">
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-gray-600">{item.brand && `${item.brand} - `}{item.specs}</div>
                                    </td>
                                    <td className="py-1 px-2 text-center text-xs">{item.qty}</td>
                                    <td className="py-1 px-2 text-right text-xs">${item.unitPrice.toFixed(2)}</td>
                                    <td className="py-1 px-2 text-right font-medium text-xs">${(item.qty * item.unitPrice).toFixed(2)}</td>
                                </tr>
                            ))}
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
                            <span>${vatAmount.toFixed(2)}</span>
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
                    <p>Thank you for your business!</p>
                    <p>{companyInfo.name} | {companyInfo.address} | {companyInfo.phone}</p>
                </footer>
            </div>
        </div>
    );
};

export default ViewDocumentPage;
