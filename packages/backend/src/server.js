import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';

// Import middleware
import { verifyToken } from './middleware/auth.js';
import { errorHandler } from './middleware/errorHandler.js';

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
  'https://wealthlogs.com',
  'https://www.wealthlogs.com',
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

// Handle OPTIONS requests explicitly BEFORE any other middleware
// This ensures OPTIONS requests never hit auth middleware or cause errors
app.options('*', (req, res) => {
  res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Origin');
  res.header('Access-Control-Allow-Credentials', 'true');
  res.header('Access-Control-Max-Age', '86400');
  res.sendStatus(200);
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting - increased limits to handle multiple users behind same IP (e.g., Render proxy)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // Increased from 100 to 500 requests per windowMs per IP (handles multiple users)
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.',
  // Skip rate limiting for health checks and OPTIONS requests
  skip: (req) => req.path === '/health' || req.method === 'OPTIONS'
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
// Skip auth for OPTIONS requests
const skipAuthForOptions = (req, res, next) => {
  if (req.method === 'OPTIONS') {
    return next();
  }
  return verifyToken(req, res, next);
};

app.use('/api/clients', skipAuthForOptions, clientsRoutes);
app.use('/api/suppliers', skipAuthForOptions, suppliersRoutes);
app.use('/api/stock', skipAuthForOptions, stockRoutes);
app.use('/api/documents', skipAuthForOptions, documentsRoutes);
app.use('/api/payments', skipAuthForOptions, paymentsRoutes);
app.use('/api/expenses', skipAuthForOptions, expensesRoutes);
app.use('/api/settings', skipAuthForOptions, settingsRoutes);
app.use('/api/admin', skipAuthForOptions, adminRoutes);

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

// Handle unhandled promise rejections - log but don't crash immediately
process.on('unhandledRejection', (err, promise) => {
  console.error('Unhandled Promise Rejection at:', promise, 'reason:', err);
  // Log the error but don't exit - let the server continue running
  // The error handler middleware will catch errors in request handlers
});

// Handle uncaught exceptions - log and exit gracefully
process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // For uncaught exceptions, we should exit as the process is in an unknown state
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});
