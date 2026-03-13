const DEFAULT_RECEIPT_CODE = 'SABHA';
const RECEIPT_SEQUENCE_WIDTH = 4;

export const normalizeReceiptCode = (receiptCode) => {
  const value = String(receiptCode || '').trim();
  return value || DEFAULT_RECEIPT_CODE;
};

export const formatReceiptNumber = (receiptCode, sequenceNumber) => {
  const nextNumber = Number(sequenceNumber || 0);
  const paddedNumber = String(Math.max(nextNumber, 1)).padStart(RECEIPT_SEQUENCE_WIDTH, '0');
  return `${normalizeReceiptCode(receiptCode)}-${paddedNumber}`;
};

