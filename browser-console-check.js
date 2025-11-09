// SIMPLE BROWSER CONSOLE CHECK
// Copy and paste this into your browser console (F12 -> Console tab)
// This will check if data exists and if Firebase is working

console.log("=== SIMPLE DATA CHECK ===");

// Check if Firebase is available
if (typeof window !== 'undefined') {
    console.log("Window object exists");
    
    // Try to access Firebase from React app
    // This will work if you paste it in the console while on your app page
    setTimeout(async () => {
        try {
            // Try to get Firebase from window
            const firebase = window.firebase || window.__FIREBASE_DEFAULTS__;
            console.log("Firebase object:", firebase ? "Found" : "Not found");
            
            // If you're using modular Firebase, it might be in a different location
            // Let's check the React app's Firebase config
            console.log("\n=== CHECKING AUTH ===");
            console.log("Try running: window.__REACT_APP_FIREBASE_AUTH__?.currentUser");
            console.log("Or check: document.querySelector('body')");
            
            // Simple test - check if console.log works
            console.log("✅ Console logging is working!");
            console.log("✅ If you see this, JavaScript is executing");
            
            // Check if React is loaded
            if (window.React) {
                console.log("✅ React is loaded");
            } else {
                console.log("⚠️  React not found in window object");
            }
            
        } catch (error) {
            console.error("Error checking Firebase:", error);
        }
    }, 1000);
} else {
    console.error("Window object not available - this script must run in browser");
}

