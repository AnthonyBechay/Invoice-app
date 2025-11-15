import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get all payments for a user
 * Supports pagination with page and limit query params
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id; // Always filter by authenticated user's ID for security
    const { limit: limitParam, page: pageParam, search } = req.query;

    // IMPORTANT: Always filter by userId to ensure users only see their own payments
    const where = {
      userId
    };

    if (search) {
      where.OR = [
        { clientName: { contains: search, mode: 'insensitive' } },
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { paymentMethod: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Pagination defaults
    const page = pageParam ? Math.max(1, parseInt(pageParam)) : 1;
    const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam))) : 50; // Default 50, max 100
    const skip = (page - 1) * limit;

    // Fetch limit+1 to check if there are more results (faster than count)
    const payments = await prisma.payment.findMany({
      where,
      take: limit + 1,
      skip,
      orderBy: { createdAt: 'desc' },
      include: {
        document: {
          select: {
            id: true,
            documentNumber: true,
            total: true,
            status: true
          }
        },
        client: {
          select: {
            id: true,
            name: true,
            email: true
          }
        }
      }
    });

    // Filter out orphaned payments (payments with documentId but document doesn't exist)
    // This happens when documents are deleted but payments weren't cascade deleted
    // IMPORTANT: Allow payments with null documentId (on-account/standalone payments) - these are valid
    // Only exclude payments that have a documentId but the document no longer exists
    const validPayments = payments.filter(payment => {
      // If payment has no documentId (null), it's an on-account payment and is always valid
      if (!payment.documentId) {
        return true;
      }
      // If payment has a documentId, the document must exist (not null)
      // If document is null, it means the document was deleted, so exclude this orphaned payment
      return payment.document !== null;
    });

    // Check if there are more payments
    const hasMore = validPayments.length > limit;
    const actualPayments = hasMore ? validPayments.slice(0, limit) : validPayments;

    // Return paginated response without total count (much faster)
    res.json({
      data: actualPayments,
      pagination: {
        page,
        limit,
        total: null,
        totalPages: null,
        hasMore
      }
    });
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
