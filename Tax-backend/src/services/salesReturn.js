function returnError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function prepareSalesReturnLines(requestedLines, invoiceLines) {
  if (!Array.isArray(requestedLines) || requestedLines.length === 0) {
    throw returnError(400, 'Select at least one item and quantity to return');
  }
  if (!Array.isArray(invoiceLines)) {
    throw returnError(500, 'Invoice items could not be loaded');
  }

  const invoiceLinesById = new Map(invoiceLines.map((line) => [Number(line.id), line]));
  const seenLineIds = new Set();

  return requestedLines.map((requested) => {
    const lineId = Number(requested?.invoiceLineId);
    if (!Number.isInteger(lineId) || lineId < 1 || seenLineIds.has(lineId)) {
      throw returnError(400, 'Each returned item must reference a unique invoice line');
    }
    seenLineIds.add(lineId);

    const line = invoiceLinesById.get(lineId);
    if (!line) throw returnError(400, 'A selected item does not belong to this invoice');

    const quantity = Number(requested.quantity);
    const soldQuantity = Number(line.qty);
    const baseQuantity = Number(line.qty_base);
    const previouslyReturned = Number(line.qty_returned || 0);
    const previouslyReturnedBase = Number(line.qty_base_returned || 0);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) {
      throw returnError(400, 'Return quantity must be a positive whole number');
    }
    if (!Number.isSafeInteger(soldQuantity) || soldQuantity <= 0
      || !Number.isSafeInteger(baseQuantity) || baseQuantity <= 0) {
      throw returnError(409, 'This invoice line does not have a valid stock quantity');
    }
    if (!Number.isSafeInteger(previouslyReturned) || previouslyReturned < 0
      || !Number.isSafeInteger(previouslyReturnedBase) || previouslyReturnedBase < 0) {
      throw returnError(409, `Previous return quantity is invalid for ${line.item_name}`);
    }
    if (previouslyReturned + quantity > soldQuantity) {
      throw returnError(409, `Return quantity exceeds the remaining sold quantity for ${line.item_name}`);
    }

    const remainingQuantity = soldQuantity - previouslyReturned;
    const remainingBaseQuantity = baseQuantity - previouslyReturnedBase;
    const quantityBase = quantity >= remainingQuantity
      ? remainingBaseQuantity
      : baseQuantity / soldQuantity * quantity;
    if (!Number.isSafeInteger(quantityBase) || quantityBase <= 0) {
      throw returnError(400, `This partial return does not convert to a whole stock quantity for ${line.item_name}`);
    }
    if (previouslyReturnedBase + quantityBase > baseQuantity) {
      throw returnError(409, `Return quantity exceeds the remaining stock quantity for ${line.item_name}`);
    }
    const ratio = baseQuantity / soldQuantity;
    const unitCost = Number(line.cogs_unit_cost || line.unit_cost_at_sale || 0)
      || (ratio > 0 ? Number(line.cost_price || 0) / ratio : 0);

    return {
      line,
      quantity,
      quantityBase,
      unitCost: Number.isFinite(unitCost) && unitCost >= 0 ? unitCost : 0,
    };
  });
}

module.exports = { prepareSalesReturnLines };
