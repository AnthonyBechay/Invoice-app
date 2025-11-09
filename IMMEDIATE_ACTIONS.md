# IMMEDIATE ACTIONS - Data Loss Recovery

**User:** a@b.com (UID: CxWdTQh6EwNz7yyZBlFhGmfdaul1)
**Date:** 2025-11-09
**Status:** URGENT - Follow these steps now

---

## WHAT HAPPENED?

A bug in the "Fix Payment Data" button caused payments to be reassigned between users. Your data may have been moved to another user's account, or another user's data may have been moved to your account.

**The bug has been FIXED.** Now we need to recover your data.

---

## STEP 1: RUN DIAGNOSTIC (5 minutes)

### Instructions:

1. Open your Invoice App in browser
2. Press **F12** to open Developer Console (keep it open)
3. Login with: **a@b.com** / **123456**
4. Go to: **Settings** > **Advanced** tab
5. Click: **"Run Database Diagnostic"**
6. Look at the console output (bottom of screen)

### What to Look For:

```
✓ Total documents: X
✓ Total payments: X
✓ Total clients: X
✓ Total items: X
```

**If you see this:**
```
🚨 CRITICAL: X payments have wrong userId!
```
→ Your payments were stolen. Continue to Step 2.

**If you see this:**
```
⚠ WARNING: No documents found!
⚠ WARNING: No payments found!
⚠ WARNING: No clients found!
```
→ Your data was deleted or moved. Continue to Step 3.

**Take a screenshot of the console output!**

---

## STEP 2: FIND STOLEN PAYMENTS (10 minutes)

If the diagnostic shows "payments have wrong userId", run this in console:

### Open Browser Console (F12), then paste:

```javascript
// Import the recovery module
const { findStolenPayments } = await import('./utils/dataRecovery.js');

// Find stolen payments for your user
const result = await findStolenPayments('CxWdTQh6EwNz7yyZBlFhGmfdaul1');

// Show results
console.log('STOLEN PAYMENTS FOUND:', result.totalStolen);
console.log('Total Amount:', result.totalAmount);
console.log('Details:', result.stolenPayments);
```

### What This Does:
- Scans ALL payments in the database
- Finds payments that reference YOUR documents but have a different userId
- Shows you who has your payments

### Save This Information:
- Number of stolen payments
- Total amount
- The other user's userId (shown in console)

---

## STEP 3: REQUEST FIREBASE BACKUP (15 minutes)

**This is the FASTEST way to recover everything.**

### Instructions:

1. Go to: https://console.firebase.google.com
2. Select your Invoice App project
3. Click: **Firestore Database** in left menu
4. Click: **Import/Export** tab
5. Check if backups exist from last week
6. If yes: Click **Import** and select the backup from before the incident
7. If no: Click **Export** to create a backup first, then contact Firebase support

### What This Does:
- Restores your entire database to a previous date
- Recovers all invoices, payments, clients, and stock
- Overwrites current data (coordinate with other users!)

### Timeline:
- Backup import: 10-30 minutes
- Verification: 5 minutes

---

## STEP 4: RECOVER PAYMENTS MANUALLY (If backup not available)

**Only do this if Firebase backup is not available or too old.**

### Instructions:

Open browser console (F12) and run:

```javascript
// Import recovery tools
const { recoverStolenPayments } = await import('./utils/dataRecovery.js');

// DRY RUN FIRST (doesn't make changes)
const dryRun = await recoverStolenPayments('CxWdTQh6EwNz7yyZBlFhGmfdaul1', true);
console.log('Would recover:', dryRun.wouldRecover, 'payments');
console.log('Details:', dryRun.stolenPayments);

// If dry run looks correct, actually recover:
const recovered = await recoverStolenPayments('CxWdTQh6EwNz7yyZBlFhGmfdaul1', false);
console.log('Recovered:', recovered.recoveredCount, 'payments');
```

