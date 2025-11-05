/**
 * Diagnostic Script to Check for Orphaned Stock Items in Firebase
 * 
 * This script checks for stock items that may not belong to any user,
 * or items that exist in the wrong location in the Firestore structure.
 * 
 * Usage:
 * 1. Make sure you have Firebase Admin SDK installed: npm install firebase-admin
 * 2. Set your Firebase service account key as GOOGLE_APPLICATION_CREDENTIALS environment variable
 * 3. Run: node check-orphaned-stock-items.js
 */

const admin = require('firebase-admin');

// Initialize Firebase Admin SDK
// You can either use service account credentials or application default credentials
if (!admin.apps.length) {
    try {
        // Try to initialize with service account
        const serviceAccount = require('./serviceAccountKey.json');
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
    } catch (error) {
        // Fall back to application default credentials
        admin.initializeApp({
            credential: admin.credential.applicationDefault()
        });
    }
}

const db = admin.firestore();

/**
 * Expected Structure:
 * items/
 *   {userId}/
 *     userItems/
 *       {itemId}/
 *         - name, category, brand, etc.
 */
async function checkOrphanedItems() {
    console.log('🔍 Checking for orphaned stock items...\n');
    
    try {
        // Get all users who have items
        const itemsCollection = db.collection('items');
        const itemsSnapshot = await itemsCollection.get();
        
        if (itemsSnapshot.empty) {
            console.log('✅ No items collection found. Database might be empty.');
            return;
        }
        
        const issues = [];
        const statistics = {
            totalUserDocuments: 0,
            totalItems: 0,
            itemsWithoutItemId: 0,
            orphanedItems: 0,
            usersWithItems: new Set()
        };
        
        // Check each user's items collection
        for (const userDoc of itemsSnapshot.docs) {
            const userId = userDoc.id;
            statistics.totalUserDocuments++;
            
            // Check if this is a user document (not an item document)
            // In Firestore, if userItems subcollection exists, the parent document might not exist
            const userItemsRef = userDoc.ref.collection('userItems');
            const userItemsSnapshot = await userItemsRef.get();
            
            if (userItemsSnapshot.empty) {
                // Check if parent document exists
                const parentDoc = await userDoc.ref.get();
                if (!parentDoc.exists) {
                    issues.push({
                        type: 'orphaned_parent',
                        userId: userId,
                        message: `Parent document for user ${userId} does not exist, but userItems collection structure exists`
                    });
                }
                continue;
            }
            
            statistics.usersWithItems.add(userId);
            
            // Check each item
            for (const itemDoc of userItemsSnapshot.docs) {
                statistics.totalItems++;
                const itemData = itemDoc.data();
                
                // Check if item has itemId field
                if (itemData.itemId === undefined || itemData.itemId === null) {
                    statistics.itemsWithoutItemId++;
                    issues.push({
                        type: 'missing_itemId',
                        userId: userId,
                        itemId: itemDoc.id,
                        itemName: itemData.name || 'Unnamed',
                        message: `Item "${itemData.name || itemDoc.id}" (${itemDoc.id}) for user ${userId} is missing itemId field`
                    });
                }
                
                // Check if item has required fields
                if (!itemData.name) {
                    issues.push({
                        type: 'missing_name',
                        userId: userId,
                        itemId: itemDoc.id,
                        message: `Item ${itemDoc.id} for user ${userId} is missing name field`
                    });
                }
            }
        }
        
        // Print statistics
        console.log('📊 Statistics:');
        console.log(`   Total user documents in items collection: ${statistics.totalUserDocuments}`);
        console.log(`   Users with items: ${statistics.usersWithItems.size}`);
        console.log(`   Total items found: ${statistics.totalItems}`);
        console.log(`   Items without itemId: ${statistics.itemsWithoutItemId}`);
        console.log(`   Orphaned items: ${issues.filter(i => i.type === 'orphaned_parent').length}`);
        console.log('');
        
        // Print issues
        if (issues.length === 0) {
            console.log('✅ No issues found! All items are properly structured.');
        } else {
            console.log(`⚠️  Found ${issues.length} issues:\n`);
            
            // Group issues by type
            const issuesByType = {};
            issues.forEach(issue => {
                if (!issuesByType[issue.type]) {
                    issuesByType[issue.type] = [];
                }
                issuesByType[issue.type].push(issue);
            });
            
            // Print each type of issue
            Object.keys(issuesByType).forEach(type => {
                console.log(`\n📋 ${type.toUpperCase()} (${issuesByType[type].length} items):`);
                issuesByType[type].slice(0, 10).forEach(issue => {
                    console.log(`   - ${issue.message}`);
                });
                if (issuesByType[type].length > 10) {
                    console.log(`   ... and ${issuesByType[type].length - 10} more`);
                }
            });
            
            // Generate a summary report
            console.log('\n\n📄 Summary Report:');
            console.log('='.repeat(60));
            Object.keys(issuesByType).forEach(type => {
                console.log(`${type}: ${issuesByType[type].length} items`);
            });
        }
        
        // Check for items in wrong location (directly in items collection)
        console.log('\n🔍 Checking for items in wrong location...');
        const directItems = [];
        for (const userDoc of itemsSnapshot.docs) {
            const userData = userDoc.data();
            // If the document has item-like fields, it might be misplaced
            if (userData.name || userData.category || userData.brand) {
                directItems.push({
                    docId: userDoc.id,
                    data: userData
                });
            }
        }
        
        if (directItems.length > 0) {
            console.log(`⚠️  Found ${directItems.length} documents that might be items in the wrong location:`);
            directItems.forEach(item => {
                console.log(`   - Document ID: ${item.docId}`);
                console.log(`     Name: ${item.data.name || 'N/A'}`);
            });
        } else {
            console.log('✅ No items found in wrong location.');
        }
        
    } catch (error) {
        console.error('❌ Error checking items:', error);
        throw error;
    }
}

/**
 * Query to check if any stock items belong to a specific user
 */
async function checkUserItems(userId) {
    console.log(`\n🔍 Checking items for user: ${userId}\n`);
    
    try {
        const userItemsRef = db.collection('items').doc(userId).collection('userItems');
        const snapshot = await userItemsRef.get();
        
        if (snapshot.empty) {
            console.log(`No items found for user ${userId}`);
            return;
        }
        
        console.log(`Found ${snapshot.size} items for user ${userId}:`);
        snapshot.forEach(doc => {
            const data = doc.data();
            console.log(`  - ${doc.id}: ${data.name || 'Unnamed'} (itemId: ${data.itemId || 'MISSING'})`);
        });
        
    } catch (error) {
        console.error(`Error checking items for user ${userId}:`, error);
    }
}

// Run the check
if (require.main === module) {
    const args = process.argv.slice(2);
    
    if (args.length > 0 && args[0] === '--user') {
        // Check specific user
        const userId = args[1];
        if (!userId) {
            console.error('Please provide a user ID: node check-orphaned-stock-items.js --user <userId>');
            process.exit(1);
        }
        checkUserItems(userId)
            .then(() => process.exit(0))
            .catch(error => {
                console.error(error);
                process.exit(1);
            });
    } else {
        // Run full check
        checkOrphanedItems()
            .then(() => process.exit(0))
            .catch(error => {
                console.error(error);
                process.exit(1);
            });
    }
}

module.exports = { checkOrphanedItems, checkUserItems };

