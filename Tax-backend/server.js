require('dotenv').config();
const app = require('./src/server');
const { initializeDatabase } = require('./src/db');

const port = Number(process.env.PORT || 4000);

initializeDatabase()
  .then(() => app.listen(port, () => console.log(`Taxation backend listening on http://localhost:${port}`)))
  .catch((error) => {
    console.error('Database initialization failed:', error.message);
    console.error('Set MYSQL_PASSWORD in Tax-backend/.env and run the server again.');
    process.exit(1);
  });
