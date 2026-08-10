import { prisma } from '@/services/lib/prisma';
import { StatutoryRuleType, TaxFilingStatus } from '@/prisma/generated/prisma/client';
import { Decimal } from 'decimal.js';

/** Default PTKP (non-taxable income) annual amounts in IDR — simplified 2024+ rates */
const DEFAULT_PTKP: Record<TaxFilingStatus, number> = {
    TK0: 54_000_000,
    TK1: 58_500_000,
    TK2: 63_000_000,
    TK3: 67_500_000,
    K0: 58_500_000,
    K1: 63_000_000,
    K2: 67_500_000,
    K3: 72_000_000,
};

/** Progressive PPh 21 annual brackets (simplified TER-compatible monthly approx uses annual/12) */
const DEFAULT_PPH21_BRACKETS = [
    { upTo: 60_000_000, rate: 0.05 },
    { upTo: 250_000_000, rate: 0.15 },
    { upTo: 500_000_000, rate: 0.25 },
    { upTo: 5_000_000_000, rate: 0.30 },
    { upTo: Infinity, rate: 0.35 },
];

export type StatutoryDeductionResult = {
    type: StatutoryRuleType;
    name: string;
    employeeAmount: number;
    employerAmount: number;
};

type RuleConfig = {
    employeeRate?: number;
    employerRate?: number;
    maxBase?: number;
    minBase?: number;
    ptkp?: Record<string, number>;
    brackets?: { upTo: number; rate: number }[];
    noNpwpMultiplier?: number;
};

export class StatutoryService {
    static async listRules() {
        return prisma.statutoryRule.findMany({
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });
    }

    static async getActiveRules() {
        return prisma.statutoryRule.findMany({
            where: { isActive: true },
            orderBy: { type: 'asc' },
        });
    }

    static async upsertRule(data: {
        id?: string;
        name: string;
        type: StatutoryRuleType;
        config: RuleConfig;
        description?: string;
        isActive?: boolean;
    }) {
        if (data.id) {
            return prisma.statutoryRule.update({
                where: { id: data.id },
                data: {
                    name: data.name,
                    type: data.type,
                    config: data.config as object,
                    description: data.description,
                    isActive: data.isActive ?? true,
                },
            });
        }
        return prisma.statutoryRule.create({
            data: {
                name: data.name,
                type: data.type,
                config: data.config as object,
                description: data.description,
                isActive: data.isActive ?? true,
            },
        });
    }

    static async seedDefaults() {
        const defaults: Array<{
            name: string;
            type: StatutoryRuleType;
            config: RuleConfig;
            description: string;
        }> = [
            {
                name: 'PPh 21 Progressive',
                type: 'PPH21',
                description: 'Indonesian income tax withholding (simplified progressive)',
                config: {
                    ptkp: DEFAULT_PTKP,
                    brackets: DEFAULT_PPH21_BRACKETS,
                    noNpwpMultiplier: 1.2,
                },
            },
            {
                name: 'BPJS Kesehatan',
                type: 'BPJS_KESEHATAN',
                description: 'Employee 1% / Employer 4%, cap applies',
                config: { employeeRate: 0.01, employerRate: 0.04, maxBase: 12_000_000 },
            },
            {
                name: 'BPJS TK JHT',
                type: 'BPJS_TK_JHT',
                description: 'Jaminan Hari Tua — Employee 2% / Employer 3.7%',
                config: { employeeRate: 0.02, employerRate: 0.037 },
            },
            {
                name: 'BPJS TK JP',
                type: 'BPJS_TK_JP',
                description: 'Jaminan Pensiun — Employee 1% / Employer 2%, cap applies',
                config: { employeeRate: 0.01, employerRate: 0.02, maxBase: 10_547_400 },
            },
            {
                name: 'BPJS TK JKK',
                type: 'BPJS_TK_JKK',
                description: 'Jaminan Kecelakaan Kerja — Employer only (default 0.24%)',
                config: { employeeRate: 0, employerRate: 0.0024 },
            },
            {
                name: 'BPJS TK JKM',
                type: 'BPJS_TK_JKM',
                description: 'Jaminan Kematian — Employer only 0.3%',
                config: { employeeRate: 0, employerRate: 0.003 },
            },
        ];

        for (const rule of defaults) {
            const existing = await prisma.statutoryRule.findFirst({
                where: { type: rule.type, name: rule.name },
            });
            if (!existing) {
                await prisma.statutoryRule.create({
                    data: {
                        name: rule.name,
                        type: rule.type,
                        config: rule.config as object,
                        description: rule.description,
                        isActive: true,
                    },
                });
            }
        }
    }

    /**
     * Calculate statutory employee deductions for a monthly gross salary.
     */
    static async calculateForEmployee(params: {
        monthlyGross: number;
        taxFilingStatus?: TaxFilingStatus;
        hasNpwp?: boolean;
    }): Promise<StatutoryDeductionResult[]> {
        const rules = await this.getActiveRules();
        const results: StatutoryDeductionResult[] = [];
        const gross = new Decimal(params.monthlyGross);

        for (const rule of rules) {
            const config = (rule.config || {}) as RuleConfig;
            let base = gross;
            if (config.maxBase != null) {
                base = Decimal.min(base, config.maxBase);
            }
            if (config.minBase != null) {
                base = Decimal.max(base, config.minBase);
            }

            if (rule.type === 'PPH21') {
                const monthlyTax = this.calculateMonthlyPph21(
                    params.monthlyGross,
                    params.taxFilingStatus || 'TK0',
                    params.hasNpwp ?? true,
                    config
                );
                results.push({
                    type: rule.type,
                    name: rule.name,
                    employeeAmount: monthlyTax,
                    employerAmount: 0,
                });
                continue;
            }

            const employeeRate = config.employeeRate ?? 0;
            const employerRate = config.employerRate ?? 0;
            results.push({
                type: rule.type,
                name: rule.name,
                employeeAmount: base.mul(employeeRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
                employerAmount: base.mul(employerRate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
            });
        }

        return results;
    }

    static calculateMonthlyPph21(
        monthlyGross: number,
        filingStatus: TaxFilingStatus,
        hasNpwp: boolean,
        config: RuleConfig = {}
    ): number {
        const ptkpMap = { ...DEFAULT_PTKP, ...(config.ptkp || {}) };
        const brackets = config.brackets || DEFAULT_PPH21_BRACKETS;
        const annualGross = monthlyGross * 12;
        const ptkp = ptkpMap[filingStatus] ?? DEFAULT_PTKP.TK0;
        let taxable = Math.max(0, annualGross - ptkp);

        let tax = 0;
        let previous = 0;
        for (const bracket of brackets) {
            const slice = Math.min(taxable, bracket.upTo - previous);
            if (slice <= 0) break;
            tax += slice * bracket.rate;
            taxable -= slice;
            previous = bracket.upTo;
            if (taxable <= 0) break;
        }

        if (!hasNpwp) {
            tax *= config.noNpwpMultiplier ?? 1.2;
        }

        // Monthly withholding
        return Math.round(tax / 12);
    }
}
