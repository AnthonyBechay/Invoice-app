import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get all suppliers for a user
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { search, limit: limitParam } = req.query;

    const where = { userId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { contactName: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } }
      ];
    }

    const suppliers = await prisma.supplier.findMany({
      where,
      take: limitParam ? parseInt(limitParam) : undefined,
      orderBy: { name: 'asc' }
    });

    res.json(suppliers);
  } catch (error) {
    next(error);
  }
});

/**
 * Get a single supplier by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const supplier = await prisma.supplier.findFirst({
      where: { id, userId }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new supplier
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const supplier = await prisma.supplier.create({
      data: {
        userId,
        ...req.body
      }
    });

    res.status(201).json(supplier);
  } catch (error) {
    next(error);
  }
});

/**
 * Update a supplier
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existingSupplier = await prisma.supplier.findFirst({
      where: { id, userId }
    });

    if (!existingSupplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    const supplier = await prisma.supplier.update({
      where: { id },
      data: req.body
    });

    res.json(supplier);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a supplier
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const supplier = await prisma.supplier.findFirst({
      where: { id, userId }
    });

    if (!supplier) {
      return res.status(404).json({ error: 'Supplier not found' });
    }

    await prisma.supplier.delete({
      where: { id }
    });

    res.json({ message: 'Supplier deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
