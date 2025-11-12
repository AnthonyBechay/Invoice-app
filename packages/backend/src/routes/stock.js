import express from 'express';
import { prisma } from '../config/database.js';
import { clearCacheOnMutation } from '../middleware/cache.js';

const router = express.Router();

// Clear cache on stock mutations
router.use(clearCacheOnMutation('stock'));

/**
 * Get all stock items for a user
 * Supports pagination with page and limit query params
 */
router.get('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { limit: limitParam, page: pageParam, search } = req.query;

    const where = {
      userId
    };

    if (search) {
      // Search across all relevant fields for comprehensive results
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
        { brand: { contains: search, mode: 'insensitive' } },
        { model: { contains: search, mode: 'insensitive' } },
        { partNumber: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
        { specifications: { contains: search, mode: 'insensitive' } },
        { supplierName: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } }
      ];
    }

    // Pagination defaults
    const page = pageParam ? Math.max(1, parseInt(pageParam)) : 1;
    const limit = limitParam ? Math.min(100, Math.max(1, parseInt(limitParam))) : 50; // Default 50, max 100
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const total = await prisma.stock.count({ where });

    const items = await prisma.stock.findMany({
      where,
      take: limit,
      skip,
      orderBy: { createdAt: 'desc' },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // Return paginated response
    res.json({
      data: items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: page * limit < total
      }
    });
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
      },
      include: {
        supplier: true  // Include supplier relation
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
    const data = req.body;

    if (!data.name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    // Create item with all provided fields
    const item = await prisma.stock.create({
      data: {
        userId,
        name: data.name,
        description: data.description || '',
        category: data.category || '',
        buyingPrice: data.buyingPrice || 0,
        sellingPrice: data.sellingPrice || data.unitPrice || 0, // Support old unitPrice field
        unit: data.unit || '',
        quantity: data.quantity || 0,
        minQuantity: data.minQuantity || 0,
        brand: data.brand || '',
        model: data.model || '',
        partNumber: data.partNumber || '',
        sku: data.sku || '',
        specifications: data.specifications || '',
        voltage: data.voltage || '',
        power: data.power || '',
        material: data.material || '',
        size: data.size || '',
        weight: data.weight || '',
        color: data.color || '',
        supplierId: data.supplierId || null,  // Use supplierId for relation
        supplierName: data.supplier || data.supplierName || '',  // Legacy field
        supplierCode: data.supplierCode || '',
        warranty: data.warranty || '',
        notes: data.notes || ''
      },
      include: {
        supplier: true  // Include supplier relation in response
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
    const data = req.body;

    const item = await prisma.stock.findFirst({
      where: { id, userId }
    });

    if (!item) {
      return res.status(404).json({ error: 'Stock item not found' });
    }

    // Update with all provided fields
    const updateData = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.description !== undefined) updateData.description = data.description;
    if (data.category !== undefined) updateData.category = data.category;
    if (data.buyingPrice !== undefined) updateData.buyingPrice = data.buyingPrice;
    if (data.sellingPrice !== undefined) updateData.sellingPrice = data.sellingPrice;
    if (data.unitPrice !== undefined) updateData.sellingPrice = data.unitPrice; // Backward compatibility
    if (data.unit !== undefined) updateData.unit = data.unit;
    if (data.quantity !== undefined) updateData.quantity = data.quantity;
    if (data.minQuantity !== undefined) updateData.minQuantity = data.minQuantity;
    if (data.brand !== undefined) updateData.brand = data.brand;
    if (data.model !== undefined) updateData.model = data.model;
    if (data.partNumber !== undefined) updateData.partNumber = data.partNumber;
    if (data.sku !== undefined) updateData.sku = data.sku;
    if (data.specifications !== undefined) updateData.specifications = data.specifications;
    if (data.voltage !== undefined) updateData.voltage = data.voltage;
    if (data.power !== undefined) updateData.power = data.power;
    if (data.material !== undefined) updateData.material = data.material;
    if (data.size !== undefined) updateData.size = data.size;
    if (data.weight !== undefined) updateData.weight = data.weight;
    if (data.color !== undefined) updateData.color = data.color;
    if (data.supplierId !== undefined) updateData.supplierId = data.supplierId;  // Use supplierId for relation
    if (data.supplier !== undefined) updateData.supplierName = data.supplier;  // Legacy field
    if (data.supplierName !== undefined) updateData.supplierName = data.supplierName;  // Legacy field
    if (data.supplierCode !== undefined) updateData.supplierCode = data.supplierCode;
    if (data.warranty !== undefined) updateData.warranty = data.warranty;
    if (data.notes !== undefined) updateData.notes = data.notes;

    const updated = await prisma.stock.update({
      where: { id },
      data: updateData,
      include: {
        supplier: true  // Include supplier relation in response
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
