import React from 'react';
import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';

// Create styles for the PDF
const styles = StyleSheet.create({
    page: {
        padding: 40,
        fontSize: 11,
        fontFamily: 'Helvetica',
        backgroundColor: '#ffffff',
    },
    header: {
        marginBottom: 20,
        paddingBottom: 15,
        borderBottom: '2px solid #333',
        textAlign: 'center',
    },
    logo: {
        width: 80,
        height: 80,
        marginBottom: 10,
        marginLeft: 'auto',
        marginRight: 'auto',
        objectFit: 'contain',
    },
    companyName: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 5,
        color: '#1a1a1a',
    },
    companyInfo: {
        fontSize: 9,
        color: '#555',
        marginBottom: 2,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        marginVertical: 20,
        color: '#1a1a1a',
        letterSpacing: 1,
    },
    detailsContainer: {
        marginBottom: 20,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 8,
        borderBottom: '1px solid #e0e0e0',
    },
    detailLabel: {
        fontSize: 11,
        color: '#555',
        fontWeight: 'bold',
    },
    detailValue: {
        fontSize: 11,
        color: '#1a1a1a',
        fontWeight: 'normal',
        textAlign: 'right',
        maxWidth: '60%',
    },
    notesContainer: {
        paddingVertical: 8,
        borderBottom: '1px solid #e0e0e0',
        marginBottom: 8,
    },
    notesLabel: {
        fontSize: 11,
        color: '#555',
        fontWeight: 'bold',
        marginBottom: 4,
    },
    notesText: {
        fontSize: 10,
        color: '#555',
        lineHeight: 1.4,
    },
    totalContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingVertical: 15,
        paddingHorizontal: 15,
        marginTop: 15,
        borderTop: '2px solid #333',
        backgroundColor: '#f9f9f9',
        borderRadius: 4,
    },
    totalLabel: {
        fontSize: 14,
        fontWeight: 'bold',
        color: '#1a1a1a',
    },
    totalAmount: {
        fontSize: 16,
        fontWeight: 'bold',
        color: '#059669', // Green color for amount
    },
    footer: {
        marginTop: 30,
        paddingTop: 20,
        borderTop: '2px solid #333',
        textAlign: 'center',
    },
    footerText: {
        fontSize: 10,
        color: '#666',
        marginBottom: 3,
    },
    footerCompany: {
        fontSize: 11,
        fontWeight: 'bold',
        color: '#1a1a1a',
        marginBottom: 5,
    },
    footerMessage: {
        fontSize: 8,
        color: '#888',
        marginTop: 5,
    },
});

const PaymentReceiptPDF = ({ payment, userSettings }) => {
    // Format date
    const formatDate = (dateString) => {
        const date = new Date(dateString);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    // Format amount
    const formatAmount = (amount) => {
        return `$${parseFloat(amount || 0).toFixed(2)}`;
    };

    // Get receipt number
    const receiptNumber = payment.id.substring(0, 8).toUpperCase();

    // Format payment method
    const formatPaymentMethod = (method) => {
        if (!method) return 'N/A';
        return method.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
    };

    return (
        <Document>
            <Page size="A4" style={styles.page}>
                {/* Header with company info */}
                <View style={styles.header}>
                    {userSettings?.logo && (
                        <Image
                            src={userSettings.logo}
                            style={styles.logo}
                        />
                    )}
                    <Text style={styles.companyName}>
                        {userSettings?.companyName || 'Company Name'}
                    </Text>
                    {userSettings?.companyAddress && (
                        <Text style={styles.companyInfo}>
                            {userSettings.companyAddress}
                        </Text>
                    )}
                    {userSettings?.companyPhone && (
                        <Text style={styles.companyInfo}>
                            {userSettings.companyPhone}
                        </Text>
                    )}
                    {userSettings?.companyVatNumber && (
                        <Text style={styles.companyInfo}>
                            VAT #: {userSettings.companyVatNumber}
                        </Text>
                    )}
                </View>

                {/* Title */}
                <Text style={styles.title}>PAYMENT RECEIPT</Text>

                {/* Payment Details */}
                <View style={styles.detailsContainer}>
                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Receipt Number:</Text>
                        <Text style={styles.detailValue}>{receiptNumber}</Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Date:</Text>
                        <Text style={styles.detailValue}>
                            {formatDate(payment.paymentDate)}
                        </Text>
                    </View>

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Client:</Text>
                        <Text style={styles.detailValue}>
                            {payment.clientName || 'N/A'}
                        </Text>
                    </View>

                    {payment.invoiceNumber && (
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Invoice Number:</Text>
                            <Text style={styles.detailValue}>
                                {payment.invoiceNumber}
                            </Text>
                        </View>
                    )}

                    <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Payment Method:</Text>
                        <Text style={styles.detailValue}>
                            {formatPaymentMethod(payment.paymentMethod)}
                        </Text>
                    </View>

                    {payment.notes && (
                        <View style={styles.notesContainer}>
                            <Text style={styles.notesLabel}>Notes:</Text>
                            <Text style={styles.notesText}>{payment.notes}</Text>
                        </View>
                    )}
                </View>

                {/* Total Amount */}
                <View style={styles.totalContainer}>
                    <Text style={styles.totalLabel}>Amount Paid:</Text>
                    <Text style={styles.totalAmount}>
                        {formatAmount(payment.amount)}
                    </Text>
                </View>

                {/* Footer */}
                <View style={styles.footer}>
                    <Text style={styles.footerText}>Thank you for your payment!</Text>
                    <Text style={styles.footerCompany}>
                        {userSettings?.companyName || 'Company Name'}
                    </Text>
                    {userSettings?.footerMessage && (
                        <Text style={styles.footerMessage}>
                            {userSettings.footerMessage}
                        </Text>
                    )}
                </View>
            </Page>
        </Document>
    );
};

export default PaymentReceiptPDF;
