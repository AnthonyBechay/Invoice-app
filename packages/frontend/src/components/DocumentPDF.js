import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Create styles for the PDF
const styles = StyleSheet.create({
    page: {
        padding: 30,
        fontSize: 10,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
        paddingBottom: 15,
        borderBottom: '2px solid #333',
    },
    logo: {
        width: 60,
        height: 60,
        objectFit: 'contain',
    },
    companyInfo: {
        flex: 1,
    },
    companyName: {
        fontSize: 16,
        fontWeight: 'bold',
        marginBottom: 4,
        color: '#1a1a1a',
    },
    companyDetails: {
        fontSize: 9,
        color: '#555',
        marginBottom: 2,
    },
    documentTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        textAlign: 'center',
        marginVertical: 15,
        color: '#1a1a1a',
        textTransform: 'uppercase',
        letterSpacing: 1,
    },
    infoSection: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 20,
    },
    infoBox: {
        flex: 1,
        marginRight: 10,
    },
    infoLabel: {
        fontSize: 9,
        color: '#666',
        marginBottom: 3,
    },
    infoValue: {
        fontSize: 10,
        color: '#1a1a1a',
        fontWeight: 'bold',
        marginBottom: 2,
    },
    clientInfo: {
        fontSize: 9,
        color: '#555',
        marginBottom: 2,
    },
    table: {
        marginTop: 15,
        marginBottom: 15,
    },
    tableHeader: {
        flexDirection: 'row',
        backgroundColor: '#f0f0f0',
        padding: 8,
        fontWeight: 'bold',
        borderBottom: '2px solid #333',
    },
    tableRow: {
        flexDirection: 'row',
        padding: 8,
        borderBottom: '1px solid #e0e0e0',
    },
    tableCol1: {
        width: '50%',
        fontSize: 9,
    },
    tableCol2: {
        width: '15%',
        fontSize: 9,
        textAlign: 'right',
    },
    tableCol3: {
        width: '15%',
        fontSize: 9,
        textAlign: 'right',
    },
    tableCol4: {
        width: '20%',
        fontSize: 9,
        textAlign: 'right',
        fontWeight: 'bold',
    },
    totalsSection: {
        marginLeft: 'auto',
        width: '40%',
        marginTop: 10,
    },
    totalRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 6,
        borderBottom: '1px solid #e0e0e0',
    },
    totalLabel: {
        fontSize: 10,
        color: '#555',
    },
    totalValue: {
        fontSize: 10,
        color: '#1a1a1a',
        fontWeight: 'bold',
    },
    grandTotal: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 8,
        backgroundColor: '#f0f0f0',
        borderTop: '2px solid #333',
        marginTop: 5,
    },
    grandTotalLabel: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#1a1a1a',
    },
    grandTotalValue: {
        fontSize: 12,
        fontWeight: 'bold',
        color: '#059669',
    },
    notes: {
        marginTop: 20,
        padding: 10,
        backgroundColor: '#f9f9f9',
        borderRadius: 4,
    },
    notesLabel: {
        fontSize: 10,
        fontWeight: 'bold',
        marginBottom: 5,
        color: '#555',
    },
    notesText: {
        fontSize: 9,
        color: '#555',
        lineHeight: 1.4,
    },
    footer: {
        position: 'absolute',
        bottom: 30,
        left: 30,
        right: 30,
        textAlign: 'center',
        fontSize: 8,
        color: '#888',
        borderTop: '1px solid #e0e0e0',
        paddingTop: 10,
    },
});

