import { collection, query, getDocs, setDoc, doc, addDoc } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * DATA RECONSTRUCTION UTILITIES
 *
 * These functions recover lost data from existing documents by extracting
 * embedded client and payment information from invoices/proformas.
 */

export const reconstructClients = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   RECONSTRUCTING CLIENTS FROM DOCUMENTS                    ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        // SAFETY CHECK 1: Check if clients collection already has data
        console.log('SAFETY CHECK: Checking if clients already exist...');
        const existingClientsQuery = query(collection(db, `clients/${userId}/userClients`));
        const existingClientsSnapshot = await getDocs(existingClientsQuery);

        if (existingClientsSnapshot.size > 0) {
            console.log(`⚠ WARNING: Found ${existingClientsSnapshot.size} existing clients`);
            console.log('Reconstruction will ADD to existing clients (duplicates may occur)');
            console.log('Existing client IDs will be UPDATED with new data');
        } else {
            console.log('✓ No existing clients found - safe to reconstruct');
        }

        // Get all documents
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);

        console.log(`Found ${documentsSnapshot.size} documents`);

        if (documentsSnapshot.size === 0) {
            console.log('❌ No documents found - cannot reconstruct clients');
            return { success: false, error: 'No documents found' };
        }

        // Extract unique clients from documents
        const clientsMap = new Map();

        documentsSnapshot.forEach(docSnap => {
            const docData = docSnap.data();

            console.log(`\nProcessing document: ${docSnap.id}`);
            console.log(`  Type: ${docData.type}`);
            console.log(`  Number: ${docData.documentNumber || docData.invoiceNumber || docData.proformaNumber}`);

            // Check if document has client data
            if (docData.client) {
                const client = docData.client;
                const clientId = client.id || client.clientId;

                if (clientId) {
                    console.log(`  Found client: ID=${clientId}, Name=${client.name || 'N/A'}`);

                    // If we haven't seen this client before, or if this version has more data
                    if (!clientsMap.has(clientId) || Object.keys(client).length > Object.keys(clientsMap.get(clientId)).length) {
                        clientsMap.set(clientId, {
                            id: clientId,
                            name: client.name || '',
                            email: client.email || '',
                            phone: client.phone || '',
                            address: client.address || '',
                            taxId: client.taxId || '',
                            notes: client.notes || '',
                            createdAt: client.createdAt || new Date(),
                            reconstructed: true,
                            reconstructedAt: new Date(),
                            reconstructedFrom: docSnap.id
                        });
                    }
                } else {
                    console.log(`  ⚠ Client has no ID: ${JSON.stringify(client)}`);
                }
            } else if (docData.clientId) {
                // Some documents might have clientId but not full client object
                console.log(`  Found clientId only: ${docData.clientId}`);
                if (!clientsMap.has(docData.clientId)) {
                    clientsMap.set(docData.clientId, {
                        id: docData.clientId,
                        name: docData.clientName || 'Unknown Client',
                        email: '',
                        phone: '',
                        address: '',
                        taxId: '',
                        notes: 'Reconstructed from partial data',
                        createdAt: new Date(),
                        reconstructed: true,
                        reconstructedAt: new Date(),
                        reconstructedFrom: docSnap.id
                    });
                }
            } else {
                console.log(`  ⚠ No client data in this document`);
            }
        });

        console.log(`\n═══════════════════════════════════════════════════════════`);
        console.log(`Found ${clientsMap.size} unique clients in documents`);

        // Now write clients back to database
        let restoredCount = 0;
        console.log('\nRestoring clients to database...');

        for (const [clientId, clientData] of clientsMap.entries()) {
            try {
                const clientDocId = clientId.toString();
                await setDoc(doc(db, `clients/${userId}/userClients`, clientDocId), clientData);
                restoredCount++;
                console.log(`  ✓ Restored client ${clientId}: ${clientData.name}`);
            } catch (error) {
                console.error(`  ✗ Failed to restore client ${clientId}:`, error);
            }
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   CLIENT RECONSTRUCTION - COMPLETED                        ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`✓ Reconstructed ${restoredCount} clients from ${documentsSnapshot.size} documents`);

        return {
            success: true,
            totalDocuments: documentsSnapshot.size,
            clientsFound: clientsMap.size,
            clientsRestored: restoredCount,
            clients: Array.from(clientsMap.values())
        };

    } catch (error) {
        console.error('Client reconstruction failed:', error);
        return { success: false, error: error.message };
    }
};

