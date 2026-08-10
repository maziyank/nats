import { describe, it, expect } from 'vitest';
import { evaluateFormula } from './formula';

describe('evaluateFormula', () => {
    it('evaluates arithmetic', () => {
        expect(evaluateFormula('10 + 5 * 2', {})).toBe(20);
    });

    it('substitutes BASE and GROSS', () => {
        expect(evaluateFormula('BASE * 0.1', { BASE: 5000 })).toBe(500);
        expect(evaluateFormula('GROSS * 0.02', { GROSS: 10000 })).toBe(200);
    });

    it('rejects invalid tokens', () => {
        expect(() => evaluateFormula('BASE; process.exit(1)', { BASE: 1 })).toThrow();
        expect(() => evaluateFormula('Math.random()', {})).toThrow();
    });

    it('returns 0 for empty formula', () => {
        expect(evaluateFormula('', {})).toBe(0);
        expect(evaluateFormula('   ', {})).toBe(0);
    });
});
