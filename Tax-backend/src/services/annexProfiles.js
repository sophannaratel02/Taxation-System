const { z } = require('zod');
const { randomUUID } = require('node:crypto');
const { requestError, validateDate } = require('./accountingLedger');

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_PATTERN = /^[+\d().\-\s]+$/;
const TIN_PATTERN = /^[A-Za-z0-9][A-Za-z0-9./\-\s]{1,79}$/;

function phoneIsValid(value) {
  if (typeof value !== 'string') return false;
  const digits = value.replace(/\D/g, '');
  return PHONE_PATTERN.test(value) && digits.length >= 6 && digits.length <= 20;
}

function optionalString(maxLength) {
  return z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string().trim().max(maxLength).nullable()
  ).default(null);
}

function splitFullName(fullName) {
  const trimmed = fullName.trim();
  const match = trimmed.match(/^(\S+)(?:\s+(.*))?$/);
  return {
    firstName: match ? match[1] : trimmed,
    lastName: match && match[2] ? match[2].trim() : null,
  };
}

// Reusable Primitive Schemas
const emailSchema = (fieldName = 'Email') =>
  z.string({ required_error: `${fieldName} is required` })
    .trim()
    .max(255, `${fieldName} cannot exceed 255 characters`)
    .toLowerCase()
    .refine((val) => EMAIL_PATTERN.test(val), `${fieldName} must be a valid email address`);

const phoneSchema = (fieldName = 'Office phone') =>
  z.string({ required_error: `${fieldName} is required` })
    .trim()
    .min(1, `${fieldName} is required`)
    .max(60, `${fieldName} cannot exceed 60 characters`)
    .refine(phoneIsValid, `${fieldName} must contain 6 to 20 digits and only valid phone characters`);

const registrationPassword = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be between 8 and 128 characters')
  .max(128, 'Password must be between 8 and 128 characters');

// Registration Schemas
const staffRegistrationSchema = z.object({
  name: z.string({ required_error: 'Name is required' }).trim().min(1, 'Name is required').max(120, 'Name cannot exceed 120 characters'),
  username: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.string()
      .trim()
      .min(3, 'Username must be at least 3 characters')
      .max(254, 'Username cannot exceed 254 characters')
      .refine((value) => !/\s/.test(value), 'Username cannot contain spaces')
      .optional()
  ),
  email: emailSchema('Email'),
  password: registrationPassword,
}).strict();

const profileRegistrationSchema = z.object({
  first_name: z.string({ required_error: 'First name is required' }).trim().min(1, 'First name is required').max(100, 'First name cannot exceed 100 characters'),
  last_name: z.string({ required_error: 'Last name is required' }).trim().min(1, 'Last name is required').max(100, 'Last name cannot exceed 100 characters'),
  enterprise_name: z.string({ required_error: 'Enterprise name is required' }).trim().min(1, 'Enterprise name is required').max(180, 'Enterprise name cannot exceed 180 characters'),
  office_phone: phoneSchema('Office phone'),
  email: emailSchema('Email'),
  password: registrationPassword,
  position: optionalString(160),
  official_address: optionalString(5000),
  website: z.preprocess(
    (value) => (value === '' || value === undefined ? null : value),
    z.string()
      .trim()
      .max(255, 'Website cannot exceed 255 characters')
      .nullable()
      .refine((value) => {
        if (value === null) return true;
        try {
          const parsed = new URL(value);
          return ['http:', 'https:'].includes(parsed.protocol) && Boolean(parsed.hostname);
        } catch {
          return false;
        }
      }, 'Website must be a valid URL beginning with http:// or https://')
  ).default(null),
}).strict();

// Company Profile Schema
const companyProfileSchema = z.object({
  enterprise_name: z.string({ required_error: 'Enterprise name is required' }).trim().min(1, 'Enterprise name is required').max(180, 'Enterprise name cannot exceed 180 characters'),
  tin: z.string({ required_error: 'TIN is required' })
    .trim()
    .min(1, 'TIN is required')
    .max(80, 'TIN cannot exceed 80 characters')
    .refine((value) => TIN_PATTERN.test(value), 'TIN format is invalid. It must contain 2 to 80 letters, numbers, spaces, or . / - characters.'),
  tax_registered_date: z.string({ required_error: 'Tax registration date is required' }).refine((value) => {
    try {
      return validateDate(value) <= new Date().toISOString().slice(0, 10);
    } catch {
      return false;
    }
  }, 'Tax registration date must be a valid date that is not in the future.'),
  director_name: z.string({ required_error: 'Director / manager / owner name is required' }).trim().min(1, 'Director / manager / owner name is required').max(180, 'Director name cannot exceed 180 characters'),
  business_activity: z.string({ required_error: 'Main business activities are required' }).trim().min(1, 'Main business activities are required').max(5000, 'Business activities cannot exceed 5000 characters'),
  accountant_name: z.string({ required_error: 'Accountant / consultant name is required' }).trim().min(1, 'Accountant / consultant name is required').max(180, 'Accountant name cannot exceed 180 characters'),
  registered_address: z.string({ required_error: 'Registered office address is required' }).trim().min(1, 'Registered office address is required').max(5000, 'Registered address cannot exceed 5000 characters'),
  office_phone: phoneSchema('Office phone'),
  official_email: emailSchema('Official email'),
}).strict();

function parsePayload(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw requestError(400, result.error.issues[0].message);
  }
  return result.data;
}

function prepareRegistration(body) {
  const isStaffRegistration = Boolean(
    body && typeof body === 'object' && ('name' in body || 'username' in body)
  );

  const schema = isStaffRegistration ? staffRegistrationSchema : profileRegistrationSchema;
  const input = parsePayload(schema, body);

  if (isStaffRegistration) {
    const { firstName, lastName } = splitFullName(input.name);
    return {
      firstName,
      lastName,
      name: input.name,
      username: input.username || `account-${randomUUID()}`,
      enterpriseName: input.name,
      officePhone: null,
      email: input.email,
      password: input.password,
      position: null,
      officialAddress: null,
      website: null,
    };
  }

  return {
    firstName: input.first_name,
    lastName: input.last_name,
    name: `${input.first_name} ${input.last_name}`.trim().slice(0, 120),
    username: input.email,
    enterpriseName: input.enterprise_name,
    officePhone: input.office_phone,
    email: input.email,
    password: input.password,
    position: input.position ?? null,
    officialAddress: input.official_address ?? null,
    website: input.website ?? null,
  };
}

function prepareCompanyProfile(body) {
  const input = parsePayload(companyProfileSchema, body);
  return {
    enterpriseName: input.enterprise_name,
    tin: input.tin.toUpperCase(),
    taxRegisteredDate: input.tax_registered_date,
    directorName: input.director_name,
    businessActivity: input.business_activity,
    accountantName: input.accountant_name,
    registeredAddress: input.registered_address,
    officePhone: input.office_phone,
    officialEmail: input.official_email,
  };
}

module.exports = {
  prepareCompanyProfile,
  prepareRegistration,
  staffRegistrationSchema,
  profileRegistrationSchema,
  companyProfileSchema,
};