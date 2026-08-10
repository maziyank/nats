import { describe, it, expect } from 'vitest';
import { StatutoryService } from './statutory.service';

describe('StatutoryService.calculateMonthlyPph21', () => {
    it('returns 0 when gross is below PTKP monthly equivalent', () => {
        // TK0 PTKP 54M/year => 4.5M/month non-taxable roughly; very low salary
        const tax = StatutoryService.calculateMonthlyPph21(1_000_000, 'TK0', true);
        expect(tax).toBe(0);
    });

    it('calculates progressive tax for higher income', () => {
        const tax = StatutoryService.calculateMonthlyPph21(20_000_000, 'TK0', true);
        expect(tax).toBeGreaterThan(0);
    });

    it('applies higher rate without NPWP', () => {
        const withNpwp = StatutoryService.calculateMonthlyPph21(20_000_000, 'TK0', true);
        const withoutNpwp = StatutoryService.calculateMonthlyPph21(20_000_000, 'TK0', false);
        expect(withoutNpwp).toBeGreaterThan(withNpwp);
    });
});
