import express from 'express';
import { prisma } from '../config/database.js';
import { clearCacheOnMutation } from '../middleware/cache.js';

const router = express.Router();

// Clear cache on document mutations
router.use(clearCacheOnMutation('documents'));

/**
 * Get all documents (proformas and invoices) for a user
 * Supports pagination with page and limit query params
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { 
      type, 
      limit: limitParam, 
      page: pageParam, 
      search,
      status,
      includeItems = 'false' // By default, don't include items for list view
    } = req.query;

    const where = {
      userId
    };

    if (type) {
      // Convert to uppercase for Prisma enum (PROFORMA, INVOICE)
      where.type = type.toUpperCase();
    }

    if (status) {
      where.status = status.toUpperCase();
    }

    if (search) {
      where.OR = [
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Pagination defaults
    const page = pageParam ? Math.max(1, parseInt(pageParam)) : 1;
    const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam))) : 50; // Default 50, max 100
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await prisma.document.count({ where });

    // Build include object conditionally
    const include = {
      client: {
        select: {
          id: true,
          name: true,
          email: true
        }
      }
    };

    // Only include items if explicitly requested (for detail view)
    if (includeItems === 'true') {
      include.items = {
        include: {
          stock: {
            select: {
              id: true,
              name: true,
              sellingPrice: true
            }
          }
        }
      };
    }

    const documents = await prisma.document.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      include
    });

    // Return paginated response
    res.json({
      data: documents,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get next document number for a given type
 */
router.get('/next-number/:type', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type } = req.params;

    // Convert to uppercase for Prisma enum
    const documentType = type.toUpperCase();

    // Validate type
    if (!['PROFORMA', 'INVOICE'].includes(documentType)) {
      return res.status(400).json({ error: 'Invalid document type. Must be PROFORMA or INVOICE' });
    }

    const year = new Date().getFullYear();
    const prefix = documentType === 'PROFORMA' ? 'PRO' : 'INV';
    const counterType = documentType === 'PROFORMA' ? 'proforma' : 'invoice';

    // Get or create counter
    const result = await prisma.counter.upsert({
      where: {
        userId_type: {
          userId,
          type: counterType
        }
      },
      update: {
        lastId: {
          increment: 1
        }
      },
      create: {
        userId,
        type: counterType,
        lastId: 1
      }
    });

    const documentNumber = `${prefix}-${year}-${String(result.lastId).padStart(3, '0')}`;

    res.json({ documentNumber });
  } catch (error) {
    next(error);
  }
});

