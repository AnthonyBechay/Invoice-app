import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/database.js';
import { JWT_SECRET } from '../middleware/auth.js';

const router = express.Router();

/**
 * Register a new user
 */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check if user already exists (case-insensitive)
    // Normalize email to lowercase for comparison
    const normalizedEmail = email.toLowerCase().trim();
    
    // Use raw query for case-insensitive email lookup (PostgreSQL ILIKE)
    const existingUsers = await prisma.$queryRaw`
      SELECT * FROM "User" WHERE LOWER(email) = LOWER(${normalizedEmail}) LIMIT 1
    `;
    
    if (existingUsers && existingUsers.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists. Please use a different email or try signing in.' });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user (store email in lowercase for consistency)
    const user = await prisma.user.create({
      data: {
        email: normalizedEmail,
        password: hashedPassword,
        name: name || ''
      },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      user,
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Login user
 */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user (case-insensitive email lookup)
    // Normalize email to lowercase for comparison
    const normalizedEmail = email.toLowerCase().trim();
    
    // Use raw query for case-insensitive email lookup (PostgreSQL ILIKE)
    const users = await prisma.$queryRaw`
      SELECT * FROM "User" WHERE LOWER(email) = LOWER(${normalizedEmail}) LIMIT 1
    `;
    
    const user = users && users.length > 0 ? users[0] : null;

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password. Please check your credentials and try again.' });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password. Please check your credentials and try again.' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        createdAt: user.createdAt
      },
      token
    });
  } catch (error) {
    next(error);
  }
});

/**
 * Get current user (requires authentication)
 */
router.get('/me', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user });
  } catch (error) {
    next(error);
  }
});

/**
 * Update password (requires authentication)
 */
router.put('/update-password', async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split('Bearer ')[1];
    const decoded = jwt.verify(token, JWT_SECRET);

    const { currentPassword, newPassword } = req.body;

    // Validate input
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required' });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    // Find user
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Verify current password
    const isValidPassword = await bcrypt.compare(currentPassword, user.password);

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Current password is incorrect' });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    // Update password
    await prisma.user.update({
      where: { id: decoded.userId },
      data: { password: hashedPassword }
    });

    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    next(error);
  }
});

/**
 * Logout (client-side only - just remove token)
 * This endpoint exists for consistency, but JWT logout is handled client-side
 */
router.post('/logout', (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

export default router;