export const reconstructPayments = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   RECONSTRUCTING PAYMENTS FROM DOCUMENTS                   ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        // SAFETY CHECK: Check if payments already exist
        console.log('SAFETY CHECK: Checking if payments already exist...');
        const existingPaymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );
        const existingPaymentsSnapshot = await getDocs(existingPaymentsQuery);

        if (existingPaymentsSnapshot.size > 0) {
            console.log(`⚠ WARNING: Found ${existingPaymentsSnapshot.size} existing payments`);
            console.log('Reconstruction will ADD new payments (may create duplicates if run multiple times)');
            console.log('RECOMMENDED: Only run this once, or delete existing payments first');
        } else {
            console.log('✓ No existing payments found - safe to reconstruct');
        }

        // Get all documents
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);

        console.log(`Found ${documentsSnapshot.size} documents`);

        if (documentsSnapshot.size === 0) {
            console.log('❌ No documents found - cannot reconstruct payments');
            return { success: false, error: 'No documents found' };
        }

        // Extract payments from documents
        const paymentsToRestore = [];

        documentsSnapshot.forEach(docSnap => {
            const docData = docSnap.data();

            console.log(`\nProcessing document: ${docSnap.id}`);
            console.log(`  Type: ${docData.type}`);
            console.log(`  Number: ${docData.documentNumber || docData.invoiceNumber || docData.proformaNumber}`);

            // Check if document has embedded payments array (old format)
            if (docData.payments && Array.isArray(docData.payments) && docData.payments.length > 0) {
                console.log(`  Found ${docData.payments.length} embedded payments`);

                docData.payments.forEach((payment, index) => {
                    const paymentData = {
                        userId: userId,
                        clientId: docData.client?.id || docData.clientId || 'unknown',
                        clientName: docData.client?.name || docData.clientName || 'Unknown',
                        documentId: docSnap.id,
                        amount: payment.amount || 0,
                        paymentDate: payment.date || payment.timestamp || new Date(),
                        paymentMethod: payment.method || 'unknown',
                        reference: payment.reference || `Payment ${index + 1} for ${docData.type} #${docData.documentNumber || docData.invoiceNumber || docData.proformaNumber}`,
                        notes: payment.note || payment.notes || 'Reconstructed from document',
                        createdAt: payment.timestamp || payment.date || new Date(),
                        updatedAt: new Date(),
                        settledToDocument: true,
                        reconstructed: true,
                        reconstructedAt: new Date(),
                        reconstructedFrom: docSnap.id
                    };

                    paymentsToRestore.push(paymentData);
                    console.log(`    Payment ${index + 1}: ${payment.amount} on ${payment.date?.toDate?.() || payment.date}`);
                });
            }
            // Check if document has totalPaid but no payments array (migrated but payments lost)
            else if (docData.totalPaid && docData.totalPaid > 0) {
                console.log(`  Document shows totalPaid: ${docData.totalPaid}, but no payment array`);
                console.log(`  Creating single payment record for total amount`);

                const paymentData = {
                    userId: userId,
                    clientId: docData.client?.id || docData.clientId || 'unknown',
                    clientName: docData.client?.name || docData.clientName || 'Unknown',
                    documentId: docSnap.id,
                    amount: docData.totalPaid,
                    paymentDate: docData.updatedAt || docData.createdAt || new Date(),
                    paymentMethod: 'unknown',
                    reference: `Reconstructed payment for ${docData.type} #${docData.documentNumber || docData.invoiceNumber || docData.proformaNumber}`,
                    notes: 'Reconstructed from totalPaid field - original payment details lost',
                    createdAt: docData.createdAt || new Date(),
                    updatedAt: new Date(),
                    settledToDocument: true,
                    reconstructed: true,
                    reconstructedAt: new Date(),
                    reconstructedFrom: docSnap.id,
                    partial: true
                };

                paymentsToRestore.push(paymentData);
            } else {
                console.log(`  No payments found in this document`);
            }
        });

        console.log(`\n═══════════════════════════════════════════════════════════`);
        console.log(`Found ${paymentsToRestore.length} payments to restore`);

        // Now write payments back to database
        let restoredCount = 0;
        console.log('\nRestoring payments to database...');

        for (const paymentData of paymentsToRestore) {
            try {
                await addDoc(collection(db, 'payments'), paymentData);
                restoredCount++;
                console.log(`  ✓ Restored payment: ${paymentData.amount} for document ${paymentData.documentId}`);
            } catch (error) {
                console.error(`  ✗ Failed to restore payment:`, error);
            }
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   PAYMENT RECONSTRUCTION - COMPLETED                       ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`✓ Reconstructed ${restoredCount} payments from ${documentsSnapshot.size} documents`);

        return {
            success: true,
            totalDocuments: documentsSnapshot.size,
            paymentsFound: paymentsToRestore.length,
            paymentsRestored: restoredCount,
            payments: paymentsToRestore
        };

    } catch (error) {
        console.error('Payment reconstruction failed:', error);
        return { success: false, error: error.message };
    }
};

