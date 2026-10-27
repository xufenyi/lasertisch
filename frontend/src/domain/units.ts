const MILLIMETRE_PATTERN = /^([+-]?)(\d+)(?:[.,](\d{1,3}))?$/;
const ANGLE_PATTERN = /^([+-]?)(\d+)(?:[.,](\d))?$/;

export function parseMillimetresToUm(source: string): number {
  const match = MILLIMETRE_PATTERN.exec(source.trim());
  if (!match) {
    throw new Error('invalid_millimetre_value');
  }
  const [, sign, wholeText, fractionText = ''] = match;
  const magnitude = Number(wholeText) * 1000 + Number(fractionText.padEnd(3, '0'));
  if (!Number.isSafeInteger(magnitude)) {
    throw new Error('millimetre_value_out_of_range');
  }
  return sign === '-' ? -magnitude : magnitude;
}

export function formatUmAsMillimetres(valueUm: number): string {
  const sign = valueUm < 0 ? '-' : '';
  const magnitude = Math.abs(valueUm);
  const whole = Math.floor(magnitude / 1000);
  const fraction = String(magnitude % 1000).padStart(3, '0').replace(/0+$/, '');
  return fraction ? `${sign}${whole}.${fraction}` : `${sign}${whole}`;
}

export function normalizeTenthsDegrees(value: number): number {
  return ((value % 3600) + 3600) % 3600;
}

export function parseDegreesToTenths(source: string): number {
  const match = ANGLE_PATTERN.exec(source.trim());
  if (!match) {
    throw new Error('invalid_angle_value');
  }
  const [, sign, wholeText, fractionText = '0'] = match;
  const magnitude = Number(wholeText) * 10 + Number(fractionText);
  return normalizeTenthsDegrees(sign === '-' ? -magnitude : magnitude);
}

export function formatTenthsDegrees(value: number): string {
  const normalized = normalizeTenthsDegrees(value);
  const whole = Math.floor(normalized / 10);
  const fraction = normalized % 10;
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

