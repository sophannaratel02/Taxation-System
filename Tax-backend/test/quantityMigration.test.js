const assert = require('node:assert/strict');
const test = require('node:test');
const { migrateQuantitiesToIntegers } = require('../src/db');

function createQuantityMigrationDatabase({ minorDrift = [], significantFractions = [] } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, params = []) {
      statements.push({ sql, params });

      if (sql.includes('information_schema.COLUMNS')) {
        const [, tableName, columnName] = params;
        const hasLegacyDecimal = (
          tableName === 'invoice_lines' && columnName === 'qty'
        ) || (
          tableName === 'stock_transactions' && columnName === 'balance_after'
        );
        return [hasLegacyDecimal ? [{ DATA_TYPE: 'decimal', NUMERIC_SCALE: 3 }] : []];
      }

      const table = sql.match(/(?:FROM|UPDATE) `([^`]+)`/)?.[1];
      const column = sql.match(/`([^`]+)` AS quantity/)?.[1]
        || sql.match(/WHERE `([^`]+)` <>/)?.[1];
      const key = `${table}.${column}`;

      if (sql.includes('AS quantity')) {
        return [significantFractions
          .filter((fraction) => `${fraction.table}.${fraction.column}` === key)
          .slice(0, 5)
          .map((fraction) => ({ id: fraction.id, quantity: fraction.quantity }))];
      }

      if (sql.includes('COUNT(*) AS count')) {
        const count = minorDrift
          .filter((fraction) => `${fraction.table}.${fraction.column}` === key)
          .length;
        return [[{ count }]];
      }

      if (sql.startsWith('UPDATE')) {
        const count = minorDrift
          .filter((fraction) => `${fraction.table}.${fraction.column}` === key)
          .length;
        return [{ affectedRows: count }];
      }

      if (sql.startsWith('ALTER TABLE')) return [{ affectedRows: 0 }];
      throw new Error(`Unexpected migration query: ${sql}`);
    },
  };
}

test('quantity migration rounds only tiny drift before converting columns to whole units', async () => {
  const database = createQuantityMigrationDatabase({
    minorDrift: [
      { table: 'invoice_lines', column: 'qty', quantity: 2.002 },
      { table: 'stock_transactions', column: 'balance_after', quantity: 747.998 },
    ],
  });
  const originalWarn = console.warn;
  const warnings = [];
  console.warn = (message) => warnings.push(message);

  try {
    await migrateQuantitiesToIntegers(database);
  } finally {
    console.warn = originalWarn;
  }

  const updates = database.statements.filter(({ sql }) => sql.startsWith('UPDATE'));
  const alters = database.statements.filter(({ sql }) => sql.startsWith('ALTER TABLE'));
  assert.equal(updates.length, 2);
  assert.ok(updates.every(({ params }) => params[0] === 0.005));
  assert.equal(alters.length, 2);
  assert.match(warnings[0], /Rounded 2 quantity value\(s\)/);
});

test('quantity migration refuses meaningful fractional quantities without changing data', async () => {
  const database = createQuantityMigrationDatabase({
    significantFractions: [{
      table: 'invoice_lines',
      column: 'qty',
      id: 55,
      quantity: 2.25,
    }],
  });

  await assert.rejects(
    migrateQuantitiesToIntegers(database),
    /exceed the 0\.005 rounding tolerance.*invoice_lines\.qty: id=55=2\.25/
  );
  assert.equal(
    database.statements.some(({ sql }) => sql.startsWith('UPDATE') || sql.startsWith('ALTER TABLE')),
    false
  );
});
