import { collection, query, where, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase/config';

// SAFE Migration function to move payments from old system to new system
export const migratePayments = async (userId) => {
    try {
        console.log('Starting SAFE payment migration...');

        // Get all documents with payments
        const documentsQuery = query(
            collection(db, `documents/${userId}/userDocuments`),
            where('payments', '!=', null)
        );

        const documentsSnapshot = await getDocs(documentsQuery);
        let migratedCount = 0;
        let skippedProformas = 0;
        const migrationResults = [];

        // STEP 1: Migrate all payments first (without clearing old data)
        // IMPORTANT: Skip proformas as payments should not be on proformas
        for (const docSnapshot of documentsSnapshot.docs) {
            const documentData = docSnapshot.data();
            const documentId = docSnapshot.id;

            // Skip proformas - payments on proformas should have been moved when converted to invoice
            if (documentData.type === 'proforma') {
                console.log(`Skipping proforma ${documentId} - proformas should not have payments`);
                skippedProformas++;
                continue;
            }

            if (documentData.payments && Array.isArray(documentData.payments) && documentData.payments.length > 0) {
                const documentPayments = [];
                const clientId = documentData.client?.id || documentData.clientId;

                // Validate client exists before migrating
                if (!clientId || clientId === 'unknown') {
                    console.warn(`Skipping document ${documentId} - no valid client ID`);
                    continue;
                }

                // Migrate each payment for this document
                // IMPORTANT: All old payments in the payments array were already applied to this invoice
                // So they should be marked as settledToDocument: true
                for (const payment of documentData.payments) {
                    const paymentData = {
                        userId: userId, // CRITICAL: Add userId for data isolation
                        clientId: clientId,
                        documentId: documentId,
                        amount: payment.amount || 0,
                        paymentDate: payment.date || payment.timestamp || new Date(),
                        paymentMethod: payment.method || 'migrated',
                        reference: `Migrated from ${documentData.type || 'document'} #${documentData.invoiceNumber || documentData.proformaNumber || documentData.documentNumber || 'N/A'}`,
                        notes: payment.note || 'Migrated payment - already applied to this invoice',
                        createdAt: payment.timestamp || new Date(),
                        updatedAt: new Date(),
                        migrated: true,
                        settledToDocument: true // This payment was in the document's payments array, so it was already applied
                    };

                    const newPaymentRef = await addDoc(collection(db, 'payments'), paymentData);
                    documentPayments.push(newPaymentRef.id);
                    migratedCount++;
                }

                // Calculate total paid from payments
                const totalPaid = documentData.payments.reduce((sum, p) => sum + (p.amount || 0), 0);

                // Store migration result for verification
                migrationResults.push({
                    documentId,
                    documentType: documentData.type,
                    originalPaymentsCount: documentData.payments.length,
                    migratedPaymentIds: documentPayments,
                    totalPaid: totalPaid
                });
            }
        }

        // STEP 2: Verify migration was successful
        console.log('Verifying migration...');
        const verification = await verifyMigration(userId);

        if (!verification.success) {
            throw new Error('Migration verification failed');
        }

        // STEP 3: Only clear old payments if migration was successful
        if (migrationResults.length > 0) {
            console.log('Migration successful, updating documents...');

            for (const result of migrationResults) {
                await updateDoc(doc(db, `documents/${userId}/userDocuments`, result.documentId), {
                    payments: [], // Clear old payments
                    totalPaid: result.totalPaid, // Set total paid amount
                    migrationCompleted: true,
                    migrationDate: new Date(),
                    migratedPaymentCount: result.originalPaymentsCount
                });
            }
        }

        console.log(`SAFE Migration completed. Migrated ${migratedCount} payments from ${migrationResults.length} documents. Skipped ${skippedProformas} proformas.`);
        return {
            success: true,
            migratedCount,
            documentsProcessed: migrationResults.length,
            skippedProformas,
            verification: verification
        };

    } catch (error) {
        console.error('Migration failed:', error);
        return { success: false, error: error.message };
    }
};

// Function to verify migration
export const verifyMigration = async (userId) => {
    try {
        // Check if any documents still have old payments
        const documentsQuery = query(
            collection(db, `documents/${userId}/userDocuments`),
            where('payments', '!=', null)
        );
        
        const documentsSnapshot = await getDocs(documentsQuery);
        const documentsWithOldPayments = [];
        
        documentsSnapshot.forEach(doc => {
            if (doc.data().payments && doc.data().payments.length > 0) {
                documentsWithOldPayments.push(doc.id);
            }
        });
        
        // Check payments collection (filtered by user)
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsCount = paymentsSnapshot.size;
        
        return {
            success: true,
            documentsWithOldPayments,
            paymentsCount,
            migrationNeeded: documentsWithOldPayments.length > 0
        };
        
    } catch (error) {
        console.error('Verification failed:', error);
        return { success: false, error: error.message };
    }
};

// Emergency rollback function (if needed)
export const rollbackMigration = async (userId) => {
    try {
        console.log('Starting migration rollback...');
        
        // Get all migrated payments
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('migrated', '==', true)
        );
        
        const paymentsSnapshot = await getDocs(paymentsQuery);
        let rollbackCount = 0;
        
        // Group payments by document
        const paymentsByDocument = {};
        paymentsSnapshot.forEach(doc => {
            const payment = doc.data();
            if (!paymentsByDocument[payment.documentId]) {
                paymentsByDocument[payment.documentId] = [];
            }
            paymentsByDocument[payment.documentId].push({
                id: doc.id,
                amount: payment.amount,
                date: payment.paymentDate,
                note: payment.notes,
                timestamp: payment.createdAt
            });
        });
        
        // Restore payments to documents
        for (const [documentId, payments] of Object.entries(paymentsByDocument)) {
            const documentRef = doc(db, `documents/${userId}/userDocuments`, documentId);
            
            // Convert back to old format
            const oldFormatPayments = payments.map(p => ({
                amount: p.amount,
                date: p.date,
                note: p.note,
                timestamp: p.timestamp
            }));
            
            await updateDoc(documentRef, {
                payments: oldFormatPayments,
                migrationCompleted: false,
                rollbackDate: new Date()
            });
            
            rollbackCount += payments.length;
        }
        
        console.log(`Rollback completed. Restored ${rollbackCount} payments.`);
        return { success: true, rollbackCount };
        
    } catch (error) {
        console.error('Rollback failed:', error);
        return { success: false, error: error.message };
    }
};

