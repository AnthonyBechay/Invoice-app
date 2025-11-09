# Browser Console Diagnostic

## If you see NOTHING in the console:

### Step 1: Verify Console is Working
1. Open DevTools (F12)
2. Go to Console tab
3. Type: `console.log("TEST")` and press Enter
4. You should see "TEST" appear
5. If nothing appears, check:
   - Console filter (top right) - make sure "All levels" is selected
   - Console is not cleared (check if there's a "Clear console" button that was clicked)
   - Try a different browser

### Step 2: Check if App is Loading
1. Open DevTools (F12)
2. Go to Network tab
3. Refresh the page (Ctrl+R or F5)
4. Look for:
   - `main.js` or `bundle.js` - should load with status 200
   - Any red errors (4xx or 5xx)
   - Check if JavaScript files are loading

### Step 3: Check for JavaScript Errors
1. Open DevTools (F12)
2. Go to Console tab
3. Look for RED error messages
4. Common errors:
   - "Cannot read property of undefined"
   - "Firebase is not defined"
   - "Module not found"
   - Syntax errors

### Step 4: Run This in Console
Copy and paste this into the browser console:

```javascript
// Simple diagnostic
console.log("=== DIAGNOSTIC START ===");
console.log("Console is working:", true);
console.log("Current URL:", window.location.href);
console.log("React loaded:", typeof React !== 'undefined');
console.log("Firebase loaded:", typeof firebase !== 'undefined');

// Check if app is mounted
const root = document.getElementById('root');
console.log("Root element exists:", root !== null);
console.log("Root has children:", root?.children?.length || 0);

// Try to access Firebase config
try {
    // This will only work if Firebase is initialized
    console.log("Checking Firebase...");
} catch (e) {
    console.error("Firebase check error:", e);
}

console.log("=== DIAGNOSTIC END ===");
```

### Step 5: Check if Data Exists in Firestore
Run this in the browser console (you must be logged in):

```javascript
// This requires Firebase to be initialized
// Run this AFTER the app loads and you're logged in

(async function() {
    console.log("=== CHECKING FIRESTORE DATA ===");
    
    // Import Firebase (adjust path if needed)
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { getFirestore, collection, getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    // Get auth - this assumes Firebase is already initialized
    // If this doesn't work, you need to access it from your app's Firebase config
    const auth = window.__FIREBASE_AUTH__ || (await import('./firebase/config.js')).auth;
    const db = window.__FIREBASE_DB__ || (await import('./firebase/config.js')).db;
    
    if (!auth || !db) {
        console.error("❌ Firebase not accessible from console");
        console.log("Try accessing it from your app's source code");
        return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        console.error("❌ Not logged in!");
        return;
    }
    
    console.log("✅ User:", user.uid);
    
    // Check clients
    try {
        const clientsRef = collection(db, `clients/${user.uid}/userClients`);
        const snapshot = await getDocs(clientsRef);
        console.log(`📋 Clients: ${snapshot.size} found`);
        snapshot.forEach(doc => {
            console.log(`  - ${doc.id}: ${doc.data().name || 'N/A'}`);
        });
    } catch (e) {
        console.error("❌ Error checking clients:", e);
    }
    
    // Check stock
    try {
        const itemsRef = collection(db, `items/${user.uid}/userItems`);
        const snapshot = await getDocs(itemsRef);
        console.log(`📦 Stock Items: ${snapshot.size} found`);
        snapshot.forEach(doc => {
            console.log(`  - ${doc.id}: ${doc.data().name || 'N/A'}`);
        });
    } catch (e) {
        console.error("❌ Error checking stock:", e);
    }
    
    // Check proformas
    try {
        const docsRef = collection(db, `documents/${user.uid}/userDocuments`);
        const snapshot = await getDocs(docsRef);
        const proformas = snapshot.docs.filter(doc => doc.data().type === 'proforma');
        console.log(`📄 Proformas: ${proformas.length} found`);
        proformas.forEach(doc => {
            const data = doc.data();
            console.log(`  - ${doc.id}: ${data.documentNumber || 'N/A'} (deleted: ${data.deleted || false})`);
        });
    } catch (e) {
        console.error("❌ Error checking proformas:", e);
    }
    
    console.log("=== CHECK COMPLETE ===");
})();
```

## About "Clean Up Deleted Items"

The "Clean Up Deleted Items" button in Settings **ONLY** deletes:
- Cancelled invoices (where `cancelled == true`)
- Deleted proformas (where `deleted == true`)
- Cancelled proformas (where `cancelled == true`)

It does **NOT** delete:
- ✅ Active clients
- ✅ Active stock items
- ✅ Active invoices
- ✅ Active proformas

So clicking it should NOT have deleted your clients or stock items.

## If Data is Missing

If the diagnostic shows data exists in Firestore but the app doesn't show it:
1. Check Firestore security rules - make sure they allow read access
2. Check authentication - make sure you're logged in with the correct user
3. Check browser console for permission errors
4. Check Network tab for failed requests

## Next Steps

1. **Rebuild the app**: `npm run build` or restart `npm start`
2. **Hard refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
3. **Clear browser cache**: Settings -> Clear browsing data
4. **Check Firebase Console**: Go to Firebase Console -> Firestore Database and verify data exists

