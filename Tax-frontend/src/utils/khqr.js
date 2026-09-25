import QRCode from 'qrcode';
import { BakongKHQR, khqrData, IndividualInfo } from 'bakong-khqr';

const CURRENCY_CODES = Object.freeze({
  USD: khqrData.currency.usd || '840',
  KHR: khqrData.currency.khr || '116',
  usd: khqrData.currency.usd || '840',
  khr: khqrData.currency.khr || '116',
  '840': khqrData.currency.usd || '840',
  '116': khqrData.currency.khr || '116',
});

function currencyCode(currency) {
  const code = CURRENCY_CODES[currency];
  if (!code) throw new Error('Currency must be USD or KHR');
  return code;
}

function cleanAccountIdentifier(accountIdentifier) {
  const account = String(accountIdentifier || '').trim().replace(/\s+/g, '');
  if (/^[^@\s]{1,32}@[a-z0-9]{4,12}$/i.test(account)) return account;
  throw new Error('Enter a Bakong Account ID such as merchant@abaa or merchant@aclb');
}

function createSdkPayload({ accountIdentifier, merchantName, amount, currency, billNo, storeLabel }) {
  const account = cleanAccountIdentifier(accountIdentifier);
  const code = currencyCode(currency);
  const optional = {
    currency: code,
    amount: Number(amount),
    billNumber: String(billNo || 'POS').slice(0, 25),
    storeLabel: String(storeLabel || '').trim().slice(0, 25) || undefined,
    expirationTimestamp: Date.now() + 15 * 60 * 1000,
  };
  const sdk = new BakongKHQR();
  const response = sdk.generateIndividual(new IndividualInfo(
    account,
    String(merchantName || 'Merchant').trim().toUpperCase().slice(0, 25),
    'Phnom Penh',
    optional,
  ));
  const payload = response?.data?.qr || response?.qr;
  if (!payload || !BakongKHQR.verify(payload).isValid) throw new Error('Bakong SDK returned an invalid KHQR payload');
  return payload;
}

export async function generatePayableKhqr(options) {
  const normalized = { ...options, accountIdentifier: cleanAccountIdentifier(options.accountIdentifier), currency: currencyCode(options.currency) };
  const payload = createSdkPayload(normalized);
  if (!BakongKHQR.verify(payload).isValid) throw new Error('Generated KHQR failed validation');
  const dataUrl = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 360,
    color: { dark: '#111827', light: '#ffffff' },
  });
  return { payload, dataUrl };
}

export async function generateKhqrDataUrl(options) {
  return generatePayableKhqr({
    ...options,
    accountIdentifier: options.accountIdentifier || options.merchantId,
    amount: options.amount ?? (options.amountKhr && !options.amountUsd ? options.amountKhr : options.amountUsd),
    currency: options.currency || (options.amountKhr && !options.amountUsd ? 'KHR' : 'USD'),
    billNo: options.billNo || options.reference,
  });
}