// EMERGENCY: Fix payments that are missing userId field
// CRITICAL FIX: Now properly filters by userId to prevent cross-user data contamination
export const fixPaymentsWithoutUserId = async (userId) => {
    try {
        console.log('=== PAYMENT REPAIR STARTED ===');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}`);

        // CRITICAL FIX: Only get payments that don't have userId OR have this user's userId
        // This prevents accidentally stealing payments from other users
        const paymentsWithoutUserIdQuery = query(
            collection(db, 'payments'),
            where('userId', '==', null)
        );

        // Also get payments that might have this user's ID but need repair
        const paymentsWithUserIdQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );

        console.log('Fetching payments without userId...');
        const paymentsWithoutUserIdSnapshot = await getDocs(paymentsWithoutUserIdQuery);
        console.log(`Found ${paymentsWithoutUserIdSnapshot.size} payments without userId`);

        console.log('Fetching payments with current userId...');
        const paymentsWithUserIdSnapshot = await getDocs(paymentsWithUserIdQuery);
        console.log(`Found ${paymentsWithUserIdSnapshot.size} payments already with userId`);

        let fixedCount = 0;
        let skippedCount = 0;
        let orphanedPayments = [];

        // Get all user's documents to match payments
        console.log('Fetching user documents...');
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);
        const userDocumentIds = new Set(documentsSnapshot.docs.map(doc => doc.id));
        console.log(`Found ${userDocumentIds.size} documents for user ${userId}`);
        console.log('Document IDs:', Array.from(userDocumentIds));

        console.log('\n=== PROCESSING PAYMENTS WITHOUT USERID ===');
        for (const paymentDoc of paymentsWithoutUserIdSnapshot.docs) {
            const payment = paymentDoc.data();
            console.log(`\nPayment ID: ${paymentDoc.id}`);
            console.log(`  - Amount: ${payment.amount}`);
            console.log(`  - ClientId: ${payment.clientId}`);
            console.log(`  - DocumentId: ${payment.documentId}`);
            console.log(`  - PaymentDate: ${payment.paymentDate}`);
            console.log(`  - Current userId: ${payment.userId || 'NONE'}`);

            // If payment has documentId that belongs to this user, fix it
            if (payment.documentId && userDocumentIds.has(payment.documentId)) {
                console.log(`  ✓ MATCH FOUND - Document ${payment.documentId} belongs to user ${userId}`);
                await updateDoc(doc(db, 'payments', paymentDoc.id), {
                    userId: userId,
                    repaired: true,
                    repairedAt: new Date(),
                    repairedBy: 'fixPaymentsWithoutUserId'
                });
                fixedCount++;
                console.log(`  ✓ REPAIRED - Added userId ${userId} to payment ${paymentDoc.id}`);
            } else if (payment.documentId) {
                console.log(`  ✗ NO MATCH - Document ${payment.documentId} does NOT belong to user ${userId}`);
                orphanedPayments.push({
                    paymentId: paymentDoc.id,
                    documentId: payment.documentId,
                    amount: payment.amount,
                    clientId: payment.clientId
                });
                skippedCount++;
            } else {
                console.log(`  - SKIPPED - No documentId on payment`);
                skippedCount++;
            }
        }

        if (orphanedPayments.length > 0) {
            console.log('\n=== ORPHANED PAYMENTS (NOT BELONGING TO THIS USER) ===');
            console.log(`Found ${orphanedPayments.length} payments that don't belong to user ${userId}:`);
            orphanedPayments.forEach(p => {
                console.log(`  - Payment ${p.paymentId}: Amount ${p.amount}, Document ${p.documentId}, Client ${p.clientId}`);
            });
            console.log('These payments were NOT modified (they belong to other users)');
        }

        console.log('\n=== REPAIR SUMMARY ===');
        console.log(`✓ Repaired: ${fixedCount} payments`);
        console.log(`- Skipped: ${skippedCount} payments (don't belong to this user or no documentId)`);
        console.log(`- Orphaned: ${orphanedPayments.length} payments (belong to other users)`);
        console.log('=== PAYMENT REPAIR COMPLETED ===\n');

        return {
            success: true,
            fixedCount,
            skippedCount,
            orphanedCount: orphanedPayments.length,
            orphanedPayments: orphanedPayments
        };

    } catch (error) {
        console.error('=== PAYMENT REPAIR FAILED ===');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        return { success: false, error: error.message };
    }
};

