const isAdmin = (req, res, next) => {
    if (!req.user?.is_admin) {
      console.warn(
        `🚨 Unauthorized admin access attempt: userId=${req.user?.id || 'unknown'}, email=${req.user?.email || 'unknown'}, ip=${req.ip}, path=${req.originalUrl}`
      );
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  };
  
  module.exports = isAdmin;
  

  //eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6MywiaWF0IjoxNzQ1MjQyMDYxLCJleHAiOjE3NDU4NDY4NjF9.ePySrfMgcMA7jJUAHj-eWhtJE_8hSohgVj7P8qvPbts