/**
 * Get a single document by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: {
        id,
        userId
      },
      include: {
        items: {
          include: {
            stock: true
          }
        },
        client: true
      }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(document);
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new document
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { items, mandays, realMandays, ...documentData } = req.body;

    // Validate and sanitize stockIds before creating items to prevent foreign key constraint violations
    let sanitizedItems = items;
    if (items && Array.isArray(items)) {
      sanitizedItems = await Promise.all(items.map(async (item) => {
        const sanitizedItem = { ...item };
        
        // Validate stockId if present
        if (sanitizedItem.stockId) {
          try {
            const stockExists = await prisma.stock.findFirst({
              where: { 
                id: sanitizedItem.stockId, 
                userId 
              },
              select: { id: true }
            });
            
            if (!stockExists) {
              console.warn(`Invalid stockId ${sanitizedItem.stockId} in document item, setting to null`);
              sanitizedItem.stockId = null;
            }
          } catch (error) {
            console.error(`Error validating stockId ${sanitizedItem.stockId}:`, error);
            sanitizedItem.stockId = null;
          }
        }
        
        // Ensure stockId is either a valid UUID string or null (not undefined)
        if (!sanitizedItem.stockId) {
          sanitizedItem.stockId = null;
        }
        
        return sanitizedItem;
      }));
    }

    // Prepare data object with proper JSON handling for mandays fields
    const data = {
      userId,
      ...documentData,
      items: sanitizedItems ? {
        create: sanitizedItems
      } : undefined
    };

    // Only include mandays if it exists and has valid data
    if (mandays && typeof mandays === 'object') {
      data.mandays = mandays;
    }

    // Only include realMandays if it exists and has valid data
    if (realMandays && typeof realMandays === 'object') {
      data.realMandays = realMandays;
    }

    const document = await prisma.document.create({
      data,
      include: {
        items: {
          include: {
            stock: true
          }
        },
        client: true
      }
    });

    res.status(201).json(document);
  } catch (error) {
    next(error);
  }
});

/**
 * Update a document
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { items, mandays, realMandays, clientId, clientName, ...updateData } = req.body;

    const existingDocument = await prisma.document.findFirst({
      where: { id, userId }
    });

    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Prepare update data with proper JSON handling
    // Validate and sanitize stockIds before creating items to prevent foreign key constraint violations
    let sanitizedItems = items;
    if (items && Array.isArray(items)) {
      // Create a sanitized copy of items with validated stockIds
      sanitizedItems = await Promise.all(items.map(async (item) => {
        const sanitizedItem = { ...item };
        
        // Validate stockId if present (handle empty strings, null, undefined, etc.)
        const stockId = sanitizedItem.stockId;
        if (stockId && typeof stockId === 'string' && stockId.trim() !== '') {
          try {
            // Basic UUID format validation
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(stockId.trim())) {
              console.warn(`Invalid stockId format ${stockId}, setting to null`);
              sanitizedItem.stockId = null;
            } else {
              const stockExists = await prisma.stock.findFirst({
                where: { 
                  id: stockId.trim(), 
                  userId 
                },
                select: { id: true } // Only select id for efficiency
              });
              
              if (!stockExists) {
                // Remove invalid stockId to prevent foreign key constraint violation
                console.warn(`Invalid stockId ${stockId} (stock not found), setting to null`);
                sanitizedItem.stockId = null;
              } else {
                // Ensure it's trimmed
                sanitizedItem.stockId = stockId.trim();
              }
            }
          } catch (error) {
            console.error(`Error validating stockId ${stockId}:`, error);
            // If validation fails, set to null to be safe
            sanitizedItem.stockId = null;
          }
        } else {
          // Ensure stockId is null (not undefined, empty string, etc.)
          sanitizedItem.stockId = null;
        }
        
        return sanitizedItem;
      }));
    }
    
    const data = {
      ...updateData,
      items: sanitizedItems ? {
        deleteMany: {},
        create: sanitizedItems
      } : undefined
    };

    // Handle client relation update if clientId is provided
    if (clientId !== undefined) {
      if (clientId) {
        data.client = { connect: { id: clientId } };
      } else {
        data.client = { disconnect: true };
      }
      // Also update clientName if provided
      if (clientName !== undefined) {
        data.clientName = clientName;
      }
    }

    // Only include mandays if explicitly provided (allow null to clear)
    if (mandays !== undefined) {
      data.mandays = mandays && typeof mandays === 'object' ? mandays : null;
    }

    // Only include realMandays if explicitly provided (allow null to clear)
    if (realMandays !== undefined) {
      data.realMandays = realMandays && typeof realMandays === 'object' ? realMandays : null;
    }

    // Update document with items if provided
    const document = await prisma.document.update({
      where: { id },
      data,
      include: {
        items: {
          include: {
            stock: true
          }
        },
        client: true
      }
    });

    res.json(document);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a document
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const document = await prisma.document.findFirst({
      where: { id, userId }
    });

    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    await prisma.document.delete({
      where: { id }
    });

    res.json({ message: 'Document deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * Convert proforma to invoice
 */
