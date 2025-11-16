/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  // Log error with more context
  console.error('Error occurred:', {
    message: err.message,
    name: err.name,
    stack: err.stack,
    path: req.path,
    method: req.method,
    status: err.status || err.statusCode
  });

  // If response was already sent, delegate to default Express error handler
  if (res.headersSent) {
    return next(err);
  }

  // Authentication errors
  if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  // Prisma errors
  if (err.code && err.code.startsWith('P')) {
    // Prisma error codes start with P
    console.error('Prisma error:', err.code, err.meta);
    
    // Handle specific Prisma errors
    if (err.code === 'P2002') {
      return res.status(409).json({ error: 'A record with this value already exists' });
    }
    if (err.code === 'P2025') {
      return res.status(404).json({ error: 'Record not found' });
    }
    if (err.code === 'P1001' || err.code === 'P1002' || err.code === 'P1008') {
      return res.status(503).json({ error: 'Database connection error. Please try again later.' });
    }
    
    // Generic Prisma error
    return res.status(500).json({ 
      error: 'Database error occurred',
      ...(process.env.NODE_ENV === 'development' && { details: err.message })
    });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // Rate limit errors
  if (err.status === 429) {
    return res.status(429).json({ error: err.message || 'Too many requests' });
  }

  // Determine status code
  const statusCode = err.status || err.statusCode || 500;

  // Don't expose internal error details in production
  const errorMessage = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : (err.message || 'Internal server error');

  res.status(statusCode).json({
    error: errorMessage,
    ...(process.env.NODE_ENV === 'production' && { 
      stack: err.stack,
      details: err 
    })
  });
};
