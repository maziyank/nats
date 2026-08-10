import { prisma } from '@/services/lib/prisma';
import { CreateSalaryComponentDTO } from '../types/payroll.types';

export class SalaryComponentService {
    static async create(data: CreateSalaryComponentDTO) {
        return prisma.salaryComponent.create({
            data: {
                name: data.name,
                type: data.type,
                isTaxable: data.isTaxable ?? true,
                description: data.description,
                accountId: data.accountId || null,
            },
            include: { account: true },
        });
    }

    static async update(id: string, data: Partial<CreateSalaryComponentDTO> & { isActive?: boolean }) {
        return prisma.salaryComponent.update({
            where: { id },
            data: {
                ...(data.name !== undefined ? { name: data.name } : {}),
                ...(data.type !== undefined ? { type: data.type } : {}),
                ...(data.isTaxable !== undefined ? { isTaxable: data.isTaxable } : {}),
                ...(data.description !== undefined ? { description: data.description } : {}),
                ...(data.accountId !== undefined ? { accountId: data.accountId || null } : {}),
                ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
            },
            include: { account: true },
        });
    }

    static async findAll() {
        return prisma.salaryComponent.findMany({
            where: { isActive: true },
            include: { account: { select: { id: true, code: true, name: true } } },
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });
    }

    static async findById(id: string) {
        return prisma.salaryComponent.findUnique({
            where: { id },
            include: { account: true },
        });
    }
}
