# Diagnostic Tools for Stock Items

This directory contains tools to diagnose and fix issues with stock items in Firebase Firestore.

## Quick Start

### Browser Console Tool (Easiest)

1. Open your invoice app in the browser
2. Open the browser console (F12 or right-click → Inspect → Console)
3. Copy the contents of `browser-diagnostic-tool.js`
4. Paste it into the console and press Enter
5. Run: `checkStockItems()`

This will show you:
- Total items for the current user
- Items without `itemId` field
- Items missing required fields (like `name`)
- All items sorted

### Server-Side Script (More Detailed)

1. Install Firebase Admin SDK:
   ```bash
   npm install firebase-admin
   ```

2. Set up service account credentials:
   - Download your Firebase service account key from Firebase Console
   - Save it as `serviceAccountKey.json` in the `Invoice-app` directory
   - OR set `GOOGLE_APPLICATION_CREDENTIALS` environment variable

3. Run the diagnostic:
   ```bash
   node check-orphaned-stock-items.js
   ```

4. Check specific user:
   ```bash
   node check-orphaned-stock-items.js --user <userId>
   ```

## Available Tools

### 1. Browser Console Tool (`browser-diagnostic-tool.js`)

**Functions:**
- `checkStockItems()` - Check items for current logged-in user
- `checkUserStockItems(userId)` - Check items for specific user
- `compareItemSources()` - Compare items from different sources

**Usage Example:**
```javascript
// In browser console
checkStockItems()  // Check current user
```

**Output:**
- Statistics (total items, items with/without itemId)
- List of items without `itemId`
- All items sorted
- Issues found

### 2. Server-Side Script (`check-orphaned-stock-items.js`)

**What it checks:**
- Items without `itemId` field
- Items missing required fields (like `name`)
- Items in wrong locations
- Orphaned items (items not belonging to any user)
- Parent documents that don't exist

**Usage Example:**
```bash
# Check all users
node check-orphaned-stock-items.js

# Check specific user
node check-orphaned-stock-items.js --user abc123xyz
```

**Output:**
- Statistics for all users
- Issues grouped by type
- Summary report
- Items in wrong locations

## Common Issues and Solutions

### Issue 1: Items Missing `itemId` Field

**Symptoms:**
- Items appear in search but not in stock list (before fix)
- Items sort incorrectly

**Solution:**
Items without `itemId` are still valid, but they won't sort properly. You can add `itemId` to existing items:

```javascript
// In browser console (after running browser-diagnostic-tool.js)
const { collection, getDocs, writeBatch, doc } = await import('firebase/firestore');

const userId = auth.currentUser.uid;
const itemsRef = collection(db, `items/${userId}/userItems`);
const snapshot = await getDocs(itemsRef);

const batch = writeBatch(db);
let nextId = 1;

snapshot.forEach(doc => {
    const data = doc.data();
    if (!data.itemId) {
        batch.update(doc.ref, { itemId: nextId++ });
    }
});

await batch.commit();
console.log('✅ Added itemId to items without it');
```

### Issue 2: Items in Wrong Location

**Symptoms:**
- Items don't appear in queries
- Items exist in Firestore console but not in app

**Solution:**
Check if items are in the correct location:
- Should be: `items/{userId}/userItems/{itemId}`
- Not: `items/{userId}` (directly in user document)

### Issue 3: Orphaned Items

**Symptoms:**
- Items exist but don't belong to any user
- Items have invalid user IDs

**Solution:**
Run the diagnostic script to identify orphaned items. You may need to:
1. Delete orphaned items
2. Move items to correct user
3. Fix user IDs

## Firebase Database Structure

```
items/
  {userId}/                    # User's item container (parent document)
    userItems/                 # Subcollection: User's stock items
      {itemId}/                # Individual stock item document
        - itemId: number       # Auto-incremented ID (optional)
        - name: string         # Required
        - category: string
        - ... (other fields)
```

**Important:**
- Parent document `items/{userId}` may not exist (it's just a container)
- Actual items are in `userItems` subcollection
- Items can exist without `itemId` field

## Troubleshooting

### Browser Console Tool Not Working

1. Make sure you're logged in
2. Check that Firebase is initialized
3. Check browser console for errors
4. Make sure you've pasted the entire script

### Server-Side Script Not Working

1. Check that Firebase Admin SDK is installed
2. Verify service account credentials are correct
3. Check that you have proper permissions
4. Check console for error messages

### Items Still Missing After Fix

1. Run the diagnostic tools to check for issues
2. Check browser console for errors
3. Verify items exist in Firestore console
4. Check Firestore security rules
5. Verify user ID matches in queries

## Next Steps

1. Run the diagnostic tools to identify issues
2. Fix any items without `itemId` (optional)
3. Check for orphaned items
4. Verify all items are showing correctly

## Related Documentation

- `FIREBASE_DATABASE_STRUCTURE.md` - Complete database structure documentation
- `STOCK_ITEMS_FIX_SUMMARY.md` - Summary of the fix applied
- `firestore.rules` - Security rules



