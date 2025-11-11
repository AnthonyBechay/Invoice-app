import React, { useState, useEffect } from 'react';
import { suppliersAPI } from '../services/api';

const SuppliersManagement = () => {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingSupplier, setEditingSupplier] = useState(null);
    const [formData, setFormData] = useState({
        name: '',
        contactName: '',
        email: '',
        phone: '',
        address: '',
        website: '',
        notes: ''
    });
    const [feedback, setFeedback] = useState({ type: '', message: '' });

    useEffect(() => {
        fetchSuppliers();
    }, []);

    const fetchSuppliers = async () => {
        try {
            setLoading(true);
            const data = await suppliersAPI.getAll();
            setSuppliers(data);
        } catch (error) {
            console.error('Error fetching suppliers:', error);
            setFeedback({ type: 'error', message: 'Failed to fetch suppliers.' });
        } finally {
            setLoading(false);
        }
    };

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleOpenModal = (supplier = null) => {
        if (supplier) {
            setEditingSupplier(supplier);
            setFormData({
                name: supplier.name || '',
                contactName: supplier.contactName || '',
                email: supplier.email || '',
                phone: supplier.phone || '',
                address: supplier.address || '',
                website: supplier.website || '',
                notes: supplier.notes || ''
            });
        } else {
            setEditingSupplier(null);
            setFormData({
                name: '',
                contactName: '',
                email: '',
                phone: '',
                address: '',
                website: '',
                notes: ''
            });
        }
        setShowModal(true);
        setFeedback({ type: '', message: '' });
    };

    const handleCloseModal = () => {
        setShowModal(false);
        setEditingSupplier(null);
        setFormData({
            name: '',
            contactName: '',
            email: '',
            phone: '',
            address: '',
            website: '',
            notes: ''
        });
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!formData.name.trim()) {
            setFeedback({ type: 'error', message: 'Supplier name is required.' });
            return;
        }

        try {
            if (editingSupplier) {
                await suppliersAPI.update(editingSupplier.id, formData);
                setFeedback({ type: 'success', message: 'Supplier updated successfully!' });
            } else {
                await suppliersAPI.create(formData);
                setFeedback({ type: 'success', message: 'Supplier created successfully!' });
            }

            await fetchSuppliers();
            setTimeout(() => {
                handleCloseModal();
                setFeedback({ type: '', message: '' });
            }, 1500);
        } catch (error) {
            console.error('Error saving supplier:', error);
            setFeedback({ type: 'error', message: 'Failed to save supplier.' });
        }
    };

    const handleDelete = async (id) => {
        if (!window.confirm('Are you sure you want to delete this supplier?')) {
            return;
        }

        try {
            await suppliersAPI.delete(id);
            setFeedback({ type: 'success', message: 'Supplier deleted successfully!' });
            await fetchSuppliers();
            setTimeout(() => setFeedback({ type: '', message: '' }), 3000);
        } catch (error) {
            console.error('Error deleting supplier:', error);
            setFeedback({ type: 'error', message: 'Failed to delete supplier.' });
        }
    };

    const filteredSuppliers = suppliers.filter(supplier =>
        supplier.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (supplier.contactName && supplier.contactName.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (supplier.email && supplier.email.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-indigo-500"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-2xl font-bold text-gray-800">Suppliers</h2>
                    <p className="text-gray-600 text-sm mt-1">Manage your supplier list</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                >
                    + Add Supplier
                </button>
            </div>

            {feedback.message && (
                <div className={`mb-4 p-4 rounded-md text-sm ${
                    feedback.type === 'success'
                        ? 'bg-green-100 text-green-800 border border-green-200'
                        : 'bg-red-100 text-red-800 border border-red-200'
                }`}>
                    {feedback.message}
                </div>
            )}

            <div className="mb-4">
                <input
                    type="text"
                    placeholder="Search suppliers..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Supplier Name
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Contact Person
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Email
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Phone
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {filteredSuppliers.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="px-6 py-8 text-center text-gray-500">
                                    No suppliers found. Click "Add Supplier" to create one.
                                </td>
                            </tr>
                        ) : (
                            filteredSuppliers.map((supplier) => (
                                <tr key={supplier.id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm font-medium text-gray-900">{supplier.name}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">{supplier.contactName || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">{supplier.email || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <div className="text-sm text-gray-500">{supplier.phone || '-'}</div>
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button
                                            onClick={() => handleOpenModal(supplier)}
                                            className="text-indigo-600 hover:text-indigo-900 mr-4"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={() => handleDelete(supplier.id)}
                                            className="text-red-600 hover:text-red-900"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
                        <div className="p-6">
                            <h3 className="text-xl font-bold text-gray-900 mb-4">
                                {editingSupplier ? 'Edit Supplier' : 'Add New Supplier'}
                            </h3>

                            <form onSubmit={handleSubmit} className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Supplier Name *
                                    </label>
                                    <input
                                        type="text"
                                        name="name"
                                        value={formData.name}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        required
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Contact Person
                                    </label>
                                    <input
                                        type="text"
                                        name="contactName"
                                        value={formData.contactName}
                                        onChange={handleInputChange}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Email
                                        </label>
                                        <input
                                            type="email"
                                            name="email"
                                            value={formData.email}
                                            onChange={handleInputChange}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>

                                    <div>
                                        <label className="block text-sm font-medium text-gray-700 mb-1">
                                            Phone
                                        </label>
                                        <input
                                            type="tel"
                                            name="phone"
                                            value={formData.phone}
                                            onChange={handleInputChange}
                                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Address
                                    </label>
                                    <textarea
                                        name="address"
                                        value={formData.address}
                                        onChange={handleInputChange}
                                        rows="2"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Website
                                    </label>
                                    <input
                                        type="url"
                                        name="website"
                                        value={formData.website}
                                        onChange={handleInputChange}
                                        placeholder="https://"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">
                                        Notes
                                    </label>
                                    <textarea
                                        name="notes"
                                        value={formData.notes}
                                        onChange={handleInputChange}
                                        rows="3"
                                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    />
                                </div>

                                {feedback.message && (
                                    <div className={`p-3 rounded-md text-sm ${
                                        feedback.type === 'success'
                                            ? 'bg-green-100 text-green-800 border border-green-200'
                                            : 'bg-red-100 text-red-800 border border-red-200'
                                    }`}>
                                        {feedback.message}
                                    </div>
                                )}

                                <div className="flex justify-end gap-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={handleCloseModal}
                                        className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                                    >
                                        {editingSupplier ? 'Update' : 'Create'} Supplier
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default SuppliersManagement;
