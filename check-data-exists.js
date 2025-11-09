// Diagnostic script to check if data exists in Firestore
// Run this in the browser console on your app page

(async function() {
    console.log("=== FIRESTORE DATA DIAGNOSTIC ===");
    console.log("Checking if data exists in Firestore...");
    
    // Import Firebase functions dynamically
    const { getAuth } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js');
    const { getFirestore, collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
    
    // Get auth and db from window or import
    // This assumes Firebase is already initialized in your app
    const auth = window.firebase?.auth?.() || (await import('./firebase/config.js')).auth;
    const db = window.firebase?.firestore?.() || (await import('./firebase/config.js')).db;
    
    if (!auth || !db) {
        console.error("Firebase not initialized. Please run this in the browser console on your app page.");
        return;
    }
    
    const user = auth.currentUser;
    if (!user) {
        console.error("No authenticated user found!");
        console.log("Please make sure you're logged in.");
        return;
    }
    
    console.log("User ID:", user.uid);
    console.log("User Email:", user.email);
    console.log("\n--- Checking Clients ---");
    
    try {
        const clientsRef = collection(db, `clients/${user.uid}/userClients`);
        const clientsSnapshot = await getDocs(clientsRef);
        console.log(`Clients found: ${clientsSnapshot.size}`);
        if (clientsSnapshot.size > 0) {
            clientsSnapshot.forEach((doc) => {
                console.log(`  - Client ID: ${doc.id}, Name: ${doc.data().name || 'N/A'}`);
            });
        } else {
            console.log("  ⚠️  NO CLIENTS FOUND!");
        }
    } catch (error) {
        console.error("Error fetching clients:", error);
    }
    
    console.log("\n--- Checking Stock Items ---");
    try {
        const itemsRef = collection(db, `items/${user.uid}/userItems`);
        const itemsSnapshot = await getDocs(itemsRef);
        console.log(`Stock items found: ${itemsSnapshot.size}`);
        if (itemsSnapshot.size > 0) {
            itemsSnapshot.forEach((doc) => {
                console.log(`  - Item ID: ${doc.id}, Name: ${doc.data().name || 'N/A'}`);
            });
        } else {
            console.log("  ⚠️  NO STOCK ITEMS FOUND!");
        }
    } catch (error) {
        console.error("Error fetching stock items:", error);
    }
    
    console.log("\n--- Checking Proformas ---");
    try {
        const proformasQuery = query(
            collection(db, `documents/${user.uid}/userDocuments`),
            where('type', '==', 'proforma')
        );
        const proformasSnapshot = await getDocs(proformasQuery);
        console.log(`Proformas found: ${proformasSnapshot.size}`);
        if (proformasSnapshot.size > 0) {
            proformasSnapshot.forEach((doc) => {
                const data = doc.data();
                console.log(`  - Proforma ID: ${doc.id}, Number: ${data.documentNumber || 'N/A'}, Deleted: ${data.deleted || false}, Cancelled: ${data.cancelled || false}`);
            });
        } else {
            console.log("  ⚠️  NO PROFORMAS FOUND!");
        }
    } catch (error) {
        console.error("Error fetching proformas:", error);
        if (error.code === 'failed-precondition') {
            console.log("  ⚠️  Index missing! Trying without where clause...");
            try {
                const allDocsRef = collection(db, `documents/${user.uid}/userDocuments`);
                const allDocsSnapshot = await getDocs(allDocsRef);
                const proformas = allDocsSnapshot.docs.filter(doc => doc.data().type === 'proforma');
                console.log(`Proformas found (filtered): ${proformas.length}`);
            } catch (e) {
                console.error("Error with fallback query:", e);
            }
        }
    }
    
    console.log("\n--- Checking Invoices ---");
    try {
        const invoicesQuery = query(
            collection(db, `documents/${user.uid}/userDocuments`),
            where('type', '==', 'invoice')
        );
        const invoicesSnapshot = await getDocs(invoicesQuery);
        console.log(`Invoices found: ${invoicesSnapshot.size}`);
    } catch (error) {
        console.error("Error fetching invoices:", error);
    }
    
    console.log("\n=== DIAGNOSTIC COMPLETE ===");
})();

