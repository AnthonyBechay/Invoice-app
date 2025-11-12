/**
 * Admin middleware - restricts access to admin email only
 */
export const requireAdmin = (req, res, next) => {
  const adminEmail = 'anthonybechay1@gmail.com';
  
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  if (req.user.email !== adminEmail) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

