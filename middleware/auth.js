const jwt = require('jsonwebtoken');
const pool = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET;

const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader?.split(' ')[1];

  if (!token) {
    console.warn(
      `🚨 Missing authentication token: userId=unknown, email=unknown, ip=${req.ip}, path=${req.originalUrl}`
    );
    return res.status(401).json({ message: 'Authentication token required' });
  }

  let decoded;
  try {
    decoded = jwt.verify(token, JWT_SECRET);
  } catch (err) {
    console.warn(
      `🚨 JWT verification failed: error=${err.message}, ip=${req.ip}, path=${req.originalUrl}`
    );
    return res.status(403).json({ message: 'Invalid or expired token' });
  }

  let conn;
  try {
    conn = await pool.getConnection();

    const [user] = await conn.query(
      `SELECT id, name, email, is_admin, active, subscription, tokens_per_day, tokens_remaining 
       FROM users 
       WHERE id = ? LIMIT 1`,
      [decoded.id]
    );

    if (!user) {
      console.warn(
        `🚨 User not found: userId=${decoded.id}, ip=${req.ip}, path=${req.originalUrl}`
      );
      return res.status(401).json({ message: 'User not found' });
    }

    if (!user.active) {
      console.warn(
        `🚨 Inactive account access attempt: userId=${user.id}, email=${user.email}, ip=${req.ip}, path=${req.originalUrl}`
      );
      return res.status(403).json({ message: 'User account is inactive' });
    }

    // Log successful authentication (optional for monitoring purposes)
    console.log(
      `✅ User authenticated successfully: userId=${user.id}, email=${user.email}, ip=${req.ip}, path=${req.originalUrl}`
    );
    
    req.user = user;
    next();
  } catch (err) {
    console.error(
      `🚨 Database error in authenticateToken: error=${err.message}, ip=${req.ip}, path=${req.originalUrl}`
    );
    return res.status(500).json({ message: 'Internal server error' });
  } finally {
    if (conn) conn.release();
  }
};

module.exports = authenticateToken;
