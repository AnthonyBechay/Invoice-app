import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get all stock items for a user
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
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } }
      ];
    }

    const items = await prisma.stock.findMany({
      where,
      take: limitParam ? parseInt(limitParam) : undefined,
      orderBy: { createdAt: 'desc' }
    });

    res.json(items);
  } catch (error) {
    next(error);
  }
});

/**
 * Get a single stock item by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const item = await prisma.stock.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!item) {
      return res.status(404).json({ error: 'Stock item not found' });
    }

    res.json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new stock item
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, description, unit, unitPrice, quantity } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const item = await prisma.stock.create({
      data: {
        userId,
        name,
        description: description || '',
        unit: unit || '',
        unitPrice: unitPrice || 0,
        quantity: quantity || 0
      }
    });

    res.status(201).json(item);
  } catch (error) {
    next(error);
  }
});

/**
 * Update a stock item
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, description, unit, unitPrice, quantity } = req.body;

    const item = await prisma.stock.findFirst({
      where: { id, userId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Stock item not found' });
    }

    const updated = await prisma.stock.update({
      where: { id },
      data: {
        name,
        description: description || '',
        unit: unit || '',
        unitPrice: unitPrice || 0,
        quantity: quantity || 0
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a stock item
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const item = await prisma.stock.findFirst({
      where: { id, userId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Stock item not found' });
    }

    await prisma.stock.delete({
      where: { id }
    });

    res.json({ message: 'Stock item deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * Batch import stock items
 */
router.post('/batch', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { items } = req.body;

    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Items must be an array' });
    }

    const created = await prisma.$transaction(
      items.map(item =>
        prisma.stock.create({
          data: {
            userId,
            ...item
          }
        })
      )
    );

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

export default router;