const DocumentPDF = ({ document, userSettings }) => {
    // Format date
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Format currency
    const formatCurrency = (amount) => {
        return `$${parseFloat(amount || 0).toFixed(2)}`;
    };

    // Parse client info
    const clientInfo = {
        name: document.clientName || document.client?.name || 'Unknown Client',
        address: document.clientAddress || document.client?.address || '',
        location: document.clientLocation || document.client?.location || '',
        phone: document.clientPhone || document.client?.phone || document.client?.phoneNumber || '',
        vatNumber: document.clientVatNumber || document.client?.vatNumber || ''
    };

    // Use taxAmount (new field) or fall back to vatAmount (old field)
    const displayVatAmount = document.taxAmount || document.vatAmount || 0;

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header */}
                <View style={styles.header}>
                    <View style={styles.companyInfo}>
                        {userSettings?.logo && (
                            <Image src={userSettings.logo} style={styles.logo} />
                        )}
                        <Text style={styles.companyName}>
                            {userSettings?.companyName || 'Company Name'}
                        </Text>
                        {userSettings?.companyAddress && (
                            <Text style={styles.companyDetails}>
                                {userSettings.companyAddress}
                            </Text>
                        )}
                        {userSettings?.companyPhone && (
                            <Text style={styles.companyDetails}>
                                Phone: {userSettings.companyPhone}
                            </Text>
                        )}
                        {userSettings?.companyVatNumber && (
                            <Text style={styles.companyDetails}>
                                VAT #: {userSettings.companyVatNumber}
                            </Text>
                        )}
                    </View>
                </View>

                {/* Document Title */}
                <Text style={styles.documentTitle}>
                    {document.type === 'INVOICE' ? 'INVOICE' : 'PROFORMA INVOICE'}
                </Text>

                {/* Document Info and Client Info */}
                <View style={styles.infoSection}>
                    <View style={styles.infoBox}>
                        <Text style={styles.infoLabel}>Document Number:</Text>
                        <Text style={styles.infoValue}>#{document.documentNumber}</Text>
                        <Text style={styles.infoLabel}>Date:</Text>
                        <Text style={styles.infoValue}>{formatDate(document.date)}</Text>
                    </View>
                    <View style={styles.infoBox}>
                        <Text style={styles.infoLabel}>Bill To:</Text>
                        <Text style={styles.infoValue}>{clientInfo.name}</Text>
                        {clientInfo.address && (
                            <Text style={styles.clientInfo}>{clientInfo.address}</Text>
                        )}
                        {clientInfo.location && (
                            <Text style={styles.clientInfo}>{clientInfo.location}</Text>
                        )}
                        {clientInfo.phone && (
                            <Text style={styles.clientInfo}>Phone: {clientInfo.phone}</Text>
                        )}
                        {clientInfo.vatNumber && (
                            <Text style={styles.clientInfo}>VAT #: {clientInfo.vatNumber}</Text>
                        )}
                    </View>
                </View>

                {/* Items Table */}
                {document.items && document.items.length > 0 && (
                    <View style={styles.table}>
                        <View style={styles.tableHeader}>
                            <Text style={styles.tableCol1}>Description</Text>
                            <Text style={styles.tableCol2}>Quantity</Text>
                            <Text style={styles.tableCol3}>Unit Price</Text>
                            <Text style={styles.tableCol4}>Total</Text>
                        </View>
                        {document.items.map((item, index) => (
                            <View key={index} style={styles.tableRow}>
                                <Text style={styles.tableCol1}>{item.description}</Text>
                                <Text style={styles.tableCol2}>{item.quantity}</Text>
                                <Text style={styles.tableCol3}>{formatCurrency(item.unitPrice)}</Text>
                                <Text style={styles.tableCol4}>{formatCurrency(item.total)}</Text>
                            </View>
                        ))}
                    </View>
                )}

                {/* Labor Section */}
                {document.mandays && document.laborPrice && (
                    <View style={styles.table}>
                        <View style={styles.tableHeader}>
                            <Text style={styles.tableCol1}>Labor</Text>
                            <Text style={styles.tableCol2}>Man-days</Text>
                            <Text style={styles.tableCol3}>Rate/Day</Text>
                            <Text style={styles.tableCol4}>Total</Text>
                        </View>
                        <View style={styles.tableRow}>
                            <Text style={styles.tableCol1}>Professional Services</Text>
                            <Text style={styles.tableCol2}>{document.mandays}</Text>
                            <Text style={styles.tableCol3}>{formatCurrency(document.laborPrice)}</Text>
                            <Text style={styles.tableCol4}>
                                {formatCurrency(document.mandays * document.laborPrice)}
                            </Text>
                        </View>
                    </View>
                )}

                {/* Totals */}
                <View style={styles.totalsSection}>
                    <View style={styles.totalRow}>
                        <Text style={styles.totalLabel}>Subtotal:</Text>
                        <Text style={styles.totalValue}>{formatCurrency(document.subtotal)}</Text>
                    </View>
                    {document.vatApplied && displayVatAmount > 0 && (
                        <View style={styles.totalRow}>
                            <Text style={styles.totalLabel}>VAT:</Text>
                            <Text style={styles.totalValue}>{formatCurrency(displayVatAmount)}</Text>
                        </View>
                    )}
                    <View style={styles.grandTotal}>
                        <Text style={styles.grandTotalLabel}>Total:</Text>
                        <Text style={styles.grandTotalValue}>{formatCurrency(document.total)}</Text>
                    </View>
                </View>

                {/* Notes */}
                {document.notes && (
                    <View style={styles.notes}>
                        <Text style={styles.notesLabel}>Notes:</Text>
                        <Text style={styles.notesText}>{document.notes}</Text>
                    </View>
                )}

                {/* Footer */}
                <View style={styles.footer}>
                    <Text>Thank you for your business!</Text>
                    {userSettings?.footerMessage && (
                        <Text style={{ marginTop: 3 }}>{userSettings.footerMessage}</Text>
                    )}
                </View>
            </Page>
        </Document>
    );
};

export default DocumentPDF;
