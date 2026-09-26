const express = require('express');
const cors = require('cors');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || configuredOrigins.length === 0 || configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    const isLocalFrontend = /^https?:\/\/(localhost|127\.0\.0\.1):5173$/.test(origin);
    callback(null, isLocalFrontend);
  },
}));
app.use(express.json());
app.use('/api', apiRoutes);

app.use(errorHandler);

module.exports = app;
