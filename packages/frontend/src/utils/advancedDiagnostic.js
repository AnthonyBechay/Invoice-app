import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * ADVANCED DIAGNOSTIC - Deep Investigation
 *
 * This function does a comprehensive scan to understand what happened to missing data
 */

export const deepInvestigation = async (userId) => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   DEEP INVESTIGATION - STARTING                            ║');
        console.log('╚════════════════════════════════════════════════════════════╝');
        console.log(`User ID: ${userId}`);
        console.log(`Timestamp: ${new Date().toISOString()}\n`);

        const results = {
            userId: userId,
            timestamp: new Date().toISOString(),
            findings: []
        };

        // 1. Check ALL documents including deleted/cancelled ones
        console.log('STEP 1: Checking ALL documents (including deleted/cancelled)...');
        const allDocsQuery = query(collection(db, `documents/${userId}/userDocuments`));
        const allDocsSnapshot = await getDocs(allDocsQuery);

        console.log(`Total documents in collection: ${allDocsSnapshot.size}`);

        if (allDocsSnapshot.size > 0) {
            const docsByStatus = {
                activeInvoices: 0,
                cancelledInvoices: 0,
                activeProformas: 0,
                deletedProformas: 0,
                other: 0
            };

            allDocsSnapshot.forEach(doc => {
                const data = doc.data();
                if (data.type === 'invoice') {
                    if (data.cancelled) {
                        docsByStatus.cancelledInvoices++;
                    } else {
                        docsByStatus.activeInvoices++;
                    }
                } else if (data.type === 'proforma') {
                    if (data.deleted || data.cancelled) {
                        docsByStatus.deletedProformas++;
                    } else {
                        docsByStatus.activeProformas++;
                    }
                } else {
                    docsByStatus.other++;
                }

                console.log(`  Document ${doc.id}:`);
                console.log(`    Type: ${data.type || 'unknown'}`);
                console.log(`    Number: ${data.documentNumber || data.invoiceNumber || data.proformaNumber || 'N/A'}`);
                console.log(`    Cancelled: ${data.cancelled || false}`);
                console.log(`    Deleted: ${data.deleted || false}`);
                console.log(`    Created: ${data.createdAt ? new Date(data.createdAt.seconds * 1000).toISOString() : 'N/A'}`);
            });

            console.log('\nDocument Status Summary:');
            console.log(`  Active Invoices: ${docsByStatus.activeInvoices}`);
            console.log(`  Cancelled Invoices: ${docsByStatus.cancelledInvoices}`);
            console.log(`  Active Proformas: ${docsByStatus.activeProformas}`);
            console.log(`  Deleted Proformas: ${docsByStatus.deletedProformas}`);
            console.log(`  Other: ${docsByStatus.other}`);

            results.documents = docsByStatus;

            if (docsByStatus.activeInvoices === 0 && docsByStatus.activeProformas === 0) {
                results.findings.push('CRITICAL: All documents are marked as cancelled/deleted');
            }
        } else {
            console.log('  ⚠ WARNING: Document collection is EMPTY!');
            results.findings.push('CRITICAL: Document collection is completely empty');
        }

        // 2. Check ALL payments (even without userId filter)
        console.log('\nSTEP 2: Checking ALL payments in database...');
        const allPaymentsQuery = query(collection(db, 'payments'));
        const allPaymentsSnapshot = await getDocs(allPaymentsQuery);

        console.log(`Total payments in entire database: ${allPaymentsSnapshot.size}`);

        const paymentsAnalysis = {
            total: allPaymentsSnapshot.size,
            withYourUserId: 0,
            withoutUserId: 0,
            withOtherUserId: 0,
            recentlyModified: []
        };

        const twoDaysAgo = new Date();
        twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);

        allPaymentsSnapshot.forEach(doc => {
            const payment = doc.data();

            if (payment.userId === userId) {
                paymentsAnalysis.withYourUserId++;
            } else if (!payment.userId) {
                paymentsAnalysis.withoutUserId++;
            } else {
                paymentsAnalysis.withOtherUserId++;
            }

            // Check for recently modified payments
            const updatedAt = payment.updatedAt?.toDate?.() || payment.createdAt?.toDate?.();
            if (updatedAt && updatedAt > twoDaysAgo) {
                paymentsAnalysis.recentlyModified.push({
                    id: doc.id,
                    userId: payment.userId,
                    amount: payment.amount,
                    updatedAt: updatedAt.toISOString(),
                    repaired: payment.repaired || false,
                    recovered: payment.recovered || false
                });
            }
        });

        console.log('\nPayment Analysis:');
        console.log(`  Payments with YOUR userId: ${paymentsAnalysis.withYourUserId}`);
        console.log(`  Payments with NO userId: ${paymentsAnalysis.withoutUserId}`);
        console.log(`  Payments with OTHER userId: ${paymentsAnalysis.withOtherUserId}`);
        console.log(`  Recently modified (last 2 days): ${paymentsAnalysis.recentlyModified.length}`);

        if (paymentsAnalysis.recentlyModified.length > 0) {
            console.log('\nRecently Modified Payments:');
            paymentsAnalysis.recentlyModified.forEach(p => {
                console.log(`  - Payment ${p.id}: UserId=${p.userId}, Amount=${p.amount}, Updated=${p.updatedAt}, Repaired=${p.repaired}`);
            });
        }

        results.payments = paymentsAnalysis;

        // 3. Check clients collection
        console.log('\nSTEP 3: Checking clients collection...');
        const clientsQuery = query(collection(db, `clients/${userId}/userClients`));
        const clientsSnapshot = await getDocs(clientsQuery);

        console.log(`Total clients: ${clientsSnapshot.size}`);

        if (clientsSnapshot.size > 0) {
            console.log('\nClients found:');
            clientsSnapshot.forEach(doc => {
                const client = doc.data();
                console.log(`  - Client ${doc.id}: ${client.name} (${client.email || 'no email'})`);
            });
        } else {
            console.log('  ⚠ WARNING: Clients collection is EMPTY!');
            results.findings.push('WARNING: Clients collection is empty');
        }

        results.clientsCount = clientsSnapshot.size;

        // 4. Check items/stock collection
        console.log('\nSTEP 4: Checking items/stock collection...');
        const itemsQuery = query(collection(db, `items/${userId}/userItems`));
        const itemsSnapshot = await getDocs(itemsQuery);

        console.log(`Total items: ${itemsSnapshot.size}`);

        if (itemsSnapshot.size > 0) {
            console.log('\nItems found:');
            itemsSnapshot.forEach(doc => {
                const item = doc.data();
                console.log(`  - Item ${doc.id}: ${item.name || 'unnamed'}`);
            });
        } else {
            console.log('  ℹ INFO: Items collection is empty (may be normal)');
        }

        results.itemsCount = itemsSnapshot.size;

        // 5. Check for audit trails (repaired/deleted flags)
        console.log('\nSTEP 5: Checking for audit trails...');

        // Check if any payments were marked as repaired recently
        const repairedPayments = allPaymentsSnapshot.docs.filter(doc => doc.data().repaired === true);
        if (repairedPayments.length > 0) {
            console.log(`Found ${repairedPayments.length} payments marked as 'repaired'`);
            results.findings.push(`${repairedPayments.length} payments have been repaired (someone ran Fix Payment Data)`);

            const repairedUsers = new Set(repairedPayments.map(doc => doc.data().userId));
            console.log(`Users who ran repair: ${Array.from(repairedUsers).join(', ')}`);
        }

        // Check if any documents were migrated
        const migratedDocs = allDocsSnapshot.docs.filter(doc => doc.data().migrationCompleted === true);
        if (migratedDocs.length > 0) {
            console.log(`Found ${migratedDocs.length} documents marked as 'migrated'`);
            results.findings.push(`${migratedDocs.length} documents have migration flags`);
        }

        // 6. Summary and conclusions
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   DEEP INVESTIGATION - CONCLUSIONS                         ║');
        console.log('╚════════════════════════════════════════════════════════════╝');

        // Determine what happened
        if (allDocsSnapshot.size === 0 && clientsSnapshot.size === 0 && paymentsAnalysis.withYourUserId === 0) {
            console.log('\n🚨 CRITICAL: Complete Data Loss Detected');
            console.log('All user data (documents, clients, payments) is missing.');
            console.log('\nPossible causes:');
            console.log('  1. Data was manually deleted in Firebase Console');
            console.log('  2. User account was deleted and recreated');
            console.log('  3. Database was reset/restored to an old backup');
            console.log('  4. You are logged in with a different account than expected');
            results.conclusion = 'COMPLETE_DATA_LOSS';
        } else if (allDocsSnapshot.size > 0 && allDocsSnapshot.docs.every(doc => doc.data().cancelled || doc.data().deleted)) {
            console.log('\n⚠ WARNING: All Documents Marked as Deleted/Cancelled');
            console.log('Documents exist but are all marked as deleted or cancelled.');
            console.log('\nPossible causes:');
            console.log('  1. Someone clicked "Clean Up Deleted Items" button');
            console.log('  2. Someone marked all documents as cancelled/deleted');
            results.conclusion = 'ALL_DOCUMENTS_DELETED';
        } else if (clientsSnapshot.size === 0 && paymentsAnalysis.withYourUserId === 0) {
            console.log('\n⚠ WARNING: Clients and Payments Missing');
            console.log('Documents may exist but clients and payments are gone.');
            console.log('\nPossible causes:');
            console.log('  1. Collections were manually deleted');
            console.log('  2. Data migration went wrong');
            results.conclusion = 'PARTIAL_DATA_LOSS';
        }

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('FINDINGS:');
        results.findings.forEach(finding => console.log(`  - ${finding}`));

        console.log('\n═══════════════════════════════════════════════════════════');
        console.log('RECOMMENDATIONS:');

        if (results.conclusion === 'COMPLETE_DATA_LOSS') {
            console.log('  1. ❗ Verify you are logged in with the correct account');
            console.log('  2. ❗ Check Firebase Console for recent deletions');
            console.log('  3. ❗ Request Firebase backup restoration IMMEDIATELY');
            console.log('  4. ❗ Check if user UID matches expected: CxWdTQh6EwNz7yyZBlFhGmfdaul1');
        } else if (results.conclusion === 'ALL_DOCUMENTS_DELETED') {
            console.log('  1. ❗ Request Firebase backup restoration');
            console.log('  2. 🔍 Check who clicked "Clean Up Deleted Items"');
            console.log('  3. 💡 Documents may be recoverable if backup exists');
        }

        console.log('');
        return results;

    } catch (error) {
        console.error('Deep investigation failed:', error);
        return { success: false, error: error.message };
    }
};

