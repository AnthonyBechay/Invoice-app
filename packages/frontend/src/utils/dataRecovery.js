import { collection, query, where, getDocs, updateDoc, doc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * DATA RECOVERY UTILITIES
 *
 * These functions help recover from data loss incidents caused by:
 * 1. Cross-user data contamination (Fix Payment Data button)
 * 2. Accidental deletion (Clean Up Deleted Items button)
 *
 * IMPORTANT: Always run diagnosticDatabaseCheck first to understand the scope of the issue
 */

// Function to find payments that were stolen from one user and assigned to another
export const findStolenPayments = async (victimUserId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   FINDING STOLEN PAYMENTS                                  ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Victim User ID: ${victimUserId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        // Get all of the victim's documents
        const documentsQuery = query(collection(db, `documents/${victimUserId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);
        const victimDocumentIds = new Set(documentsSnapshot.docs.map(doc => doc.id));

        console.log(`Found ${victimDocumentIds.size} documents belonging to victim user`);
        console.log('Document IDs:', Array.from(victimDocumentIds));

        // Get ALL payments in the database
        console.log('\nScanning all payments in database for stolen payments...');
        const allPaymentsQuery = query(collection(db, 'payments'));
        const allPaymentsSnapshot = await getDocs(allPaymentsQuery);

        const stolenPayments = [];

        for (const paymentDoc of allPaymentsSnapshot.docs) {
            const payment = paymentDoc.data();

            // If payment has a documentId that belongs to the victim user
            // but the userId is NOT the victim, it was stolen
            if (payment.documentId &&
                victimDocumentIds.has(payment.documentId) &&
                payment.userId !== victimUserId) {

                stolenPayments.push({
                    paymentId: paymentDoc.id,
                    amount: payment.amount,
                    documentId: payment.documentId,
                    currentWrongUserId: payment.userId,
                    correctUserId: victimUserId,
                    paymentDate: payment.paymentDate,
                    clientId: payment.clientId,
                    reference: payment.reference
                });

                console.log(`🚨 STOLEN PAYMENT FOUND:`);
                console.log(`  Payment ID: ${paymentDoc.id}`);
                console.log(`  Amount: ${payment.amount}`);
                console.log(`  Document ID: ${payment.documentId}`);
                console.log(`  Current (WRONG) User ID: ${payment.userId}`);
                console.log(`  Correct User ID: ${victimUserId}`);
            }
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   STOLEN PAYMENTS SEARCH - COMPLETED                       ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Found ${stolenPayments.length} stolen payments`);

        if (stolenPayments.length > 0) {
            const totalAmount = stolenPayments.reduce((sum, p) => sum + (p.amount || 0), 0);
            console.log(`Total amount stolen: ${totalAmount}`);
            console.log('\nSTOLEN PAYMENTS SUMMARY:');
            stolenPayments.forEach(p => {
                console.log(`  - Payment ${p.paymentId}: ${p.amount} (Doc: ${p.documentId}, Wrong User: ${p.currentWrongUserId})`);
            });
        } else {
            console.log('✓ No stolen payments found for this user');
        }

        return {
            success: true,
            stolenPayments: stolenPayments,
            totalStolen: stolenPayments.length,
            totalAmount: stolenPayments.reduce((sum, p) => sum + (p.amount || 0), 0)
        };

    } catch (error) {
        console.error('Error finding stolen payments:', error);
        return { success: false, error: error.message };
    }
};

// Function to recover stolen payments back to the correct user
export const recoverStolenPayments = async (victimUserId, dryRun = true) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log(`║   RECOVERING STOLEN PAYMENTS ${dryRun ? '(DRY RUN)' : '(LIVE)'}                   ║`);
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Victim User ID: ${victimUserId}`);
        console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE (payments will be modified)'}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        // First find all stolen payments
        const findResult = await findStolenPayments(victimUserId);

        if (!findResult.success) {
            return findResult;
        }

        if (findResult.stolenPayments.length === 0) {
            console.log('No stolen payments to recover');
            return {
                success: true,
                recoveredCount: 0,
                message: 'No stolen payments found'
            };
        }

        if (dryRun) {
            console.log('\n⚠ DRY RUN MODE - No changes will be made');
            console.log(`Would recover ${findResult.stolenPayments.length} payments`);
            console.log('To actually recover payments, call this function with dryRun=false');
            return {
                success: true,
                dryRun: true,
                wouldRecover: findResult.stolenPayments.length,
                stolenPayments: findResult.stolenPayments
            };
        }

        // Actually recover the payments
        console.log(`\nRecovering ${findResult.stolenPayments.length} payments...`);
        let recoveredCount = 0;

        for (const stolenPayment of findResult.stolenPayments) {
            console.log(`Recovering payment ${stolenPayment.paymentId}...`);

            await updateDoc(doc(db, 'payments', stolenPayment.paymentId), {
                userId: victimUserId,
                recoveredAt: new Date(),
                recoveredFrom: stolenPayment.currentWrongUserId,
                recovered: true
            });

            recoveredCount++;
            console.log(`  ✓ Payment ${stolenPayment.paymentId} recovered`);
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   PAYMENT RECOVERY - COMPLETED                             ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`✓ Recovered ${recoveredCount} payments back to user ${victimUserId}`);

        return {
            success: true,
            recoveredCount: recoveredCount,
            recoveredPayments: findResult.stolenPayments
        };

    } catch (error) {
        console.error('Error recovering stolen payments:', error);
        return { success: false, error: error.message };
    }
};

// Function to find all users who might have been affected
export const findAffectedUsers = async () => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   FINDING AFFECTED USERS                                   ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        // Get all payments
        const allPaymentsQuery = query(collection(db, 'payments'));
        const allPaymentsSnapshot = await getDocs(allPaymentsQuery);

        const userPaymentCounts = new Map();
        const usersWithRepaired = new Set();
        const usersWithRecovered = new Set();

        for (const paymentDoc of allPaymentsSnapshot.docs) {
            const payment = paymentDoc.data();

            if (payment.userId) {
                const count = userPaymentCounts.get(payment.userId) || 0;
                userPaymentCounts.set(payment.userId, count + 1);

                if (payment.repaired) {
                    usersWithRepaired.add(payment.userId);
                }

                if (payment.recovered) {
                    usersWithRecovered.add(payment.userId);
                }
            }
        }

        console.log('Payment distribution by user:');
        for (const [userId, count] of userPaymentCounts.entries()) {
            const repaired = usersWithRepaired.has(userId) ? ' (has repaired payments)' : '';
            const recovered = usersWithRecovered.has(userId) ? ' (has recovered payments)' : '';
            console.log(`  User ${userId}: ${count} payments${repaired}${recovered}`);
        }

        console.log(`\nTotal users with payments: ${userPaymentCounts.size}`);
        console.log(`Users who ran repair operation: ${usersWithRepaired.size}`);
        console.log(`Users who ran recovery: ${usersWithRecovered.size}`);

        return {
            success: true,
            userPaymentCounts: Object.fromEntries(userPaymentCounts),
            usersWithRepaired: Array.from(usersWithRepaired),
            usersWithRecovered: Array.from(usersWithRecovered)
        };

    } catch (error) {
        console.error('Error finding affected users:', error);
        return { success: false, error: error.message };
    }
};

// Function to generate recovery report
export const generateRecoveryReport = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   GENERATING RECOVERY REPORT                               ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        const report = {
            userId: userId,
            timestamp: new Date().toISOString(),
            documents: 0,
            payments: 0,
            clients: 0,
            items: 0,
            stolenPayments: [],
            issues: []
        };

        // Check documents
        const documentsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const documentsSnapshot = await getDocs(documentsQuery);
        report.documents = documentsSnapshot.size;

        // Check payments
        const paymentsQuery = query(
            collection(db, 'payments'),
            where('userId', '==', userId)
        );
        const paymentsSnapshot = await getDocs(paymentsQuery);
        report.payments = paymentsSnapshot.size;

        // Check clients
        const clientsQuery = query(collection(db, `clients/${userId}/userClients`));
        const clientsSnapshot = await getDocs(clientsQuery);
        report.clients = clientsSnapshot.size;

        // Check items
        const itemsQuery = query(collection(db, `items/${userId}/userItems`));
        const itemsSnapshot = await getDocs(itemsQuery);
        report.items = itemsSnapshot.size;

        // Find stolen payments
        const stolenResult = await findStolenPayments(userId);
        if (stolenResult.success) {
            report.stolenPayments = stolenResult.stolenPayments;
            if (stolenResult.totalStolen > 0) {
                report.issues.push(`${stolenResult.totalStolen} payments were stolen by other users`);
            }
        }

        // Check for missing data
        if (report.documents === 0) {
            report.issues.push('No documents found - possible data loss');
        }
        if (report.payments === 0) {
            report.issues.push('No payments found - possible data loss or theft');
        }
        if (report.clients === 0) {
            report.issues.push('No clients found - possible data loss');
        }

        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   RECOVERY REPORT                                          ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`Documents: ${report.documents}`);
        console.log(`Payments: ${report.payments}`);
        console.log(`Clients: ${report.clients}`);
        console.log(`Items: ${report.items}`);
        console.log(`Stolen Payments: ${report.stolenPayments.length}`);
        console.log(`Issues: ${report.issues.length}`);

        if (report.issues.length > 0) {
            console.log('\nISSUES DETECTED:');
            report.issues.forEach(issue => console.log(`  - ${issue}`));
        }

        return report;

    } catch (error) {
        console.error('Error generating recovery report:', error);
        return { success: false, error: error.message };
    }
};

/**
 * RECOVERY STRATEGY GUIDE
 *
 * If data loss occurred, follow these steps:
 *
 * 1. STOP - Don't make any more changes
 * 2. Request Firebase backup restoration from Firebase Console
 * 3. Run diagnosticDatabaseCheck(userId) to assess damage
 * 4. Run generateRecoveryReport(userId) for detailed analysis
 * 5. Run findStolenPayments(userId) to identify stolen payments
 * 6. If stolen payments found, run recoverStolenPayments(userId, true) for dry run
 * 7. If dry run looks good, run recoverStolenPayments(userId, false) to actually recover
 * 8. Verify recovery with diagnosticDatabaseCheck(userId) again
 *
 * PREVENTION:
 * - The bug in fixPaymentsWithoutUserId has been fixed to prevent future incidents
 * - Added comprehensive logging to track all operations
 * - Added diagnostic tools to detect issues early
 *
 * BACKUP RESTORATION:
 * If Firebase backup is available:
 * 1. Go to Firebase Console > Firestore Database > Import/Export
 * 2. Import the backup from the date before the incident
 * 3. This will restore all data to that point in time
 *
 * Note: Backup restoration will overwrite current data, so coordinate with all users first
 */
