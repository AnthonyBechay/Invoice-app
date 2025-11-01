import React, { useRef, useEffect, useState } from 'react';
import { collection, addDoc, updateDoc, doc, runTransaction, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';
import { COMPANY_INFO } from '../config';

const ViewDocumentPage = ({ documentToView, navigateTo }) => {
    const printRef = useRef();
    const [userSettings, setUserSettings] = useState(null);
    const [isConverting, setIsConverting] = useState(false);

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

    const handlePrint = () => {
        // Check if iOS and in standalone mode (Add to Home Screen)
        const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
        const isStandalone = window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
        
        if (isIOS && isStandalone) {
            // iOS standalone mode - window.print() doesn't work
            // Use Share API if available, otherwise show instructions
            if (navigator.share && printRef.current) {
                // Try to share as text/html or provide download
                // For iOS, best option is to guide user to use Safari's share
                alert('On iOS: Use the Share button (square with arrow) at the bottom of your screen and select "Save to Files" or "Print" to save as PDF.');
            } else {
                // Fallback: scroll to top and show instructions
                if (printRef.current) {
                    printRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    alert('On iOS Add to Home Screen: Use the Share button (square with arrow) at the bottom of your screen and select "Save to Files" or "Print" to save as PDF.\n\nAlternatively, open this page in Safari and use File > Print > Save as PDF.');
                }
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
                        <button onClick={handlePrint} className="flex-1 sm:flex-none bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-3 sm:px-4 rounded-lg transition-colors duration-200 text-sm sm:text-base">
                            Print / Save PDF
                        </button>
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
