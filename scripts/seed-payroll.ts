import { prisma } from '@/services/lib/prisma';
import { SalaryComponentType, PayrollPeriodStatus } from '@/prisma/generated/prisma/client';

async function main() {
    console.log('🌱 Menyiapkan data penggajian...');

    // 1. Pastikan komponen gaji tersedia
    console.log('Membuat komponen gaji...');

    async function ensureComponent(
        name: string,
        legacyNames: string[],
        type: SalaryComponentType,
        isTaxable: boolean,
    ) {
        let component = await prisma.salaryComponent.findFirst({ where: { name } });
        if (component) return component;

        for (const legacy of legacyNames) {
            const old = await prisma.salaryComponent.findFirst({ where: { name: legacy } });
            if (old) {
                return prisma.salaryComponent.update({
                    where: { id: old.id },
                    data: { name, type, isTaxable },
                });
            }
        }

        return prisma.salaryComponent.create({
            data: { name, type, isTaxable },
        });
    }

    const basicComponent = await ensureComponent(
        'Gaji Pokok',
        ['Basic Salary'],
        SalaryComponentType.EARNING,
        true,
    );

    const transportComponent = await ensureComponent(
        'Tunjangan Transport',
        ['Transport Allowance'],
        SalaryComponentType.EARNING,
        false,
    );

    const taxComponent = await ensureComponent(
        'PPh 21',
        ['Income Tax'],
        SalaryComponentType.DEDUCTION,
        false,
    );

    // 2. Pastikan karyawan tersedia
    console.log('Memeriksa/membuat karyawan...');
    const employeesData = [
        {
            name: 'Budi Santoso',
            email: 'budi.santoso@example.com',
            baseSalary: 12_500_000,
            transport: 750_000,
        },
        {
            name: 'Siti Rahayu',
            email: 'siti.rahayu@example.com',
            baseSalary: 15_000_000,
            transport: 1_000_000,
        },
        {
            name: 'Ahmad Wijaya',
            email: 'ahmad.wijaya@example.com',
            baseSalary: 9_500_000,
            transport: 500_000,
        },
    ];

    // Migrasi email karyawan contoh lama
    const legacyMap: Record<string, string> = {
        'john.doe@example.com': 'budi.santoso@example.com',
        'jane.smith@example.com': 'siti.rahayu@example.com',
        'robert.johnson@example.com': 'ahmad.wijaya@example.com',
    };
    for (const [oldEmail, newEmail] of Object.entries(legacyMap)) {
        const old = await prisma.contact.findFirst({
            where: { email: oldEmail, type: 'EMPLOYEE' },
        });
        const neu = employeesData.find((e) => e.email === newEmail);
        if (old && neu) {
            await prisma.contact.update({
                where: { id: old.id },
                data: { name: neu.name, email: neu.email },
            });
        }
    }

    const employees = [];
    for (const empData of employeesData) {
        let employee = await prisma.contact.findFirst({
            where: { email: empData.email, type: 'EMPLOYEE' },
        });

        if (!employee) {
            employee = await prisma.contact.create({
                data: {
                    name: empData.name,
                    email: empData.email,
                    type: 'EMPLOYEE',
                    isActive: true,
                },
            });
            console.log(`Karyawan dibuat: ${empData.name}`);
        } else {
            await prisma.contact.update({
                where: { id: employee.id },
                data: { name: empData.name },
            });
            console.log(`Karyawan sudah ada: ${empData.name}`);
        }
        employees.push({ contact: employee, ...empData });
    }

    // 3. Buat struktur gaji
    console.log('Membuat struktur gaji...');
    for (const emp of employees) {
        const existingStructure = await prisma.salaryStructure.findFirst({
            where: { contactId: emp.contact.id, isActive: true },
        });

        if (!existingStructure) {
            await prisma.salaryStructure.create({
                data: {
                    name: 'Struktur Standar 2026',
                    contactId: emp.contact.id,
                    baseSalary: emp.baseSalary,
                    isActive: true,
                    items: {
                        create: [
                            {
                                componentId: basicComponent.id,
                                amount: emp.baseSalary,
                                formula: '',
                            },
                            {
                                componentId: transportComponent.id,
                                amount: emp.transport,
                                formula: '',
                            },
                            {
                                componentId: taxComponent.id,
                                amount: Math.round(emp.baseSalary * 0.05),
                                formula: '',
                            },
                        ],
                    },
                },
            });
            console.log(`Struktur gaji dibuat untuk ${emp.name}`);
        } else {
            // Naikkan gaji lama berbasis USD ke skala IDR jika perlu
            if (Number(existingStructure.baseSalary) < 1_000_000) {
                await prisma.salaryStructure.update({
                    where: { id: existingStructure.id },
                    data: {
                        name: 'Struktur Standar 2026',
                        baseSalary: emp.baseSalary,
                    },
                });
                console.log(`Struktur gaji diperbarui ke IDR untuk ${emp.name}`);
            } else {
                console.log(`Struktur gaji sudah ada untuk ${emp.name}`);
            }
        }
    }

    // 4. Buat periode penggajian bulan ini
    console.log('Membuat periode penggajian...');
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const monthName = startOfMonth.toLocaleString('id-ID', { month: 'long' });
    const periodName = `Penggajian ${monthName} ${now.getFullYear()}`;

    const existingPeriod = await prisma.payrollPeriod.findFirst({
        where: {
            OR: [
                { name: periodName },
                {
                    name: {
                        contains: startOfMonth.toLocaleString('default', { month: 'long' }),
                    },
                },
            ],
        },
    });

    if (!existingPeriod) {
        await prisma.payrollPeriod.create({
            data: {
                name: periodName,
                startDate: startOfMonth,
                endDate: endOfMonth,
                status: PayrollPeriodStatus.DRAFT,
            },
        });
        console.log(`Periode penggajian dibuat: ${periodName}`);
    } else if (existingPeriod.name.startsWith('Payroll ')) {
        await prisma.payrollPeriod.update({
            where: { id: existingPeriod.id },
            data: { name: periodName },
        });
        console.log(`Periode penggajian diperbarui: ${periodName}`);
    } else {
        console.log(`Periode penggajian sudah ada: ${existingPeriod.name}`);
    }

    console.log('✅ Seeding penggajian selesai');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
