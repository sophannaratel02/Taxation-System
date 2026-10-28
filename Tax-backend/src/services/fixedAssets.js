const { requestError, positiveId, validateDate } = require('./accountingLedger');

const CURRENCIES = new Set(['USD', 'KHR']);
const METHODS = new Set(['straight_line', 'declining']);

function prepareAssetClass(body) {
  const classCode = String(body.classCode || '').trim().toUpperCase();
  const className = String(body.className || '').trim();
  const description = String(body.description || '').trim();
  const depreciationMethod = String(body.depreciationMethod || '');
  const annualRate = Number(body.annualRate);

  if (!/^[A-Z0-9_-]{1,30}$/.test(classCode)) {
    throw requestError(400, 'Class code must contain 1 to 30 letters, numbers, hyphens, or underscores');
  }
  if (!className || className.length > 160) throw requestError(400, 'Class name is required and must be at most 160 characters');
  if (description.length > 500) throw requestError(400, 'Class description cannot exceed 500 characters');
  if (!METHODS.has(depreciationMethod)) throw requestError(400, 'Invalid depreciation method');
  if (!Number.isFinite(annualRate) || annualRate <= 0 || annualRate > 1) {
    throw requestError(400, 'Annual rate must be greater than 0 and at most 1');
  }

  return { classCode, className, description: description || null, depreciationMethod, annualRate };
}

function nonNegativeAmount(value, label, { allowZero = true } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0 || (!allowZero && amount === 0)) {
    throw requestError(400, `${label} must be ${allowZero ? 'a non-negative' : 'a positive'} number`);
  }
  const amountUnits = Math.round(amount * 10000);
  if (!Number.isSafeInteger(amountUnits) || Math.abs(amount * 10000 - amountUnits) > 1e-7) {
    throw requestError(400, `${label} cannot have more than 4 decimal places`);
  }
  return amount;
}

function optionalId(value, label) {
  return value === undefined || value === null || value === '' ? null : positiveId(value, label);
}

function prepareAsset(body) {
  const assetCode = String(body.assetCode || '').trim();
  const assetName = String(body.assetName || '').trim();
  const description = String(body.description || '').trim();
  const currency = String(body.currency || 'USD').toUpperCase();
  const vendorId = optionalId(body.vendorId, 'Vendor');
  const classId = positiveId(body.classId, 'Asset class');
  const assetAccountId = positiveId(body.assetAccountId, 'Asset account');
  const depreciationAccountId = positiveId(body.depreciationAccountId, 'Depreciation expense account');
  const accumulatedDepreciationAccountId = positiveId(body.accumulatedDepreciationAccountId, 'Accumulated depreciation account');
  const acquisitionDate = validateDate(body.acquisitionDate);
  const deploymentDate = validateDate(body.deploymentDate);
  const acquisitionValue = nonNegativeAmount(body.acquisitionValue, 'Acquisition value', { allowZero: false });
  const residualValue = nonNegativeAmount(body.residualValue ?? 0, 'Residual value');
  const accumulatedDepreciation = nonNegativeAmount(body.accumulatedDepreciation ?? 0, 'Accumulated depreciation');
  const manufacturerNumber = String(body.manufacturerNumber || '').trim();
  const invoiceNumber = String(body.invoiceNumber || '').trim();
  const location = String(body.location || '').trim();
  const custodian = String(body.custodian || '').trim();

  if (!assetCode || assetCode.length > 80) throw requestError(400, 'Asset code is required and must be at most 80 characters');
  if (!assetName || assetName.length > 180) throw requestError(400, 'Asset name is required and must be at most 180 characters');
  if (description.length > 1000) throw requestError(400, 'Description cannot exceed 1000 characters');
  if (!CURRENCIES.has(currency)) throw requestError(400, 'Currency must be USD or KHR');
  if (acquisitionDate > deploymentDate) throw requestError(400, 'Deployment date cannot be before the acquisition date');
  if (!location || location.length > 180) throw requestError(400, 'Location is required and must be at most 180 characters');
  if (!custodian || custodian.length > 180) throw requestError(400, 'Custodian is required and must be at most 180 characters');
  if (manufacturerNumber.length > 100 || invoiceNumber.length > 80) {
    throw requestError(400, 'Manufacturer number or invoice number exceeds its maximum length');
  }
  if (residualValue > acquisitionValue || accumulatedDepreciation > acquisitionValue - residualValue) {
    throw requestError(400, 'Residual and accumulated depreciation cannot exceed the acquisition value');
  }

  return {
    assetCode,
    assetName,
    description,
    classId,
    manufacturerNumber,
    invoiceNumber,
    location,
    custodian,
    vendorId,
    assetAccountId,
    depreciationAccountId,
    accumulatedDepreciationAccountId,
    currency,
    acquisitionDate,
    acquisitionValue,
    deploymentDate,
    residualValue,
    accumulatedDepreciation,
  };
}

function calculateMonthlyDepreciation({
  method,
  annualRate,
  acquisitionValue,
  residualValue = 0,
  accumulatedDepreciation = 0,
}) {
  if (!METHODS.has(method)) throw requestError(400, 'Unsupported depreciation method');
  const rate = Number(annualRate);
  const cost = Number(acquisitionValue);
  const residual = Number(residualValue);
  const accumulated = Number(accumulatedDepreciation);
  if (!Number.isFinite(rate) || rate <= 0 || rate > 1) throw requestError(400, 'Annual depreciation rate must be greater than 0 and at most 1');
  const bookValue = cost - accumulated;
  const depreciableValue = bookValue - residual;
  if (depreciableValue <= 0) return 0;

  const annualBase = method === 'straight_line' ? cost - residual : depreciableValue;
  return Math.min(depreciableValue, Math.round((annualBase * rate / 12) * 10000) / 10000);
}

function isMonthEnd(date) {
  const value = new Date(`${date}T00:00:00.000Z`);
  return value.getUTCDate() === new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + 1, 0)).getUTCDate();
}

module.exports = { calculateMonthlyDepreciation, isMonthEnd, prepareAsset, prepareAssetClass };
