import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get user settings
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const excludeLogo = req.query.excludeLogo === 'true';

    // Select fields, optionally excluding logo for faster initial load
    const settings = await prisma.settings.findUnique({
      where: { userId },
      select: {
        id: true,
        userId: true,
        companyName: true,
        companyAddress: true,
        companyPhone: true,
        companyEmail: true,
        companyVatNumber: true,
        logo: !excludeLogo, // Only include logo if not excluded
        footerMessage: true,
        taxRate: true,
        currency: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!settings) {
      // Return default settings if none exist
      return res.json({
        userId,
        companyName: '',
        companyAddress: '',
        companyPhone: '',
        companyEmail: '',
        companyVatNumber: '',
        logo: '',
        footerMessage: 'Thank you for your business!',
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
