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

    const payment = await prisma.payment.create({
      data: {
        userId,
        ...req.body
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

    const payment = await prisma.payment.update({
      where: { id },
      data: req.body,
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
