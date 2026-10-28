function errorHandler(error, req, res, next) {
  console.error(error);
  const requestedStatus = Number(error.statusCode || error.status);
  const status = Number.isInteger(requestedStatus) && requestedStatus >= 400 && requestedStatus <= 599
    ? requestedStatus
    : 500;
  res.status(status).json({
    message: status < 500 ? error.message : 'Server error',
    detail: process.env.NODE_ENV === 'development' ? error.message : undefined,
  });
}

module.exports = errorHandler;
