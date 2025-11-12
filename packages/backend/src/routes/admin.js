import express from 'express';
import { prisma } from '../config/database.js';
import { requireAdmin } from '../middleware/admin.js';
import bcrypt from 'bcryptjs';

const router = express.Router();

// All admin routes require admin access
router.use(requireAdmin);

/**
 * Get all users with statistics
 */
router.get('/users', async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        _count: {
          select: {
            clients: true,
            documents: true,
            payments: true,
            stock: true,
            expenses: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get additional statistics for each user
    const usersWithStats = await Promise.all(
      users.map(async (user) => {
        // Get total revenue (sum of all invoice totals)
        const invoices = await prisma.document.findMany({
          where: {
            userId: user.id,
            type: 'INVOICE',
            status: { not: 'CANCELLED' }
          },
          select: { total: true }
        });
        const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);

        // Get total payments
        const payments = await prisma.payment.findMany({
          where: { userId: user.id },
          select: { amount: true }
        });
        const totalPayments = payments.reduce((sum, p) => sum + (p.amount || 0), 0);

        // Get recent activity (last document created)
        const lastDocument = await prisma.document.findFirst({
          where: { userId: user.id },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true, type: true, documentNumber: true }
        });

        return {
          ...user,
          totalRevenue,
          totalPayments,
          lastActivity: lastDocument?.createdAt || null,
          lastDocumentType: lastDocument?.type || null,
          lastDocumentNumber: lastDocument?.documentNumber || null
        };
      })
    );

    res.json(usersWithStats);
  } catch (error) {
    next(error);
  }
});

/**
 * Get system-wide statistics
 */
router.get('/stats', async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalClients,
      totalDocuments,
      totalInvoices,
      totalProformas,
      totalPayments,
      totalStock,
      totalRevenue,
      totalPaymentsAmount
    ] = await Promise.all([
      prisma.user.count(),
      prisma.client.count(),
      prisma.document.count(),
      prisma.document.count({ where: { type: 'INVOICE' } }),
      prisma.document.count({ where: { type: 'PROFORMA' } }),
      prisma.payment.count(),
      prisma.stock.count(),
      prisma.document.aggregate({
        where: { type: 'INVOICE', status: { not: 'CANCELLED' } },
        _sum: { total: true }
      }),
      prisma.payment.aggregate({
        _sum: { amount: true }
      })
    ]);

    // Get recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentActivity = await Promise.all([
      prisma.document.count({
        where: { createdAt: { gte: sevenDaysAgo } }
      }),
      prisma.payment.count({
        where: { createdAt: { gte: sevenDaysAgo } }
      }),
      prisma.user.count({
        where: { createdAt: { gte: sevenDaysAgo } }
      })
    ]);

    res.json({
      overview: {
        totalUsers,
        totalClients,
        totalDocuments,
        totalInvoices,
        totalProformas,
        totalPayments,
        totalStock,
        totalRevenue: totalRevenue._sum.total || 0,
        totalPaymentsAmount: totalPaymentsAmount._sum.amount || 0
      },
      recentActivity: {
        documentsLast7Days: recentActivity[0],
        paymentsLast7Days: recentActivity[1],
        newUsersLast7Days: recentActivity[2]
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Update user password
 */
router.put('/users/:id/password', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { id },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(error);
  }
});

/**
 * Delete user and all their data
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const { confirm } = req.query;

    if (confirm !== 'true') {
      return res.status(400).json({ error: 'Confirmation required. Add ?confirm=true to the URL' });
    }

    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id },
      select: { email: true }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting admin account
    if (user.email === 'anthonybechay1@gmail.com') {
      return res.status(403).json({ error: 'Cannot delete admin account' });
    }

    // Delete all user data in a transaction
    // Prisma will cascade delete related records due to onDelete: Cascade
    await prisma.user.delete({
      where: { id }
    });

    res.json({ 
      message: 'User and all associated data deleted successfully',
      deletedUser: user.email
    });
  } catch (error) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'User not found' });
    }
    next(error);
  }
});

/**
 * Get detailed user information
 */
router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
        updatedAt: true,
        clients: {
          select: {
            id: true,
            name: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        documents: {
          select: {
            id: true,
            type: true,
            documentNumber: true,
            total: true,
            status: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        payments: {
          select: {
            id: true,
            amount: true,
            paymentDate: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        stock: {
          select: {
            id: true,
            name: true,
            quantity: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: {
            clients: true,
            documents: true,
            payments: true,
            stock: true,
            expenses: true
          }
        }
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    next(error);
  }
});

export default router;

