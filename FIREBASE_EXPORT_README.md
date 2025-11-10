# Firebase Data Export Guide

This guide explains how to export data from Firebase for user UID: `mRH3LA0jPnNKRhYJ5JQmi0gn3FP2` and import it into the new PostgreSQL database.

## Prerequisites

1. **Firebase Admin SDK credentials**
   - Download your Firebase service account key from [Firebase Console](https://console.firebase.google.com/)
   - Go to Project Settings > Service Accounts > Generate New Private Key
   - Save the JSON file

2. **Node.js installed** (v18+)

3. **Install dependencies**
   ```bash
   npm install firebase-admin
   ```

## Step 1: Set Up Firebase Admin SDK

### Option A: Using Environment Variable (Recommended)

```bash
# Windows (PowerShell)
$env:GOOGLE_APPLICATION_CREDENTIALS="C:\path\to\your\serviceAccountKey.json"

# Windows (CMD)
set GOOGLE_APPLICATION_CREDENTIALS=C:\path\to\your\serviceAccountKey.json

# Linux/Mac
export GOOGLE_APPLICATION_CREDENTIALS="C:\Users\User\Desktop\development\Invoice-app\voltventures-ec8c4-firebase-adminsdk-fbsvc-aa49bdf4e6.json"
```

### Option B: Modify the Script

If you prefer, you can modify `export-firebase-data.js` to load credentials directly:

```javascript
const serviceAccount = require('./path/to/serviceAccountKey.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
```

## Step 2: Run the Export Script

```bash
node export-firebase-data.js
```

The script will:
- Connect to Firebase
- Export all data for user UID: `mRH3LA0jPnNKRhYJ5JQmi0gn3FP2`
- Generate CSV files in the `firebase-export/` directory

## Step 3: Review Exported Files

The script generates the following CSV files:

1. **clients.csv** - All clients
2. **stock.csv** - All stock items
3. **documents.csv** - All proformas and invoices
4. **payments.csv** - All payments
5. **expenses.csv** - All expenses
6. **settings.csv** - User settings

## Step 4: Import Data into New System

### Import Clients

1. Log into the new application
2. Go to **Clients** page
3. Click **Import CSV**
4. Select `clients.csv`
5. Verify all clients imported correctly

### Import Stock Items

1. Go to **Stock Items** page
2. Click **Import CSV**
3. Select `stock.csv`
4. Verify all items imported correctly

### Import Documents (Proformas & Invoices)

**Note:** Documents have a complex structure with items, so manual import or a custom script may be needed.

The `documents.csv` file contains:
- Basic document information
- Items stored as JSON in the "Items JSON" column

You can:
1. **Manual Import**: Create documents manually in the app
2. **Custom Script**: Create a script to parse the JSON and create documents via API

### Import Payments

**Note:** Payments need to be linked to existing documents/clients, so they should be imported after documents.

You can:
1. **Manual Import**: Add payments manually in the app
2. **Custom Script**: Create a script to import payments via API

### Import Expenses

**Note:** Expenses can be imported manually or via a custom script.

### Import Settings

**Note:** Settings should be imported manually:
1. Go to **Settings** page
2. Copy values from `settings.csv`
3. Paste into the settings form
4. Upload logo if present (base64 data)

## CSV File Formats

### clients.csv
```
Client ID,Name,Email,Phone,Location,VAT Number
1,John Doe,john@example.com,+1234567890,New York,12345
```

### stock.csv
```
Name,Description,Unit,Unit Price,Quantity
Widget A,High quality widget,pcs,10.50,100
```

### documents.csv
```
Type,Document Number,Client Name,Date,Due Date,Subtotal,Tax Rate,Tax Amount,Total,Status,Notes,Items JSON
invoice,INV-2024-001,John Doe,2024-01-15,2024-02-15,1000,11,110,1110,paid,Thank you,[{"name":"Item 1","quantity":1,"unitPrice":1000}]
```

### payments.csv
```
Client Name,Invoice Number,Amount,Payment Date,Payment Method,Notes
John Doe,INV-2024-001,1110,2024-01-20,bank transfer,Full payment
```

### expenses.csv
```
Description,Category,Amount,Expense Date,Notes
Office supplies,Supplies,50.00,2024-01-10,Monthly supplies
```

### settings.csv
```
Company Name,Company Address,Company Phone,Company Email,Company VAT Number,Footer Message,Tax Rate,Currency,Logo (Base64)
My Company,123 Main St,New York,+1234567890,contact@company.com,12345,Thank you!,11,USD,data:image/png;base64,...
```

## Troubleshooting

### Error: "Error initializing Firebase Admin SDK"
- Make sure `GOOGLE_APPLICATION_CREDENTIALS` is set correctly
- Verify the service account key file exists and is valid JSON
- Check that the service account has Firestore read permissions

### Error: "Permission denied"
- Verify the service account has the "Cloud Datastore User" role
- Check Firebase project permissions

### No data exported
- Verify the user UID is correct: `mRH3LA0jPnNKRhYJ5JQmi0gn3FP2`
- Check that data exists in Firebase for this user
- Verify the collection names match (clients, stock, documents, payments, expenses, settings)

### CSV import fails
- Check CSV file format matches expected headers
- Verify no special characters break CSV parsing
- Ensure required fields are not empty

## Next Steps After Import

1. **Verify Data Integrity**
   - Check that all clients imported correctly
   - Verify stock items match
   - Review documents and ensure items are correct

2. **Link Relationships**
   - Ensure payments are linked to correct invoices
   - Verify document items reference correct stock items
   - Check that documents reference correct clients

3. **Test Functionality**
   - Create a new invoice to test
   - Generate a PDF
   - Test payment tracking

## Support

If you encounter issues:
1. Check the console output for error messages
2. Verify Firebase connection
3. Review CSV file formats
4. Test with a small subset of data first

