import express from 'express';
import { prisma } from '../config/database.js';

const router = express.Router();

/**
 * Get next client ID
 */
router.get('/next-id', async (req, res, next) => {
  try {
    const userId = req.user.id;

    const result = await prisma.counter.upsert({
      where: {
        userId_type: {
          userId,
          type: 'client'
        }
      },
      update: {
        lastId: {
          increment: 1
        }
      },
      create: {
        userId,
        type: 'client',
        lastId: 1
      }
    });

    res.json({ id: result.lastId });
  } catch (error) {
    next(error);
  }
});

/**
 * Get all clients for a user
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
        { email: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { location: { contains: search, mode: 'insensitive' } }
      ];
    }

    const clients = await prisma.client.findMany({
      where,
      take: limitParam ? parseInt(limitParam) : undefined,
      orderBy: { createdAt: 'desc' }
    });

    res.json(clients);
  } catch (error) {
    next(error);
  }
});

/**
 * Get a single client by ID
 */
router.get('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: {
        id,
        userId
      }
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.json(client);
  } catch (error) {
    next(error);
  }
});

/**
 * Create a new client
 */
router.post('/', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { name, email, phone, location, vatNumber, clientId } = req.body;

    if (!name) {
      return res.status(400).json({ error: 'Name is required' });
    }

    const client = await prisma.client.create({
      data: {
        userId,
        name,
        email: email || '',
        phone: phone || '',
        location: location || '',
        vatNumber: vatNumber || '',
        clientId: clientId || null
      }
    });

    res.status(201).json(client);
  } catch (error) {
    next(error);
  }
});

/**
 * Update a client
 */
router.put('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const { name, email, phone, location, vatNumber } = req.body;

    const client = await prisma.client.findFirst({
      where: { id, userId }
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const updated = await prisma.client.update({
      where: { id },
      data: {
        name,
        email: email || '',
        phone: phone || '',
        location: location || '',
        vatNumber: vatNumber || ''
      }
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});

/**
 * Delete a client
 */
router.delete('/:id', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;

    const client = await prisma.client.findFirst({
      where: { id, userId }
    });

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    await prisma.client.delete({
      where: { id }
    });

    res.json({ message: 'Client deleted successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * Batch import clients
 */
router.post('/batch', async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { clients } = req.body;

    if (!Array.isArray(clients)) {
      return res.status(400).json({ error: 'Clients must be an array' });
    }

    const created = await prisma.$transaction(
      clients.map(client =>
        prisma.client.create({
          data: {
            userId,
            ...client
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
