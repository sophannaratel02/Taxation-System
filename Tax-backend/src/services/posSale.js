function roundToTwo(value) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

function hasAtMostDecimals(value, places) {
  const number = Number(value);
  const scale = 10 ** places;
  return Number.isFinite(number) && Math.abs(number * scale - Math.round(number * scale)) <= 1e-8;
}

function saleError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function assertRegisterOpen(register) {
  if (register) return;

  const error = new Error('Open a register for this branch before processing sales');
  error.status = 409;
  throw error;
}

function isOpenRegisterConflict(error) {
  const message = String(error?.sqlMessage || error?.message || '');
  return error?.code === 'ER_DUP_ENTRY'
    && message.includes('uq_cash_registers_open_branch');
}

function resolveSaleLine(line, item, { averageCost = item.average_cost ?? item.purchase_cost } = {}) {
  const requestedUnit = String(line.unit || item.base_unit).trim();
  let units = item.units;
  if (typeof units === 'string') {
    try {
      units = JSON.parse(units || '[]');
    } catch {
      units = [];
    }
  }
  if (!Array.isArray(units)) units = [];
  const unit = units.find((entry) => String(entry?.name || '').toLowerCase() === requestedUnit.toLowerCase());

  if (!unit && requestedUnit.toLowerCase() !== String(item.base_unit).toLowerCase()) {
    throw saleError(`Invalid unit for ${item.name_en}`);
  }

  const ratio = Number(unit?.ratio ?? 1);
  const catalogPrice = Number(unit?.retailPrice ?? item.retail_price);
  const cost = Number(averageCost) > 0 ? Number(averageCost) : Number(item.purchase_cost || 0);
  const markupAmount = Number(item.markup_amount ?? 0);
  const unitPrice = Number.isFinite(catalogPrice) && catalogPrice > 0
    ? catalogPrice
    : Number.isFinite(cost) && cost >= 0 && Number.isFinite(ratio) && ratio > 0
      && Number.isFinite(markupAmount) && markupAmount >= 0
      ? Number(((cost + markupAmount) * ratio).toFixed(4))
      : catalogPrice;
  const quantity = Number(line.qty);
  const discount = Number(line.discount ?? 0);
  if (!Number.isFinite(ratio) || ratio <= 0) throw saleError(`Invalid unit conversion for ${item.name_en}`);
  if (!Number.isFinite(unitPrice) || unitPrice < 0 || !hasAtMostDecimals(unitPrice, 4)) {
    throw saleError(`Invalid catalog price for ${item.name_en}`);
  }
  if (!Number.isSafeInteger(quantity) || quantity <= 0) {
    throw saleError(`Invalid quantity for ${item.name_en}; quantity must be a whole number`);
  }
  if (!Number.isFinite(discount) || discount < 0 || !hasAtMostDecimals(discount, 2)) {
    throw saleError(`Invalid discount for ${item.name_en}`);
  }

  const grossAmount = unitPrice * quantity;
  if (discount > grossAmount + 0.000001) {
    throw saleError(`Discount cannot exceed the line amount for ${item.name_en}`);
  }

  const stockDeductionQty = quantity * ratio;
  if (!Number.isSafeInteger(stockDeductionQty) || stockDeductionQty <= 0) {
    throw saleError(`The selected unit conversion for ${item.name_en} must produce a whole stock quantity`);
  }

  return {
    unit: requestedUnit,
    ratio,
    unitPrice,
    qty: quantity,
    discount: roundToTwo(discount),
    stockDeductionQty,
    grossAmount,
    lineNet: roundToTwo(grossAmount - discount),
  };
}

function validateCashTender(receivedUsdValue, receivedKhrValue, exchangeRate) {
  const receivedUSD = Number(receivedUsdValue ?? 0);
  const receivedKHR = Number(receivedKhrValue ?? 0);
  if (!Number.isFinite(receivedUSD) || receivedUSD < 0 || !hasAtMostDecimals(receivedUSD, 2)) {
    throw saleError('USD tender must be a non-negative amount with no more than 2 decimals');
  }
  if (!Number.isSafeInteger(receivedKHR) || receivedKHR < 0) {
    throw saleError('KHR tender must be a non-negative whole number');
  }
  const tenderedUSD = roundToTwo(receivedUSD + receivedKHR / exchangeRate);
  return { receivedUSD, receivedKHR, tenderedUSD };
}

module.exports = {
  assertRegisterOpen,
  isOpenRegisterConflict,
  hasAtMostDecimals,
  resolveSaleLine,
  roundToTwo,
  validateCashTender,
};
