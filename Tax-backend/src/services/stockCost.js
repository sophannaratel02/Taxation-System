function branchFilter(column, branches) {
  if (branches === null) return { condition: '', params: [] };
  if (!branches.length) return { condition: ' AND 1 = 0', params: [] };
  return { condition: ` AND ${column} IN (?)`, params: [branches] };
}

function movementCostExpression(movementAlias = 'movement', itemAlias = 'item', branchStockAlias = 'branch_cost') {
  return `COALESCE(NULLIF(${movementAlias}.unit_cost, 0), NULLIF(${branchStockAlias}.avg_cost, 0), NULLIF(${itemAlias}.average_cost, 0), NULLIF(${itemAlias}.purchase_cost, 0), 0)`;
}

async function backfillZeroCostAdjustments(connection) {
  await connection.query(
    `UPDATE stock_transactions movement
     JOIN inventory_batches batch
       ON batch.item_id = movement.item_id
      AND batch.branch = movement.branch
      AND batch.batch_no = movement.reference
     SET movement.unit_cost = batch.unit_cost
     WHERE movement.type = 'Adjustment'
       AND movement.qty > 0
       AND (movement.unit_cost IS NULL OR movement.unit_cost = 0)
       AND movement.reference LIKE 'OPENING-%'`
  );
  await connection.query(
    `UPDATE stock_transactions movement
     JOIN items item ON item.id = movement.item_id
     LEFT JOIN item_branch_stock branch_cost
       ON branch_cost.item_id = movement.item_id
      AND branch_cost.branch = movement.branch
     SET movement.unit_cost = ${movementCostExpression('movement', 'item', 'branch_cost')}
     WHERE movement.type = 'Adjustment'
       AND (movement.unit_cost IS NULL OR movement.unit_cost = 0)`
  );
}

module.exports = { backfillZeroCostAdjustments, branchFilter, movementCostExpression };
