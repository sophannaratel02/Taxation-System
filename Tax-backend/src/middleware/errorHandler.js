function errorHandler(error, req, res, next) {
  console.error(error);
  res.status(500).json({
    message: 'Server error',
    detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

module.exports = errorHandler;
