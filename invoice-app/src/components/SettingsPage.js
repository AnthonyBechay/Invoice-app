import React, { useState, useEffect } from 'react';
import { doc, getDoc, setDoc, collection, query, where, getDocs, deleteDoc, writeBatch, limit } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { updateProfile, updateEmail, updatePassword, reauthenticateWithCredential, EmailAuthProvider, sendEmailVerification, verifyBeforeUpdateEmail, applyActionCode, checkActionCode } from 'firebase/auth';
import { auth, db, storage } from '../firebase/config';
import { repairMigratedPayments } from '../utils/paymentMigration';

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
            // Note: This requires action handler URL to be configured in Firebase Console
            try {
                await verifyBeforeUpdateEmail(auth.currentUser, userEmail, {
                    // Action handler URL - Firebase will redirect here after verification
                    // If your app is deployed, use the deployed URL, otherwise use current origin
                    url: window.location.origin,
                    handleCodeInApp: false // Set to true if you want to handle the code in-app
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

    const handleCleanupDatabase = async () => {
        if (!auth.currentUser) return;
        
        if (!window.confirm('This will permanently delete all cancelled invoices and deleted proformas. This action cannot be undone. Continue?')) {
            return;
        }

        setLoading(true);
        setFeedback({ type: '', message: '' });

        try {
            const userId = auth.currentUser.uid;
            let deletedInvoices = 0;
            let deletedProformas = 0;
            let errors = [];

            // Helper function to delete documents in batches (Firestore batch limit is 500)
            const deleteInBatches = async (querySnapshot, type) => {
                let deletedCount = 0;
                let currentBatch = writeBatch(db);
                let batchCount = 0;
                
                for (const docSnap of querySnapshot.docs) {
                    currentBatch.delete(doc(db, `documents/${userId}/userDocuments`, docSnap.id));
                    batchCount++;
                    deletedCount++;
                    
                    // Commit batch when reaching limit (500) or at end
                    if (batchCount >= 500) {
                        await currentBatch.commit();
                        currentBatch = writeBatch(db);
                        batchCount = 0;
                    }
                }
                
                // Commit remaining documents in the last batch
                if (batchCount > 0) {
                    await currentBatch.commit();
                }
                
                return deletedCount;
            };

            // Cleanup cancelled invoices
            try {
                const invoicesQuery = query(
                    collection(db, `documents/${userId}/userDocuments`),
                    where('type', '==', 'invoice'),
                    where('cancelled', '==', true)
                );
                const invoicesSnapshot = await getDocs(invoicesQuery);
                deletedInvoices = await deleteInBatches(invoicesSnapshot, 'invoice');
            } catch (error) {
                console.error('Error cleaning invoices:', error);
                errors.push(`Error cleaning invoices: ${error.message}`);
            }

            // Cleanup deleted proformas
            try {
                const proformasQuery = query(
                    collection(db, `documents/${userId}/userDocuments`),
                    where('type', '==', 'proforma'),
                    where('deleted', '==', true)
                );
                const proformasSnapshot = await getDocs(proformasQuery);
                deletedProformas += await deleteInBatches(proformasSnapshot, 'proforma');
            } catch (error) {
                console.error('Error cleaning proformas:', error);
                errors.push(`Error cleaning proformas: ${error.message}`);
            }

            // Cleanup cancelled proformas (marked as cancelled instead of deleted)
            try {
                const cancelledProformasQuery = query(
                    collection(db, `documents/${userId}/userDocuments`),
                    where('type', '==', 'proforma'),
                    where('cancelled', '==', true)
                );
                const cancelledProformasSnapshot = await getDocs(cancelledProformasQuery);
                deletedProformas += await deleteInBatches(cancelledProformasSnapshot, 'cancelled proforma');
            } catch (error) {
                console.error('Error cleaning cancelled proformas:', error);
                errors.push(`Error cleaning cancelled proformas: ${error.message}`);
            }

            const totalDeleted = deletedInvoices + deletedProformas;
            const message = totalDeleted > 0 
                ? `Cleanup completed! Deleted ${deletedInvoices} cancelled invoice(s) and ${deletedProformas} deleted proforma(s).${errors.length > 0 ? ' Warnings: ' + errors.join('; ') : ''}`
                : 'No deleted items found to clean up.';

            setFeedback({
                type: totalDeleted > 0 ? 'success' : 'info',
                message: message
            });
        } catch (error) {
            console.error('Cleanup error:', error);
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
