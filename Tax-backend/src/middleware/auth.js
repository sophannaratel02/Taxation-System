const jwt = require('jsonwebtoken');

const jwtSecret = process.env.JWT_SECRET || 'development-secret-change-me';

function authenticate(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ message: 'Authentication required' });

  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
}

function requireAdmin(req, res, next) {
  if (String(req.user?.role || '').toLowerCase() !== 'admin') {
    return res.status(403).json({ message: 'Admin access required' });
  }
  next();
}

module.exports = { authenticate, requireAdmin };
