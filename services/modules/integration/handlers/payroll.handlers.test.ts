
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { handlePayrollRunCompleted } from './payroll.handlers';
import { JournalService } from '@/services/modules/accounting/services/journal.service';
import * as DefaultAccountsInfo from '@/services/lib/accounting/default-account.service';

// Mock dependencies
vi.mock('@/modules/accounting/services/journal.service', () => ({
    JournalService: {
        createJournalEntry: vi.fn(),
        postJournalEntry: vi.fn(),
    },
}));

vi.mock('@/lib/accounting/default-account.service', () => ({
    getRequiredDefaultAccount: vi.fn(),
}));

vi.mock('@/lib/document-numbering', () => ({
    generateDocumentNumber: vi.fn().mockResolvedValue('PAY-un-123'),
}));

describe('Payroll Integration Handlers', () => {
    let mockTx: any;

    beforeEach(() => {
        vi.clearAllMocks();
        mockTx = {
            payrollRun: {
                findUnique: vi.fn(),
                update: vi.fn(),
            },
            salarySlip: {
                findMany: vi.fn(),
            },
        };
    });

    describe('handlePayrollRunCompleted', () => {
        it('should create and post journal entry for completed payroll run', async () => {
            // Setup data
            const payload = {
                payrollRunId: 'cpayr000000000000000000001',
                periodId: 'period-123',
                totalAmount: '5000', // Net Pay
                processedAt: new Date().toISOString(),
                userId: 'user-1',
            };

            const mockRun = {
                id: 'cpayr000000000000000000001',
                periodId: 'period-123',
                runDate: new Date(),
                totalEarnings: 6000,
                totalDeductions: 1000,
                netPay: 5000,
                journalEntryId: null,
            };

            const mockExpenseAccount = { accountId: 'acc-expense' };
            const mockLiabilityAccount = { accountId: 'acc-liability' };
            const mockJournalEntry = { id: 'je-123' };

            // Setup mocks
            mockTx.payrollRun.findUnique.mockResolvedValue(mockRun);
            mockTx.salarySlip.findMany.mockResolvedValue([
                {
                    id: 'cslip000000000000000000001',
                    periodId: payload.periodId,
                    items: [
                        {
                            type: 'DEDUCTION',
                            amount: 1000,
                            component: { name: 'Other', accountId: null },
                        },
                    ],
                },
            ]);
            (DefaultAccountsInfo.getRequiredDefaultAccount as any)
                .mockResolvedValueOnce(mockExpenseAccount) // SALARIES_EXPENSE
                .mockResolvedValueOnce(mockLiabilityAccount); // PAYROLL_LIABILITY

            (JournalService.createJournalEntry as any).mockResolvedValue(mockJournalEntry);

            // Execute
            await handlePayrollRunCompleted(mockTx, payload);

            // Assertions
            expect(mockTx.payrollRun.findUnique).toHaveBeenCalledWith({ where: { id: payload.payrollRunId } });

            // Default accounts fetched
            expect(DefaultAccountsInfo.getRequiredDefaultAccount).toHaveBeenCalledWith('SALARIES_EXPENSE');
            expect(DefaultAccountsInfo.getRequiredDefaultAccount).toHaveBeenCalledWith('PAYROLL_LIABILITY');

            // Journal Entry Created
            expect(JournalService.createJournalEntry).toHaveBeenCalledWith(
                expect.objectContaining({
                    entryNumber: expect.stringContaining('PAY-un-123'),
                    description: `Payroll Run ${mockRun.id}`,
                    lines: expect.arrayContaining([
                        // Expense (Debit)
                        expect.objectContaining({
                            accountId: 'acc-expense',
                            debitAmount: 6000,
                            creditAmount: 0,
                        }),
                        // Net Pay (Credit)
                        expect.objectContaining({
                            accountId: 'acc-liability',
                            creditAmount: 5000,
                            debitAmount: 0,
                        }),
                        // Deductions (Credit)
                        expect.objectContaining({
                            accountId: 'acc-liability',
                            creditAmount: 1000,
                            debitAmount: 0,
                        }),
                    ]),
                }),
                payload.userId,
                mockTx
            );

            // Journal Entry Posted
            expect(JournalService.postJournalEntry).toHaveBeenCalledWith(mockJournalEntry.id, mockTx);

            // Payroll Run Updated
            expect(mockTx.payrollRun.update).toHaveBeenCalledWith({
                where: { id: mockRun.id },
                data: { journalEntryId: mockJournalEntry.id },
            });
        });

        it('should skip if payroll run already has journal entry', async () => {
            const payload = {
                payrollRunId: 'cpayr000000000000000000001',
                periodId: 'period-123',
                totalAmount: '5000',
                processedAt: new Date().toISOString(),
                userId: 'user-1',
            };

            mockTx.payrollRun.findUnique.mockResolvedValue({
                id: 'cpayr000000000000000000001',
                journalEntryId: 'existing-je-id',
            });

            await handlePayrollRunCompleted(mockTx, payload);

            expect(JournalService.createJournalEntry).not.toHaveBeenCalled();
        });

        it('should throw if payroll run not found', async () => {
            const payload = {
                payrollRunId: 'cpayr000000000000000000002',
                periodId: 'period-123',
                totalAmount: '5000',
                processedAt: new Date().toISOString(),
                userId: 'user-1',
            };

            mockTx.payrollRun.findUnique.mockResolvedValue(null);

            await expect(handlePayrollRunCompleted(mockTx, payload))
                .rejects.toThrow('Payroll run not found');
        });
    });
});
