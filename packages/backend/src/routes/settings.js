import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get user settings
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const settings = await prisma.settings.findUnique({
      where: { userId }
    });

    if (!settings) {
      // Return default settings if none exist
      return res.json({
        userId,
        companyName: '',
        companyAddress: '',
        companyPhone: '',
        companyEmail: '',
        taxRate: 0,
        currency: 'USD'
      });
    }

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

/**
 * Update user settings
 */
router.put('/', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const settings = await prisma.settings.upsert({
      where: { userId },
      update: req.body,
      create: {
        userId,
        ...req.body
      }
    });

    res.json(settings);
  } catch (error) {
    next(error);
  }
});

export default router;
