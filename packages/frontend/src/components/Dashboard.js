import React, { useState, useEffect, useMemo } from 'react';
import { documentsAPI, paymentsAPI } from '../services/api';
import { CardSkeleton, ListItemSkeleton } from './LoadingSkeleton';

const StatCard = ({ title, value, detail, color, isExpanded, onToggle }) => (
    <div className={`rounded-lg shadow-lg text-white ${color} transition-all duration-300 ${isExpanded ? 'p-6' : 'p-4'}`}>
        <div className="flex justify-between items-start">
            <div className="flex-1">
                <h3 className="text-lg font-semibold">{title}</h3>
                {isExpanded && (
                    <>
                        <p className="text-3xl font-bold mt-2">{value}</p>
                        <p className="text-sm mt-1">{detail}</p>
                    </>
                )}
            </div>
            <button
                onClick={onToggle}
                className="ml-2 text-white hover:text-gray-200 transition-colors"
            >
                <svg
                    className={`w-5 h-5 transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path>
                </svg>
            </button>
        </div>
    </div>
);

const Dashboard = ({ navigateTo }) => {
    const [stats, setStats] = useState({
        proformasCount: 0,
        proformasTotal: 0,
        invoicesCount: 0,
        invoicesTotal: 0,
    });
    const [recentDocuments, setRecentDocuments] = useState([]);
    const [pendingProformas, setPendingProformas] = useState([]);
    const [unpaidInvoices, setUnpaidInvoices] = useState([]);
    const [overdueInvoices, setOverdueInvoices] = useState([]);
    const [loading, setLoading] = useState(true);
    const [filterPeriod, setFilterPeriod] = useState('allTime');
    const [expandedCards, setExpandedCards] = useState({
        proformas: false,
        invoices: false,
        revenue: false
    });

    const toggleCard = (cardName) => {
        setExpandedCards(prev => ({
            ...prev,
            [cardName]: !prev[cardName]
        }));
    };

    const getDateRange = () => {
        const now = new Date();
        const year = now.getFullYear();
        const month = now.getMonth();

        switch (filterPeriod) {
            case 'thisMonth':
                return {
                    start: new Date(year, month, 1),
                    end: new Date(year, month + 1, 0, 23, 59, 59)
                };
            case 'ytd':
                return {
                    start: new Date(year, 0, 1),
                    end: now
                };
            case 'allTime':
            default:
                return {
                    start: new Date(2020, 0, 1),
                    end: now
                };
        }
    };

    const dateRange = useMemo(() => getDateRange(), [filterPeriod]);

    useEffect(() => {
        fetchData();
    }, [filterPeriod, dateRange]);

    const fetchData = async () => {
        try {
            setLoading(true);
            const [documentsResponse, paymentsResponse] = await Promise.all([
                documentsAPI.getAll(null, null, 500, 1, ''), // Fetch first 500 documents for stats
                paymentsAPI.getAll(null, 500, 1, '') // Fetch first 500 payments for stats
            ]);

            // Handle paginated response format
            const allDocuments = documentsResponse.data || documentsResponse;
            const allPayments = paymentsResponse.data || paymentsResponse;

            // Filter by date range and exclude cancelled/deleted documents for stats
            const docs = allDocuments.filter(doc => {
                const docDate = new Date(doc.date);
                return docDate >= dateRange.start &&
                       docDate <= dateRange.end &&
                       doc.status !== 'CANCELLED' &&
                       !doc.deleted;
            });

            // Filter active documents only (not converted proformas)
            // Handle both uppercase and lowercase type values
            const proformas = docs.filter(d => {
                const type = (d.type || '').toLowerCase();
                return (type === 'proforma' || type === 'proformas') && !d.convertedTo;
            });
            const invoices = docs.filter(d => {
                const type = (d.type || '').toLowerCase();
                return type === 'invoice' || type === 'invoices';
            });

            // Calculate totals
            const proformasTotal = proformas.reduce((sum, doc) => sum + (doc.total || 0), 0);
            const invoicesTotal = invoices.reduce((sum, doc) => sum + (doc.total || 0), 0);

            setStats({
                proformasCount: proformas.length,
                proformasTotal: proformasTotal,
                invoicesCount: invoices.length,
                invoicesTotal: invoicesTotal,
            });

            // For follow-up, use ALL documents (not filtered by date range) but exclude cancelled/deleted
            const allActiveDocs = allDocuments.filter(doc => {
                return doc.status !== 'CANCELLED' &&
                       !doc.deleted;
            });

            const allProformas = allActiveDocs.filter(d => {
                const type = (d.type || '').toLowerCase();
                return (type === 'proforma' || type === 'proformas') && !d.convertedTo;
            });
            const allInvoices = allActiveDocs.filter(d => {
                const type = (d.type || '').toLowerCase();
                return type === 'invoice' || type === 'invoices';
            });

            // Calculate total paid for each invoice using payments
            const allInvoicesWithPayments = allInvoices.map(inv => {
                const totalPaid = allPayments
                    .filter(p => p.documentId === inv.id)
                    .reduce((sum, p) => sum + (p.amount || 0), 0);
                return { ...inv, totalPaid: totalPaid || 0 };
            });

            // Set pending proformas for follow-up (all active proformas, not just date-filtered)
            const sortedProformas = [...allProformas].sort((a, b) => {
                const aPaid = allPayments.filter(p => p.documentId === a.id).reduce((sum, p) => sum + (p.amount || 0), 0);
                const bPaid = allPayments.filter(p => p.documentId === b.id).reduce((sum, p) => sum + (p.amount || 0), 0);
                if (aPaid === 0 && bPaid > 0) return -1;
                if (aPaid > 0 && bPaid === 0) return 1;
                return new Date(a.date) - new Date(b.date);
            });
            setPendingProformas(sortedProformas.slice(0, 5));

            // Set unpaid invoices for follow-up (all active invoices, not just date-filtered)
            const unpaid = allInvoicesWithPayments.filter(inv => (inv.totalPaid || 0) < (inv.total || 0));

            // Separate overdue invoices (30+ days old and unpaid)
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            const overdue = unpaid.filter(inv => new Date(inv.date) < thirtyDaysAgo);
            const recentUnpaid = unpaid.filter(inv => new Date(inv.date) >= thirtyDaysAgo);

            setUnpaidInvoices(recentUnpaid.slice(0, 5));
            setOverdueInvoices(overdue.slice(0, 5));

            docs.sort((a, b) => new Date(b.date) - new Date(a.date));
            setRecentDocuments(docs.slice(0, 5));

            setLoading(false);
        } catch (error) {
            console.error("Error fetching dashboard data:", error);
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div>
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                    <div className="h-10 bg-gray-200 rounded w-64 animate-pulse"></div>
                    <div className="h-10 bg-gray-200 rounded w-48 animate-pulse"></div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                    <CardSkeleton />
                    <CardSkeleton />
                    <CardSkeleton />
                </div>
                <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
                    <div className="h-8 bg-gray-200 rounded w-48 mb-4 animate-pulse"></div>
                    <div className="space-y-2">
                        <ListItemSkeleton />
                        <ListItemSkeleton />
                        <ListItemSkeleton />
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
                <h1 className="text-3xl font-bold text-gray-800">Dashboard</h1>
                <div className="flex flex-wrap gap-2">
                    <select
                        value={filterPeriod}
                        onChange={(e) => setFilterPeriod(e.target.value)}
                        className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="thisMonth">This Month</option>
                        <option value="ytd">Year to Date</option>
                        <option value="allTime">All Time</option>
                    </select>
                    <button onClick={() => navigateTo('newDocument')} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105">
                        + Create New Document
                    </button>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-8">
                <StatCard
                    title="Potentials (Proformas)"
                    value={`${stats.proformasTotal.toFixed(2)}`}
                    detail={`${stats.proformasCount} active proformas`}
                    color="bg-gradient-to-r from-yellow-400 to-yellow-600"
                    isExpanded={expandedCards.proformas}
                    onToggle={() => toggleCard('proformas')}
                />
                <StatCard
                    title="Finalized (Invoices)"
                    value={`${stats.invoicesTotal.toFixed(2)}`}
                    detail={`${stats.invoicesCount} invoices`}
                    color="bg-gradient-to-r from-green-400 to-green-600"
                    isExpanded={expandedCards.invoices}
                    onToggle={() => toggleCard('invoices')}
                />
                 <StatCard
                    title="Total Revenue"
                    value={`${stats.invoicesTotal.toFixed(2)}`}
                    detail="From all finalized invoices"
                    color="bg-gradient-to-r from-blue-400 to-blue-600"
                    isExpanded={expandedCards.revenue}
                    onToggle={() => toggleCard('revenue')}
                />
            </div>

            {/* Follow-Up Summary */}
            <div className="bg-white p-6 rounded-lg shadow-lg mb-8">
                <h2 className="text-xl font-semibold text-gray-700 mb-4">Follow-Up Required</h2>

                {/* Critical Overdue Section */}
                {overdueInvoices.length > 0 && (
                    <div className="mb-6 p-4 bg-red-50 rounded-lg border border-red-200">
                        <h3 className="text-lg font-medium text-red-700 mb-3 flex items-center">
                            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                            </svg>
                            Overdue Invoices (30+ days)
                        </h3>
                        <div className="space-y-2">
                            {overdueInvoices.map(doc => {
                                const daysOld = Math.floor((new Date() - new Date(doc.date)) / (1000 * 60 * 60 * 24));
                                const remaining = doc.total - (doc.totalPaid || 0);
                                return (
                                    <div
                                        key={doc.id}
                                        onClick={() => navigateTo('viewDocument', doc)}
                                        className="p-3 bg-white border border-red-300 rounded hover:bg-red-50 cursor-pointer"
                                    >
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <span className="font-medium text-sm">{doc.clientName || 'Unknown Client'}</span>
                                                <span className="text-xs text-gray-500 ml-2">{doc.documentNumber}</span>
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-semibold text-red-700">${remaining.toFixed(2)}</span>
                                                <div className="text-xs text-red-600 font-medium">
                                                    {daysOld} days overdue
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Pending Proformas */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-600 mb-2">Active Proformas</h3>
                        {pendingProformas.length === 0 ? (
                            <p className="text-gray-500 text-sm">No pending proformas</p>
                        ) : (
                            <div className="space-y-2">
                                {pendingProformas.map(doc => {
                                    const daysOld = Math.floor((new Date() - new Date(doc.date)) / (1000 * 60 * 60 * 24));
                                    const totalPaid = doc.totalPaid || 0;
                                    const remaining = doc.total - totalPaid;

                                    return (
                                        <div
                                            key={doc.id}
                                            onClick={() => navigateTo('viewDocument', doc)}
                                            className="p-2 border rounded hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-medium text-sm">{doc.clientName || 'Unknown Client'}</span>
                                                <span className="text-xs text-gray-500 ml-2">{doc.documentNumber}</span>
                                                {totalPaid > 0 && (
                                                    <span className="text-xs bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded ml-1">
                                                        Partial ${totalPaid.toFixed(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-semibold">
                                                    ${remaining > 0 ? remaining.toFixed(2) : doc.total.toFixed(2)}
                                                </span>
                                                <div className="text-xs text-gray-500">
                                                    {daysOld} days old
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Recent Unpaid Invoices */}
                    <div>
                        <h3 className="text-lg font-medium text-gray-600 mb-2">Recent Unpaid Invoices</h3>
                        {unpaidInvoices.length === 0 ? (
                            <p className="text-gray-500 text-sm">No recent unpaid invoices</p>
                        ) : (
                            <div className="space-y-2">
                                {unpaidInvoices.map(doc => {
                                    const daysOld = Math.floor((new Date() - new Date(doc.date)) / (1000 * 60 * 60 * 24));
                                    const totalPaid = doc.totalPaid || 0;
                                    const remaining = doc.total - totalPaid;

                                    return (
                                        <div
                                            key={doc.id}
                                            onClick={() => navigateTo('viewDocument', doc)}
                                            className="p-2 border rounded hover:bg-gray-50 cursor-pointer flex justify-between items-center"
                                        >
                                            <div>
                                                <span className="font-medium text-sm">{doc.clientName || 'Unknown Client'}</span>
                                                <span className="text-xs text-gray-500 ml-2">{doc.documentNumber}</span>
                                                {totalPaid > 0 && (
                                                    <span className="text-xs bg-green-100 text-green-800 px-1 py-0.5 rounded ml-1">
                                                        Paid ${totalPaid.toFixed(0)}
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-right">
                                                <span className="text-sm font-semibold">
                                                    ${remaining.toFixed(2)}
                                                </span>
                                                <div className="text-xs text-gray-500">
                                                    {daysOld} days old
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Business Insights */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Collection Rate & Payment Status */}
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Payment Collection</h2>
                    <div className="space-y-4">
                        {(() => {
                            const totalInvoiced = stats.invoicesTotal;
                            const totalPaidFromInvoices = unpaidInvoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0) +
                                overdueInvoices.reduce((sum, inv) => sum + (inv.totalPaid || 0), 0);
                            const totalOutstanding = unpaidInvoices.reduce((sum, inv) => sum + (inv.total - (inv.totalPaid || 0)), 0) +
                                overdueInvoices.reduce((sum, inv) => sum + (inv.total - (inv.totalPaid || 0)), 0);
                            const collectionRate = totalInvoiced > 0 ? ((totalPaidFromInvoices / totalInvoiced) * 100) : 0;

                            return (
                                <>
                                    <div className="flex justify-between items-center p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg">
                                        <div>
                                            <p className="text-sm text-gray-600">Collection Rate</p>
                                            <p className="text-2xl font-bold text-green-700">{collectionRate.toFixed(1)}%</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-xs text-gray-500">Collected</p>
                                            <p className="text-lg font-semibold text-green-600">${totalPaidFromInvoices.toFixed(2)}</p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div className="p-4 bg-orange-50 rounded-lg">
                                            <p className="text-xs text-gray-600 mb-1">Outstanding</p>
                                            <p className="text-xl font-bold text-orange-700">${totalOutstanding.toFixed(2)}</p>
                                            <p className="text-xs text-gray-500 mt-1">{unpaidInvoices.length + overdueInvoices.length} invoices</p>
                                        </div>
                                        <div className="p-4 bg-red-50 rounded-lg">
                                            <p className="text-xs text-gray-600 mb-1">Overdue</p>
                                            <p className="text-xl font-bold text-red-700">{overdueInvoices.length}</p>
                                            <p className="text-xs text-gray-500 mt-1">30+ days old</p>
                                        </div>
                                    </div>

                                    <div className="pt-4 border-t">
                                        <button
                                            onClick={() => navigateTo('invoices')}
                                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                                        >
                                            View All Invoices
                                        </button>
                                    </div>
                                </>
                            );
                        })()}
                    </div>
                </div>

                {/* Quick Actions */}
                <div className="bg-white p-6 rounded-lg shadow-lg">
                    <h2 className="text-xl font-semibold text-gray-700 mb-4">Quick Actions</h2>
                    <div className="grid grid-cols-2 gap-4">
                        <button
                            onClick={() => navigateTo('newDocument')}
                            className="p-4 border-2 border-indigo-200 rounded-lg hover:bg-indigo-50 transition-colors group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <svg className="w-10 h-10 text-indigo-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                                </svg>
                                <span className="text-sm font-medium text-gray-700">New Proforma</span>
                            </div>
                        </button>

                        <button
                            onClick={() => navigateTo('clients')}
                            className="p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 transition-colors group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <svg className="w-10 h-10 text-purple-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                                </svg>
                                <span className="text-sm font-medium text-gray-700">Manage Clients</span>
                            </div>
                        </button>

                        <button
                            onClick={() => navigateTo('payments')}
                            className="p-4 border-2 border-green-200 rounded-lg hover:bg-green-50 transition-colors group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <svg className="w-10 h-10 text-green-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                <span className="text-sm font-medium text-gray-700">Add Payment</span>
                            </div>
                        </button>

                        <button
                            onClick={() => navigateTo('accounting')}
                            className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 transition-colors group"
                        >
                            <div className="flex flex-col items-center text-center">
                                <svg className="w-10 h-10 text-blue-600 mb-2 group-hover:scale-110 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                                </svg>
                                <span className="text-sm font-medium text-gray-700">View Reports</span>
                            </div>
                        </button>
                    </div>

                    <div className="mt-6 p-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-lg">
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm font-medium text-gray-700">Recent Documents</p>
                                <p className="text-2xl font-bold text-indigo-700">{recentDocuments.length}</p>
                            </div>
                            <button
                                onClick={() => navigateTo('proformas')}
                                className="text-sm text-indigo-600 hover:text-indigo-800 font-medium"
                            >
                                View All →
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Dashboard;
