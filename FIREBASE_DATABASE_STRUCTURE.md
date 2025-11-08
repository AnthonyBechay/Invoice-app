# Firebase Firestore Database Structure Documentation

## Overview

This document explains the Firestore database structure used in the Invoice App. The database is organized hierarchically to ensure proper user isolation and data security.

## Database Structure

```
Firestore Database
├── items/
│   └── {userId}/                    # User's item container (parent document)
│       └── userItems/               # Subcollection: User's stock items
│           └── {itemId}/            # Individual stock item document
│               ├── itemId: number   # Auto-incremented ID (optional)
│               ├── name: string     # Item name (required)
│               ├── category: string
│               ├── subCategory: string
│               ├── brand: string
│               ├── partNumber: string
│               ├── specs: string
│               ├── type: string
│               ├── color: string
│               ├── buyingPrice: number
│               ├── sellingPrice: number
│               ├── customField1: string
│               └── customField2: string
│
├── clients/
│   └── {userId}/                    # User's client container
│       └── userClients/             # Subcollection: User's clients
│           └── {clientId}/          # Individual client document
│               ├── name: string
│               ├── email: string
│               ├── phone: string
│               └── address: string
│
├── documents/
│   └── {userId}/                    # User's document container
│       └── userDocuments/           # Subcollection: User's invoices/proformas
│           └── {documentId}/        # Individual document
│               ├── type: string      # 'invoice' or 'proforma'
│               ├── documentNumber: string
│               ├── date: Timestamp
│               ├── client: object
│               ├── items: array
│               ├── laborPrice: number
│               ├── mandays: object
│               ├── realMandays: object
│               ├── notes: string
│               ├── vatApplied: boolean
│               ├── subtotal: number
│               ├── vatAmount: number
│               └── total: number
│
├── payments/
│   └── {paymentId}/                 # Payment document (flat structure)
│       ├── userId: string           # Owner's user ID
│       ├── documentId: string
│       ├── amount: number
│       ├── date: Timestamp
│       └── status: string
│
├── counters/
│   └── {userId}/                     # User's counter container
│       ├── documentCounters/         # Subcollection: Document number counters
│       │   ├── invoiceCounter/
│       │   │   └── lastId: number
│       │   └── proformaCounter/
│       │       └── lastId: number
│       └── itemCounter/             # Subcollection: Item ID counter
│           └── counter/
│               └── lastId: number
│
├── expenses/
│   └── {userId}/                     # User's expense container
│       ├── userExpenses/             # Subcollection: User's expenses
│       │   └── {expenseId}/
│       └── categories/               # Subcollection: Expense categories
│           └── {categoryId}/
│
└── settings/
    └── {userId}/                     # User settings document
        ├── companyName: string
        ├── companyAddress: string
        └── ... (other settings)
```

## Key Concepts

### 1. User Isolation

All user-specific data is organized under the user's UID (`{userId}`). This ensures:
- Users can only access their own data
- Firestore security rules can easily enforce access control
- Data is logically separated by user

### 2. Parent Documents vs Subcollections

**Parent Documents** (e.g., `items/{userId}`):
- These are container documents that exist to organize subcollections
- They may or may not have fields themselves
- They serve as a namespace for user-specific data

**Subcollections** (e.g., `userItems`):
- These are the actual collections of user data
- They contain the documents that hold the actual data
- They are scoped to the parent document

### 3. Stock Items Structure

The stock items follow this pattern:
```
items/{userId}/userItems/{itemId}
```

**Important Notes:**
- The parent document `items/{userId}` may not exist (it's a container)
- The actual items are in the `userItems` subcollection
- Each item document has an optional `itemId` field (auto-incremented number)
- Items without `itemId` are still valid but won't sort properly with `orderBy`

### 4. Common Issues

#### Issue 1: Missing Items in Stock Screen
**Cause:** 
- StockPage was using `limit(100)` which only fetched first 100 items
- StockPage was using `orderBy('itemId', 'asc')` which excluded items without `itemId`

**Solution:**
- Removed `limit(100)` to fetch all items
- Removed `orderBy` and sort client-side to handle items without `itemId`

#### Issue 2: Items Showing in Search but Not in Stock List
**Cause:**
- NewDocumentPage fetches all items without limits
- StockPage had a 100-item limit

**Solution:**
- Both now fetch all items consistently

#### Issue 3: Orphaned Items
**Definition:** Items that exist but don't belong to any user, or items in the wrong location.

**How to Check:**
- Run the diagnostic script: `node check-orphaned-stock-items.js`
- Or use the browser console diagnostic tool

## Security Rules

All collections follow this pattern:
```javascript
match /items/{userId}/userItems/{itemId} {
  allow read, write: if request.auth != null && request.auth.uid == userId;
}
```

This ensures:
- Users can only read/write their own data
- Authentication is required
- User ID in the path must match the authenticated user's ID

## Querying Data

### Fetching All Stock Items for a User

```javascript
const itemsRef = collection(db, `items/${userId}/userItems`);
const snapshot = await getDocs(itemsRef);
```

### Fetching Items with Ordering (if all items have itemId)

```javascript
const q = query(
  collection(db, `items/${userId}/userItems`),
  orderBy('itemId', 'asc')
);
```

### Fetching Items Without OrderBy (includes items without itemId)

```javascript
const q = query(
  collection(db, `items/${userId}/userItems`)
);
// Sort client-side after fetching
```

## Best Practices

1. **Always use user-specific paths**: Never query across all users
2. **Handle missing fields gracefully**: Items may not have all fields (e.g., `itemId`)
3. **Use subcollections for user data**: This enables proper security rules
4. **Check parent document existence**: Parent documents may not exist (they're containers)
5. **Use transactions for counters**: Always use transactions when incrementing counters

## Migration Notes

If you have items in the wrong location or missing `itemId` fields:

1. **Add missing itemId**: Use the diagnostic script to identify items without `itemId`
2. **Move misplaced items**: If items are directly in `items/{userId}`, they should be in `items/{userId}/userItems/`
3. **Create parent documents**: If needed, create parent documents for organization (though not required)

## Diagnostic Tools

1. **Server-side script**: `check-orphaned-stock-items.js` (requires Firebase Admin SDK)
2. **Browser console tool**: Available in the browser console (see `FIREBASE_DIAGNOSTIC_TOOL.md`)

## Related Files

- `firestore.rules` - Security rules
- `check-orphaned-stock-items.js` - Diagnostic script
- `StockPage.js` - Stock items display component
- `NewDocumentPage.js` - Document creation with item search




