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
    const { newDocumentNumber } = req.body;

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

    if (proforma.type !== 'proforma') {
      return res.status(400).json({ error: 'Only proformas can be converted to invoices' });
    }

    // Create new invoice based on proforma
    const invoice = await prisma.document.create({
      data: {
        userId,
        type: 'invoice',
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

export default router;
