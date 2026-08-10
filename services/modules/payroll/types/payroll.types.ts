import { PayrollPeriod, SalaryStructure } from '@/prisma/generated/prisma/client';



export type CreatePayrollPeriodDTO = {
    name: string;
    startDate: Date;
    endDate: Date;
};

export type CreateSalaryComponentDTO = {
    name: string;
    type: 'EARNING' | 'DEDUCTION';
    isTaxable?: boolean;
    description?: string;
    accountId?: string;
};

export type CreateSalaryStructureDTO = {
    contactId: string;
    name: string;
    baseSalary: number;
    createdById?: string;
    items: {
        componentId: string;
        amount: number;
        formula?: string;
    }[];
};

export interface IPayrollService {
    createPayrollPeriod(data: CreatePayrollPeriodDTO): Promise<PayrollPeriod>;
    configureSalaryStructure(data: CreateSalaryStructureDTO): Promise<SalaryStructure>;
    runPayroll(periodId: string): Promise<PayrollRunResult>;
    approvePayrollRun(runId: string): Promise<void>;
}

export type PayrollRunResult = {
    periodId: string;
    totalSlips: number;
    totalAmount: number;
};

export type { ActionResponse } from '@/types/actions';
