import React, { useState, useEffect, useMemo } from 'react';
import { expensesAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';

const ExpensesPage = () => {
    const [expenses, setExpenses] = useState([]);
    const [categories, setCategories] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [editingExpense, setEditingExpense] = useState(null);
    const [deleteConfirm, setDeleteConfirm] = useState(null);

    // Form states
    const [expenseDescription, setExpenseDescription] = useState('');
    const [expenseAmount, setExpenseAmount] = useState('');
    const [expenseDate, setExpenseDate] = useState(new Date().toISOString().split('T')[0]);
    const [expenseCategory, setExpenseCategory] = useState('');
    const [expenseNotes, setExpenseNotes] = useState('');

    // Category form
    const [newCategoryName, setNewCategoryName] = useState('');
    const [newCategoryColor, setNewCategoryColor] = useState('#3B82F6');
    const [editingCategory, setEditingCategory] = useState(null);

    // Filters and search
    const [searchQuery, setSearchQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('all');
    const [dateFilter, setDateFilter] = useState('all'); // all, thisMonth, lastMonth, thisYear
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [displayLimit, setDisplayLimit] = useState(50);

    const [feedback, setFeedback] = useState({ type: '', message: '' });

    // Default categories
    const DEFAULT_CATEGORIES = [
        { name: 'Food & Dining', color: '#EF4444' },
        { name: 'Transportation', color: '#F59E0B' },
        { name: 'Shopping', color: '#8B5CF6' },
        { name: 'Entertainment', color: '#EC4899' },
        { name: 'Bills & Utilities', color: '#3B82F6' },
        { name: 'Healthcare', color: '#10B981' },
        { name: 'Other', color: '#6B7280' }
    ];

    // Fetch expenses
    useEffect(() => {
        fetchExpenses();
    }, []);

    const fetchExpenses = async () => {
        try {
            setLoading(true);
            const response = await expensesAPI.getAll();
            // Handle paginated response format
            const expensesData = response.data || response;

            // Convert date strings to Date objects
            expensesData.forEach(expense => {
                if (expense.date) {
                    expense.date = new Date(expense.date);
                }
            });

            setExpenses(expensesData);

            // Extract unique categories from expenses and merge with defaults
            const uniqueCategories = [...new Set(expensesData.map(exp => exp.category).filter(Boolean))];
            const allCategoryNames = [...new Set([...DEFAULT_CATEGORIES.map(c => c.name), ...uniqueCategories])];

            const categoriesData = allCategoryNames.map(name => {
                const defaultCat = DEFAULT_CATEGORIES.find(c => c.name === name);
                return {
                    id: name.toLowerCase().replace(/\s+/g, '-'),
                    name: name,
                    color: defaultCat?.color || '#6B7280'
                };
            });

            setCategories(categoriesData);
        } catch (error) {
            console.error("Error fetching expenses:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleAddCategory = () => {
        if (!newCategoryName.trim()) return;

        try {
            if (editingCategory) {
                // Update existing category
                setCategories(categories.map(cat =>
                    cat.id === editingCategory.id
                        ? { ...cat, name: newCategoryName.trim(), color: newCategoryColor }
                        : cat
                ));
                setFeedback({ type: 'success', message: 'Category updated successfully!' });
            } else {
                // Add new category
                const newCat = {
                    id: newCategoryName.trim().toLowerCase().replace(/\s+/g, '-'),
                    name: newCategoryName.trim(),
                    color: newCategoryColor
                };
                setCategories([...categories, newCat]);
                setFeedback({ type: 'success', message: 'Category added successfully!' });
            }

            setNewCategoryName('');
            setNewCategoryColor('#3B82F6');
            setEditingCategory(null);
            setShowCategoryModal(false);
        } catch (error) {
            console.error("Error adding/updating category:", error);
            setFeedback({ type: 'error', message: 'Failed to save category.' });
        }
    };

    const handleDeleteCategory = (categoryId) => {
        if (!window.confirm('Delete this category? Expenses using this category will not be deleted.')) {
            return;
        }

        try {
            setCategories(categories.filter(cat => cat.id !== categoryId));
            setFeedback({ type: 'success', message: 'Category deleted successfully!' });
        } catch (error) {
            console.error("Error deleting category:", error);
            setFeedback({ type: 'error', message: 'Failed to delete category.' });
        }
    };

    const handleAddExpense = async () => {
        if (!expenseDescription.trim() || !expenseAmount || !expenseCategory) {
            setFeedback({ type: 'error', message: 'Please fill in all required fields.' });
            return;
        }

        try {
            const expenseData = {
                description: expenseDescription.trim(),
                amount: parseFloat(expenseAmount),
                date: new Date(expenseDate).toISOString(),
                category: expenseCategory,
                notes: expenseNotes.trim()
            };

            if (editingExpense) {
                // Update existing expense
                await expensesAPI.update(editingExpense.id, expenseData);
                setFeedback({ type: 'success', message: 'Expense updated successfully!' });
            } else {
                // Add new expense
                await expensesAPI.create(expenseData);
                setFeedback({ type: 'success', message: 'Expense added successfully!' });
            }

            // Refresh expenses
            await fetchExpenses();

            resetForm();
            setShowAddModal(false);
        } catch (error) {
            console.error("Error adding/updating expense:", error);
            setFeedback({ type: 'error', message: 'Failed to save expense.' });
        }
    };

    const handleEditExpense = (expense) => {
        setEditingExpense(expense);
        setExpenseDescription(expense.description);
        setExpenseAmount(expense.amount.toString());
        const dateObj = expense.date instanceof Date ? expense.date : new Date(expense.date);
        setExpenseDate(dateObj.toISOString().split('T')[0]);
        setExpenseCategory(expense.category);
        setExpenseNotes(expense.notes || '');
        setShowAddModal(true);
    };

    const handleDeleteExpense = async (expenseId) => {
        try {
            await expensesAPI.delete(expenseId);
            setFeedback({ type: 'success', message: 'Expense deleted successfully!' });
            setDeleteConfirm(null);

            // Refresh expenses
            await fetchExpenses();
        } catch (error) {
            console.error("Error deleting expense:", error);
            setFeedback({ type: 'error', message: 'Failed to delete expense.' });
        }
    };

    const resetForm = () => {
        setExpenseDescription('');
        setExpenseAmount('');
        setExpenseDate(new Date().toISOString().split('T')[0]);
        setExpenseCategory('');
        setExpenseNotes('');
        setEditingExpense(null);
    };

    const getCategoryColor = (categoryName) => {
        const category = categories.find(cat => cat.name === categoryName);
        return category?.color || '#6B7280';
    };

    // Filter expenses
    const filteredExpenses = useMemo(() => {
        let filtered = expenses;

        // Category filter
        if (categoryFilter !== 'all') {
            filtered = filtered.filter(exp => exp.category === categoryFilter);
        }

        // Date filter
        const now = new Date();
        if (dateFilter === 'thisMonth') {
            filtered = filtered.filter(exp => {
                const expDate = exp.date instanceof Date ? exp.date : new Date(exp.date);
                return expDate.getMonth() === now.getMonth() && expDate.getFullYear() === now.getFullYear();
            });
        } else if (dateFilter === 'lastMonth') {
            const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            filtered = filtered.filter(exp => {
                const expDate = exp.date instanceof Date ? exp.date : new Date(exp.date);
                return expDate.getMonth() === lastMonth.getMonth() && expDate.getFullYear() === lastMonth.getFullYear();
            });
        } else if (dateFilter === 'thisYear') {
            filtered = filtered.filter(exp => {
                const expDate = exp.date instanceof Date ? exp.date : new Date(exp.date);
                return expDate.getFullYear() === now.getFullYear();
            });
        }

        // Search filter
        if (debouncedSearchQuery) {
            const search = debouncedSearchQuery.toLowerCase();
            filtered = filtered.filter(exp =>
                exp.description.toLowerCase().includes(search) ||
                exp.category.toLowerCase().includes(search) ||
                exp.notes?.toLowerCase().includes(search) ||
                exp.amount.toString().includes(search)
            );
        }

        return filtered;
    }, [expenses, categoryFilter, dateFilter, debouncedSearchQuery]);

    const displayedExpenses = useMemo(() => {
        return filteredExpenses.slice(0, displayLimit);
    }, [filteredExpenses, displayLimit]);

    // Calculate statistics
    const totalExpenses = useMemo(() => {
        return displayedExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    }, [displayedExpenses]);

    const expensesByCategory = useMemo(() => {
        const byCategory = {};
        displayedExpenses.forEach(exp => {
            if (!byCategory[exp.category]) {
                byCategory[exp.category] = 0;
            }
            byCategory[exp.category] += exp.amount;
        });
        return byCategory;
    }, [displayedExpenses]);

    return (
        <div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
                <h1 className="text-2xl sm:text-3xl font-bold text-gray-800">Personal Expenses</h1>
                <div className="flex gap-2 w-full sm:w-auto">
                    <button
                        onClick={() => {
                            resetForm();
                            setShowAddModal(true);
                        }}
                        className="flex-1 sm:flex-none bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        + Add Expense
                    </button>
                    <button
                        onClick={() => setShowCategoryModal(true)}
                        className="flex-1 sm:flex-none bg-gray-600 hover:bg-gray-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Manage Categories
                    </button>
                </div>
            </div>

            {/* Feedback */}
            {feedback.message && (
                <div className={`mb-4 p-3 rounded-lg ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {feedback.message}
                </div>
            )}

            {/* Filters */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <input
                    type="text"
                    placeholder="Search expenses..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="all">All Categories</option>
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                    ))}
                </select>
                <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                    <option value="all">All Time</option>
                    <option value="thisMonth">This Month</option>
                    <option value="lastMonth">Last Month</option>
                    <option value="thisYear">This Year</option>
                </select>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                {loading ? (
                    <>
                        <div className="bg-indigo-50 p-4 rounded-lg animate-pulse">
                            <div className="h-4 bg-indigo-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-indigo-200 rounded w-3/4"></div>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg animate-pulse">
                            <div className="h-4 bg-blue-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-blue-200 rounded w-1/2"></div>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg animate-pulse">
                            <div className="h-4 bg-purple-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-purple-200 rounded w-1/2"></div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-indigo-50 p-4 rounded-lg">
                            <p className="text-sm text-indigo-600">Total Expenses</p>
                            <p className="text-2xl font-bold text-indigo-800">${totalExpenses.toFixed(2)}</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <p className="text-sm text-blue-600">Number of Expenses</p>
                            <p className="text-2xl font-bold text-blue-800">{displayedExpenses.length}</p>
                        </div>
                        <div className="bg-purple-50 p-4 rounded-lg">
                            <p className="text-sm text-purple-600">Categories</p>
                            <p className="text-2xl font-bold text-purple-800">{categories.length}</p>
                        </div>
                    </>
                )}
            </div>

            {/* Expenses by Category */}
            {!loading && Object.keys(expensesByCategory).length > 0 && (
                <div className="bg-white p-6 rounded-lg shadow-lg mb-6">
                    <h3 className="text-lg font-bold text-gray-800 mb-4">Breakdown by Category</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {Object.entries(expensesByCategory).map(([category, amount]) => (
                            <div key={category} className="flex items-center gap-2">
                                <div
                                    className="w-4 h-4 rounded-full"
                                    style={{ backgroundColor: getCategoryColor(category) }}
                                ></div>
                                <div className="flex-1">
                                    <p className="text-xs text-gray-600">{category}</p>
                                    <p className="text-sm font-bold text-gray-900">${amount.toFixed(2)}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Expenses Table */}
            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    {loading ? (
                        <TableSkeleton rows={5} columns={6} />
                    ) : displayedExpenses.length === 0 ? (
                        <p className="text-gray-500 text-center py-8">
                            {debouncedSearchQuery || categoryFilter !== 'all' || dateFilter !== 'all'
                                ? 'No expenses found matching your filters.'
                                : 'No expenses yet. Add your first expense above!'}
                        </p>
                    ) : (
                        <table className="min-w-full bg-white">
                            <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                <tr>
                                    <th className="py-3 px-6 text-left">Date</th>
                                    <th className="py-3 px-6 text-left">Description</th>
                                    <th className="py-3 px-6 text-left">Category</th>
                                    <th className="py-3 px-6 text-right">Amount</th>
                                    <th className="py-3 px-6 text-left">Notes</th>
                                    <th className="py-3 px-6 text-center">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="text-gray-600 text-sm font-light">
                                {displayedExpenses.map(expense => (
                                    <tr key={expense.id} className="border-b border-gray-200 hover:bg-gray-100">
                                        <td className="py-3 px-6 text-left whitespace-nowrap">
                                            {(expense.date instanceof Date ? expense.date : new Date(expense.date)).toLocaleDateString()}
                                        </td>
                                        <td className="py-3 px-6 text-left">{expense.description}</td>
                                        <td className="py-3 px-6 text-left">
                                            <span
                                                className="px-2 py-1 rounded-full text-xs font-semibold text-white"
                                                style={{ backgroundColor: getCategoryColor(expense.category) }}
                                            >
                                                {expense.category}
                                            </span>
                                        </td>
                                        <td className="py-3 px-6 text-right font-semibold">${expense.amount.toFixed(2)}</td>
                                        <td className="py-3 px-6 text-left text-xs text-gray-500">
                                            {expense.notes || '-'}
                                        </td>
                                        <td className="py-3 px-6 text-center">
                                            <div className="flex item-center justify-center gap-2">
                                                <button
                                                    onClick={() => handleEditExpense(expense)}
                                                    className="text-blue-600 hover:text-blue-800 font-medium text-sm"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => setDeleteConfirm(expense.id)}
                                                    className="text-red-600 hover:text-red-800 font-medium text-sm"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Load More */}
                {filteredExpenses.length > displayLimit && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => setDisplayLimit(prev => prev + 50)}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg"
                        >
                            Load More ({filteredExpenses.length - displayLimit} remaining)
                        </button>
                    </div>
                )}
            </div>

            {/* Add/Edit Expense Modal */}
            {showAddModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-md">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">{editingExpense ? 'Edit Expense' : 'Add Expense'}</h2>
                            <button onClick={() => { setShowAddModal(false); resetForm(); }} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
                                <input
                                    type="text"
                                    value={expenseDescription}
                                    onChange={(e) => setExpenseDescription(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="E.g., Grocery shopping"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Amount *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    value={expenseAmount}
                                    onChange={(e) => setExpenseAmount(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="0.00"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
                                <input
                                    type="date"
                                    value={expenseDate}
                                    onChange={(e) => setExpenseDate(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
                                <select
                                    value={expenseCategory}
                                    onChange={(e) => setExpenseCategory(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">Select a category</option>
                                    {categories.map(cat => (
                                        <option key={cat.id} value={cat.name}>{cat.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Notes (Optional)</label>
                                <textarea
                                    value={expenseNotes}
                                    onChange={(e) => setExpenseNotes(e.target.value)}
                                    rows={3}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="Additional details..."
                                />
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 p-4 border-t">
                            <button
                                onClick={() => { setShowAddModal(false); resetForm(); }}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleAddExpense}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                            >
                                {editingExpense ? 'Update' : 'Add'} Expense
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Category Management Modal */}
            {showCategoryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Manage Categories</h2>
                            <button onClick={() => { setShowCategoryModal(false); setEditingCategory(null); setNewCategoryName(''); }} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="p-4 space-y-4">
                            <div className="bg-gray-50 p-4 rounded-lg">
                                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                                    {editingCategory ? 'Edit Category' : 'Add New Category'}
                                </h3>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={newCategoryName}
                                        onChange={(e) => setNewCategoryName(e.target.value)}
                                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        placeholder="Category name"
                                    />
                                    <input
                                        type="color"
                                        value={newCategoryColor}
                                        onChange={(e) => setNewCategoryColor(e.target.value)}
                                        className="w-14 h-10 border border-gray-300 rounded-lg cursor-pointer"
                                    />
                                    <button
                                        onClick={handleAddCategory}
                                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                                    >
                                        {editingCategory ? 'Update' : 'Add'}
                                    </button>
                                    {editingCategory && (
                                        <button
                                            onClick={() => {
                                                setEditingCategory(null);
                                                setNewCategoryName('');
                                                setNewCategoryColor('#3B82F6');
                                            }}
                                            className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                                        >
                                            Cancel
                                        </button>
                                    )}
                                </div>
                            </div>

                            <div className="overflow-y-auto max-h-96">
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-100">
                                        <tr>
                                            <th className="py-2 px-4 text-left text-sm font-medium text-gray-600">Category</th>
                                            <th className="py-2 px-4 text-center text-sm font-medium text-gray-600">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.map(cat => (
                                            <tr key={cat.id} className="border-b border-gray-200">
                                                <td className="py-2 px-4 flex items-center gap-2">
                                                    <div
                                                        className="w-6 h-6 rounded-full"
                                                        style={{ backgroundColor: cat.color }}
                                                    ></div>
                                                    <span>{cat.name}</span>
                                                </td>
                                                <td className="py-2 px-4 text-center">
                                                    <button
                                                        onClick={() => {
                                                            setEditingCategory(cat);
                                                            setNewCategoryName(cat.name);
                                                            setNewCategoryColor(cat.color);
                                                        }}
                                                        className="text-blue-600 hover:text-blue-800 text-sm mr-3"
                                                    >
                                                        Edit
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeleteCategory(cat.id)}
                                                        className="text-red-600 hover:text-red-800 text-sm"
                                                    >
                                                        Delete
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirm && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
                        <h3 className="text-lg font-bold mb-4">Confirm Delete</h3>
                        <p className="mb-6">Are you sure you want to delete this expense? This action cannot be undone.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setDeleteConfirm(null)}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteExpense(deleteConfirm)}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg"
                            >
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ExpensesPage;