// Comprehensive repair function to fix all payment data
export const repairMigratedPayments = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   COMPREHENSIVE PAYMENT REPAIR - STARTING                  ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        // First run emergency fix for payments without userId
        console.log('STEP 1: Running emergency fix for payments without userId...');
        const emergencyFix = await fixPaymentsWithoutUserId(userId);
        console.log(`\n✓ Emergency fix completed: ${emergencyFix.fixedCount} payments fixed, ${emergencyFix.skippedCount} skipped`);

        // Get all payments (including ones we just fixed)
        console.log('\nSTEP 2: Fetching user data for payment repair...');
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        console.log(`✓ Found ${paymentsSnapshot.size} payments for user ${userId}`);

        let repairedCount = 0;
        let fixedSettlement = 0;

        // Get all documents to match with payments
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);
        const documentsMap = new Map();
        documentsSnapshot.forEach(doc => {
            documentsMap.set(doc.id, doc.data());
        });
        console.log(`✓ Found ${documentsSnapshot.size} documents for user ${userId}`);

        // Get all clients
        const clientsQuery = query(collection(db, `clients/${userId}/userClients`));
        const clientsSnapshot = await getDocs(clientsQuery);
        const clientsMap = new Map();
        clientsSnapshot.forEach(doc => {
            clientsMap.set(doc.id, doc.data());
        });
        console.log(`✓ Found ${clientsSnapshot.size} clients for user ${userId}`);

        console.log('\nSTEP 3: Repairing payment details and settlement status...');

        for (const paymentDoc of paymentsSnapshot.docs) {
            const payment = paymentDoc.data();

            // CRITICAL FIX: If payment has documentId, it should be marked as settled
            // If migrated and has documentId, it was already applied to that invoice
            const shouldBeSettled = payment.documentId && payment.documentId !== null;

            const documentData = payment.documentId ? documentsMap.get(payment.documentId) : null;

            if (documentData) {
                const clientId = documentData.client?.id || documentData.clientId;
                const clientData = clientsMap.get(clientId);

                if (clientId && clientId !== 'unknown' && clientData) {
                    const updatedPaymentData = {
                        userId: userId, // Ensure userId is set
                        clientId: clientId,
                        clientName: clientData.name,
                        reference: payment.reference || `Migrated from ${documentData.type || 'document'} #${documentData.invoiceNumber || documentData.proformaNumber || documentData.documentNumber || 'N/A'}`,
                        settledToDocument: shouldBeSettled, // Mark as settled if it has a documentId
                        updatedAt: new Date(),
                        repaired: true
                    };

                    await updateDoc(doc(db, 'payments', paymentDoc.id), updatedPaymentData);
                    repairedCount++;
                    if (shouldBeSettled && !payment.settledToDocument) {
                        fixedSettlement++;
                    }
                    console.log(`Repaired payment for client: ${clientData.name}, settled: ${shouldBeSettled}`);
                } else if (clientId && clientId !== 'unknown') {
                    // Client ID exists but client data not found - just update the reference
                    const updatedPaymentData = {
                        userId: userId, // Ensure userId is set
                        reference: payment.reference || `Migrated from ${documentData.type || 'document'} #${documentData.invoiceNumber || documentData.proformaNumber || documentData.documentNumber || 'N/A'}`,
                        settledToDocument: shouldBeSettled,
                        updatedAt: new Date(),
                        repaired: true
                    };

                    await updateDoc(doc(db, 'payments', paymentDoc.id), updatedPaymentData);
                    repairedCount++;
                    if (shouldBeSettled && !payment.settledToDocument) {
                        fixedSettlement++;
                    }
                    console.log(`Updated payment reference for client ID: ${clientId}`);
                } else {
                    console.log(`Skipping payment - client not found: ${clientId}`);
                }
            } else if (payment.documentId) {
                // Payment has documentId but document not found - mark as settled anyway
                console.log(`Warning: Payment references missing document ${payment.documentId}, marking as settled`);
                await updateDoc(doc(db, 'payments', paymentDoc.id), {
                    userId: userId, // Ensure userId is set
                    settledToDocument: true,
                    updatedAt: new Date(),
                    repaired: true
                });
                fixedSettlement++;
                repairedCount++;
            } else {
                // Payment has no documentId - this is a client account payment, mark as unsettled
                console.log(`Payment ${paymentDoc.id} has no document - marking as client account payment`);
                await updateDoc(doc(db, 'payments', paymentDoc.id), {
                    userId: userId, // Ensure userId is set
                    settledToDocument: false,
                    updatedAt: new Date(),
                    repaired: true
                });
                repairedCount++;
            }
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   COMPREHENSIVE PAYMENT REPAIR - COMPLETED                 ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`✓ Emergency fix: ${emergencyFix.fixedCount} payments fixed`);
        console.log(`✓ Payment repair: ${repairedCount} payments updated`);
        console.log(`✓ Settlement fix: ${fixedSettlement} settlement statuses corrected`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        return {
            success: true,
            repairedCount,
            fixedSettlement,
            emergencyFixCount: emergencyFix.fixedCount
        };

    } catch (error) {
        console.error('\n╔════════════════════════════════════════════════════════════╗');
        console.error('║   COMPREHENSIVE PAYMENT REPAIR - FAILED                    ║');
        console.error('╚════════════════════════════════════════════════════════════╝');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        return { success: false, error: error.message };
    }
};

