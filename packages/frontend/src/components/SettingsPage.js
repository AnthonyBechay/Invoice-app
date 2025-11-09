import React, { useState, useEffect } from 'react';
import { settingsAPI } from '../services/api';

const SettingsPage = () => {
    const [companyName, setCompanyName] = useState('');
    const [companyAddress, setCompanyAddress] = useState('');
    const [companyPhone, setCompanyPhone] = useState('');
    const [companyEmail, setCompanyEmail] = useState('');
    const [taxRate, setTaxRate] = useState(0);
    const [currency, setCurrency] = useState('USD');
    const [logoBase64, setLogoBase64] = useState('');
    const [imageFile, setImageFile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [feedback, setFeedback] = useState({ type: '', message: '' });

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
                setTaxRate(settings.taxRate || 0);
                setCurrency(settings.currency || 'USD');
                // Logo will be stored in database as base64 or URL
                // For now, we'll handle it in the backend
            }
        } catch (error) {
            console.error('Error fetching settings:', error);
            setFeedback({ type: 'error', message: 'Failed to fetch settings.' });
        } finally {
            setLoading(false);
        }
    };

    const handleImageChange = (e) => {
        if (e.target.files[0]) {
            const file = e.target.files[0];

            // Check file size (1MB limit for base64 storage)
            if (file.size > 1 * 1024 * 1024) {
                setFeedback({ type: 'error', message: 'File size must be less than 1MB' });
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
                setLogoBase64(reader.result);
            };
            reader.onerror = () => {
                setFeedback({ type: 'error', message: 'Failed to read image file' });
            };
            reader.readAsDataURL(file);

            setImageFile(file);
            setFeedback({ type: '', message: '' });
        }
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
                taxRate: parseFloat(taxRate) || 0,
                currency,
            };

            // Note: Logo upload will be handled in a future update
            // For now, we're storing basic company information

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

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold text-gray-800 mb-6">Settings</h1>

            <div className="bg-white p-8 rounded-lg shadow-lg">
                <form onSubmit={handleSave} className="space-y-6">
                    <div>
                        <label htmlFor="companyName" className="block text-sm font-medium text-gray-700 mb-1">
                            Company Name
                        </label>
                        <input
                            type="text"
                            id="companyName"
                            value={companyName}
                            onChange={(e) => setCompanyName(e.target.value)}
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            placeholder="Enter your company name"
                        />
                    </div>

                    <div>
                        <label htmlFor="companyAddress" className="block text-sm font-medium text-gray-700 mb-1">
                            Company Address
                        </label>
                        <input
                            type="text"
                            id="companyAddress"
                            value={companyAddress}
                            onChange={(e) => setCompanyAddress(e.target.value)}
                            placeholder="123 Business St, City, State 12345"
                            className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <label htmlFor="companyPhone" className="block text-sm font-medium text-gray-700 mb-1">
                                Phone Number
                            </label>
                            <input
                                type="text"
                                id="companyPhone"
                                value={companyPhone}
                                onChange={(e) => setCompanyPhone(e.target.value)}
                                placeholder="+1 (555) 123-4567"
                                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>

                        <div>
                            <label htmlFor="companyEmail" className="block text-sm font-medium text-gray-700 mb-1">
                                Company Email
                            </label>
                            <input
                                type="email"
                                id="companyEmail"
                                value={companyEmail}
                                onChange={(e) => setCompanyEmail(e.target.value)}
                                placeholder="contact@company.com"
                                className="block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Company Logo
                        </label>
                        <div className="mt-2 flex items-center space-x-4">
                            {logoBase64 && (
                                <img
                                    src={logoBase64}
                                    alt="Company Logo"
                                    className="h-16 w-16 rounded object-cover border border-gray-300"
                                />
                            )}
                            <div className="flex-1">
                                <input
                                    type="file"
                                    onChange={handleImageChange}
                                    accept="image/png,image/jpeg,image/jpg,image/gif"
                                    className="text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                                />
                                <p className="text-xs text-gray-500 mt-1">
                                    Max size: 1MB. Formats: PNG, JPG, GIF
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                    Note: Logo upload feature will be fully implemented in a future update
                                </p>
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
        </div>
    );
};

export default SettingsPage;