// Function to verify current user identity
export const verifyUserIdentity = async () => {
    try {
        console.log('\n╔════════════════════════════════════════════════════════════╗');
        console.log('║   USER IDENTITY VERIFICATION                               ║');
        console.log('╚════════════════════════════════════════════════════════════╝');

        const auth = (await import('../firebase/config')).auth;
        const currentUser = auth.currentUser;

        if (!currentUser) {
            console.log('❌ No user is currently logged in!');
            return { loggedIn: false };
        }

        console.log('Current User Details:');
        console.log(`  Email: ${currentUser.email}`);
        console.log(`  UID: ${currentUser.uid}`);
        console.log(`  Display Name: ${currentUser.displayName || 'Not set'}`);
        console.log(`  Email Verified: ${currentUser.emailVerified}`);
        console.log(`  Created: ${currentUser.metadata.creationTime}`);
        console.log(`  Last Sign In: ${currentUser.metadata.lastSignInTime}`);

        console.log('\nExpected User Details:');
        console.log('  Email: a@b.com');
        console.log('  UID: CxWdTQh6EwNz7yyZBlFhGmfdaul1');

        if (currentUser.email !== 'a@b.com') {
            console.log('\n⚠ WARNING: You are logged in with a different email than expected!');
            console.log(`  Expected: a@b.com`);
            console.log(`  Current: ${currentUser.email}`);
            return {
                loggedIn: true,
                wrongAccount: true,
                currentEmail: currentUser.email,
                currentUid: currentUser.uid
            };
        }

        if (currentUser.uid !== 'CxWdTQh6EwNz7yyZBlFhGmfdaul1') {
            console.log('\n⚠ WARNING: User UID does not match expected!');
            console.log(`  Expected: CxWdTQh6EwNz7yyZBlFhGmfdaul1`);
            console.log(`  Current: ${currentUser.uid}`);
            console.log('\nThis could mean:');
            console.log('  1. The user account was deleted and recreated');
            console.log('  2. You are looking at the wrong account');
            console.log('  3. The expected UID is incorrect');
            return {
                loggedIn: true,
                wrongUid: true,
                currentEmail: currentUser.email,
                currentUid: currentUser.uid,
                expectedUid: 'CxWdTQh6EwNz7yyZBlFhGmfdaul1'
            };
        }

        console.log('\n✓ User identity matches expected');
        return {
            loggedIn: true,
            correct: true,
            email: currentUser.email,
            uid: currentUser.uid
        };

    } catch (error) {
        console.error('Error verifying user identity:', error);
        return { error: error.message };
    }
};
