"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_assert_1 = require("node:assert");
const node_test_1 = __importDefault(require("node:test"));
const journalEngine_1 = require("./journalEngine");
(0, node_test_1.default)('Valid entry posts successfully', () => {
    node_assert_1.strict.doesNotThrow(() => (0, journalEngine_1.validateJournalEntry)({
        lines: [
            { debit_amount: 5000, credit_amount: 0 },
            { debit_amount: 0, credit_amount: 5000 },
        ],
    }));
});
(0, node_test_1.default)('Imbalanced entry fails', () => {
    node_assert_1.strict.throws(() => (0, journalEngine_1.validateJournalEntry)({
        lines: [
            { debit_amount: 5000, credit_amount: 0 },
            { debit_amount: 0, credit_amount: 4000 },
        ],
    }), /Total debit and credit must be equal/);
});
(0, node_test_1.default)('Editing posted entry fails', () => {
    node_assert_1.strict.throws(() => (0, journalEngine_1.assertMutableEntry)('posted'), /Posted entries cannot be modified. Use reversal\./);
});
(0, node_test_1.default)('Reversal creates correct mirror entry', () => {
    const reversed = (0, journalEngine_1.buildReversalLines)([
        { debit_amount: 10000, credit_amount: 0 },
        { debit_amount: 0, credit_amount: 10000 },
    ]);
    node_assert_1.strict.equal(reversed[0].debit_amount, 0);
    node_assert_1.strict.equal(reversed[0].credit_amount, 10000);
    node_assert_1.strict.equal(reversed[1].debit_amount, 10000);
    node_assert_1.strict.equal(reversed[1].credit_amount, 0);
});
(0, node_test_1.default)('Double posting prevented', () => {
    node_assert_1.strict.throws(() => (0, journalEngine_1.assertDraftForPosting)('posted'), /Only draft entries can be posted/);
});
(0, node_test_1.default)('Negative values rejected', () => {
    node_assert_1.strict.throws(() => (0, journalEngine_1.validateJournalEntry)({
        lines: [
            { debit_amount: -10, credit_amount: 0 },
            { debit_amount: 0, credit_amount: 10 },
        ],
    }), /Invalid negative values in entry/);
});
(0, node_test_1.default)('Single-line entry rejected', () => {
    node_assert_1.strict.throws(() => (0, journalEngine_1.validateJournalEntry)({
        lines: [{ debit_amount: 10, credit_amount: 0 }],
    }), /Journal entry must have at least two lines/);
});
