import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get all payments for a user
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit: limitParam, search } = req.query;

    const where = {
      userId
    };

    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } }
      ];
    }

    const payments = await prisma.payment.findMany({
      where,
      take: limitParam ? parseInt(limitParam) : undefined,
      orderBy: { createdAt: 'desc' },
      include: {
        document: true,
        client: true
      }
    });

    res.json(payments);
  } catch (error) {
    next(error);
  }
});

/**
 * Get a single payment by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const payment = await prisma.payment.findFirst({
      where: {
        id,
        userId
      },
      include: {
        document: true,
        client: true
      }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    res.json(payment);
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new payment
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { documentId, ...paymentData } = req.body;

    // Validate that payment can only be added to invoices
    if (documentId) {
      const document = await prisma.document.findFirst({
        where: {
          id: documentId,
          userId
        }
      });

      if (!document) {
        return res.status(404).json({ error: 'Document not found' });
      }

      if (document.type !== 'INVOICE') {
        return res.status(400).json({ 
          error: 'Payments can only be added to invoices. Proformas cannot receive payments.' 
        });
      }
    }

    const payment = await prisma.payment.create({
      data: {
        userId,
        documentId,
        ...paymentData
      },
      include: {
        document: true,
        client: true
      }
    });

    res.status(201).json(payment);
  } catch (error) {
    next(error);
  }
});

/**
 * Update a payment
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existingPayment = await prisma.payment.findFirst({
      where: { id, userId }
    });

    if (!existingPayment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    // Handle documentId - convert to relation format if provided
    const { documentId, ...updateData } = req.body;
    const data = { ...updateData };
    
    if (documentId !== undefined) {
      if (documentId === null) {
        data.document = { disconnect: true };
      } else {
        // Validate document exists and is an invoice
        const document = await prisma.document.findFirst({
          where: {
            id: documentId,
            userId
          }
        });

        if (!document) {
          return res.status(404).json({ error: 'Document not found' });
        }

        if (document.type !== 'INVOICE') {
          return res.status(400).json({ 
            error: 'Payments can only be added to invoices. Proformas cannot receive payments.' 
          });
        }

        data.document = { connect: { id: documentId } };
      }
    }

    const payment = await prisma.payment.update({
      where: { id },
      data,
      include: {
        document: true,
        client: true
      }
    });

    res.json(payment);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a payment
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const payment = await prisma.payment.findFirst({
      where: { id, userId }
    });

    if (!payment) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    await prisma.payment.delete({
      where: { id }
    });

    res.json({ message: 'Payment deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
