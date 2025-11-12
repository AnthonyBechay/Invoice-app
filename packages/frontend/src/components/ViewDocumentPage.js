import React, { useRef, useEffect, useState } from 'react';
import { settingsAPI, documentsAPI } from '../services/api';
import { COMPANY_INFO } from '../config';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';

const ViewDocumentPage = ({ documentToView, navigateTo, previousPage }) => {
    const printRef = useRef();
    const [userSettings, setUserSettings] = useState(null);
    const [isConverting, setIsConverting] = useState(false);
    const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

    useEffect(() => {
        if (documentToView) {
            const originalTitle = document.title;
            const { type, documentNumber, clientName } = documentToView;
            document.title = `${type}-${documentNumber}-${clientName}`;

            // Cleanup function to reset title
            return () => {
                document.title = originalTitle;
            };
        }
    }, [documentToView]);

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

    const handleShare = async (e) => {
        // Check if iOS and in standalone mode (Add to Home Screen)
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);

        if (isIOS && isStandalone && navigator.share && printRef.current) {
            try {
                setIsGeneratingPDF(true);

                // Get the document title for filename
                const { type, documentNumber, clientName } = documentToView;
                const filename = `${type}-${documentNumber}-${clientName}.pdf`;

                console.log('Capturing canvas...');
                // A4 dimensions in pixels at 96 DPI (standard screen resolution)
                // A4: 210mm x 297mm = 8.27" x 11.69" = 794px x 1123px at 96 DPI
                const a4WidthPx = 794; // A4 width in pixels (210mm = 794px at 96 DPI)

                const element = printRef.current;

                // Store original styles
                const originalWidth = element.style.width;
                const originalMaxWidth = element.style.maxWidth;
                const originalMargin = element.style.margin;

                // Set fixed A4 width for consistent capture (matches browser print)
                element.style.width = a4WidthPx + 'px';
                element.style.maxWidth = a4WidthPx + 'px';
                element.style.margin = '0';
                element.style.padding = '32px'; // 8*4 = 32px padding

                // Force layout recalculation
                element.offsetHeight; // Trigger reflow

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

                // Wait for layout to update
                await new Promise(resolve => setTimeout(resolve, 300));

                // Get the actual rendered dimensions
                const elementWidth = element.offsetWidth || a4WidthPx;
                const elementHeight = element.scrollHeight || element.offsetHeight;

                console.log('Element dimensions:', elementWidth, 'x', elementHeight);

                // Capture the print area as canvas - use A4 width for consistency
                const canvas = await html2canvas(element, {
                    scale: 2, // Higher scale for better quality
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
                        // Ensure the cloned element maintains A4 width and proper styling
                        const clonedElement = clonedDoc.querySelector('.print-area');
                        if (clonedElement) {
                            clonedElement.style.width = elementWidth + 'px';
                            clonedElement.style.maxWidth = elementWidth + 'px';
                            clonedElement.style.margin = '0';
                            clonedElement.style.padding = '32px';
                            clonedElement.style.boxSizing = 'border-box';

                            // Ensure header layout is horizontal with logo on left
                            const header = clonedElement.querySelector('header');
                            if (header) {
                                header.style.display = 'flex';
                                header.style.flexDirection = 'row';
                                header.style.justifyContent = 'space-between';
                                header.style.alignItems = 'flex-start';
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

                            // Ensure grid layout is 2 columns for details section
                            const detailsSection = clonedElement.querySelector('section.grid');
                            if (detailsSection) {
                                detailsSection.style.gridTemplateColumns = '1fr 1fr';
                                detailsSection.style.display = 'grid';
                            }
                        }
                    }
                });

                // Restore original styles
                element.style.width = originalWidth;
                element.style.maxWidth = originalMaxWidth;
                element.style.margin = originalMargin;

                console.log('Canvas captured:', canvas.width, 'x', canvas.height);

                // Convert canvas to image data
                const imgData = canvas.toDataURL('image/png', 1.0);
                console.log('Image data generated, length:', imgData.length);

                // A4 dimensions in mm
                const a4Width = 210; // A4 width in mm
                const a4Height = 297; // A4 height in mm

                // Calculate the scale factor: canvas pixels to mm
                // We want the image to fill the full A4 page width
                const pixelsPerMm = canvas.width / a4Width;
                const imgWidthMm = a4Width; // Full A4 width
                const imgHeightMm = canvas.height / pixelsPerMm; // Maintain aspect ratio

                console.log('PDF dimensions: A4', a4Width, 'x', a4Height, 'mm');
                console.log('Image dimensions:', imgWidthMm, 'x', imgHeightMm, 'mm');

                // Create PDF instance - use standard A4 format
                const pdf = new jsPDF({
                    orientation: 'portrait',
                    unit: 'mm',
                    format: 'a4'
                });

                console.log('Adding image to PDF...');
                // Add image to PDF - fill full width (A4 format)
                // For content taller than A4, add multiple pages (only if actually needed)
                const pageHeight = a4Height;

                if (imgHeightMm <= pageHeight) {
                    // Single page - add image at top
                    pdf.addImage(imgData, 'PNG', 0, 0, imgWidthMm, imgHeightMm, undefined, 'FAST');
                } else {
                    // Multiple pages needed - split image across pages
                    const sourceHeight = canvas.height;
                    const sourceWidth = canvas.width;
                    let yOffset = 0;

                    while (yOffset < imgHeightMm) {
                        if (yOffset > 0) {
                            pdf.addPage();
                        }

                        const remainingHeight = imgHeightMm - yOffset;
                        const heightThisPage = Math.min(pageHeight, remainingHeight);

                        // Only proceed if we actually have content for this page
                        if (heightThisPage <= 0) break;

                        // Calculate source canvas region for this page
                        const sourceY = (yOffset / imgHeightMm) * sourceHeight;
                        const sourceHeightThisPage = Math.ceil((heightThisPage / imgHeightMm) * sourceHeight);

                        // Ensure we don't exceed source canvas bounds
                        if (sourceY >= sourceHeight) break;

                        // Create temporary canvas for this page slice
                        const pageCanvas = document.createElement('canvas');
                        pageCanvas.width = sourceWidth;
                        pageCanvas.height = Math.min(sourceHeightThisPage, sourceHeight - sourceY);
                        const ctx = pageCanvas.getContext('2d');
                        ctx.drawImage(canvas, 0, sourceY, sourceWidth, Math.min(sourceHeightThisPage, sourceHeight - sourceY), 0, 0, sourceWidth, Math.min(sourceHeightThisPage, sourceHeight - sourceY));

                        const pageImgData = pageCanvas.toDataURL('image/png', 1.0);
                        pdf.addImage(pageImgData, 'PNG', 0, 0, imgWidthMm, heightThisPage, undefined, 'FAST');

                        yOffset += heightThisPage;

                        // Prevent infinite loop
                        if (yOffset >= imgHeightMm) break;
                    }
                }

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
                        text: `${type} ${documentNumber} for ${clientName}`,
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
                    if (error.message.includes('canvas') || error.name === 'SecurityError') {
                        errorMessage += 'Could not capture document image. Please ensure the document is fully loaded.';
                    } else if (error.message.includes('Share') || error.name === 'AbortError') {
                        // User cancelled - silently fail
                        return;
                    } else {
                        errorMessage += error.message || 'Unknown error occurred. Please try again.';
                    }

                    alert(errorMessage);
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
        if (documentToView.type !== 'proforma') return;

        // Prevent double click
        if (isConverting) {
            console.log('Conversion already in progress');
            return;
        }

        setIsConverting(true);

        try {
            await documentsAPI.convertToInvoice(documentToView.id);
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

    const { type, documentNumber, clientName, date, items, laborPrice, mandays, notes, vatApplied, subtotal, taxAmount, vatAmount, total } = documentToView;
    // Use taxAmount (new field) or fall back to vatAmount (old field) for backward compatibility
    const displayVatAmount = taxAmount || vatAmount || 0;

    // Parse client data - handle both old format (client object) and new format (clientName, etc.)
    const clientInfo = {
        name: clientName || documentToView.client?.name || 'Unknown Client',
        address: documentToView.clientAddress || documentToView.client?.address || '',
        location: documentToView.clientLocation || documentToView.client?.location || '',
        phone: documentToView.clientPhone || documentToView.client?.phone || documentToView.client?.phoneNumber || '',
        vatNumber: documentToView.clientVatNumber || documentToView.client?.vatNumber || ''
    };

    // Use user settings if available, otherwise fall back to config defaults
    const companyInfo = {
        name: userSettings?.companyName || COMPANY_INFO.name,
        address: userSettings?.companyAddress || COMPANY_INFO.address,
        phone: userSettings?.companyPhone || COMPANY_INFO.phone,
        vatNumber: userSettings?.companyVatNumber || COMPANY_INFO.vatNumber,
        logo: userSettings?.logo ? (
            <img src={userSettings.logo} alt="Company Logo" className="h-12 w-auto" />
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
                        {type === 'proforma' && !documentToView.convertedTo && (
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
                        <button onClick={() => navigateTo(previousPage || (documentToView.type === 'invoice' ? 'invoices' : 'proformas'))} className="flex-1 sm:flex-none bg-gray-500 hover:bg-gray-600 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 text-sm sm:text-base">
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
                                <th className="py-1 px-2 text-left text-xs font-semibold text-gray-600">Item/Part #</th>
                                <th className="py-1 px-2 text-left text-xs font-semibold text-gray-600">Description</th>
                                <th className="py-1 px-2 text-center text-xs font-semibold text-gray-600">Qty</th>
                                <th className="py-1 px-2 text-right text-xs font-semibold text-gray-600">Unit Price</th>
                                <th className="py-1 px-2 text-right text-xs font-semibold text-gray-600">Total</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items && items.map((item, index) => (
                                <tr key={index} className="border-b">
                                    <td className="py-1 px-2 text-xs">{item.stock?.partNumber || ''}</td>
                                    <td className="py-1 px-2 text-xs">
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-gray-600">{item.description || ''}</div>
                                    </td>
                                    <td className="py-1 px-2 text-center text-xs">{item.quantity || 0}</td>
                                    <td className="py-1 px-2 text-right text-xs">${(item.unitPrice || 0).toFixed(2)}</td>
                                    <td className="py-1 px-2 text-right font-medium text-xs">${((item.quantity || 0) * (item.unitPrice || 0)).toFixed(2)}</td>
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
        </div>
    );
};

export default ViewDocumentPage;