router.post('/:id/convert', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    let { newDocumentNumber } = req.body;

    const proforma = await prisma.document.findFirst({
      where: {
        id,
        userId
      },
      include: {
        items: {
          include: {
            stock: true
          }
        }
      }
    });

    if (!proforma) {
      return res.status(404).json({ error: 'Document not found' });
    }

    if (proforma.type !== 'PROFORMA') {
      return res.status(400).json({ error: 'Only proformas can be converted to invoices' });
    }

    // Generate invoice number if not provided
    if (!newDocumentNumber) {
      const year = new Date().getFullYear();
      const result = await prisma.counter.upsert({
        where: {
          userId_type: {
            userId,
            type: 'invoice'
          }
        },
        update: {
          lastId: {
            increment: 1
          }
        },
        create: {
          userId,
          type: 'invoice',
          lastId: 1
        }
      });
      newDocumentNumber = `INV-${year}-${String(result.lastId).padStart(3, '0')}`;
    }

    // Create new invoice based on proforma (copy all fields including mandays)
    const invoiceData = {
      userId,
      type: 'INVOICE',
      documentNumber: newDocumentNumber,
      clientId: proforma.clientId,
      clientName: proforma.clientName,
      date: proforma.date,
      dueDate: proforma.dueDate,
      subtotal: proforma.subtotal,
      taxRate: proforma.taxRate,
      taxAmount: proforma.taxAmount,
      total: proforma.total,
      laborPrice: proforma.laborPrice || 0,
      vatApplied: proforma.vatApplied || false,
      notes: proforma.notes,
      status: proforma.status,
      convertedFrom: id,
      items: {
        create: proforma.items.map(item => ({
          stockId: item.stockId,
          name: item.name,
          description: item.description,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: item.total
        }))
      }
    };

    // Copy mandays if it exists
    if (proforma.mandays) {
      invoiceData.mandays = proforma.mandays;
    }

    // Copy realMandays if it exists
    if (proforma.realMandays) {
      invoiceData.realMandays = proforma.realMandays;
    }

    const invoice = await prisma.document.create({
      data: invoiceData,
      include: {
        items: {
          include: {
            stock: true
          }
        },
        client: true
      }
    });

    // Update proforma to mark as converted
    await prisma.document.update({
      where: { id },
      data: {
        convertedTo: invoice.id
      }
    });

    res.status(201).json(invoice);
  } catch (error) {
    next(error);
  }
});

/**
 * Batch import documents (proformas/invoices)
 */
router.post('/batch', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { documents } = req.body;

    if (!Array.isArray(documents)) {
      return res.status(400).json({ error: 'Documents must be an array' });
    }

    const created = await prisma.$transaction(
      documents.map(doc => {
        const { items, mandays, realMandays, ...documentData } = doc;

        // Validate document type
        if (documentData.type && !['PROFORMA', 'INVOICE'].includes(documentData.type.toUpperCase())) {
          throw new Error(`Invalid document type: ${documentData.type}. Must be PROFORMA or INVOICE`);
        }

        // Convert type to enum
        const type = documentData.type ? documentData.type.toUpperCase() : 'PROFORMA';

        // Validate status
        let status = documentData.status || 'DRAFT';
        if (status) {
          status = status.toUpperCase();
          // Validate status based on type
          if (type === 'PROFORMA' && !['DRAFT', 'SENT', 'CONVERTED'].includes(status)) {
            status = 'DRAFT';
          }
          if (type === 'INVOICE' && !['DRAFT', 'SENT', 'PAID', 'CANCELLED'].includes(status)) {
            status = 'DRAFT';
          }
        }

        // Prepare data with proper handling of JSON fields
        const data = {
          userId,
          type,
          status,
          ...documentData,
          items: items ? {
            create: items.map(item => ({
              name: item.name || '',
              description: item.description || '',
              quantity: parseFloat(item.quantity) || 0,
              unitPrice: parseFloat(item.unitPrice) || 0,
              total: parseFloat(item.total) || (parseFloat(item.quantity) || 0) * (parseFloat(item.unitPrice) || 0),
              stockId: item.stockId || null
            }))
          } : undefined
        };

        // Add mandays if provided
        if (mandays && typeof mandays === 'object') {
          data.mandays = mandays;
        }

        // Add realMandays if provided
        if (realMandays && typeof realMandays === 'object') {
          data.realMandays = realMandays;
        }

        return prisma.document.create({
          data,
          include: {
            items: true,
            client: true
          }
        });
      })
    );

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export default router;
