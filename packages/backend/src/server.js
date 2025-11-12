import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Import middleware
import { verifyToken } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';
import { cacheMiddleware } from './middleware/cache.js';

// Import routes
import authRoutes from './routes/auth.js';
import clientsRoutes from './routes/clients.js';
import suppliersRoutes from './routes/suppliers.js';
import stockRoutes from './routes/stock.js';
import documentsRoutes from './routes/documents.js';
import paymentsRoutes from './routes/payments.js';
import expensesRoutes from './routes/expenses.js';
import settingsRoutes from './routes/settings.js';
import adminRoutes from './routes/admin.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy - important for Render deployment
app.set('trust proxy', 1);

// Security middleware - configure helmet to not interfere with CORS
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration - comprehensive setup
const allowedOrigins = [
  'http://localhost:3000',
  'https://invoice-app-xi-neon.vercel.app',
  process.env.FRONTEND_URL
].filter(Boolean);

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // Log for debugging
      console.log(`CORS: Request from origin ${origin} - allowing (permissive mode)`);
      // Allow all origins (permissive approach for production)
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range'],
  optionsSuccessStatus: 200,
  preflightContinue: false,
  maxAge: 86400 // 24 hours
};

// Apply CORS middleware - this handles both preflight and regular requests
app.use(cors(corsOptions));

// Additional explicit OPTIONS handler as fallback (in case CORS middleware doesn't catch it)
app.options('*', cors(corsOptions));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', limiter);

// Health check endpoint (no auth required)
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
// Auth routes (public - no authentication required)
app.use('/api/auth', authRoutes);

// Protected routes (require authentication)
// Apply caching middleware to GET routes (5 minute cache)
app.use('/api/clients', verifyToken, cacheMiddleware(300), clientsRoutes);
app.use('/api/suppliers', verifyToken, cacheMiddleware(300), suppliersRoutes);
app.use('/api/stock', verifyToken, cacheMiddleware(300), stockRoutes);
app.use('/api/documents', verifyToken, cacheMiddleware(300), documentsRoutes);
app.use('/api/payments', verifyToken, cacheMiddleware(300), paymentsRoutes);
app.use('/api/expenses', verifyToken, cacheMiddleware(300), expensesRoutes);
app.use('/api/settings', verifyToken, cacheMiddleware(300), settingsRoutes);
app.use('/api/admin', verifyToken, adminRoutes); // No caching for admin routes

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🌐 CORS enabled for: ${corsOptions.origin}`);
  console.log(`🔐 JWT authentication enabled`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  process.exit(1);
});
