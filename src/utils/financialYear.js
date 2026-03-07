const FY_PATTERN = /^(\d{4})-(\d{2})$/;

const formatFinancialYear = (startYear) => {
  const endYearShort = String((startYear + 1) % 100).padStart(2, '0');
  return `${startYear}-${endYearShort}`;
};

export const getCurrentFinancialYear = (date = new Date()) => {
  const year = date.getFullYear();
  const monthIndex = date.getMonth();
  const startYear = monthIndex >= 3 ? year : year - 1;
  return formatFinancialYear(startYear);
};

export const parseFinancialYearStart = (fy) => {
  const value = String(fy || '').trim();
  const match = value.match(FY_PATTERN);
  if (!match) return null;
  return Number(match[1]);
};

export const getFinancialYearOptions = ({
  pastYears = 2,
  futureYears = 1,
  include = []
} = {}) => {
  const currentStart = parseFinancialYearStart(getCurrentFinancialYear()) ?? new Date().getFullYear();
  const values = new Set(include.filter(Boolean));

  for (let offset = -pastYears; offset <= futureYears; offset += 1) {
    values.add(formatFinancialYear(currentStart + offset));
  }

  return [...values]
    .filter((value) => parseFinancialYearStart(value) !== null)
    .sort((a, b) => parseFinancialYearStart(a) - parseFinancialYearStart(b))
    .map((value) => ({ value, label: value }));
};

export const isValidFinancialYear = (fy, options = []) => {
  if (!fy) return false;
  const values = options.map((opt) => opt?.value);
  return values.includes(fy);
};