export const reconstructItems = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   RECONSTRUCTING ITEMS/STOCK FROM DOCUMENTS                ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        // SAFETY CHECK: Check if items already exist
        console.log('SAFETY CHECK: Checking if items already exist...');
        const existingItemsQuery = query(collection(db, `items/${userId}/userItems`));
        const existingItemsSnapshot = await getDocs(existingItemsQuery);

        if (existingItemsSnapshot.size > 0) {
            console.log(`⚠ WARNING: Found ${existingItemsSnapshot.size} existing items`);
            console.log('Reconstruction will UPDATE existing items with same ID');
            console.log('Items with different IDs will be ADDED');
        } else {
            console.log('✓ No existing items found - safe to reconstruct');
        }

        // Get all documents
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);

        console.log(`Found ${documentsSnapshot.size} documents`);

        if (documentsSnapshot.size === 0) {
            console.log('❌ No documents found - cannot reconstruct items');
            return { success: false, error: 'No documents found' };
        }

        // Extract unique items from documents
        const itemsMap = new Map();

        documentsSnapshot.forEach(docSnap => {
            const docData = docSnap.data();

            console.log(`\nProcessing document: ${docSnap.id}`);
            console.log(`  Type: ${docData.type}`);
            console.log(`  Number: ${docData.documentNumber || docData.invoiceNumber || docData.proformaNumber}`);

            // Check if document has items array
            if (docData.items && Array.isArray(docData.items) && docData.items.length > 0) {
                console.log(`  Found ${docData.items.length} items`);

                docData.items.forEach((item, index) => {
                    const itemId = item.itemId || item.id;

                    if (itemId) {
                        console.log(`    Item ${index + 1}: ${item.name || 'Unnamed'} (ID: ${itemId})`);

                        // If we haven't seen this item before, or if this version has more data
                        if (!itemsMap.has(itemId) || Object.keys(item).length > Object.keys(itemsMap.get(itemId)).length) {
                            itemsMap.set(itemId, {
                                id: itemId,
                                itemId: item.itemId || itemId,
                                name: item.name || '',
                                brand: item.brand || '',
                                category: item.category || '',
                                subCategory: item.subCategory || '',
                                specs: item.specs || '',
                                partNumber: item.partNumber || '',
                                type: item.type || '',
                                color: item.color || '',
                                buyingPrice: item.buyingPrice || 0,
                                sellingPrice: item.sellingPrice || item.unitPrice || 0,
                                customField1: item.customField1 || '',
                                customField2: item.customField2 || '',
                                createdAt: new Date(),
                                reconstructed: true,
                                reconstructedAt: new Date(),
                                reconstructedFrom: docSnap.id
                            });
                        }
                    } else {
                        console.log(`    ⚠ Item has no ID: ${item.name || 'Unnamed'}`);
                    }
                });
            } else {
                console.log(`  No items found in this document`);
            }
        });

        console.log(`\n═══════════════════════════════════════════════════════════`);
        console.log(`Found ${itemsMap.size} unique items in documents`);

        // Now write items back to database
        let restoredCount = 0;
        console.log('\nRestoring items to database...');

        for (const [itemId, itemData] of itemsMap.entries()) {
            try {
                const itemDocId = itemId.toString();
                await setDoc(doc(db, `items/${userId}/userItems`, itemDocId), itemData);
                restoredCount++;
                console.log(`  ✓ Restored item ${itemId}: ${itemData.name} (${itemData.brand})`);
            } catch (error) {
                console.error(`  ✗ Failed to restore item ${itemId}:`, error);
            }
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   ITEM RECONSTRUCTION - COMPLETED                          ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`✓ Reconstructed ${restoredCount} items from ${documentsSnapshot.size} documents`);

        return {
            success: true,
            totalDocuments: documentsSnapshot.size,
            itemsFound: itemsMap.size,
            itemsRestored: restoredCount,
            items: Array.from(itemsMap.values())
        };

    } catch (error) {
        console.error('Item reconstruction failed:', error);
        return { success: false, error: error.message };
    }
};

