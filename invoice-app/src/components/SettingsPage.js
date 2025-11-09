import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, writeBatch, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendEmailVerification, verifyBeforeUpdateEmail, applyActionCode, checkActionCode } from 'firebase/auth';
import { auth, db, storage } from '../firebase/config';
import { repairMigratedPayments, diagnosticDatabaseCheck } from '../utils/paymentMigration';
import { deepInvestigation, verifyUserIdentity } from '../utils/advancedDiagnostic';
import { fullDataReconstruction, reconstructClients, reconstructPayments } from '../utils/reconstructData';

const SettingsPage = () => {
    const [companyName, setCompanyName] = useState('');
    const [companyAddress, setCompanyAddress] = useState('');
    const [companyPhone, setCompanyPhone] = useState('');
    const [companyVatNumber, setCompanyVatNumber] = useState('');
    const [footerMessage, setFooterMessage] = useState('');
    const [logoUrl, setLogoUrl] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [loading, setLoading] = useState(true);
    const [feedback, setFeedback] = useState({ type: '', message: '' });
    
    // User account settings
    const [userDisplayName, setUserDisplayName] = useState('');
    const [userEmail, setUserEmail] = useState('');
    const [currentPasswordForEmail, setCurrentPasswordForEmail] = useState('');
    const [currentPasswordForPassword, setCurrentPasswordForPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [activeTab, setActiveTab] = useState('company');

    useEffect(() => {
        const fetchSettings = async () => {
            if (!auth.currentUser) return;
            
            // Load user account info
            setUserDisplayName(auth.currentUser.displayName || '');
            setUserEmail(auth.currentUser.email || '');
            
            const settingsRef = doc(db, 'settings', auth.currentUser.uid);
            try {
                const docSnap = await getDoc(settingsRef);
                if (docSnap.exists()) {
                    const settings = docSnap.data();
                    setCompanyName(settings.companyName || '');
                    setCompanyAddress(settings.companyAddress || '');
                    setCompanyPhone(settings.companyPhone || '');
                    setCompanyVatNumber(settings.companyVatNumber || '');
                    setFooterMessage(settings.footerMessage || 'Thank you for your business!');
                    setLogoUrl(settings.logoUrl || '');
                }
            } catch (error) {
                console.error("Error fetching settings:", error);
                setFeedback({ type: 'error', message: 'Failed to fetch settings.' });
            } finally {
                setLoading(false);
            }
        };
        fetchSettings();
    }, []);

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];
            
            // Check file size (5MB limit)
            if (file.size > 5 * 1024 * 1024) {
                setFeedback({ type: 'error', message: 'File size must be less than 5MB' });
                return;
            }
            
            // Check file type
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
                setFeedback({ type: 'error', message: 'Please upload a valid image file (PNG, JPG, or GIF)' });
                return;
            }
            
            setImageFile(file);
            setFeedback({ type: '', message: '' });
        }
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        let newLogoUrl = logoUrl;

        if (imageFile) {
            // Check file size for base64 storage (limit to 1MB for Firestore)
            if (imageFile.size > 1 * 1024 * 1024) {
                setFeedback({
                    type: 'error',
                    message: 'Logo file is too large. Please use an image under 1MB or configure CORS for Firebase Storage.'
                });
                setLoading(false);
                setImageFile(null);
                return;
            }

            // Convert to base64 (skip Firebase Storage for now due to CORS)
            // Once CORS is configured, we can enable Storage upload
            console.log('Converting logo to base64 (CORS workaround)');
            setUploadProgress(50);

            try {
                // Convert image to base64
                const reader = new FileReader();
                const base64Promise = new Promise((resolve, reject) => {
                    reader.onload = () => resolve(reader.result);
                    reader.onerror = reject;
                    reader.readAsDataURL(imageFile);
                });

                newLogoUrl = await base64Promise;
                setLogoUrl(newLogoUrl);
                setUploadProgress(100);
                console.log('Logo stored as base64 successfully');
            } catch (base64Error) {
                console.error("Base64 conversion failed:", base64Error);
                setFeedback({ type: 'error', message: `Logo save failed: ${base64Error.message}` });
                setLoading(false);
                setUploadProgress(0);
                setImageFile(null);
                return;
            }
        }

        const settingsRef = doc(db, 'settings', auth.currentUser.uid);
        try {
            await setDoc(settingsRef, {
                companyName,
                companyAddress,
                companyPhone,
                companyVatNumber,
                footerMessage: footerMessage || 'Thank you for your business!',
                logoUrl: newLogoUrl
            }, { merge: true });

            // Show appropriate success message
            if (imageFile && newLogoUrl && newLogoUrl.startsWith('data:')) {
                setFeedback({
                    type: 'success',
                    message: 'Settings saved! Logo stored as base64. To use cloud storage instead, configure CORS for Firebase Storage (see docs).'
                });
            } else {
                setFeedback({ type: 'success', message: 'Settings saved successfully!' });
            }
        } catch (error) {
            console.error("Error saving settings:", error);
            setFeedback({ type: 'error', message: 'Failed to save settings.' });
        } finally {
            setLoading(false);
            setImageFile(null);
            setUploadProgress(0);
        }
    };

    const handleUpdateProfile = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            await updateProfile(auth.currentUser, {
                displayName: userDisplayName
            });
            setFeedback({ type: 'success', message: 'Profile updated successfully!' });
        } catch (error) {
            console.error("Error updating profile:", error);
            setFeedback({ type: 'error', message: 'Failed to update profile.' });
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateEmail = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        // Check if email actually changed
        if (userEmail === auth.currentUser.email) {
            setFeedback({ type: 'info', message: 'Email is already set to this value.' });
            setLoading(false);
            return;
        }

        try {
            // Re-authenticate before updating email (Firebase requires this)
            if (!currentPasswordForEmail) {
                setFeedback({ type: 'error', message: 'Please enter your current password to change email.' });
                setLoading(false);
                return;
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(userEmail)) {
                setFeedback({ type: 'error', message: 'Please enter a valid email address.' });
                setLoading(false);
                return;
            }

            // Re-authenticate the user
            const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPasswordForEmail);
            await reauthenticateWithCredential(auth.currentUser, credential);
            
            // Try verifyBeforeUpdateEmail - this sends verification email
            // We rely on Firebase Console Email Action URL (no hardcoded URL here)
            try {
                await verifyBeforeUpdateEmail(auth.currentUser, userEmail, {
                    handleCodeInApp: false
                });
                
                setFeedback({ 
                    type: 'success', 
                    message: `✓ Verification email sent to ${userEmail}. Please check your inbox (and spam folder) and click the verification link to complete the email change. The email will be updated automatically after you verify it.` 
                });
                
                // Clear password field after successful request
                setCurrentPasswordForEmail('');
            } catch (verifyError) {
                console.error("verifyBeforeUpdateEmail error:", verifyError);
                
                // If verifyBeforeUpdateEmail fails with operation-not-allowed,
                // it might mean email verification is disabled or action handler URL is not configured
                if (verifyError.code === 'auth/operation-not-allowed') {
                    setFeedback({ 
                        type: 'error', 
                        message: 'Email verification is not properly configured in Firebase. Please contact support or configure the Email Action Handler URL in Firebase Console under Authentication > Settings > Email Templates.' 
                    });
                } else {
                    // Try alternative: use updateEmail directly (might work if verification settings allow it)
                    try {
                        await updateEmail(auth.currentUser, userEmail);
                        setFeedback({ 
                            type: 'success', 
                            message: `Email updated successfully to ${userEmail}!` 
                        });
                        setCurrentPasswordForEmail('');
                    } catch (updateError) {
                        console.error("updateEmail error:", updateError);
                        throw verifyError; // Throw original error
                    }
                }
            }
        } catch (error) {
            console.error("Error updating email:", error);
            if (error.code === 'auth/requires-recent-login') {
                setFeedback({ type: 'error', message: 'Please re-authenticate to change email. Enter your current password and try again.' });
            } else if (error.code === 'auth/wrong-password') {
                setFeedback({ type: 'error', message: 'Current password is incorrect.' });
            } else if (error.code === 'auth/email-already-in-use') {
                setFeedback({ type: 'error', message: 'This email is already in use by another account.' });
            } else if (error.code === 'auth/invalid-email') {
                setFeedback({ type: 'error', message: 'Please enter a valid email address.' });
            } else if (error.code === 'auth/operation-not-allowed') {
                setFeedback({ 
                    type: 'error', 
                    message: 'Email verification is required but not configured. Please configure Email Action Handler URL in Firebase Console (Authentication > Settings > Email Templates) or contact your administrator.' 
                });
            } else {
                setFeedback({ type: 'error', message: `Failed to update email: ${error.message}. Please try again or contact support.` });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        if (newPassword !== confirmPassword) {
            setFeedback({ type: 'error', message: 'New passwords do not match.' });
            setLoading(false);
            return;
        }

        if (newPassword.length < 6) {
            setFeedback({ type: 'error', message: 'Password must be at least 6 characters long.' });
            setLoading(false);
            return;
        }

        try {
            // Re-authenticate user before changing password
            const credential = EmailAuthProvider.credential(auth.currentUser.email, currentPasswordForPassword);
            await reauthenticateWithCredential(auth.currentUser, credential);

            await updatePassword(auth.currentUser, newPassword);
            setFeedback({ type: 'success', message: 'Password updated successfully!' });
            setCurrentPasswordForPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error("Error updating password:", error);
            if (error.code === 'auth/wrong-password') {
                setFeedback({ type: 'error', message: 'Current password is incorrect.' });
            } else if (error.code === 'auth/weak-password') {
                setFeedback({ type: 'error', message: 'Password is too weak.' });
            } else {
                setFeedback({ type: 'error', message: 'Failed to update password.' });
            }
        } finally {
            setLoading(false);
        }
    };

    const handleRepairPayments = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });
        try {
            const result = await repairMigratedPayments(auth.currentUser.uid);
            if (result.success) {
                setFeedback({
                    type: 'success',
                    message: `Repair completed successfully! Added userId to ${result.emergencyFixCount || 0} payments. Fixed ${result.repairedCount} payment details. Corrected settlement status on ${result.fixedSettlement} payments.`
                });
            } else {
                setFeedback({ type: 'error', message: `Repair failed: ${result.error}` });
            }
        } catch (error) {
            console.error('Repair error:', error);
            setFeedback({ type: 'error', message: 'Repair failed. Please try again.' });
        } finally {
            setLoading(false);
        }
    };

    const handleDiagnosticCheck = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            console.log('Running diagnostic check...');
            const result = await diagnosticDatabaseCheck(auth.currentUser.uid);

            if (result.success === false) {
                setFeedback({ type: 'error', message: `Diagnostic failed: ${result.error}` });
            } else {
                const summary = `Diagnostic completed! Documents: ${result.documents.total}, Payments: ${result.payments.total}, Clients: ${result.clients.total}, Items: ${result.items.total}. ${result.issues.length > 0 ? `Found ${result.issues.length} issue(s) - check console for details.` : 'No issues found.'}`;
                setFeedback({
                    type: result.issues.length > 0 ? 'warning' : 'success',
                    message: summary
                });
            }
        } catch (error) {
            console.error('Diagnostic error:', error);
            setFeedback({ type: 'error', message: 'Diagnostic failed. Check console for details.' });
        } finally {
            setLoading(false);
        }
    };

    const handleDeepInvestigation = async () => {
        if (!auth.currentUser) return;
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            console.log('Running deep investigation...');
            const result = await deepInvestigation(auth.currentUser.uid);

            if (result.success === false) {
                setFeedback({ type: 'error', message: `Investigation failed: ${result.error}` });
            } else {
                const message = `Deep investigation completed. Conclusion: ${result.conclusion || 'See console for details'}. Found ${result.findings.length} findings. Check console (F12) for full report.`;
                setFeedback({
                    type: 'warning',
                    message: message
                });
            }
        } catch (error) {
            console.error('Investigation error:', error);
            setFeedback({ type: 'error', message: 'Investigation failed. Check console for details.' });
        } finally {
            setLoading(false);
        }
    };

    const handleVerifyIdentity = async () => {
        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            console.log('Verifying user identity...');
            const result = await verifyUserIdentity();

            if (!result.loggedIn) {
                setFeedback({ type: 'error', message: 'No user logged in!' });
            } else if (result.wrongAccount) {
                setFeedback({
                    type: 'error',
                    message: `Wrong account! Expected: a@b.com, Current: ${result.currentEmail}. Check console for details.`
                });
            } else if (result.wrongUid) {
                setFeedback({
                    type: 'error',
                    message: `User UID mismatch! This account may have been recreated. Check console for details.`
                });
            } else if (result.correct) {
                setFeedback({
                    type: 'success',
                    message: `✓ User identity verified. Email: ${result.email}, UID: ${result.uid}`
                });
            } else {
                setFeedback({ type: 'info', message: 'Identity check completed. See console for details.' });
            }
        } catch (error) {
            console.error('Identity verification error:', error);
            setFeedback({ type: 'error', message: 'Verification failed. Check console for details.' });
        } finally {
            setLoading(false);
        }
    };

    const handleFullReconstruction = async () => {
        if (!auth.currentUser) return;

        if (!window.confirm('This will attempt to reconstruct your clients and payments from existing invoices. Your documents must exist for this to work. Continue?')) {
            return;
        }

        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            console.log('Running full data reconstruction...');
            const result = await fullDataReconstruction(auth.currentUser.uid);

            if (!result.success) {
                setFeedback({
                    type: 'error',
                    message: `Reconstruction failed. Errors: ${result.errors.join(', ')}. Check console for details.`
                });
            } else {
                const clientsRestored = result.clients?.clientsRestored || 0;
                const paymentsRestored = result.payments?.paymentsRestored || 0;
                const itemsRestored = result.items?.itemsRestored || 0;

                setFeedback({
                    type: 'success',
                    message: `✓ Data reconstructed! Clients: ${clientsRestored}, Payments: ${paymentsRestored}, Stock Items: ${itemsRestored}. Check console for full report.`
                });
            }
        } catch (error) {
            console.error('Reconstruction error:', error);
            setFeedback({ type: 'error', message: `Reconstruction failed: ${error.message}. Check console for details.` });
        } finally {
            setLoading(false);
        }
    };

    const handleCleanupDatabase = async () => {
        if (!auth.currentUser) return;

        if (!window.confirm('This will permanently delete all cancelled invoices and deleted proformas. This action cannot be undone. Continue?')) {
            return;
        }

        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            console.log('\n╔════════════════════════════════════════════════════════════╗');
            console.log('║   DATABASE CLEANUP - STARTING                              ║');
            console.log('╚════════════════════════════════════════════════════════════╝');
            const userId = auth.currentUser.uid;
            console.log(`User ID: ${userId}`);
            console.log(`Timestamp: ${new Date().toISOString()}\n`);

            let deletedInvoices = 0;
            let deletedProformas = 0;
            let errors = [];

            // Helper function to delete documents in batches (Firestore batch limit is 500)
            const deleteInBatches = async (querySnapshot, type) => {
                let deletedCount = 0;
                let currentBatch = writeBatch(db);
                let batchCount = 0;

                console.log(`Deleting ${querySnapshot.size} ${type}(s)...`);

                for (const docSnap of querySnapshot.docs) {
                    const data = docSnap.data();
                    console.log(`  - Deleting ${type}: ${docSnap.id} (${data.documentNumber || data.invoiceNumber || data.proformaNumber || 'N/A'})`);

                    currentBatch.delete(doc(db, `documents/${userId}/userDocuments`, docSnap.id));
                    batchCount++;
                    deletedCount++;

                    // Commit batch when reaching limit (500) or at end
                    if (batchCount >= 500) {
                        console.log(`  Committing batch of ${batchCount} documents...`);
                        await currentBatch.commit();
                        currentBatch = writeBatch(db);
                        batchCount = 0;
                    }
                }

                // Commit remaining documents in the last batch
                if (batchCount > 0) {
                    console.log(`  Committing final batch of ${batchCount} documents...`);
                    await currentBatch.commit();
                }

                console.log(`✓ Deleted ${deletedCount} ${type}(s)`);
                return deletedCount;
            };

            // NOTE: Firebase composite indexes removed, using client-side filtering instead
            // Get ALL documents once, then filter in memory to avoid index requirements

            try {
                console.log('Fetching all documents for cleanup...');
                const allDocsQuery = query(collection(db, `documents/${userId}/userDocuments`));
                const allDocsSnapshot = await getDocs(allDocsQuery);

                console.log(`Fetched ${allDocsSnapshot.size} total documents`);

                // Filter client-side to avoid composite indexes
                const cancelledInvoices = [];
                const deletedProformas = [];
                const cancelledProformas = [];

                allDocsSnapshot.docs.forEach(doc => {
                    const data = doc.data();

                    if (data.type === 'invoice' && data.cancelled === true) {
                        cancelledInvoices.push(doc);
                    } else if (data.type === 'proforma' && data.deleted === true) {
                        deletedProformas.push(doc);
                    } else if (data.type === 'proforma' && data.cancelled === true) {
                        cancelledProformas.push(doc);
                    }
                });

                console.log(`Found ${cancelledInvoices.length} cancelled invoices`);
                console.log(`Found ${deletedProformas.length} deleted proformas`);
                console.log(`Found ${cancelledProformas.length} cancelled proformas`);

                // Delete cancelled invoices
                if (cancelledInvoices.length > 0) {
                    deletedInvoices = await deleteInBatches({ docs: cancelledInvoices, size: cancelledInvoices.length }, 'cancelled invoice');
                }

                // Delete deleted proformas
                if (deletedProformas.length > 0) {
                    deletedProformas += await deleteInBatches({ docs: deletedProformas, size: deletedProformas.length }, 'deleted proforma');
                }

                // Delete cancelled proformas
                if (cancelledProformas.length > 0) {
                    deletedProformas += await deleteInBatches({ docs: cancelledProformas, size: cancelledProformas.length }, 'cancelled proforma');
                }

            } catch (error) {
                console.error('Error during cleanup:', error);
                errors.push(`Error during cleanup: ${error.message}`);
            }

            const totalDeleted = deletedInvoices + deletedProformas;

            console.log('\n╔════════════════════════════════════════════════════════════╗');
            console.log('║   DATABASE CLEANUP - COMPLETED                             ║');
            console.log('╚════════════════════════════════════════════════════════════╝');
            console.log(`✓ Deleted invoices: ${deletedInvoices}`);
            console.log(`✓ Deleted proformas: ${deletedProformas}`);
            console.log(`✓ Total deleted: ${totalDeleted}`);
            if (errors.length > 0) {
                console.log(`⚠ Errors encountered: ${errors.length}`);
                errors.forEach(err => console.log(`  - ${err}`));
            }
            console.log(`Timestamp: ${new Date().toISOString()}\n`);

            const message = totalDeleted > 0
                ? `Cleanup completed! Deleted ${deletedInvoices} cancelled invoice(s) and ${deletedProformas} deleted proforma(s).${errors.length > 0 ? ' Warnings: ' + errors.join('; ') : ''}`
                : 'No deleted items found to clean up.';

            setFeedback({
                type: totalDeleted > 0 ? 'success' : 'info',
                message: message
            });
        } catch (error) {
            console.error('\n╔════════════════════════════════════════════════════════════╗');
            console.error('║   DATABASE CLEANUP - FAILED                                ║');
            console.error('╚════════════════════════════════════════════════════════════╝');
            console.error('Error:', error);
            console.error('Stack:', error.stack);
            setFeedback({ type: 'error', message: `Cleanup failed: ${error.message}` });
        } finally {
            setLoading(false);
        }
    };

    if (loading && !companyName) { // Check !companyName to avoid flicker on save
        return <p>Loading settings...</p>;
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>
            
            {/* Tab Navigation */}
            <div className="mb-6">
                <div className="border-b border-gray-200">
                    <nav className="-mb-px flex space-x-8">
                        <button
                            onClick={() => setActiveTab('company')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'company'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Company Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('account')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'account'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Account Settings
                        </button>
                        <button
                            onClick={() => setActiveTab('advanced')}
                            className={`py-2 px-1 border-b-2 font-medium text-sm ${
                                activeTab === 'advanced'
                                    ? 'border-indigo-500 text-indigo-600'
                                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                            }`}
                        >
                            Advanced
                        </button>
                    </nav>
                </div>
            </div>

            <div className="bg-white p-8 rounded-lg shadow-lg">
                {activeTab === 'company' && (
                    <div className="space-y-6">
                        <div>
                        <label htmlFor="companyName" className="block text-sm font-medium text-gray-700">Company Name</label>
                        <input
                            type="text"
                            id="companyName"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="companyAddress" className="block text-sm font-medium text-gray-700">Company Address</label>
                        <input
                            type="text"
                            id="companyAddress"
                            value={companyAddress}
                            onChange={(e) => setCompanyAddress(e.target.value)}
                            placeholder="123 Business St, City, State 12345"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="companyPhone" className="block text-sm font-medium text-gray-700">Phone Number</label>
                        <input
                            type="text"
                            id="companyPhone"
                            value={companyPhone}
                            onChange={(e) => setCompanyPhone(e.target.value)}
                            placeholder="+1 (555) 123-4567"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="companyVatNumber" className="block text-sm font-medium text-gray-700">VAT Number</label>
                        <input
                            type="text"
                            id="companyVatNumber"
                            value={companyVatNumber}
                            onChange={(e) => setCompanyVatNumber(e.target.value)}
                            placeholder="123456789"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>
                    <div>
                        <label htmlFor="footerMessage" className="block text-sm font-medium text-gray-700">Invoice Footer Message</label>
                        <textarea
                            id="footerMessage"
                            value={footerMessage}
                            onChange={(e) => setFooterMessage(e.target.value)}
                            rows={3}
                            placeholder="Thank you for your business!"
                            className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                        <p className="text-xs text-gray-500 mt-1">This message will appear at the bottom of all invoices and proformas.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Company Logo</label>
                        <div className="mt-2 flex items-center space-x-4">
                            {logoUrl && <img src={logoUrl} alt="Company Logo" className="h-16 w-16 rounded-full object-cover" />}
                            <div>
                                <input 
                                    type="file" 
                                    onChange={handleImageChange} 
                                    accept="image/png,image/jpeg,image/jpg,image/gif" 
                                    className="text-sm"
                                />
                                <p className="text-xs text-gray-500 mt-1">Max size: 5MB. Formats: PNG, JPG, GIF</p>
                            </div>
                        </div>
                        {uploadProgress > 0 && uploadProgress < 100 && (
                            <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                                <div className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" style={{ width: `${uploadProgress}%` }}></div>
                            </div>
                        )}
                    </div>
                        <div>
                            <button
                                onClick={handleSave}
                                disabled={loading}
                                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md disabled:bg-indigo-300"
                            >
                                {loading ? 'Saving...' : 'Save Company Settings'}
                            </button>
                        </div>
                    </div>
                )}

                {activeTab === 'account' && (
                    <div className="space-y-6">
                        {/* Profile Information */}
                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Profile Information</h3>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="userDisplayName" className="block text-sm font-medium text-gray-700">Display Name</label>
                                    <input
                                        type="text"
                                        id="userDisplayName"
                                        value={userDisplayName}
                                        onChange={(e) => setUserDisplayName(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter your display name"
                                    />
                                </div>
                                <div>
                                    <button
                                        onClick={handleUpdateProfile}
                                        disabled={loading}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-indigo-300"
                                    >
                                        {loading ? 'Updating...' : 'Update Profile'}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Email Settings */}
                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Email Address</h3>
                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                                <p className="text-sm text-blue-700 mb-2">
                                    <strong>Current Email:</strong> {auth.currentUser?.email}
                                </p>
                                <p className="text-xs text-blue-600 mb-2">
                                    <strong>Note:</strong> Firebase will send a verification email to your new address. Check your inbox (and spam folder) for the verification link. The email change will only take effect after you click that link.
                                </p>
                                <p className="text-xs text-orange-600">
                                    <strong>⚠️ Troubleshooting:</strong> If you don&apos;t receive the verification email, check that Email Action Handler URL is configured in Firebase Console (Authentication &gt; Settings &gt; Email Templates).
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="userEmail" className="block text-sm font-medium text-gray-700 mb-1">New Email Address</label>
                                    <input
                                        type="email"
                                        id="userEmail"
                                        value={userEmail}
                                        onChange={(e) => setUserEmail(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter your new email address"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Enter a new email address. A verification email will be sent to the new address. You must click the link in that email to complete the change.</p>
                                </div>
                                <div>
                                    <label htmlFor="currentPasswordForEmail" className="block text-sm font-medium text-gray-700 mb-1">
                                        Current Password <span className="text-red-600">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="currentPasswordForEmail"
                                        value={currentPasswordForEmail}
                                        onChange={(e) => setCurrentPasswordForEmail(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter your current password"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Firebase requires your current password to change your email address for security reasons. After clicking "Update Email", check your new email inbox for a verification link.</p>
                                </div>
                                <div>
                                    <button
                                        onClick={handleUpdateEmail}
                                        disabled={loading || !currentPasswordForEmail || !userEmail || userEmail === auth.currentUser?.email}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {loading ? 'Updating Email...' : 'Update Email'}
                                    </button>
                                <button
                                    onClick={handleUpdateEmail}
                                    disabled={loading || !currentPasswordForEmail || !userEmail || userEmail === auth.currentUser?.email}
                                    className="ml-3 bg-gray-600 hover:bg-gray-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                                >
                                    {loading ? 'Sending...' : 'Resend verification email'}
                                </button>
                                </div>
                            </div>
                        </div>

                        {/* Password Settings */}
                        <div>
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Change Password</h3>
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                                <p className="text-sm text-yellow-700">
                                    <strong>Security Note:</strong> Choose a strong password with at least 6 characters. You will need to enter your current password to change it.
                                </p>
                            </div>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                        Current Password <span className="text-red-600">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="currentPassword"
                                        value={currentPasswordForPassword}
                                        onChange={(e) => setCurrentPasswordForPassword(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter your current password"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Required to verify your identity before changing password.</p>
                                </div>
                                <div>
                                    <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                        New Password <span className="text-red-600">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="newPassword"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Enter new password (min. 6 characters)"
                                    />
                                    <p className="text-xs text-gray-500 mt-1">Minimum 6 characters required.</p>
                                </div>
                                <div>
                                    <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                        Confirm New Password <span className="text-red-600">*</span>
                                    </label>
                                    <input
                                        type="password"
                                        id="confirmPassword"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="Re-enter new password"
                                    />
                                    {newPassword && confirmPassword && newPassword !== confirmPassword && (
                                        <p className="text-xs text-red-600 mt-1">Passwords do not match.</p>
                                    )}
                                    {newPassword && confirmPassword && newPassword === confirmPassword && (
                                        <p className="text-xs text-green-600 mt-1">✓ Passwords match.</p>
                                    )}
                                </div>
                                <div>
                                    <button
                                        onClick={handleUpdatePassword}
                                        disabled={loading || !currentPasswordForPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword || newPassword.length < 6}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {loading ? 'Updating Password...' : 'Update Password'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {activeTab === 'advanced' && (
                    <div className="space-y-6">
                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">🔍 User Identity Check</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Verify that you are logged in with the correct account and that your user ID matches the expected value.
                            </p>
                            <div className="bg-purple-50 border-l-4 border-purple-400 p-4 mb-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-purple-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-purple-700">
                                            <strong>Run this FIRST</strong> if you see no data. You may be logged in with the wrong account or your account may have been recreated.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleVerifyIdentity}
                                disabled={loading}
                                className="bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-purple-300"
                            >
                                {loading ? 'Verifying...' : 'Verify User Identity'}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                                Expected: a@b.com (UID: CxWdTQh6EwNz7yyZBlFhGmfdaul1)
                            </p>
                        </div>

                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">🔍 Quick Database Check</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Run a quick diagnostic check to see how many documents, payments, clients, and stock items you have.
                            </p>
                            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-blue-700">
                                            <strong>Info:</strong> Safe, read-only check. Check the browser console (F12) for detailed results.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleDiagnosticCheck}
                                disabled={loading}
                                className="bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-blue-300"
                            >
                                {loading ? 'Running...' : 'Run Quick Check'}
                            </button>
                        </div>

                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">🔬 Deep Investigation</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Run a comprehensive deep investigation to find out what happened to your data. This checks ALL documents (including deleted ones), scans ALL payments in the database, and provides detailed forensic analysis.
                            </p>
                            <div className="bg-orange-50 border-l-4 border-orange-400 p-4 mb-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-orange-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-orange-700">
                                            <strong>Use this if data is missing:</strong> This will check for deleted/cancelled documents, scan all payments (including other users), and determine what happened. Safe to run - won't modify data.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleDeepInvestigation}
                                disabled={loading}
                                className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-orange-300"
                            >
                                {loading ? 'Investigating...' : 'Run Deep Investigation'}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                                This may take 10-30 seconds. Full forensic report will appear in console (F12).
                            </p>
                        </div>

                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">🔧 Reconstruct Lost Data</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                If your clients, payments, and stock items collections were deleted, but your documents (invoices/proformas) still exist, this tool can reconstruct ALL of them by extracting embedded data from your existing documents.
                            </p>
                            <div className="bg-green-50 border-l-4 border-green-400 p-4 mb-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-green-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-green-700">
                                            <strong>Recovery Tool:</strong> This will scan your invoices and extract client, payment, AND stock item information. Your documents have embedded data for all three! Safe to run multiple times.
                                        </p>
                                        <p className="text-sm text-green-700 mt-2">
                                            <strong>What will be recovered:</strong> Clients (names, phones, emails), Payments (amounts, dates), Stock Items (names, brands, specs, prices)
                                        </p>
                                        <p className="text-sm text-green-700 mt-2">
                                            <strong>Status:</strong> Your documents have full embedded data - Excellent recovery chance!
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleFullReconstruction}
                                disabled={loading}
                                className="bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-green-300"
                            >
                                {loading ? 'Reconstructing Data...' : 'Reconstruct ALL Data (Clients + Payments + Stock)'}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                                This will recreate your clients, payments, AND stock items collections from existing invoices. Check console (F12) for detailed progress.
                            </p>
                        </div>

                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Payment Data Management</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Use this tool to fix payment data isolation issues. This ensures all your payments have the correct user ID and are properly associated with your account.
                            </p>
                            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 mb-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-yellow-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-yellow-700">
                                            <strong>Important:</strong> Only run this if you're experiencing issues with payments not appearing, or if instructed by support. This operation is safe and can be run multiple times.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleRepairPayments}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-red-300"
                            >
                                {loading ? 'Repairing...' : 'Fix Payment Data'}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                                This will scan all payments and ensure they're properly associated with your user account.
                            </p>
                        </div>

                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Database Cleanup</h3>
                            <p className="text-sm text-gray-600 mb-4">
                                Permanently delete all cancelled invoices and deleted proformas from your database. 
                                This will free up storage space and improve performance. Only deleted/cancelled items will be removed.
                            </p>
                            <div className="bg-red-50 border-l-4 border-red-400 p-4 mb-4">
                                <div className="flex">
                                    <div className="flex-shrink-0">
                                        <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                                        </svg>
                                    </div>
                                    <div className="ml-3">
                                        <p className="text-sm text-red-700">
                                            <strong>Warning:</strong> This action is permanent and cannot be undone. 
                                            Make sure you don't need any of the deleted items before proceeding.
                                        </p>
                                    </div>
                                </div>
                            </div>
                            <button
                                onClick={handleCleanupDatabase}
                                disabled={loading}
                                className="bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md disabled:bg-red-300"
                            >
                                {loading ? 'Cleaning up...' : 'Clean Up Deleted Items'}
                            </button>
                            <p className="text-xs text-gray-500 mt-2">
                                This will remove all cancelled invoices and deleted proformas from your database.
                            </p>
                        </div>

                        <div className="border-b border-gray-200 pb-6">
                            <h3 className="text-lg font-medium text-gray-900 mb-4">Database Information</h3>
                            <div className="space-y-2 text-sm">
                                <div className="flex justify-between">
                                    <span className="text-gray-600">User ID:</span>
                                    <span className="font-mono text-gray-900">{auth.currentUser?.uid}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-gray-600">Account Email:</span>
                                    <span className="text-gray-900">{auth.currentUser?.email}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {feedback.message && (
                    <div className={`mt-6 p-3 rounded-md text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                        {feedback.message}
                    </div>
                )}
            </div>
        </div>
    );
};

export default SettingsPage;
