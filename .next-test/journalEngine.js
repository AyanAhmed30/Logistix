"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateJournalEntry = validateJournalEntry;
exports.assertDraftForPosting = assertDraftForPosting;
exports.assertMutableEntry = assertMutableEntry;
exports.buildReversalLines = buildReversalLines;
function toAmount(value) {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
}
function roundAmount(value) {
    return Math.round(value * 100) / 100;
}
function validateJournalEntry(entry) {
    const lines = Array.isArray(entry.lines) ? entry.lines : [];
    if (lines.length < 2) {
        throw new Error('Journal entry must have at least two lines');
    }
    let totalDebit = 0;
    let totalCredit = 0;
    let hasDebit = false;
    let hasCredit = false;
    for (const line of lines) {
        const debit = toAmount(line.debit_amount);
        const credit = toAmount(line.credit_amount);
        if (debit < 0 || credit < 0) {
            throw new Error('Invalid negative values in entry');
        }
        if (debit > 0)
            hasDebit = true;
        if (credit > 0)
            hasCredit = true;
        totalDebit += debit;
        totalCredit += credit;
    }
    totalDebit = roundAmount(totalDebit);
    totalCredit = roundAmount(totalCredit);
    if (!hasDebit || !hasCredit) {
        throw new Error('Entry must contain both debit and credit lines');
    }
    if (totalDebit !== totalCredit) {
        throw new Error('Total debit and credit must be equal');
    }
}
function assertDraftForPosting(status) {
    if (status !== 'draft') {
        throw new Error('Only draft entries can be posted');
    }
}
function assertMutableEntry(status) {
    if (status === 'posted') {
        throw new Error('Posted entries cannot be modified. Use reversal.');
    }
}
function buildReversalLines(lines) {
    return lines.map((line) => ({
        ...line,
        debit_amount: line.credit_amount,
        credit_amount: line.debit_amount,
    }));
}
