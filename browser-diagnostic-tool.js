/**
 * Browser Console Diagnostic Tool for Firebase Stock Items
 * 
 * This tool can be run directly in the browser console to check for issues
 * with stock items without needing Firebase Admin SDK.
 * 
 * Usage:
 * 1. Open your invoice app in the browser
 * 2. Open the browser console (F12)
 * 3. Copy and paste this entire script
 * 4. Run: checkStockItems()
 * 
 * Or check a specific user: checkUserStockItems(userId)
 */

// Make sure Firebase is available
if (typeof db === 'undefined') {
    console.error('Firebase db is not available. Make sure you are logged in and Firebase is initialized.');
}

/**
 * Check stock items for the current user
 */
async function checkStockItems() {
    if (!auth || !auth.currentUser) {
        console.error('❌ No user logged in. Please log in first.');
        return;
    }
    
    const userId = auth.currentUser.uid;
    console.log(`🔍 Checking stock items for user: ${userId}\n`);
    
    await checkUserStockItems(userId);
}

/**
 * Check stock items for a specific user
 */
async function checkUserStockItems(userId) {
    const { collection, getDocs, query } = await import('firebase/firestore');
    
    try {
        const itemsRef = collection(db, `items/${userId}/userItems`);
        const snapshot = await getDocs(itemsRef);
        
        if (snapshot.empty) {
            console.log(`✅ No items found for user ${userId}`);
            return {
                totalItems: 0,
                itemsWithoutItemId: [],
                itemsWithItemId: [],
                issues: []
            };
        }
        
        const items = [];
        const itemsWithoutItemId = [];
        const itemsWithItemId = [];
        const issues = [];
        
        snapshot.forEach(doc => {
            const data = doc.data();
            const item = {
                id: doc.id,
                ...data
            };
            
            items.push(item);
            
            if (data.itemId === undefined || data.itemId === null) {
                itemsWithoutItemId.push(item);
                issues.push({
                    type: 'missing_itemId',
                    itemId: doc.id,
                    itemName: data.name || 'Unnamed',
                    message: `Item "${data.name || doc.id}" (${doc.id}) is missing itemId field`
                });
            } else {
                itemsWithItemId.push(item);
            }
            
            // Check for other issues
            if (!data.name) {
                issues.push({
                    type: 'missing_name',
                    itemId: doc.id,
                    message: `Item ${doc.id} is missing name field`
                });
            }
        });
        
        // Print results
        console.log(`📊 Statistics for user ${userId}:`);
        console.log(`   Total items: ${items.length}`);
        console.log(`   Items with itemId: ${itemsWithItemId.length}`);
        console.log(`   Items without itemId: ${itemsWithoutItemId.length}`);
        console.log(`   Issues found: ${issues.length}`);
        console.log('');
        
        if (issues.length > 0) {
            console.log('⚠️  Issues:');
            issues.forEach(issue => {
                console.log(`   - ${issue.message}`);
            });
            console.log('');
        }
        
        if (itemsWithoutItemId.length > 0) {
            console.log('📋 Items without itemId:');
            itemsWithoutItemId.slice(0, 10).forEach(item => {
                console.log(`   - ${item.name || item.id} (ID: ${item.id})`);
            });
            if (itemsWithoutItemId.length > 10) {
                console.log(`   ... and ${itemsWithoutItemId.length - 10} more`);
            }
            console.log('');
        }
        
        // Sort items to show order
        items.sort((a, b) => {
            if (a.itemId !== undefined && b.itemId !== undefined) {
                return a.itemId - b.itemId;
            }
            if (a.itemId !== undefined) return -1;
            if (b.itemId !== undefined) return 1;
            return a.id.localeCompare(b.id);
        });
        
        console.log(`✅ All items (sorted):`);
        items.slice(0, 20).forEach(item => {
            const itemIdDisplay = item.itemId !== undefined ? `itemId: ${item.itemId}` : 'NO itemId';
            console.log(`   - ${item.name || item.id} (${itemIdDisplay}, docId: ${item.id})`);
        });
        if (items.length > 20) {
            console.log(`   ... and ${items.length - 20} more`);
        }
        
        return {
            totalItems: items.length,
            itemsWithoutItemId: itemsWithoutItemId,
            itemsWithItemId: itemsWithItemId,
            issues: issues,
            allItems: items
        };
        
    } catch (error) {
        console.error('❌ Error checking items:', error);
        throw error;
    }
}

/**
 * Compare items between StockPage and NewDocumentPage
 * This helps identify if items are missing from StockPage
 */
async function compareItemSources() {
    if (!auth || !auth.currentUser) {
        console.error('❌ No user logged in. Please log in first.');
        return;
    }
    
    const userId = auth.currentUser.uid;
    console.log(`🔍 Comparing items from different sources for user: ${userId}\n`);
    
    const { collection, getDocs, query, onSnapshot } = await import('firebase/firestore');
    
    // Get all items (like NewDocumentPage does)
    const allItemsRef = collection(db, `items/${userId}/userItems`);
    const allItemsSnapshot = await getDocs(allItemsRef);
    
    const allItems = new Set();
    allItemsSnapshot.forEach(doc => {
        allItems.add(doc.id);
    });
    
    console.log(`📊 Total items found: ${allItems.size}`);
    console.log(`   Item IDs:`, Array.from(allItems));
    
    return {
        totalItems: allItems.size,
        itemIds: Array.from(allItems)
    };
}

// Export functions for use in console
if (typeof window !== 'undefined') {
    window.checkStockItems = checkStockItems;
    window.checkUserStockItems = checkUserStockItems;
    window.compareItemSources = compareItemSources;
    
    console.log('✅ Diagnostic tools loaded!');
    console.log('Available functions:');
    console.log('  - checkStockItems() - Check items for current user');
    console.log('  - checkUserStockItems(userId) - Check items for specific user');
    console.log('  - compareItemSources() - Compare items from different sources');
}