### What This Does:
- First run shows what WOULD be recovered (safe, no changes)
- Second run actually changes the userId back to yours
- Only affects payments that reference YOUR documents

---

## STEP 5: VERIFY RECOVERY

After recovery (either backup or manual):

1. Go to: **Settings** > **Advanced**
2. Click: **"Run Database Diagnostic"** again
3. Check console output:
   ```
   ✓ Total documents: [should be your count]
   ✓ Total payments: [should be your count]
   ✓ No critical issues found
   ```

4. Check your pages:
   - **Dashboard** - Do you see your invoices?
   - **Invoices** - Are all invoices there?
   - **Payments** - Are all payments showing?
   - **Clients** - Are all clients there?
   - **Stock** - Are all items there?

---

## STEP 6: FIND THE OTHER USER (Optional)

If you want to know who caused this:

1. Go to Firebase Console > Firestore Database
2. Navigate to: **payments** collection
3. Add filter: `repaired == true`
4. Sort by: `repairedAt` (descending)
5. Look at the first few payments
6. Check the `userId` field - this is who clicked "Fix Payment Data"

**Note:** They probably didn't know this would happen. The bug has been fixed now.

---

## QUICK REFERENCE: Console Commands

### Check What Data You Have
```javascript
// Run diagnostic
// Settings > Advanced > Run Database Diagnostic
// Or in console:
const { diagnosticDatabaseCheck } = await import('./utils/paymentMigration.js');
const result = await diagnosticDatabaseCheck('CxWdTQh6EwNz7yyZBlFhGmfdaul1');
```

### Find Your Stolen Payments
```javascript
const { findStolenPayments } = await import('./utils/dataRecovery.js');
const stolen = await findStolenPayments('CxWdTQh6EwNz7yyZBlFhGmfdaul1');
console.log(stolen);
```

### Recover Your Payments
```javascript
const { recoverStolenPayments } = await import('./utils/dataRecovery.js');
// Dry run first
const dryRun = await recoverStolenPayments('CxWdTQh6EwNz7yyZBlFhGmfdaul1', true);
// Then actually recover
const recovered = await recoverStolenPayments('CxWdTQh6EwNz7yyZBlFhGmfdaul1', false);
```

### See All Affected Users
```javascript
const { findAffectedUsers } = await import('./utils/dataRecovery.js');
const users = await findAffectedUsers();
console.log(users);
```

---

## WHAT WAS FIXED?

The bug that caused this has been fixed. The changes are in:
- `src/utils/paymentMigration.js` - Fixed the cross-user contamination bug
- `src/components/SettingsPage.js` - Added diagnostic button
- `src/utils/dataRecovery.js` - New recovery tools

**The "Fix Payment Data" button is now safe to use** (but you probably don't need it anymore).

---

## NEED HELP?

1. **Review the full investigation report:**
   `DATA_LOSS_INVESTIGATION_REPORT.md`

2. **Check the recovery code:**
   `src/utils/dataRecovery.js`

3. **Run the diagnostic:**
   Settings > Advanced > Run Database Diagnostic

4. **Check browser console (F12)** for detailed logs

---

## TIMELINE

- **5 min:** Run diagnostic to assess damage
- **10 min:** Find stolen payments (if any)
- **15 min:** Request Firebase backup OR
- **20 min:** Recover payments manually
- **5 min:** Verify recovery

**Total: 30-55 minutes**

---

## CHECKLIST

- [ ] Ran database diagnostic
- [ ] Took screenshot of console output
- [ ] Identified what data is missing
- [ ] Requested Firebase backup restoration OR
- [ ] Found stolen payments
- [ ] Ran recovery (dry run first)
- [ ] Verified recovery successful
- [ ] Checked all pages (Dashboard, Invoices, Payments, Clients, Stock)
- [ ] Documented the incident
- [ ] Notified other users if needed

---

**YOU CAN DO THIS!**

The tools are ready. Follow the steps. Your data can be recovered.

---

*Last Updated: 2025-11-09*
