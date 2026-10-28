function purchaseReturnError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function preparePurchaseReturnLines(requestedLines, purchaseOrderLines) {
  if (!Array.isArray(requestedLines) || requestedLines.length === 0) {
    throw purchaseReturnError(400, 'Select at least one item and quantity to return');
  }
  if (!Array.isArray(purchaseOrderLines)) {
    throw purchaseReturnError(500, 'Purchase order items could not be loaded');
  }

  const linesById = new Map(purchaseOrderLines.map((line) => [Number(line.id), line]));
  const seenLineIds = new Set();

  return requestedLines.map((requested) => {
    const lineId = Number(requested?.purchaseOrderItemId);
    if (!Number.isInteger(lineId) || lineId < 1 || seenLineIds.has(lineId)) {
      throw purchaseReturnError(400, 'Each returned item must reference a unique purchase order line');
    }
    seenLineIds.add(lineId);

    const line = linesById.get(lineId);
    if (!line) throw purchaseReturnError(400, 'A selected item does not belong to this purchase order');
    if (!Number.isInteger(Number(line.item_id)) || Number(line.item_id) < 1) {
      throw purchaseReturnError(409, `The purchase order line for ${line.product_name} is not linked to inventory`);
    }

    const quantity = Number(requested.quantity);
    const receivedQuantity = Number(line.qty);
    const previouslyReturned = Number(line.qty_returned || 0);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw purchaseReturnError(400, 'Return quantity must be a positive whole number');
    }
    if (!Number.isSafeInteger(receivedQuantity) || receivedQuantity <= 0
      || !Number.isSafeInteger(previouslyReturned) || previouslyReturned < 0) {
      throw purchaseReturnError(409, `The received quantity for ${line.product_name} is invalid`);
    }
    if (previouslyReturned + quantity > receivedQuantity) {
      throw purchaseReturnError(409, `Return quantity exceeds the remaining received quantity for ${line.product_name}`);
    }

    return { line, quantity };
  });
}

module.exports = { preparePurchaseReturnLines };
