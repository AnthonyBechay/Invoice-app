/**
 * Global error handler middleware
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error:', err);

  // Firebase Admin errors
  if (err.code && err.code.startsWith('auth/')) {
    return res.status(401).json({ error: err.message });
  }

  // Validation errors
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // Default to 500 server error
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error'
  });
};
