import React, { useState, useEffect, useMemo, useRef } from 'react';
import { documentsAPI } from '../services/api';
import { useDebounce } from '../hooks/useDebounce';
import { TableSkeleton } from './LoadingSkeleton';
import { useAuth } from '../contexts/AuthContext';
import Papa from 'papaparse';

const ProformasPage = ({ navigateTo }) => {
    const { user } = useAuth();
    const [proformas, setProformas] = useState([]);
    const [cancelledProformas, setCancelledProformas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showHistoryModal, setShowHistoryModal] = useState(false);
    const [showCancelledModal, setShowCancelledModal] = useState(false);
    const [historyInvoices, setHistoryInvoices] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [lastVisible, setLastVisible] = useState(null);
    const [hasMore, setHasMore] = useState(true);
    const [historyFilter, setHistoryFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const debouncedSearchQuery = useDebounce(searchQuery, 300);
    const [currentPage, setCurrentPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1, hasMore: false });
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(null);
    const [convertingIds, setConvertingIds] = useState(new Set()); // Track converting proformas
    const fileInputRef = useRef(null);

    const fetchProformas = async (page = 1, append = false) => {
        console.log("ProformasPage: Fetching proformas, page:", page);
        if (!append) setLoading(true);
        else setIsLoadingMore(true);

        try {
            // Fetch proformas with pagination
            const response = await documentsAPI.getAll('proforma', null, 50, page, debouncedSearchQuery || '');
            
            // Handle both old format (array) and new format (object with data property)
            const allProformas = response.data || response;
            const paginationInfo = response.pagination || { page, limit: 50, total: allProformas.length, totalPages: 1, hasMore: false };
            
            console.log("ProformasPage: Received", allProformas.length, "documents, pagination:", paginationInfo);

            const activeDocs = [];
            const cancelledDocs = [];

            allProformas.forEach((doc) => {
                // Check if it's converted to invoice - exclude from all lists to avoid double counting
                if (doc.status === 'CONVERTED' || doc.convertedTo) {
                    // Skip converted proformas from all lists
                    return;
                }

                if (doc.status === 'CANCELLED') {
                    cancelledDocs.push(doc);
                } else {
                    activeDocs.push(doc);
                }
            });

            // Update state
            if (append) {
                setProformas(prev => [...prev, ...activeDocs]);
                setCancelledProformas(prev => [...prev, ...cancelledDocs]);
            } else {
                setProformas(activeDocs);
                setCancelledProformas(cancelledDocs);
            }
            
            setPagination(paginationInfo);
            setCurrentPage(page);
        } catch (error) {
            console.error("ProformasPage: Error fetching proformas:", error);
        } finally {
            setLoading(false);
            setIsLoadingMore(false);
        }
    };

    useEffect(() => {
        console.log("ProformasPage: useEffect running");
        fetchProformas(1, false);
    }, []);

    // Refetch when search query changes
    useEffect(() => {
        if (debouncedSearchQuery !== undefined) {
            fetchProformas(1, false);
        }
    }, [debouncedSearchQuery]);


    const fetchHistoryInvoices = async (loadMore = false) => {
        if (!user) return;
        setHistoryLoading(true);

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        try {
            // Fetch invoices with pagination (last 30 days)
            const response = await documentsAPI.getAll('INVOICE', null, 100, 1, '');
            const allInvoices = response.data || response;
            
            // Filter by date (last 30 days)
            let newInvoices = allInvoices.filter(inv => {
                const invDate = new Date(inv.date);
                return invDate >= thirtyDaysAgo;
            });
            
            // Sort by date desc
            newInvoices.sort((a, b) => {
                const dateA = new Date(a.date);
                const dateB = new Date(b.date);
                return dateB - dateA;
            });

            // Pagination (limit to 10 per load)
            if (loadMore) {
                const currentCount = historyInvoices.length;
                newInvoices = newInvoices.slice(currentCount, currentCount + 10);
            } else {
                newInvoices = newInvoices.slice(0, 10);
            }

            const newLastVisible = newInvoices.length > 0 ? newInvoices[newInvoices.length - 1] : null;
            setLastVisible(newLastVisible);

            setHistoryInvoices(prev => loadMore ? [...prev, ...newInvoices] : newInvoices);
            setHasMore(newInvoices.length === 10);
        } catch (error) {
            console.error("Error fetching invoice history: ", error);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleOpenHistoryModal = () => {
        setShowHistoryModal(true);
        setHistoryInvoices([]);
        setLastVisible(null);
        setHasMore(true);
        fetchHistoryInvoices();
    };

    const handleExportCSV = () => {
        // Prepare CSV data
        const csvData = proformas.map(doc => {
            // Serialize items to JSON string for CSV
            const itemsJSON = JSON.stringify(doc.items || []);
            const mandaysJSON = doc.mandays ? JSON.stringify(doc.mandays) : '';
            const realMandaysJSON = doc.realMandays ? JSON.stringify(doc.realMandays) : '';

            return {
                'Document Number': doc.documentNumber || '',
                'Client Name': doc.client?.name || doc.clientName || '',
                'Date': new Date(doc.date).toLocaleDateString(),
                'Subtotal': doc.subtotal || 0,
                'VAT Amount': doc.taxAmount || 0,
                'Total': doc.total || 0,
                'Labor Price': doc.laborPrice || 0,
                'Mandays': mandaysJSON,
                'Real Mandays': realMandaysJSON,
                'Notes': doc.notes || '',
                'Status': doc.status || 'DRAFT',
                'Items JSON': itemsJSON
            };
        });

        // Convert to CSV using PapaParse
        const csv = Papa.unparse(csvData);

        // Create download link
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);
        link.setAttribute('href', url);
        link.setAttribute('download', `proformas_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const handleImportCSV = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        Papa.parse(file, {
            header: true,
            complete: async (results) => {
                try {
                    // Fetch clients and stock items for matching (they should already be imported)
                    let clients = [];
                    try {
                        const { clientsAPI } = await import('../services/api');
                        clients = await clientsAPI.getAll();
                    } catch (e) {
                        console.warn('Could not fetch clients, will match by name only');
                    }
                    
                    let stockItems = [];
                    try {
                        const { stockAPI } = await import('../services/api');
                        stockItems = await stockAPI.getAll();
                    } catch (e) {
                        console.warn('Could not fetch stock items');
                    }

                    const validDocuments = await Promise.all(
                        results.data
                            .filter(row => row['Document Number'] && row['Document Number'].trim() !== '')
                            .map(async (row) => {
                                // Parse items JSON - handle misaligned fields due to date splitting
                                let items = [];
                                try {
                                    // Get all row values to find Items JSON even if misaligned
                                    const allRowValues = Object.values(row);
                                    let itemsJson = row['Items JSON'] || '';
                                    
                                    // Search through ALL fields to find the one containing JSON array
                                    // This handles cases where date splitting causes misalignment
                                    if (!itemsJson || (!itemsJson.trim().startsWith('[') && !itemsJson.trim().startsWith('{'))) {
                                        // First, try to find where the JSON starts
                                        let jsonStartIndex = -1;
                                        for (let i = 0; i < allRowValues.length; i++) {
                                            const fieldValue = allRowValues[i];
                                            if (fieldValue && typeof fieldValue === 'string') {
                                                const trimmed = fieldValue.trim();
                                                // Check if this looks like a JSON array/object with items
                                                if ((trimmed.startsWith('[') || trimmed.startsWith('{')) &&
                                                    (trimmed.includes('name') || trimmed.includes('qty') || trimmed.includes('unitPrice'))) {
                                                    jsonStartIndex = i;
                                                    itemsJson = trimmed;
                                                    console.log('Found Items JSON start at index', i, ':', itemsJson);
                                                    break;
                                                }
                                                // Also check for unquoted format: [{name:value,qty:1}]
                                                if (trimmed.includes('name:') && (trimmed.includes('qty:') || trimmed.includes('unitPrice:'))) {
                                                    jsonStartIndex = i;
                                                    itemsJson = trimmed;
                                                    console.log('Found Items JSON (unquoted format) start at index', i, ':', itemsJson);
                                                    break;
                                                }
                                            }
                                        }
                                        
                                        // If we found the start but it doesn't end with ], try to reconstruct from following fields
                                        if (jsonStartIndex >= 0 && !itemsJson.trim().endsWith(']') && !itemsJson.trim().endsWith('}')) {
                                            // Try to reconstruct by joining subsequent fields until we find a closing bracket
                                            let reconstructedJson = itemsJson;
                                            let openBraces = (itemsJson.match(/\{/g) || []).length;
                                            let closeBraces = (itemsJson.match(/\}/g) || []).length;
                                            let openBrackets = (itemsJson.match(/\[/g) || []).length;
                                            let closeBrackets = (itemsJson.match(/\]/g) || []).length;
                                            
                                            for (let i = jsonStartIndex + 1; i < allRowValues.length && i < jsonStartIndex + 15; i++) {
                                                const nextValue = allRowValues[i];
                                                if (nextValue && typeof nextValue === 'string') {
                                                    const trimmed = nextValue.trim();
                                                    // Smart joining: if previous ends with comma/brace/bracket, don't add comma
                                                    // If next starts with a key (like "qty:" or "unitPrice:"), it's a continuation
                                                    const prevEndsWithSeparator = reconstructedJson.endsWith(',') || reconstructedJson.endsWith('{') || reconstructedJson.endsWith('[') || reconstructedJson.endsWith(':');
                                                    const nextStartsWithKey = trimmed.match(/^\s*[a-zA-Z_][a-zA-Z0-9_]*\s*:/);
                                                    
                                                    if (!prevEndsWithSeparator && !nextStartsWithKey && !trimmed.startsWith('}') && !trimmed.startsWith(']')) {
                                                        reconstructedJson += ',';
                                                    }
                                                    reconstructedJson += trimmed;
                                                    
                                                    // Update brace/bracket counts
                                                    openBraces += (trimmed.match(/\{/g) || []).length;
                                                    closeBraces += (trimmed.match(/\}/g) || []).length;
                                                    openBrackets += (trimmed.match(/\[/g) || []).length;
                                                    closeBrackets += (trimmed.match(/\]/g) || []).length;
                                                    
                                                    // Check if we've closed the JSON (all braces and brackets match)
                                                    if (openBraces === closeBraces && openBrackets === closeBrackets && reconstructedJson.trim().endsWith(']')) {
                                                        itemsJson = reconstructedJson;
                                                        console.log('Reconstructed Items JSON from multiple fields:', itemsJson);
                                                        break;
                                                    }
                                                }
                                            }
                                            
                                            // If still not closed, try to close it manually
                                            if (openBraces !== closeBraces || openBrackets !== closeBrackets) {
                                                // Add missing closing braces
                                                while (openBraces > closeBraces) {
                                                    reconstructedJson += '}';
                                                    closeBraces++;
                                                }
                                                // Add missing closing bracket
                                                if (openBrackets > closeBrackets) {
                                                    reconstructedJson += ']';
                                                }
                                                itemsJson = reconstructedJson;
                                                console.log('Manually closed Items JSON:', itemsJson);
                                            }
                                        }
                                    }
                                    
                                    // Clean up the JSON string
                                    itemsJson = itemsJson.trim();
                                    // Remove surrounding quotes if present
                                    if ((itemsJson.startsWith('"') && itemsJson.endsWith('"')) || 
                                        (itemsJson.startsWith("'") && itemsJson.endsWith("'"))) {
                                        itemsJson = itemsJson.slice(1, -1);
                                    }
                                    // Replace escaped quotes
                                    itemsJson = itemsJson.replace(/""/g, '"');
                                    
                                    // Try to parse as JSON
                                    if (itemsJson && itemsJson.startsWith('[')) {
                                        try {
                                            items = JSON.parse(itemsJson);
                                        } catch (e) {
                                            // If parsing fails, try to fix unquoted format
                                            // Pattern: [{name:Flexible 40 cm ,qty:1,unitPrice:4}]
                                            console.log('JSON parse failed, attempting to fix unquoted format:', itemsJson);
                                            // Fix unquoted keys: name: -> "name":
                                            itemsJson = itemsJson.replace(/([{,\[]\s*)(\w+)\s*:/g, '$1"$2":');
                                            // Fix unquoted string values (values that aren't numbers and aren't already quoted)
                                            // Match: : value, or : value} or : value]
                                            itemsJson = itemsJson.replace(/:\s*([^",\d\[\]{}][^,}\]]*?)([,}\]])/g, (match, value, end) => {
                                                const trimmedValue = value.trim();
                                                // If value is not a number and not already quoted
                                                if (trimmedValue && isNaN(parseFloat(trimmedValue))) {
                                                    // Escape any quotes in the value
                                                    const escapedValue = trimmedValue.replace(/"/g, '\\"');
                                                    return ': "' + escapedValue + '"' + end;
                                                }
                                                return match;
                                            });
                                            items = JSON.parse(itemsJson);
                                            console.log('Successfully fixed and parsed JSON:', items);
                                        }
                                    } else if (itemsJson && itemsJson.includes('name')) {
                                        // Try to fix common JSON issues - handle unquoted keys
                                        // First, ensure it's wrapped in array brackets if not
                                        if (!itemsJson.startsWith('[')) {
                                            itemsJson = '[' + itemsJson + ']';
                                        }
                                        // Fix unquoted keys
                                        itemsJson = itemsJson.replace(/([{,\[]\s*)(\w+)\s*:/g, '$1"$2":');
                                        // Fix unquoted string values
                                        itemsJson = itemsJson.replace(/:\s*([^",\d\[\]{}][^,}\]]*?)([,}\]])/g, (match, value, end) => {
                                            const trimmedValue = value.trim();
                                            if (trimmedValue && isNaN(parseFloat(trimmedValue))) {
                                                const escapedValue = trimmedValue.replace(/"/g, '\\"');
                                                return ': "' + escapedValue + '"' + end;
                                            }
                                            return match;
                                        });
                                        items = JSON.parse(itemsJson);
                                    }
                                    
                                    // Ensure items is an array
                                    if (!Array.isArray(items)) {
                                        items = [];
                                    }
                                    
                                    // Filter out empty items
                                    items = items.filter(item => item && (item.name || item.qty || item.quantity));
                                    
                                    console.log('Parsed items:', items.length, items);
                                } catch (e) {
                                    console.error('Error parsing items JSON:', e);
                                    console.warn('Raw value:', row['Items JSON'], 'All row values:', Object.values(row));
                                    items = [];
                                }

                                // Parse mandays and realMandays if they exist
                                let mandays = null;
                                let realMandays = null;
                                try {
                                    if (row['Mandays'] && row['Mandays'].trim() !== '') {
                                        mandays = JSON.parse(row['Mandays']);
                                    }
                                } catch (e) {
                                    // Ignore
                                }
                                try {
                                    if (row['Real Mandays'] && row['Real Mandays'].trim() !== '') {
                                        realMandays = JSON.parse(row['Real Mandays']);
                                    }
                                } catch (e) {
                                    // Ignore
                                }

                                // Find client by name (should already be imported)
                                const clientName = (row['Client Name'] || '').trim();
                                let clientId = null;
                                
                                if (clientName && clients.length > 0) {
                                    // Normalize client name for matching (trim, lowercase, remove extra spaces)
                                    const normalizeClientName = (name) => {
                                        return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
                                    };
                                    
                                    const clientNameNormalized = normalizeClientName(clientName);
                                    
                                    // Try exact match first
                                    let existingClient = clients.find(c => 
                                        c.name && normalizeClientName(c.name) === clientNameNormalized
                                    );
                                    
                                    // If no exact match, try partial match (contains)
                                    if (!existingClient) {
                                        existingClient = clients.find(c => 
                                            c.name && (
                                                normalizeClientName(c.name).includes(clientNameNormalized) ||
                                                clientNameNormalized.includes(normalizeClientName(c.name))
                                            )
                                        );
                                    }
                                    
                                    if (existingClient && existingClient.id) {
                                        clientId = existingClient.id;
                                        console.log(`Matched client: "${clientName}" -> "${existingClient.name}" (ID: ${existingClient.id})`);
                                    } else {
                                        console.warn(`Could not match client: "${clientName}"`);
                                    }
                                    // Don't create clients - they should already be imported
                                }
                                
                                // Build items array with laborPrice and mandays as items
                                const documentItems = await Promise.all(items.map(async (item) => {
                                    // Try to match stock item by name - improved matching
                                    let stockId = null;
                                    if (item.name && stockItems.length > 0) {
                                        // Normalize the item name for matching
                                        const normalizeName = (name) => {
                                            return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
                                        };
                                        
                                        const itemNameNormalized = normalizeName(item.name);
                                        
                                        // Try exact match first
                                        let matchedStock = stockItems.find(s => 
                                            s.name && normalizeName(s.name) === itemNameNormalized
                                        );
                                        
                                        // If no exact match, try partial match (contains)
                                        if (!matchedStock) {
                                            matchedStock = stockItems.find(s => 
                                                s.name && normalizeName(s.name).includes(itemNameNormalized) || 
                                                itemNameNormalized.includes(normalizeName(s.name))
                                            );
                                        }
                                        
                                        if (matchedStock && matchedStock.id) {
                                            // Validate that the stockId exists in the stockItems array
                                            const stockExists = stockItems.some(s => s.id === matchedStock.id);
                                            if (stockExists) {
                                                stockId = matchedStock.id;
                                                console.log(`Matched stock item: "${item.name}" -> "${matchedStock.name}" (ID: ${matchedStock.id})`);
                                            } else {
                                                console.warn(`Matched stock item but ID not found in stockItems: "${item.name}" -> "${matchedStock.name}" (ID: ${matchedStock.id})`);
                                                stockId = null;
                                            }
                                        } else {
                                            console.warn(`Could not match stock item: "${item.name}"`);
                                            stockId = null;
                                        }
                                    }
                                    
                                    return {
                                        stockId: stockId, // Will be null if not matched or invalid
                                        name: item.name || '',
                                        description: item.description || '',
                                        quantity: parseFloat(item.qty || item.quantity || 0),
                                        unitPrice: parseFloat(item.unitPrice || 0),
                                        total: parseFloat(item.total || (item.qty || item.quantity || 0) * (item.unitPrice || 0))
                                    };
                                }));
                                
                                // Add labor price as item ONLY if there are no other items
                                // Labor should be stored in laborPrice field, not as an item
                                const laborPrice = parseFloat(row['Labor Price'] || 0);
                                // Only add labor as item if there are no stock items (items array is empty)
                                if (laborPrice > 0 && documentItems.length === 0) {
                                    documentItems.push({
                                        stockId: null,
                                        name: 'Labor',
                                        description: 'Labor',
                                        quantity: 1,
                                        unitPrice: laborPrice,
                                        total: laborPrice
                                    });
                                }
                                
                                // Add mandays as item if exists
                                if (mandays && typeof mandays === 'object') {
                                    const mandaysDays = mandays.days || 0;
                                    const mandaysPeople = mandays.people || 0;
                                    const mandaysCostPerDay = mandays.costPerDay || 0;
                                    const mandaysTotal = mandaysDays * mandaysPeople * mandaysCostPerDay;
                                    if (mandaysTotal > 0) {
                                        documentItems.push({
                                            stockId: null,
                                            name: 'Mandays',
                                            description: `Mandays (${mandaysDays} days × ${mandaysPeople} people × $${mandaysCostPerDay}/day)`,
                                            quantity: 1,
                                            unitPrice: mandaysTotal,
                                            total: mandaysTotal
                                        });
                                    }
                                }

                                // Calculate subtotal from items + laborPrice
                                const itemsTotal = documentItems.reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0);
                                const subtotal = itemsTotal + laborPrice; // Include laborPrice in subtotal
                                const vatAmount = parseFloat(row['VAT Amount'] || 0);
                                const total = subtotal + vatAmount;

                                // Add realMandays to notes if exists
                                let notes = (row['Notes'] || '').trim();
                                if (realMandays && typeof realMandays === 'object') {
                                    const realMandaysDays = realMandays.days || 0;
                                    const realMandaysPeople = realMandays.people || 0;
                                    const realMandaysCostPerDay = realMandays.costPerDay || 0;
                                    const realMandaysTotal = realMandaysDays * realMandaysPeople * realMandaysCostPerDay;
                                    if (realMandaysTotal > 0) {
                                        const realMandaysNote = `[Real Mandays Cost: ${realMandaysDays} days × ${realMandaysPeople} people × $${realMandaysCostPerDay}/day = $${realMandaysTotal}]`;
                                        notes = notes ? `${notes}\n\n${realMandaysNote}` : realMandaysNote;
                                    }
                                }

                                // Parse status - ensure it's a valid DocumentStatus
                                let status = (row['Status'] || 'DRAFT').trim().toUpperCase();
                                const validStatuses = ['DRAFT', 'SENT', 'PAID', 'CANCELLED', 'CONVERTED'];
                                if (!validStatuses.includes(status)) {
                                    status = 'DRAFT';
                                }

                                // Parse date correctly
                                // Date might be split like "November 1, 2025 at 12:00:00 AM UTC+2"
                                // Or might be incorrectly parsed as "2001-11-01,2025 at 12:00:00 AM UTC+2"
                                let dateStr = row['Date'] || '';
                                let documentDate = new Date();
                                if (dateStr) {
                                    try {
                                        // Check if date contains comma and year pattern (means it was split)
                                        if (dateStr.includes(',') && dateStr.match(/\d{4}/)) {
                                            // Try to extract the correct year (should be 2025, not 2001)
                                            const yearMatch = dateStr.match(/(\d{4})/g);
                                            if (yearMatch && yearMatch.length > 0) {
                                                // Find the year that's in the 2000-2100 range
                                                const validYear = yearMatch.find(y => parseInt(y) >= 2000 && parseInt(y) < 2100);
                                                if (validYear) {
                                                    // Reconstruct date string
                                                    const monthMatch = dateStr.match(/(\w+)\s+(\d+)/);
                                                    if (monthMatch) {
                                                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                                                          'July', 'August', 'September', 'October', 'November', 'December'];
                                                        const monthName = monthMatch[1];
                                                        const day = parseInt(monthMatch[2]);
                                                        const year = parseInt(validYear);
                                                        const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
                                                        
                                                        if (monthIndex !== -1) {
                                                            documentDate = new Date(year, monthIndex, day);
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                        
                                        // If still not parsed, try standard parsing
                                        if (isNaN(documentDate.getTime())) {
                                            // Remove "at" and timezone info
                                            let cleanDateStr = dateStr.split('at')[0].trim();
                                            // Parse the date string - handle "Month Day, Year" format
                                            const dateMatch = cleanDateStr.match(/(\w+)\s+(\d+),?\s+(\d+)/);
                                            if (dateMatch) {
                                                const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                                                  'July', 'August', 'September', 'October', 'November', 'December'];
                                                const monthName = dateMatch[1];
                                                const day = parseInt(dateMatch[2]);
                                                const year = parseInt(dateMatch[3]);
                                                const monthIndex = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
                                                
                                                if (monthIndex !== -1 && year >= 2000 && year < 2100) {
                                                    documentDate = new Date(year, monthIndex, day);
                                                } else {
                                                    documentDate = new Date(cleanDateStr);
                                                }
                                            } else {
                                                documentDate = new Date(cleanDateStr);
                                            }
                                        }
                                        
                                        // Validate the parsed date
                                        if (isNaN(documentDate.getTime()) || documentDate.getFullYear() < 2000 || documentDate.getFullYear() >= 2100) {
                                            documentDate = new Date();
                                        }
                                    } catch (e) {
                                        documentDate = new Date();
                                    }
                                }

                                // Parse VAT Applied
                                const vatApplied = (row['VAT Applied'] || '').toString().toLowerCase() === 'yes' || 
                                                   (row['VAT Applied'] || '').toString().toLowerCase() === 'true';

                                return {
                                    type: 'PROFORMA',
                                    documentNumber: row['Document Number'] || '',
                                    clientId: clientId,
                                    clientName: clientName,
                                    date: documentDate.toISOString(),
                                    subtotal: subtotal,
                                    taxRate: 0,
                                    taxAmount: vatAmount,
                                    total: total,
                                    laborPrice: laborPrice,
                                    mandays: mandays,
                                    realMandays: realMandays,
                                    vatApplied: vatApplied,
                                    notes: notes,
                                    status: status,
                                    items: documentItems
                                };
                            })
                    );

                    if (validDocuments.length === 0) {
                        alert('No valid proformas found in CSV file');
                        return;
                    }

            await documentsAPI.batchCreate(validDocuments);
            await fetchProformas(1, false); // Reset to first page after import
            alert(`Successfully imported ${validDocuments.length} proformas`);
                } catch (err) {
                    console.error('Error importing proformas:', err);
                    alert('Failed to import proformas: ' + (err.message || 'Unknown error'));
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

    const handleConvertToInvoice = async (proforma) => {
        if (!user) return;

        // Prevent double click
        if (convertingIds.has(proforma.id)) {
            console.log('Conversion already in progress for this proforma');
            return;
        }

        // Add to converting set
        setConvertingIds(prev => new Set(prev).add(proforma.id));

        try {
            // Convert proforma to invoice using API (backend will generate invoice number)
            await documentsAPI.convertToInvoice(proforma.id);

            // Refresh proformas list
            await fetchProformas(1, false);

            // Navigate to invoices page
            navigateTo('invoices');
        } catch (error) {
            console.error("Error converting proforma to invoice: ", error);
            alert('Error converting proforma to invoice. Please try again.');
            // Remove from converting set on error
            setConvertingIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(proforma.id);
                return newSet;
            });
        }
    };

    const [deletingProformaIds, setDeletingProformaIds] = useState(new Set());

    const handleDeleteProforma = async (proformaId) => {
        if (!user) return;

        // Prevent double-click
        if (deletingProformaIds.has(proformaId)) {
            return;
        }

        if (!window.confirm('Are you sure you want to cancel this proforma? You can restore it later from the cancelled proformas.')) {
            return;
        }

        setDeletingProformaIds(prev => new Set(prev).add(proformaId));
        setLoading(true);

        try {
            // Cancel the proforma (set status to CANCELLED) instead of deleting
            await documentsAPI.update(proformaId, {
                status: 'CANCELLED'
            });
            setConfirmDelete(null);
            await fetchProformas(1, false);
        } catch (error) {
            console.error("Error cancelling proforma: ", error);
            alert('Error cancelling proforma. Please try again.');
        } finally {
            setLoading(false);
            setDeletingProformaIds(prev => {
                const newSet = new Set(prev);
                newSet.delete(proformaId);
                return newSet;
            });
        }
    };

    const handleRestoreProforma = async (proformaId) => {
        if (!user) return;

        try {
            await documentsAPI.update(proformaId, {
                status: 'DRAFT'
            });
            await fetchProformas(1, false);
        } catch (error) {
            console.error("Error restoring proforma: ", error);
        }
    };

    const handlePermanentDelete = async (proformaId) => {
        if (!user) return;
        
        if (!window.confirm('Are you sure you want to permanently delete this proforma? This action cannot be undone and will remove it from the database.')) {
            return;
        }
        
        try {
            await documentsAPI.delete(proformaId);
            await fetchProformas(1, false);
            alert('Proforma permanently deleted.');
        } catch (error) {
            console.error("Error permanently deleting proforma: ", error);
            alert('Error deleting proforma. Please try again.');
        }
    };

    const filteredHistoryInvoices = historyInvoices.filter(invoice => {
        const filter = historyFilter.toLowerCase();
        const clientName = invoice.client?.name || invoice.clientName || '';
        return (
            invoice.documentNumber.toLowerCase().includes(filter) ||
            clientName.toLowerCase().includes(filter)
        );
    });

    // Filter proformas based on debounced search query - memoized
    // Note: Server-side search is now used, but we keep client-side filter for immediate feedback
    const filteredProformas = useMemo(() => {
        if (!debouncedSearchQuery) return proformas;
        const search = debouncedSearchQuery.toLowerCase();
        return proformas.filter(doc => {
            const dateStr = new Date(doc.date).toLocaleDateString();
            const clientName = doc.client?.name || doc.clientName || '';
            return (
                doc.documentNumber.toLowerCase().includes(search) ||
                clientName.toLowerCase().includes(search) ||
                dateStr.includes(search) ||
                doc.total.toString().includes(search)
            );
        });
    }, [proformas, debouncedSearchQuery]);

    // Use filtered proformas directly (pagination handled server-side)
    const displayedProformas = filteredProformas;

    // Calculate statistics - memoized
    const totalAmount = useMemo(() => {
        return displayedProformas.reduce((sum, doc) => sum + (doc.total || 0), 0);
    }, [displayedProformas]);

    return (
        <div>
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold text-gray-800">Proformas</h1>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigateTo('newDocument')}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-transform transform hover:scale-105"
                    >
                        + Add New Document
                    </button>
                    <button
                        onClick={handleExportCSV}
                        className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Export proformas to CSV"
                    >
                        Export CSV
                    </button>
                    <button
                        onClick={() => fileInputRef.current?.click()}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                        title="Import proformas from CSV"
                    >
                        Import CSV
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv"
                        onChange={handleImportCSV}
                        className="hidden"
                    />
                    <button
                        onClick={() => setShowCancelledModal(true)}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors"
                    >
                        Cancelled ({cancelledProformas.length})
                    </button>
                </div>
            </div>

            {/* Search Bar */}
            <div className="mb-6">
                <input
                    type="text"
                    placeholder="Search by proforma number, client name, date, or amount..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
            </div>

            {/* Proforma Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                {loading ? (
                    <>
                        <div className="bg-yellow-50 p-4 rounded-lg animate-pulse">
                            <div className="h-4 bg-yellow-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-yellow-200 rounded w-3/4 mb-2"></div>
                            <div className="h-3 bg-yellow-200 rounded w-full"></div>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg animate-pulse">
                            <div className="h-4 bg-blue-200 rounded w-1/2 mb-2"></div>
                            <div className="h-8 bg-blue-200 rounded w-1/3 mb-2"></div>
                            <div className="h-3 bg-blue-200 rounded w-full"></div>
                        </div>
                    </>
                ) : (
                    <>
                        <div className="bg-yellow-50 p-4 rounded-lg">
                            <p className="text-sm text-yellow-600">Total Proforma Value</p>
                            <p className="text-2xl font-bold text-yellow-800">${totalAmount.toFixed(2)}</p>
                            <p className="text-xs text-yellow-600 mt-1">Active proformas (not yet converted to invoices)</p>
                        </div>
                        <div className="bg-blue-50 p-4 rounded-lg">
                            <p className="text-sm text-blue-600">Total Active Proformas</p>
                            <p className="text-2xl font-bold text-blue-800">{displayedProformas.length}</p>
                            <p className="text-xs text-blue-600 mt-1">Convert proformas to invoices to enable payments</p>
                        </div>
                    </>
                )}
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-400 p-4 mb-6">
                <div className="flex">
                    <div className="flex-shrink-0">
                        <svg className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                    </div>
                    <div className="ml-3">
                        <p className="text-sm text-blue-700">
                            <strong>Note:</strong> Proformas are temporary quotes and cannot receive direct payments.
                            To accept payments, either:
                            <br/>• Add payment to client account (via Payments page), or
                            <br/>• Convert the proforma to an invoice first
                        </p>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-lg shadow-lg">
                <div className="overflow-x-auto">
                    {loading ? (
                        <TableSkeleton rows={5} columns={5} />
                    ) : displayedProformas.length === 0 ? (
                        <p className="text-gray-500">
                            {debouncedSearchQuery ? 'No proformas found matching your search.' : 'No proformas found.'}
                        </p>
                    ) : (
                    <table className="min-w-full bg-white">
                        <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                            <tr>
                                <th className="py-3 px-6 text-left">Number</th>
                                <th className="py-3 px-6 text-left">Client</th>
                                <th className="py-3 px-6 text-center">Date</th>
                                <th className="py-3 px-6 text-right">Total</th>
                                <th className="py-3 px-6 text-center">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="text-gray-600 text-sm font-light">
                            {displayedProformas.map(doc => {
                                return (
                                    <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                        <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                        <td className="py-3 px-6 text-left">{doc.client?.name || doc.clientName || 'N/A'}</td>
                                        <td className="py-3 px-6 text-center">{new Date(doc.date).toLocaleDateString()}</td>
                                        <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                        <td className="py-3 px-6 text-center">
                                            <div className="flex item-center justify-center gap-1">
                                                <button
                                                    onClick={() => navigateTo('viewDocument', doc)}
                                                    className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                >
                                                    View
                                                </button>
                                                <button
                                                    onClick={() => navigateTo('newDocument', doc)}
                                                    className="text-gray-600 hover:text-purple-600 font-medium py-1 px-2 rounded-lg text-sm"
                                                >
                                                    Edit
                                                </button>
                                                <button
                                                    onClick={() => handleConvertToInvoice(doc)}
                                                    disabled={convertingIds.has(doc.id)}
                                                    className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                    title="Convert to Invoice"
                                                >
                                                    {convertingIds.has(doc.id) ? 'Converting...' : 'Convert'}
                                                </button>
                                                <button
                                                    onClick={() => setConfirmDelete(doc.id)}
                                                    disabled={deletingProformaIds.has(doc.id) || convertingIds.has(doc.id)}
                                                    className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                                >
                                                    Delete
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    )}
                </div>
                
                {/* Load More Button - show when there are more pages */}
                {pagination.hasMore && (
                    <div className="mt-4 text-center">
                        <button
                            onClick={() => {
                                fetchProformas(currentPage + 1, true);
                            }}
                            disabled={isLoadingMore}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-6 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mx-auto"
                        >
                            {isLoadingMore ? (
                                <>
                                    <div className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white"></div>
                                    Loading...
                                </>
                            ) : (
                                `Load More Proformas (${pagination.total - displayedProformas.length} remaining)`
                            )}
                        </button>
                        <p className="text-sm text-gray-500 mt-2">
                            Showing {displayedProformas.length} of {pagination.total} proformas
                        </p>
                    </div>
                )}
            </div>

            {/* Delete Confirmation Modal */}
            {confirmDelete && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl p-6 max-w-md">
                        <h3 className="text-lg font-bold mb-4">Confirm Cancel</h3>
                        <p className="mb-6">Are you sure you want to cancel this proforma? You can restore it later from the cancelled proformas.</p>
                        <div className="flex justify-end gap-2">
                            <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-4 py-2 bg-gray-300 hover:bg-gray-400 rounded-lg"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => handleDeleteProforma(confirmDelete)}
                                disabled={deletingProformaIds.has(confirmDelete) || loading}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {deletingProformaIds.has(confirmDelete) ? 'Deleting...' : 'Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Cancelled Proformas Modal */}
            {showCancelledModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Cancelled Proformas</h2>
                            <button onClick={() => setShowCancelledModal(false)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {cancelledProformas.length === 0 ? (
                                <p className="text-gray-500">No cancelled proformas.</p>
                            ) : (
                                <table className="min-w-full bg-white">
                                    <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                        <tr>
                                            <th className="py-3 px-6 text-left">Number</th>
                                            <th className="py-3 px-6 text-left">Client</th>
                                            <th className="py-3 px-6 text-center">Date</th>
                                            <th className="py-3 px-6 text-center">Cancelled On</th>
                                            <th className="py-3 px-6 text-right">Total</th>
                                            <th className="py-3 px-6 text-center">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="text-gray-600 text-sm font-light">
                                        {cancelledProformas.map(doc => (
                                            <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                                <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                                <td className="py-3 px-6 text-left">{doc.client?.name || doc.clientName || 'N/A'}</td>
                                                <td className="py-3 px-6 text-center">
                                                    {(doc.date instanceof Date ? doc.date : new Date(doc.date)).toLocaleDateString()}
                                                </td>
                                                <td className="py-3 px-6 text-center">
                                                    {doc.updatedAt ? (doc.updatedAt instanceof Date ? doc.updatedAt : new Date(doc.updatedAt)).toLocaleDateString() : (doc.createdAt ? (doc.createdAt instanceof Date ? doc.createdAt : new Date(doc.createdAt)).toLocaleDateString() : 'Unknown')}
                                                </td>
                                                <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                                <td className="py-3 px-6 text-center">
                                                    <div className="flex item-center justify-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                handleRestoreProforma(doc.id);
                                                                setShowCancelledModal(false);
                                                            }}
                                                            className="text-green-600 hover:text-green-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Restore
                                                        </button>
                                                        <button
                                                            onClick={() => {
                                                                if (window.confirm('Are you sure you want to permanently delete this proforma? This action cannot be undone.')) {
                                                                    handlePermanentDelete(doc.id);
                                                                    setShowCancelledModal(false);
                                                                }
                                                            }}
                                                            className="text-red-600 hover:text-red-800 font-medium py-1 px-2 rounded-lg text-sm"
                                                        >
                                                            Delete Permanently
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </div>
                </div>
            )}


            {/* Invoice History Modal */}
            {showHistoryModal && (
                <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
                    <div className="bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-full flex flex-col">
                        <div className="flex justify-between items-center p-4 border-b">
                            <h2 className="text-xl font-bold">Invoice History (Last 30 Days)</h2>
                            <button onClick={() => setShowHistoryModal(false)} className="text-gray-400 hover:text-gray-600">
                                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path>
                                </svg>
                            </button>
                        </div>
                        <div className="p-4">
                            <input
                                type="text"
                                placeholder="Filter by invoice # or client name..."
                                value={historyFilter}
                                onChange={e => setHistoryFilter(e.target.value)}
                                className="w-full px-4 py-2 border rounded-lg mb-4"
                            />
                        </div>
                        <div className="overflow-y-auto flex-grow p-4">
                            {historyLoading && historyInvoices.length === 0 ? <p>Loading history...</p> :
                             filteredHistoryInvoices.length === 0 ? <p>No invoices found in the last 30 days.</p> :
                            <table className="min-w-full bg-white">
                                <thead className="bg-gray-200 text-gray-600 uppercase text-sm leading-normal">
                                    <tr>
                                        <th className="py-3 px-6 text-left">Number</th>
                                        <th className="py-3 px-6 text-left">Client</th>
                                        <th className="py-3 px-6 text-center">Date</th>
                                        <th className="py-3 px-6 text-right">Total</th>
                                        <th className="py-3 px-6 text-center">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="text-gray-600 text-sm font-light">
                                    {filteredHistoryInvoices.map(doc => (
                                        <tr key={doc.id} className="border-b border-gray-200 hover:bg-gray-100">
                                            <td className="py-3 px-6 text-left">{doc.documentNumber}</td>
                                            <td className="py-3 px-6 text-left">{doc.client?.name || doc.clientName || 'N/A'}</td>
                                            <td className="py-3 px-6 text-center">{new Date(doc.date).toLocaleDateString()}</td>
                                            <td className="py-3 px-6 text-right font-semibold">${doc.total.toFixed(2)}</td>
                                            <td className="py-3 px-6 text-center">
                                                <button 
                                                    onClick={() => navigateTo('viewDocument', doc)} 
                                                    className="text-gray-600 hover:text-indigo-600 font-medium py-1 px-3 rounded-lg text-sm"
                                                >
                                                    View
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            }
                        </div>
                        <div className="p-4 border-t">
                            {hasMore && (
                                <button
                                    onClick={() => fetchHistoryInvoices(true)}
                                    disabled={historyLoading}
                                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded w-full disabled:bg-blue-300"
                                >
                                    {historyLoading ? 'Loading...' : 'Show More'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ProformasPage;