export const fullDataReconstruction = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   FULL DATA RECONSTRUCTION - STARTING                      ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        const results = {
            userId: userId,
            timestamp: new Date().toISOString(),
            clients: null,
            payments: null,
            items: null,
            success: true,
            errors: []
        };

        // Step 1: Reconstruct clients
        console.log('STEP 1: Reconstructing clients...');
        const clientsResult = await reconstructClients(userId);
        results.clients = clientsResult;

        if (!clientsResult.success) {
            results.errors.push(`Client reconstruction failed: ${clientsResult.error}`);
        }

        // Step 2: Reconstruct payments
        console.log('\nSTEP 2: Reconstructing payments...');
        const paymentsResult = await reconstructPayments(userId);
        results.payments = paymentsResult;

        if (!paymentsResult.success) {
            results.errors.push(`Payment reconstruction failed: ${paymentsResult.error}`);
        }

        // Step 3: Reconstruct items/stock
        console.log('\nSTEP 3: Reconstructing items/stock...');
        const itemsResult = await reconstructItems(userId);
        results.items = itemsResult;

        if (!itemsResult.success) {
            results.errors.push(`Item reconstruction failed: ${itemsResult.error}`);
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   FULL DATA RECONSTRUCTION - COMPLETED                     ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Clients reconstructed: ${clientsResult.clientsRestored || 0}`);
        console.log(`Payments reconstructed: ${paymentsResult.paymentsRestored || 0}`);
        console.log(`Items reconstructed: ${itemsResult.itemsRestored || 0}`);

        if (results.errors.length > 0) {
            console.log(`\n⚠ Errors encountered: ${results.errors.length}`);
            results.errors.forEach(err => console.log(`  - ${err}`));
            results.success = false;
        } else {
            console.log('\n✓ All data successfully reconstructed!');
        }

        return results;

    } catch (error) {
        console.error('Full reconstruction failed:', error);
        return { success: false, error: error.message };
    }
};
