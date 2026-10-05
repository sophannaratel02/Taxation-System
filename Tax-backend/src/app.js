const express = require('express');
const cors = require('cors');
const { isProduction } = require('./config/runtime');
const apiRoutes = require('./routes/api');
const errorHandler = require('./middleware/errorHandler');

const app = express();
const configuredOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowLocalDevOrigin = (origin) => /^https?:\/\/(localhost|127\.0\.0\.1):(5173|4173)$/.test(origin);

app.use(cors({
  origin(origin, callback) {
    if (!origin) {
      callback(null, true);
      return;
    }

    if (configuredOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    if (!isProduction() && allowLocalDevOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  credentials: true,
}));
app.use(express.json());
app.use('/api', apiRoutes);

app.use(errorHandler);

module.exports = app;
