import React, { useState, useEffect } from 'react';
import { settingsAPI, authAPI } from '../services/api';
import SuppliersManagement from './SuppliersManagement';
import { useAuth } from '../contexts/AuthContext';

const SettingsPage = ({ navigateTo }) => {
    const { user } = useAuth();
    const isAdmin = user?.email === 'anthonybechay1@gmail.com';
    const [activeTab, setActiveTab] = useState('company');
    const [companyName, setCompanyName] = useState('');
    const [companyAddress, setCompanyAddress] = useState('');
    const [companyPhone, setCompanyPhone] = useState('');
    const [companyEmail, setCompanyEmail] = useState('');
    const [companyVatNumber, setCompanyVatNumber] = useState('');
    const [logo, setLogo] = useState('');
    const [footerMessage, setFooterMessage] = useState('Thank you for your business!');
    const [taxRate, setTaxRate] = useState(0);
    const [currency, setCurrency] = useState('USD');
    const [imageFile, setImageFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    // Password update state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [updatingPassword, setUpdatingPassword] = useState(false);
    const [passwordFeedback, setPasswordFeedback] = useState({ type: '', message: '' });

    useEffect(() => {
        fetchSettings();
    }, []);

    const fetchSettings = async () => {
        try {
            setLoading(true);
            const settings = await settingsAPI.get();
            if (settings) {
                setCompanyName(settings.companyName || '');
                setCompanyAddress(settings.companyAddress || '');
                setCompanyPhone(settings.companyPhone || '');
                setCompanyEmail(settings.companyEmail || '');
                setCompanyVatNumber(settings.companyVatNumber || '');
                setLogo(settings.logo || '');
                setFooterMessage(settings.footerMessage || 'Thank you for your business!');
                setTaxRate(settings.taxRate || 0);
                setCurrency(settings.currency || 'USD');
            }
            setLoading(false);
        } catch (error) {
            console.error('Error fetching settings:', error);
            setFeedback({ type: 'error', message: 'Failed to fetch settings.' });
            setLoading(false);
        }
    };

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];

            // Check file size (500KB limit for base64 storage to prevent slow loads)
            if (file.size > 500 * 1024) {
                setFeedback({ type: 'error', message: 'File size must be less than 500KB. Please compress your image.' });
                return;
            }

            // Check file type
            const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif'];
            if (!allowedTypes.includes(file.type)) {
                setFeedback({ type: 'error', message: 'Please upload a valid image file (PNG, JPG, or GIF)' });
                return;
            }

            // Convert to base64
            const reader = new FileReader();
            reader.onload = () => {
                setLogo(reader.result);
            };
            reader.onerror = () => {
                setFeedback({ type: 'error', message: 'Failed to read image file' });
            };
            reader.readAsDataURL(file);

            setImageFile(file);
            setFeedback({ type: '', message: '' });
        }
    };

    const handleRemoveLogo = () => {
        setLogo('');
        setImageFile(null);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        setSaving(true);
        setFeedback({ type: '', message: '' });

        try {
            const settingsData = {
                companyName,
                companyAddress,
                companyPhone,
                companyEmail,
                companyVatNumber,
                logo, // Include logo (base64 string)
                footerMessage,
                taxRate: parseFloat(taxRate) || 0,
                currency,
            };

            await settingsAPI.update(settingsData);

            setFeedback({ type: 'success', message: 'Settings saved successfully!' });
            setImageFile(null);
        } catch (error) {
            console.error('Error saving settings:', error);
            setFeedback({ type: 'error', message: 'Failed to save settings. Please try again.' });
        } finally {
            setSaving(false);
        }
    };

    const handlePasswordUpdate = async (e) => {
        e.preventDefault();
        setPasswordFeedback({ type: '', message: '' });

        // Validate passwords match
        if (newPassword !== confirmPassword) {
            setPasswordFeedback({ type: 'error', message: 'New passwords do not match.' });
            return;
        }

        // Validate password length
        if (newPassword.length < 6) {
            setPasswordFeedback({ type: 'error', message: 'New password must be at least 6 characters.' });
            return;
        }

        setUpdatingPassword(true);

        try {
            await authAPI.updatePassword(currentPassword, newPassword);
            setPasswordFeedback({ type: 'success', message: 'Password updated successfully!' });
            // Clear password fields
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error) {
            console.error('Error updating password:', error);
            setPasswordFeedback({ type: 'error', message: error.message || 'Failed to update password. Please check your current password.' });
        } finally {
            setUpdatingPassword(false);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-6xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>

            {/* Tabs */}
            <div className="mb-6 border-b border-gray-200">
                <nav className="-mb-px flex space-x-8">
                    <button
                        onClick={() => setActiveTab('company')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'company'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Company Settings
                    </button>
                    <button
                        onClick={() => setActiveTab('security')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'security'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        Security
                    </button>
                    <button
                        onClick={() => setActiveTab('lists')}
                        className={`py-4 px-1 border-b-2 font-medium text-sm ${
                            activeTab === 'lists'
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                        }`}
                    >
                        List of Values
                    </button>
                    {isAdmin && navigateTo && (
                        <button
                            onClick={() => navigateTo('admin')}
                            className="py-4 px-1 border-b-2 font-medium text-sm border-transparent text-red-600 hover:text-red-700 hover:border-red-300"
                        >
                            Admin Dashboard →
                        </button>
                    )}
                </nav>
            </div>

            {/* Company Settings Tab */}
            {activeTab === 'company' && (
            <div className="bg-white p-8 rounded-lg shadow-lg">
                <form onSubmit={handleSave} className="space-y-6">
                    {/* Company Logo Section */}
                    <div className="border-b border-gray-200 pb-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Company Logo</h2>
                        <div className="flex items-center space-x-6">
                            {logo && (
                                <div className="relative">
                                    <img
                                        src={logo}
                                        alt="Company Logo"
                                        className="h-24 w-24 rounded-lg object-contain border-2 border-gray-300 p-2 bg-white"
                                    />
                                    <button
                                        type="button"
                                        onClick={handleRemoveLogo}
                                        className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 hover:bg-red-600 transition-colors"
                                    >
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                        </svg>
                                    </button>
                                </div>
                            )}
                            <div className="flex-1">
                                <input
                                    type="file"
                                    onChange={handleImageChange}
                                    accept="image/png,image/jpeg,image/jpg,image/gif"
                                    className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                />
                                <p className="text-xs text-gray-500 mt-2">
                                    Max size: 500KB. Formats: PNG, JPG, GIF. Please compress large images.
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Your logo will appear on all invoices and proformas
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Company Information Section */}
                    <div className="border-b border-gray-200 pb-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Company Information</h2>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                                    Company Name *
                                </label>
                                <input
                                    type="text"
                                    id="companyName"
                                    value={companyName}
                                    onChange={(e) => setCompanyName(e.target.value)}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Enter your company name"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="companyAddress" className="block text-sm font-medium text-gray-700 mb-1">
                                    Company Address *
                                </label>
                                <textarea
                                    id="companyAddress"
                                    value={companyAddress}
                                    onChange={(e) => setCompanyAddress(e.target.value)}
                                    placeholder="123 Business St, City, State 12345"
                                    rows="2"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="companyPhone" className="block text-sm font-medium text-gray-700 mb-1">
                                        Phone Number *
                                    </label>
                                    <input
                                        type="text"
                                        id="companyPhone"
                                        value={companyPhone}
                                        onChange={(e) => setCompanyPhone(e.target.value)}
                                        placeholder="+1 (555) 123-4567"
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label htmlFor="companyEmail" className="block text-sm font-medium text-gray-700 mb-1">
                                        Company Email *
                                    </label>
                                    <input
                                        type="email"
                                        id="companyEmail"
                                        value={companyEmail}
                                        onChange={(e) => setCompanyEmail(e.target.value)}
                                        placeholder="contact@company.com"
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        required
                                    />
                                </div>
                            </div>

                            <div>
                                <label htmlFor="companyVatNumber" className="block text-sm font-medium text-gray-700 mb-1">
                                    VAT Number
                                </label>
                                <input
                                    type="text"
                                    id="companyVatNumber"
                                    value={companyVatNumber}
                                    onChange={(e) => setCompanyVatNumber(e.target.value)}
                                    placeholder="Enter your VAT/Tax ID number"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This will appear on invoices when VAT is applied
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Invoice Settings Section */}
                    <div className="border-b border-gray-200 pb-6">
                        <h2 className="text-xl font-semibold text-gray-800 mb-4">Invoice Settings</h2>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="footerMessage" className="block text-sm font-medium text-gray-700 mb-1">
                                    Footer Message
                                </label>
                                <textarea
                                    id="footerMessage"
                                    value={footerMessage}
                                    onChange={(e) => setFooterMessage(e.target.value)}
                                    placeholder="Thank you for your business!"
                                    rows="2"
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    This message will appear at the bottom of all invoices and proformas
                                </p>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label htmlFor="taxRate" className="block text-sm font-medium text-gray-700 mb-1">
                                        Default Tax Rate (%)
                                    </label>
                                    <input
                                        type="number"
                                        id="taxRate"
                                        value={taxRate}
                                        onChange={(e) => setTaxRate(e.target.value)}
                                        min="0"
                                        max="100"
                                        step="0.01"
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                        placeholder="0"
                                    />
                                </div>

                                <div>
                                    <label htmlFor="currency" className="block text-sm font-medium text-gray-700 mb-1">
                                        Currency
                                    </label>
                                    <select
                                        id="currency"
                                        value={currency}
                                        onChange={(e) => setCurrency(e.target.value)}
                                        className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    >
                                        <option value="USD">USD - US Dollar</option>
                                        <option value="EUR">EUR - Euro</option>
                                        <option value="GBP">GBP - British Pound</option>
                                        <option value="CAD">CAD - Canadian Dollar</option>
                                        <option value="AUD">AUD - Australian Dollar</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={saving}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-md disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
                        >
                            {saving ? 'Saving...' : 'Save Settings'}
                        </button>
                    </div>
                </form>

                {feedback.message && (
                    <div className={`mt-6 p-4 rounded-md text-sm ${
                        feedback.type === 'success'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                        {feedback.message}
                    </div>
                )}
            </div>
            )}

            {/* Security Tab */}
            {activeTab === 'security' && (
            <div className="bg-white p-8 rounded-lg shadow-lg">
                <h2 className="text-2xl font-bold text-gray-800 mb-6">Account Security</h2>

                <form onSubmit={handlePasswordUpdate} className="space-y-6">
                    <div className="border-b border-gray-200 pb-6">
                        <h3 className="text-xl font-semibold text-gray-800 mb-4">Update Password</h3>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                    Current Password *
                                </label>
                                <input
                                    type="password"
                                    id="currentPassword"
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Enter your current password"
                                    required
                                />
                            </div>

                            <div>
                                <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                    New Password *
                                </label>
                                <input
                                    type="password"
                                    id="newPassword"
                                    value={newPassword}
                                    onChange={(e) => setNewPassword(e.target.value)}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Enter new password (min 6 characters)"
                                    required
                                    minLength={6}
                                />
                            </div>

                            <div>
                                <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">
                                    Confirm New Password *
                                </label>
                                <input
                                    type="password"
                                    id="confirmPassword"
                                    value={confirmPassword}
                                    onChange={(e) => setConfirmPassword(e.target.value)}
                                    className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                                    placeholder="Confirm new password"
                                    required
                                    minLength={6}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4">
                        <button
                            type="submit"
                            disabled={updatingPassword}
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-4 rounded-lg shadow-md disabled:bg-indigo-300 disabled:cursor-not-allowed transition-colors"
                        >
                            {updatingPassword ? 'Updating Password...' : 'Update Password'}
                        </button>
                    </div>
                </form>

                {passwordFeedback.message && (
                    <div className={`mt-6 p-4 rounded-md text-sm ${
                        passwordFeedback.type === 'success'
                            ? 'bg-green-100 text-green-800 border border-green-200'
                            : 'bg-red-100 text-red-800 border border-red-200'
                    }`}>
                        {passwordFeedback.message}
                    </div>
                )}
            </div>
            )}

            {/* List of Values Tab */}
            {activeTab === 'lists' && (
            <div className="bg-white p-8 rounded-lg shadow-lg">
                <SuppliersManagement />
            </div>
            )}
        </div>
    );
};

export default SettingsPage;
