import { prisma } from '@/services/lib/prisma';
import { SalarySlipStatus } from '@/prisma/generated/prisma/client';

export class SalarySlipService {
    static async findByPeriod(periodId: string) {
        return prisma.salarySlip.findMany({
            where: { periodId },
            include: {
                items: {
                    include: { component: true },
                },
                contact: true,
            },
        });
    }

    static async findById(id: string) {
        return prisma.salarySlip.findUnique({
            where: { id },
            include: {
                items: {
                    include: { component: true },
                },
                contact: true,
            },
        });
    }

    static async updateStatus(id: string, status: SalarySlipStatus) {
        return prisma.salarySlip.update({
            where: { id },
            data: { status },
        });
    }
}