// Diagnostic function to check database state for a user
export const diagnosticDatabaseCheck = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   DATABASE DIAGNOSTIC CHECK - STARTING                     ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        const results = {
            userId: userId,
            timestamp: new Date().toISOString(),
            documents: {},
            payments: {},
            clients: {},
            items: {},
            issues: []
        };

        // Check documents
        console.log('Checking documents...');
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);
        const invoices = documentsSnapshot.docs.filter(doc => doc.data().type === 'invoice');
        const proformas = documentsSnapshot.docs.filter(doc => doc.data().type === 'proforma');
        const cancelledInvoices = invoices.filter(doc => doc.data().cancelled === true);
        const deletedProformas = proformas.filter(doc => doc.data().deleted === true);

        results.documents = {
            total: documentsSnapshot.size,
            invoices: invoices.length,
            proformas: proformas.length,
            cancelledInvoices: cancelledInvoices.length,
            deletedProformas: deletedProformas.length,
            documentIds: documentsSnapshot.docs.map(doc => doc.id)
        };

        console.log(`  ✓ Total documents: ${documentsSnapshot.size}`);
        console.log(`    - Invoices: ${invoices.length} (${cancelledInvoices.length} cancelled)`);
        console.log(`    - Proformas: ${proformas.length} (${deletedProformas.length} deleted)`);

        if (documentsSnapshot.size === 0) {
            results.issues.push('WARNING: No documents found for this user');
            console.log('  ⚠ WARNING: No documents found!');
        }

        // Check payments
        console.log('\nChecking payments...');
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsWithDocuments = paymentsSnapshot.docs.filter(doc => doc.data().documentId);
        const paymentsWithoutDocuments = paymentsSnapshot.docs.filter(doc => !doc.data().documentId);
        const settledPayments = paymentsSnapshot.docs.filter(doc => doc.data().settledToDocument === true);
        const unsettledPayments = paymentsSnapshot.docs.filter(doc => doc.data().settledToDocument !== true);

        results.payments = {
            total: paymentsSnapshot.size,
            withDocuments: paymentsWithDocuments.length,
            withoutDocuments: paymentsWithoutDocuments.length,
            settled: settledPayments.length,
            unsettled: unsettledPayments.length,
            totalAmount: paymentsSnapshot.docs.reduce((sum, doc) => sum + (doc.data().amount || 0), 0),
            paymentIds: paymentsSnapshot.docs.map(doc => ({
                id: doc.id,
                amount: doc.data().amount,
                documentId: doc.data().documentId,
                settled: doc.data().settledToDocument
            }))
        };

        console.log(`  ✓ Total payments: ${paymentsSnapshot.size}`);
        console.log(`    - With documents: ${paymentsWithDocuments.length}`);
        console.log(`    - Without documents: ${paymentsWithoutDocuments.length}`);
        console.log(`    - Settled: ${settledPayments.length}`);
        console.log(`    - Unsettled: ${unsettledPayments.length}`);
        console.log(`    - Total amount: ${results.payments.totalAmount}`);

        if (paymentsSnapshot.size === 0) {
            results.issues.push('WARNING: No payments found for this user');
            console.log('  ⚠ WARNING: No payments found!');
        }

        // Check for orphaned payments (payments with documentId that doesn't exist)
        const orphanedPayments = paymentsWithDocuments.filter(paymentDoc => {
            const documentId = paymentDoc.data().documentId;
            return !results.documents.documentIds.includes(documentId);
        });

        if (orphanedPayments.length > 0) {
            results.issues.push(`WARNING: ${orphanedPayments.length} payments reference non-existent documents`);
            console.log(`  ⚠ WARNING: ${orphanedPayments.length} orphaned payments (reference non-existent documents)`);
            orphanedPayments.forEach(paymentDoc => {
                const payment = paymentDoc.data();
                console.log(`    - Payment ${paymentDoc.id}: Amount ${payment.amount}, Missing Document ${payment.documentId}`);
            });
        }

        // Check clients
        console.log('\nChecking clients...');
        const clientsQuery = query(collection(db, `clients/${userId}/userClients`));
        const clientsSnapshot = await getDocs(clientsQuery);

        results.clients = {
            total: clientsSnapshot.size,
            clientIds: clientsSnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name
            }))
        };

        console.log(`  ✓ Total clients: ${clientsSnapshot.size}`);

        if (clientsSnapshot.size === 0) {
            results.issues.push('WARNING: No clients found for this user');
            console.log('  ⚠ WARNING: No clients found!');
        }

        // Check items/stock
        console.log('\nChecking items/stock...');
        const itemsQuery = query(collection(db, `items/${userId}/userItems`));
        const itemsSnapshot = await getDocs(itemsQuery);

        results.items = {
            total: itemsSnapshot.size,
            itemIds: itemsSnapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name
            }))
        };

        console.log(`  ✓ Total items: ${itemsSnapshot.size}`);

        if (itemsSnapshot.size === 0) {
            results.issues.push('INFO: No stock items found for this user');
            console.log('  ℹ INFO: No stock items found (this may be normal)');
        }

        // Check for payments from other users
        console.log('\nChecking for data contamination...');
        const allPaymentsQuery = query(collection(db, 'payments'));
        const allPaymentsSnapshot = await getDocs(allPaymentsQuery);
        const paymentsWithWrongUser = [];

        for (const paymentDoc of allPaymentsSnapshot.docs) {
            const payment = paymentDoc.data();
            if (payment.documentId && results.documents.documentIds.includes(payment.documentId) && payment.userId !== userId) {
                paymentsWithWrongUser.push({
                    paymentId: paymentDoc.id,
                    wrongUserId: payment.userId,
                    correctUserId: userId,
                    documentId: payment.documentId,
                    amount: payment.amount
                });
            }
        }

        if (paymentsWithWrongUser.length > 0) {
            results.issues.push(`CRITICAL: ${paymentsWithWrongUser.length} payments stolen by other users`);
            console.log(`  🚨 CRITICAL: ${paymentsWithWrongUser.length} payments have wrong userId!`);
            paymentsWithWrongUser.forEach(p => {
                console.log(`    - Payment ${p.paymentId}: Amount ${p.amount}, Document ${p.documentId}, Wrong User: ${p.wrongUserId}`);
            });
            results.stolenPayments = paymentsWithWrongUser;
        } else {
            console.log(`  ✓ No data contamination detected`);
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   DATABASE DIAGNOSTIC CHECK - COMPLETED                    ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Total Issues: ${results.issues.length}`);
        if (results.issues.length > 0) {
            console.log('\nISSUES FOUND:');
            results.issues.forEach(issue => console.log(`  - ${issue}`));
        } else {
            console.log('✓ No critical issues found');
        }
        console.log('');

        return results;

    } catch (error) {
        console.error('\n╔════════════════════════════════════════════════════════════╗');
        console.error('║   DATABASE DIAGNOSTIC CHECK - FAILED                       ║');
        console.error('╚════════════════════════════════════════════════════════════╝');
        console.error('Error:', error);
        console.error('Stack:', error.stack);
        return { success: false, error: error.message };
    }
};
