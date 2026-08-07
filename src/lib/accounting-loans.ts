/**
 * Loan amortization / installment schedule helpers (Odoo-style).
 */

export type LoanInterestMethod = 'fixed' | 'reducing_balance';
export type LoanInstallmentFrequency = 'monthly' | 'quarterly' | 'yearly';

export type LoanScheduleLine = {
  sequence: number;
  due_date: string;
  opening_balance: number;
  principal_amount: number;
  interest_amount: number;
  total_amount: number;
  closing_balance: number;
};

function round2(n: number) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function addMonths(isoDate: string, months: number): string {
  const d = new Date(isoDate + (isoDate.length <= 10 ? 'T00:00:00' : ''));
  if (Number.isNaN(d.getTime())) return isoDate;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export function frequencyStepMonths(freq: LoanInstallmentFrequency): number {
  if (freq === 'quarterly') return 3;
  if (freq === 'yearly') return 12;
  return 1;
}

export function periodsPerYear(freq: LoanInstallmentFrequency): number {
  if (freq === 'quarterly') return 4;
  if (freq === 'yearly') return 1;
  return 12;
}

/**
 * Equal installment (EMI) amortization for reducing balance,
 * or equal principal + interest on original for fixed.
 */
export function buildLoanAmortizationSchedule(opts: {
  principal: number;
  annualRatePercent: number;
  numberOfInstallments: number;
  firstInstallmentDate: string;
  frequency?: LoanInstallmentFrequency;
  interestMethod?: LoanInterestMethod;
}): LoanScheduleLine[] {
  const principal = round2(Math.max(0, opts.principal));
  const n = Math.max(1, Math.floor(opts.numberOfInstallments || 1));
  const first = String(opts.firstInstallmentDate || '').slice(0, 10);
  const freq = opts.frequency || 'monthly';
  const method = opts.interestMethod || 'reducing_balance';
  const step = frequencyStepMonths(freq);
  const ppy = periodsPerYear(freq);
  const annualRate = Math.max(0, Number(opts.annualRatePercent) || 0) / 100;
  const r = annualRate / ppy;

  if (principal <= 0.004 || !first) return [];

  const lines: LoanScheduleLine[] = [];

  if (method === 'fixed') {
    // Flat / fixed: interest on original principal for full term, equal principal
    const totalInterest = round2(principal * annualRate * (n / ppy));
    const principalPer = round2(principal / n);
    const interestPer = round2(totalInterest / n);
    let allocatedP = 0;
    let allocatedI = 0;
    let balance = principal;

    for (let i = 1; i <= n; i++) {
      const due = addMonths(first, (i - 1) * step);
      const opening = balance;
      let pAmt = i === n ? round2(principal - allocatedP) : principalPer;
      let iAmt = i === n ? round2(totalInterest - allocatedI) : interestPer;
      if (pAmt < 0) pAmt = 0;
      if (iAmt < 0) iAmt = 0;
      allocatedP = round2(allocatedP + pAmt);
      allocatedI = round2(allocatedI + iAmt);
      balance = round2(Math.max(0, balance - pAmt));
      lines.push({
        sequence: i,
        due_date: due,
        opening_balance: opening,
        principal_amount: pAmt,
        interest_amount: iAmt,
        total_amount: round2(pAmt + iAmt),
        closing_balance: balance,
      });
    }
    return lines;
  }

  // Reducing balance — standard EMI
  let emi: number;
  if (r <= 0) {
    emi = round2(principal / n);
  } else {
    const pow = Math.pow(1 + r, n);
    emi = round2((principal * r * pow) / (pow - 1));
  }

  let balance = principal;
  for (let i = 1; i <= n; i++) {
    const due = addMonths(first, (i - 1) * step);
    const opening = balance;
    const interest = round2(balance * r);
    let principalAmt = i === n ? round2(balance) : round2(emi - interest);
    if (principalAmt > balance) principalAmt = round2(balance);
    if (principalAmt < 0) principalAmt = 0;
    // Last payment: pay remaining principal + accrued interest
    const total =
      i === n ? round2(principalAmt + interest) : round2(principalAmt + interest);
    balance = round2(Math.max(0, balance - principalAmt));
    lines.push({
      sequence: i,
      due_date: due,
      opening_balance: opening,
      principal_amount: principalAmt,
      interest_amount: interest,
      total_amount: total,
      closing_balance: balance,
    });
  }
  return lines;
}

export function summarizeLoanSchedule(lines: LoanScheduleLine[]) {
  const totalInterest = round2(
    lines.reduce((s, l) => s + (Number(l.interest_amount) || 0), 0)
  );
  const totalPrincipal = round2(
    lines.reduce((s, l) => s + (Number(l.principal_amount) || 0), 0)
  );
  const totalPayable = round2(totalPrincipal + totalInterest);
  const monthlyInstallment = lines.length ? round2(lines[0].total_amount) : 0;
  const endDate = lines.length ? lines[lines.length - 1].due_date : null;
  const nextDate = lines.length ? lines[0].due_date : null;
  return {
    totalInterest,
    totalPrincipal,
    totalPayable,
    monthlyInstallment,
    endDate,
    nextDate,
  };
}
