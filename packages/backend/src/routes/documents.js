import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get all documents (proformas and invoices) for a user
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { type, limit: limitParam, search } = req.query;

    const where = {
      userId
    };

    if (type) {
      where.type = type;
    }

    if (search) {
      where.OR = [
        { documentNumber: { contains: search, mode: 'insensitive' } },
        { clientName: { contains: search, mode: 'insensitive' } }
      ];
    }

    const documents = await prisma.document.findMany({
      where,
      take: limitParam ? parseInt(limitParam) : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        client: true
      }
    });

    res.json(documents);
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
        items: true,
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
    const { items, ...documentData } = req.body;

    const document = await prisma.document.create({
      data: {
        userId,
        ...documentData,
        items: items ? {
          create: items
        } : undefined
      },
      include: {
        items: true,
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
    const { items, ...updateData } = req.body;

    const existingDocument = await prisma.document.findFirst({
      where: { id, userId }
    });

    if (!existingDocument) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Update document with items if provided
    const document = await prisma.document.update({
      where: { id },
      data: {
        ...updateData,
        items: items ? {
          deleteMany: {},
          create: items
        } : undefined
      },
      include: {
        items: true,
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
        items: true
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

    // Create new invoice based on proforma
    const invoice = await prisma.document.create({
      data: {
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
      },
      include: {
        items: true,
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
        const { items, ...documentData } = doc;
        
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

        return prisma.document.create({
          data: {
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
          },
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
