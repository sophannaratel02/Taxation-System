const assert = require('node:assert/strict');
const test = require('node:test');
const fixedAssetsController = require('../src/controllers/fixedAssets.controller');
const { authenticate, requireAdminForWrites } = require('../src/middleware/auth');
const {
  calculateMonthlyDepreciation,
  isMonthEnd,
  prepareAsset,
  prepareAssetClass,
} = require('../src/services/fixedAssets');

test('fixed asset reads require authentication and writes require administrator authorization', () => {
  const middleware = fixedAssetsController.stack
    .filter((layer) => !layer.route)
    .map((layer) => layer.handle);
  assert.ok(middleware.includes(authenticate));
  assert.ok(middleware.includes(requireAdminForWrites));
});

test('fixed asset payload validates references, dates, currency, and book value bounds', () => {
  const asset = prepareAsset({
    assetCode: 'VEH-001',
    assetName: 'Delivery vehicle',
    description: 'Delivery van',
    classId: '2',
    currency: 'USD',
    acquisitionDate: '2026-01-10',
    acquisitionValue: '10000.0000',
    deploymentDate: '2026-01-12',
    residualValue: '500',
    accumulatedDepreciation: '250',
    location: 'Main office',
    custodian: 'Operations',
    assetAccountId: '1',
    depreciationAccountId: '2',
    accumulatedDepreciationAccountId: '3',
  });
  assert.equal(asset.acquisitionValue, 10000);
  assert.equal(asset.classId, 2);
  assert.equal(asset.vendorId, null);
  assert.throws(() => prepareAsset({ ...asset, acquisitionDate: '2026-01-13' }), /cannot be before the acquisition date/);
  assert.throws(() => prepareAsset({ ...asset, residualValue: 10000 }), /cannot exceed the acquisition value/);
  assert.throws(() => prepareAsset({ ...asset, currency: 'EUR' }), /Currency must be USD or KHR/);
  assert.throws(() => prepareAsset({ ...asset, acquisitionValue: 1.00001 }), /4 decimal places/);
});

test('fixed asset classes can be created with validated company-specific setup values', () => {
  assert.deepEqual(prepareAssetClass({
    classCode: ' vehicle-1 ',
    className: 'Vehicles',
    description: 'Company-specific depreciation rate',
    depreciationMethod: 'straight_line',
    annualRate: '0.2',
  }), {
    classCode: 'VEHICLE-1',
    className: 'Vehicles',
    description: 'Company-specific depreciation rate',
    depreciationMethod: 'straight_line',
    annualRate: 0.2,
  });

  assert.throws(() => prepareAssetClass({ classCode: '', className: 'Vehicles', depreciationMethod: 'straight_line', annualRate: 0.2 }), /Class code/);
  assert.throws(() => prepareAssetClass({ classCode: 'VEHICLE', className: 'Vehicles', depreciationMethod: 'unknown', annualRate: 0.2 }), /Invalid depreciation method/);
  assert.throws(() => prepareAssetClass({ classCode: 'VEHICLE', className: 'Vehicles', depreciationMethod: 'straight_line', annualRate: 0 }), /Annual rate/);
});

test('monthly depreciation uses class method and never depreciates below residual value', () => {
  assert.equal(calculateMonthlyDepreciation({
    method: 'straight_line',
    annualRate: 0.12,
    acquisitionValue: 1000,
    residualValue: 100,
    accumulatedDepreciation: 0,
  }), 9);
  assert.equal(calculateMonthlyDepreciation({
    method: 'declining',
    annualRate: 0.12,
    acquisitionValue: 1000,
    residualValue: 0,
    accumulatedDepreciation: 0,
  }), 10);
  assert.equal(calculateMonthlyDepreciation({
    method: 'straight_line',
    annualRate: 0.12,
    acquisitionValue: 1000,
    residualValue: 100,
    accumulatedDepreciation: 899.5,
  }), 0.5);
  assert.equal(calculateMonthlyDepreciation({
    method: 'declining',
    annualRate: 0.12,
    acquisitionValue: 1000,
    residualValue: 100,
    accumulatedDepreciation: 900,
  }), 0);
});

test('depreciation period dates are checked against actual month ends', () => {
  assert.equal(isMonthEnd('2026-02-28'), true);
  assert.equal(isMonthEnd('2024-02-29'), true);
  assert.equal(isMonthEnd('2026-02-27'), false);
});
