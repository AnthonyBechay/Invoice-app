import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get all expenses for a user
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
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } }
      ];
    }

    const expenses = await prisma.expense.findMany({
      where,
      take: limitParam ? parseInt(limitParam) : undefined,
      orderBy: { createdAt: 'desc' }
    });

    res.json(expenses);
  } catch (error) {
    next(error);
  }
});

/**
 * Get a single expense by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const expense = await prisma.expense.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    res.json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new expense
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const expense = await prisma.expense.create({
      data: {
        userId,
        ...req.body
      }
    });

    res.status(201).json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * Update an expense
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const existingExpense = await prisma.expense.findFirst({
      where: { id, userId }
    });

    if (!existingExpense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    const expense = await prisma.expense.update({
      where: { id },
      data: req.body
    });

    res.json(expense);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete an expense
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const expense = await prisma.expense.findFirst({
      where: { id, userId }
    });

    if (!expense) {
      return res.status(404).json({ error: 'Expense not found' });
    }

    await prisma.expense.delete({
      where: { id }
    });

    res.json({ message: 'Expense deleted successfully' });
  } catch (error) {
    next(error);
  }
});

export default router;
