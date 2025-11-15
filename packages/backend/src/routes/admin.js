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

/**
 * Get unused stock items (not referenced in any document)
 */
router.get('/unused/stock', async (req, res, next) => {
  try {
    const { userId } = req.query;
    
    // Get all stock items
    const allStock = await prisma.stock.findMany({
      where: userId ? { userId: String(userId) } : undefined,
      select: {
        id: true,
        name: true,
        description: true,
        category: true,
        brand: true,
        model: true,
        partNumber: true,
        sku: true,
        quantity: true,
        buyingPrice: true,
        sellingPrice: true,
        userId: true,
        user: {
          select: {
            email: true
          }
        },
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get all stock IDs that are referenced in documents
    const usedStockIds = await prisma.documentItem.findMany({
      where: {
        stockId: { not: null }
      },
      select: {
        stockId: true
      },
      distinct: ['stockId']
    });

    const usedIds = new Set(usedStockIds.map(item => item.stockId));

    // Filter out used stock items
    const unusedStock = allStock.filter(stock => !usedIds.has(stock.id));

    res.json(unusedStock);
  } catch (error) {
    next(error);
  }
});

/**
 * Get unused clients (not referenced in any document)
 */
router.get('/unused/clients', async (req, res, next) => {
  try {
    const { userId } = req.query;
    
    // Get all clients
    const allClients = await prisma.client.findMany({
      where: userId ? { userId: String(userId) } : undefined,
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        location: true,
        clientId: true,
        userId: true,
        user: {
          select: {
            email: true
          }
        },
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    // Get all client IDs that are referenced in documents
    const usedClientIds = await prisma.document.findMany({
      where: {
        clientId: { not: null }
      },
      select: {
        clientId: true
      },
      distinct: ['clientId']
    });

    const usedIds = new Set(usedClientIds.map(doc => doc.clientId));

    // Filter out used clients
    const unusedClients = allClients.filter(client => !usedIds.has(client.id));

    res.json(unusedClients);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete unused stock items (bulk delete, no cascade)
 */
router.delete('/unused/stock', async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of stock IDs is required' });
    }

    // Verify these are actually unused (safety check)
    const usedStockIds = await prisma.documentItem.findMany({
      where: {
        stockId: { in: ids }
      },
      select: {
        stockId: true
      },
      distinct: ['stockId']
    });

    const usedIds = new Set(usedStockIds.map(item => item.stockId));
    const safeToDelete = ids.filter(id => !usedIds.has(id));

    if (safeToDelete.length === 0) {
      return res.status(400).json({ error: 'None of the selected items can be deleted (they are in use)' });
    }

    // Delete the unused stock items
    const result = await prisma.stock.deleteMany({
      where: {
        id: { in: safeToDelete }
      }
    });

    res.json({
      message: `Successfully deleted ${result.count} unused stock item(s)`,
      deleted: result.count,
      skipped: ids.length - safeToDelete.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Delete unused clients (bulk delete, no cascade)
 */
router.delete('/unused/clients', async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of client IDs is required' });
    }

    // Verify these are actually unused (safety check)
    const usedClientIds = await prisma.document.findMany({
      where: {
        clientId: { in: ids }
      },
      select: {
        clientId: true
      },
      distinct: ['clientId']
    });

    const usedIds = new Set(usedClientIds.map(doc => doc.clientId));
    const safeToDelete = ids.filter(id => !usedIds.has(id));

    if (safeToDelete.length === 0) {
      return res.status(400).json({ error: 'None of the selected clients can be deleted (they are in use)' });
    }

    // Delete the unused clients
    const result = await prisma.client.deleteMany({
      where: {
        id: { in: safeToDelete }
      }
    });

    res.json({
      message: `Successfully deleted ${result.count} unused client(s)`,
      deleted: result.count,
      skipped: ids.length - safeToDelete.length
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get documents (invoices/proformas) by user
 */
router.get('/unused/documents', async (req, res, next) => {
  try {
    const { userId, type } = req.query;
    
    const where = {};
    if (userId) {
      where.userId = String(userId);
    }
    if (type) {
      where.type = type.toUpperCase();
    }
    
    // Get all documents matching the filter
    const documents = await prisma.document.findMany({
      where,
      select: {
        id: true,
        type: true,
        documentNumber: true,
        date: true,
        total: true,
        status: true,
        clientName: true,
        userId: true,
        user: {
          select: {
            email: true
          }
        },
        createdAt: true
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(documents);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete documents (bulk delete)
 */
router.delete('/unused/documents', async (req, res, next) => {
  try {
    const { ids } = req.body;

    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ error: 'Array of document IDs is required' });
    }

    // Delete the documents (cascade will handle related items and payments)
    const result = await prisma.document.deleteMany({
      where: {
        id: { in: ids }
      }
    });

    res.json({
      message: `Successfully deleted ${result.count} document(s)`,
      deleted: result.count
    });
  } catch (error) {
    next(error);
  }
});

export default router;

