import React, { useState, useEffect, useRef } from 'react';
import { clientsAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import Papa from 'papaparse';

const ClientsPage = () => {
    const [clients, setClients] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const debouncedSearchTerm = useDebounce(searchTerm, 300);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [newClient, setNewClient] = useState({ name: '', email: '', phone: '', location: '', vatNumber: '' });
    const [editingClient, setEditingClient] = useState(null);
    const fileInputRef = useRef(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchClients();
    }, [debouncedSearchTerm]);

    const fetchClients = async () => {
        try {
            setLoading(true);
            const response = await clientsAPI.getAll(debouncedSearchTerm);
            // Handle paginated response format
            const data = response.data || response;
            setClients(data);
        } catch (err) {
            console.error('Error fetching clients:', err);
            setError('Failed to fetch clients');
        } finally {
            setLoading(false);
        }
    };

    const handleAddOrUpdateClient = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;

        setIsSubmitting(true);
        setError('');

        try {
            if (editingClient) {
                // Update existing client
                const updated = await clientsAPI.update(editingClient.id, newClient);
                setClients(clients.map(c => c.id === editingClient.id ? updated : c));
                setEditingClient(null);
            } else {
                // Create new client
                const nextIdData = await clientsAPI.getNextId();
                const clientData = {
                    ...newClient,
                    clientId: nextIdData.id
                };
                const created = await clientsAPI.create(clientData);
                setClients([...clients, created]);
            }

            // Reset form
            setNewClient({ name: '', email: '', phone: '', location: '', vatNumber: '' });
            setShowForm(false);
        } catch (err) {
            console.error('Error saving client:', err);
            setError('Failed to save client');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleEditClient = (client) => {
        setEditingClient(client);
        setNewClient({
            name: client.name || '',
            email: client.email || '',
            phone: client.phone || '',
            location: client.location || '',
            vatNumber: client.vatNumber || ''
        });
        setShowForm(true);
    };

    const handleDeleteClient = async (clientId) => {
        if (!window.confirm('Are you sure you want to delete this client?')) return;

        try {
            await clientsAPI.delete(clientId);
            setClients(clients.filter(c => c.id !== clientId));
        } catch (err) {
            console.error('Error deleting client:', err);
            setError('Failed to delete client');
        }
    };

    const handleCancelEdit = () => {
        setShowForm(false);
        setEditingClient(null);
        setNewClient({ name: '', email: '', phone: '', location: '', vatNumber: '' });
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                try {
                    const validClients = results.data
                        .filter(row => row.name && row.name.trim() !== '')
                        .map(row => ({
                            name: row.name || '',
                            email: row.email || '',
                            phone: row.phone || '',
                            location: row.location || '',
                            vatNumber: row.vatNumber || row['vat number'] || row['VAT Number'] || ''
                        }));

                    if (validClients.length === 0) {
                        alert('No valid clients found in CSV file');
                        return;
                    }

                    await clientsAPI.batchCreate(validClients);
                    await fetchClients();
                    alert(`Successfully imported ${validClients.length} clients`);
                } catch (err) {
                    console.error('Error importing clients:', err);
                    alert('Failed to import clients');
                }
            },
            error: (error) => {
                console.error('CSV parsing error:', error);
                alert('Failed to parse CSV file');
            }
        });

        // Reset file input
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleExportCSV = () => {
        const csv = Papa.unparse(clients.map(client => ({
            'Client ID': client.clientId || '',
            'Name': client.name || '',
            'Email': client.email || '',
            'Phone': client.phone || '',
            'Location': client.location || '',
            'VAT Number': client.vatNumber || ''
        })));

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `clients_${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
    };

    const filteredClients = clients;

    if (loading && clients.length === 0) {
        return (
            <div>
                <h1 className="text-3xl font-bold text-gray-800 mb-6">Clients</h1>
                <TableSkeleton />
            </div>
        );
    }

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Clients</h1>
                <div className="flex space-x-3">
                    <button
                        onClick={() => setShowForm(!showForm)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors font-medium"
                    >
                        {showForm ? 'Cancel' : '+ Add Client'}
                    </button>
                    <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleImportCSV}
                        accept=".csv"
                        className="hidden"
                    />
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors font-medium"
                    >
                        Import CSV
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg shadow-md transition-colors font-medium"
                        disabled={clients.length === 0}
                    >
                        Export CSV
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
                    {error}
                </div>
            )}

            {showForm && (
                <div className="bg-white p-6 rounded-lg shadow-md mb-6">
                    <h2 className="text-xl font-semibold mb-4">{editingClient ? 'Edit Client' : 'Add New Client'}</h2>
                    <form onSubmit={handleAddOrUpdateClient}>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <input
                                type="text"
                                placeholder="Client Name *"
                                value={newClient.name}
                                onChange={(e) => setNewClient({ ...newClient, name: e.target.value })}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                required
                                disabled={isSubmitting}
                            />
                            <input
                                type="email"
                                placeholder="Email"
                                value={newClient.email}
                                onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                            <input
                                type="text"
                                placeholder="Phone"
                                value={newClient.phone}
                                onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                            <input
                                type="text"
                                placeholder="Location"
                                value={newClient.location}
                                onChange={(e) => setNewClient({ ...newClient, location: e.target.value })}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                            <input
                                type="text"
                                placeholder="VAT Number"
                                value={newClient.vatNumber}
                                onChange={(e) => setNewClient({ ...newClient, vatNumber: e.target.value })}
                                className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                disabled={isSubmitting}
                            />
                        </div>
                        <div className="mt-4 flex space-x-3">
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg shadow-md transition-colors disabled:bg-indigo-300"
                            >
                                {isSubmitting ? 'Saving...' : (editingClient ? 'Update Client' : 'Add Client')}
                            </button>
                            <button
                                type="button"
                                onClick={handleCancelEdit}
                                disabled={isSubmitting}
                                className="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg shadow-md transition-colors"
                            >
                                Cancel
                            </button>
                        </div>
                    </form>
                </div>
            )}

            <div className="bg-white p-4 rounded-lg shadow-md mb-6">
                <input
                    type="text"
                    placeholder="Search clients..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            <div className="bg-white rounded-lg shadow-md overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">VAT Number</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredClients.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
                                        {searchTerm ? 'No clients found matching your search' : 'No clients yet. Add your first client to get started!'}
                                    </td>
                                </tr>
                            ) : (
                                filteredClients.map((client) => (
                                    <tr key={client.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{client.clientId || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{client.name}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.email || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.phone || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.location || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{client.vatNumber || '-'}</td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium space-x-2">
                                            <button
                                                onClick={() => handleEditClient(client)}
                                                className="text-indigo-600 hover:text-indigo-900"
                                            >
                                                Edit
                                            </button>
                                            <button
                                                onClick={() => handleDeleteClient(client.id)}
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
            </div>

            <div className="mt-4 text-sm text-gray-600">
                Showing {filteredClients.length} client{filteredClients.length !== 1 ? 's' : ''}
            </div>
        </div>
    );
};

export default ClientsPage;
