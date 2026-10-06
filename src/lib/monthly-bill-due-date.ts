export const ADVERTISING_FULL_CREDIT_MONTHS = 2;

/**
 * Advertising bills are payable after two complete calendar months.
 * Example: a June bill accrues credit through July and August, then becomes
 * due on September 1.
 */
export function calculateAdvertisingBillDueDate(month: string): Date | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) return null;

  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) return null;

  return new Date(
    Date.UTC(
      year,
      monthNumber - 1 + ADVERTISING_FULL_CREDIT_MONTHS + 1,
      1,
    ),
  );
}

