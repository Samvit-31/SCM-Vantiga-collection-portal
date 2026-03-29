const DEFAULT_LOCALE = 'en-IN';

export const toAmountNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatAmountIndian = (value) => (
  new Intl.NumberFormat(DEFAULT_LOCALE, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(toAmountNumber(value))
);

export const formatCurrencyINR = (value) => (
  new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(toAmountNumber(value))
);

const integerToWordsIndian = (num) => {
  if (!num || num === 0) return 'Zero';

  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];

  const ltThousand = (n) => {
    if (n === 0) return '';
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    if (n < 100) {
      const t = Math.floor(n / 10);
      const o = n % 10;
      return tens[t] + (o ? ` ${ones[o]}` : '');
    }
    const h = Math.floor(n / 100);
    const r = n % 100;
    return `${ones[h]} Hundred${r ? ` ${ltThousand(r)}` : ''}`;
  };

  if (num < 1000) return ltThousand(num);
  if (num < 100000) {
    const th = Math.floor(num / 1000);
    const r = num % 1000;
    return `${ltThousand(th)} Thousand${r ? ` ${ltThousand(r)}` : ''}`;
  }
  if (num < 10000000) {
    const l = Math.floor(num / 100000);
    const r = num % 100000;
    return `${ltThousand(l)} Lakh${r ? ` ${integerToWordsIndian(r)}` : ''}`;
  }
  const c = Math.floor(num / 10000000);
  const r = num % 10000000;
  return `${ltThousand(c)} Crore${r ? ` ${integerToWordsIndian(r)}` : ''}`;
};

export const amountToWordsIndian = (value) => {
  const totalPaise = Math.abs(Math.round(toAmountNumber(value) * 100));
  const rupees = Math.floor(totalPaise / 100);
  const paise = totalPaise % 100;

  if (rupees === 0 && paise === 0) return 'Zero';
  if (paise === 0) return integerToWordsIndian(rupees);
  if (rupees === 0) return `${integerToWordsIndian(paise)} Paise`;
  return `${integerToWordsIndian(rupees)} and ${integerToWordsIndian(paise)} Paise`;
};

export const formatAmountInWordsINR = (value) => {
  const amount = toAmountNumber(value);
  if (!(amount > 0)) return '';
  return `Rupees ${amountToWordsIndian(amount)} Only`;
};
