import { PrismaClient } from '@prisma/client';

// Initialize Prisma Client with connection pooling optimization
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  datasources: {
    db: {
      url: process.env.DATABASE_URL
    }
  },
  // Connection pool configuration
  // These settings help optimize database connections
  // Adjust based on your database provider's recommendations
  errorFormat: 'pretty',
});

// Optimize connection pool for better performance
// Prisma automatically manages connection pooling, but we can configure it via DATABASE_URL
// Example: postgresql://user:password@host:port/database?connection_limit=10&pool_timeout=20

// Graceful shutdown
const gracefulShutdown = async () => {
  try {
    await prisma.$disconnect();
    console.log('Prisma Client disconnected');
  } catch (error) {
    console.error('Error disconnecting Prisma Client:', error);
  }
};

process.on('beforeExit', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

export default prisma;
