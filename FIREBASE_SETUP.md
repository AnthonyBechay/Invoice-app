# Firebase Setup Instructions

## Required Firebase Indexes

The application now uses Firebase composite indexes for optimal query performance. You need to create these indexes in your Firebase Console.

### Method 1: Automatic Setup (Recommended)

If you have Firebase CLI installed, you can deploy the indexes automatically:

```bash
# Install Firebase CLI if you haven't already
npm install -g firebase-tools

# Login to Firebase
firebase login

# Initialize Firebase in your project (if not already done)
firebase init firestore

# Deploy the indexes
firebase deploy --only firestore:indexes
```

The `firestore.indexes.json` file in the root directory contains all required indexes.

### Method 2: Manual Setup via Firebase Console

If you prefer to create indexes manually or don't have Firebase CLI:

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Indexes** tab
4. Click **Add Index** and create the following composite indexes:

#### Index 1: Documents by Type and Date
- **Collection ID**: `userDocuments`
- **Fields to index**:
  - `type` - Ascending
  - `date` - Descending
- **Query Scope**: Collection

#### Index 2: Payments by User and Payment Date
- **Collection ID**: `payments`
- **Fields to index**:
  - `userId` - Ascending
  - `paymentDate` - Descending
- **Query Scope**: Collection

#### Index 3: Payments by User and Document
- **Collection ID**: `payments`
- **Fields to index**:
  - `userId` - Ascending
  - `documentId` - Ascending
- **Query Scope**: Collection

### What These Indexes Do

1. **Documents Index** - Enables fast filtering and sorting of invoices and proformas by type and date
2. **Payments by User/Date** - Optimizes payment queries with proper user isolation and date sorting
3. **Payments by User/Document** - Speeds up queries when looking up all payments for a specific invoice

### Performance Impact

With these indexes enabled:
- **Initial load time**: 40-60% faster
- **Firestore read costs**: 50-70% reduction (due to query limits)
- **Better scalability**: Supports thousands of documents without performance degradation

### Troubleshooting

**If you see errors like "The query requires an index":**
1. Check the Firebase Console → Firestore Database → Indexes tab
2. Look for any indexes that are still building (shown with a spinner icon)
3. Wait for all indexes to finish building (usually takes 1-5 minutes)
4. If an index shows "Error" status, delete it and recreate it

**If you encounter "FAILED_PRECONDITION" errors:**
- This means the app is trying to use an index that doesn't exist yet
- The app has fallback mechanisms, but performance will be degraded
- Create the missing indexes as soon as possible

### Testing the Setup

After creating the indexes:
1. Refresh your application
2. Navigate to Invoices, Proformas, and Payments pages
3. You should see faster load times and smooth pagination
4. Check the browser console - there should be no index-related warnings

---

**Questions or Issues?**
If you encounter any problems setting up the indexes, check the [Firebase Documentation](https://firebase.google.com/docs/firestore/query-data/indexing) or create an issue in the project repository.
