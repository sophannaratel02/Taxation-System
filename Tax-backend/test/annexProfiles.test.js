const assert = require('node:assert/strict');
const test = require('node:test');
const companyController = require('../src/controllers/company.controller');
const registrationController = require('../src/controllers/registration.controller');
const { authenticate } = require('../src/middleware/auth');
const { emailVerificationEmail } = require('../src/config/mailer');
const { prepareCompanyProfile, prepareRegistration } = require('../src/services/annexProfiles');

test('registration payload validates compulsory fields and retains voluntary fields', () => {
  const staffRegistration = prepareRegistration({
    name: 'Rina Sok',
    username: 'rina.sok',
    email: 'RINA@example.test',
    password: 'secure-password',
  });
  assert.equal(staffRegistration.name, 'Rina Sok');
  assert.equal(staffRegistration.firstName, 'Rina');
  assert.equal(staffRegistration.lastName, 'Sok');
  assert.equal(staffRegistration.username, 'rina.sok');
  assert.equal(staffRegistration.email, 'rina@example.test');
  assert.equal(staffRegistration.enterpriseName, 'Rina Sok');
  assert.equal(staffRegistration.officePhone, null);
  assert.equal(staffRegistration.position, null);
  assert.equal(staffRegistration.officialAddress, null);
  assert.equal(staffRegistration.website, null);
  const usernameOptionalRegistration = prepareRegistration({
    name: 'Rina Sok',
    email: 'rina@example.test',
    password: 'secure-password',
  });
  assert.match(usernameOptionalRegistration.username, /^account-[0-9a-f-]{36}$/);
  assert.ok(Object.values(staffRegistration).every((value) => value !== undefined));
  assert.throws(() => prepareRegistration({
    name: 'Rina Sok',
    username: 'rina.sok',
    email: 'rina@example.test',
    password: 'secure-password',
    role: 'admin',
  }), /Unrecognized key: "role"/);
  assert.throws(() => prepareRegistration({
    name: 'Rina Sok',
    username: 'rina.sok',
    email: 'rina@example.test',
    password: 'secure-password',
    company_id: 1,
  }), /Unrecognized key: "company_id"/);

  const registration = prepareRegistration({
    first_name: 'Rina',
    last_name: 'Sok',
    enterprise_name: 'Example Trading',
    office_phone: '+855 12 345 678',
    email: 'RINA@example.test',
    password: 'secure-password',
    position: 'Managing Director',
    official_address: 'Phnom Penh',
    website: 'https://example.test',
  });
  assert.equal(registration.name, 'Rina Sok');
  assert.equal(registration.email, 'rina@example.test');
  assert.equal(registration.enterpriseName, 'Example Trading');
  assert.equal(registration.position, 'Managing Director');
  assert.equal(registration.website, 'https://example.test');
  assert.throws(() => prepareRegistration({ first_name: 'Rina', last_name: 'Sok' }), /Enterprise name is required/);
  assert.throws(() => prepareRegistration({
    first_name: 'Rina', last_name: 'Sok', enterprise_name: 'Example',
    office_phone: '1234567', email: 'person@example.test', password: 'short',
  }), /between 8 and 128 characters/);
  assert.throws(() => prepareRegistration({
    first_name: 'Rina', last_name: 'Sok', enterprise_name: 'Example',
    office_phone: '1234567', email: 'person@example.test', password: 'secure-password', website: 'javascript:alert(1)',
  }), /http:\/\/ or https:\/\//);
});

test('company profile requires valid TIN, date, phone, official email, and all official fields', () => {
  const payload = {
    enterprise_name: 'Example Trading',
    tin: '  123-ABC  ',
    tax_registered_date: new Date().toISOString().slice(0, 10),
    director_name: 'Rina Sok',
    business_activity: 'Wholesale',
    accountant_name: 'Example Accounting',
    registered_address: 'Phnom Penh',
    office_phone: '+855 12 345 678',
    official_email: 'accounts@example.test',
  };
  const profile = prepareCompanyProfile(payload);
  assert.equal(profile.tin, '123-ABC');
  assert.equal(profile.officialEmail, 'accounts@example.test');
  assert.throws(() => prepareCompanyProfile({ ...payload, tin: '!' }), /TIN format is invalid/);
  assert.throws(() => prepareCompanyProfile({ ...payload, tax_registered_date: '2026-02-30' }), /Tax registration date must be a valid date/);
  assert.throws(() => prepareCompanyProfile({ ...payload, office_phone: '123' }), /6 to 20 digits/);
  assert.throws(() => prepareCompanyProfile({ ...payload, official_email: 'invalid' }), /valid email address/);
});

test('verification email escapes user-controlled HTML and includes the verification URL', () => {
  const html = emailVerificationEmail('https://example.test/verify-email?token=abc', '<Rina>');
  assert.match(html, /&lt;Rina&gt;/);
  assert.match(html, /https:\/\/example\.test\/verify-email\?token=abc/);
  assert.doesNotMatch(html, /<Rina>/);
});

test('registration and email verification routes are present, and company profile requires authentication', () => {
  assert.ok(registrationController.stack.some((layer) => layer.route?.path === '/register' && layer.route.methods.post));
  assert.ok(registrationController.stack.some((layer) => layer.route?.path === '/verify-email' && layer.route.methods.get));
  assert.ok(companyController.stack.some((layer) => !layer.route && layer.handle === authenticate));
  assert.ok(companyController.stack.some((layer) => layer.route?.path === '/profile' && layer.route.methods.get));
  assert.ok(companyController.stack.some((layer) => layer.route?.path === '/profile' && layer.route.methods.put));
});
