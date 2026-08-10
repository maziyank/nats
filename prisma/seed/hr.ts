import { prisma } from "./utils";
import {
  ContactType,
  SalaryComponentType,
  PayrollPeriodStatus,
} from "../generated/prisma/client";
import {
  faker,
  getRandomItem,
  randomIdrAmount,
  randomIndonesianAddress,
  randomIndonesianPhone,
} from "./bulk_utils";

const BASIC_SALARY = "Gaji Pokok";
const TRANSPORT_ALLOWANCE = "Tunjangan Transport";
const INCOME_TAX = "PPh 21";

export async function seedHR() {
  console.log("Menyiapkan modul SDM...");

  try {
    const { StatutoryService } = await import(
      "../../services/modules/payroll/services/statutory.service"
    );
    await StatutoryService.seedDefaults();
    console.log("Aturan statutory payroll (PPh 21, BPJS) disiapkan.");
  } catch (e) {
    console.warn("Gagal menyiapkan aturan statutory:", (e as Error).message);
  }

  const departments = [
    { name: "Teknik", code: "ENG" },
    { name: "Penjualan", code: "SALES" },
    { name: "Sumber Daya Manusia", code: "HR" },
    { name: "Keuangan", code: "FIN" },
  ];

  for (const dept of departments) {
    await prisma.department.upsert({
      where: { code: dept.code },
      update: { name: dept.name },
      create: { name: dept.name, code: dept.code },
    });
  }

  // Migrasi nama departemen lama
  const legacyDepts: Record<string, string> = {
    Engineering: "Teknik",
    Sales: "Penjualan",
    "Human Resources": "Sumber Daya Manusia",
    Finance: "Keuangan",
  };
  for (const [oldName, newName] of Object.entries(legacyDepts)) {
    const dept = await prisma.department.findFirst({ where: { name: oldName } });
    if (dept) {
      await prisma.department.update({
        where: { id: dept.id },
        data: { name: newName },
      });
    }
  }

  console.log("Membuat komponen gaji...");

  async function ensureComponent(name: string, legacyNames: string[], type: SalaryComponentType, isTaxable: boolean) {
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
    BASIC_SALARY,
    ["Basic Salary"],
    SalaryComponentType.EARNING,
    true,
  );
  const transportComponent = await ensureComponent(
    TRANSPORT_ALLOWANCE,
    ["Transport Allowance"],
    SalaryComponentType.EARNING,
    false,
  );
  const taxComponent = await ensureComponent(
    INCOME_TAX,
    ["Income Tax"],
    SalaryComponentType.DEDUCTION,
    false,
  );

  const employeesData = [
    {
      name: "Budi Santoso",
      email: "budi.santoso@example.com",
      role: "Insinyur Perangkat Lunak",
      deptCode: "ENG",
      baseSalary: 12_500_000,
      transport: 750_000,
      joinDate: new Date("2024-01-15"),
    },
    {
      name: "Siti Rahayu",
      email: "siti.rahayu@example.com",
      role: "Manajer Penjualan",
      deptCode: "SALES",
      baseSalary: 15_000_000,
      transport: 1_000_000,
      joinDate: new Date("2023-05-10"),
    },
    {
      name: "Ahmad Wijaya",
      email: "ahmad.wijaya@example.com",
      role: "Spesialis SDM",
      deptCode: "HR",
      baseSalary: 9_500_000,
      transport: 500_000,
      joinDate: new Date("2025-02-01"),
    },
  ];

  // Migrasi karyawan contoh lama
  const legacyEmployees: Record<string, string> = {
    "john.doe@example.com": "budi.santoso@example.com",
    "jane.smith@example.com": "siti.rahayu@example.com",
    "robert.johnson@example.com": "ahmad.wijaya@example.com",
  };
  for (const [oldEmail, newEmail] of Object.entries(legacyEmployees)) {
    const old = await prisma.contact.findFirst({
      where: { email: oldEmail, type: ContactType.EMPLOYEE },
    });
    const neu = employeesData.find((e) => e.email === newEmail);
    if (old && neu) {
      await prisma.contact.update({
        where: { id: old.id },
        data: { name: neu.name, email: neu.email },
      });
    }
  }

  for (let i = 0; i < employeesData.length; i++) {
    const empData = employeesData[i];
    let employee = await prisma.contact.findFirst({
      where: { email: empData.email, type: ContactType.EMPLOYEE },
    });

    if (!employee) {
      employee = await prisma.contact.create({
        data: {
          name: empData.name,
          email: empData.email,
          type: ContactType.EMPLOYEE,
          isActive: true,
          phone: randomIndonesianPhone(),
          address: randomIndonesianAddress(),
        },
      });
    }

    const department = await prisma.department.findUnique({
      where: { code: empData.deptCode },
    });

    const existingDetail = await prisma.employeeDetail.findUnique({
      where: { contactId: employee.id },
    });
    if (!existingDetail) {
      await prisma.employeeDetail.create({
        data: {
          contactId: employee.id,
          employeeNumber: `EMP-${empData.deptCode}-${String(i + 1).padStart(3, "0")}`,
          jobTitle: empData.role,
          department: department?.name || "Umum",
          departmentId: department?.id || null,
          joinDate: empData.joinDate,
          taxFilingStatus: "TK0",
          hasNpwp: true,
        },
      });
    } else {
      await prisma.employeeDetail.update({
        where: { contactId: employee.id },
        data: {
          jobTitle: empData.role,
          department: department?.name || existingDetail.department,
          departmentId: department?.id || existingDetail.departmentId,
        },
      });
    }

    const existingStructure = await prisma.salaryStructure.findFirst({
      where: { contactId: employee.id, isActive: true },
    });

    if (!existingStructure) {
      await prisma.salaryStructure.create({
        data: {
          name: "Struktur Standar 2026",
          contactId: employee.id,
          baseSalary: empData.baseSalary,
          isActive: true,
          items: {
            create: [
              {
                componentId: basicComponent.id,
                amount: empData.baseSalary,
                formula: "",
              },
              {
                componentId: transportComponent.id,
                amount: empData.transport,
                formula: "",
              },
              {
                componentId: taxComponent.id,
                amount: Math.round(empData.baseSalary * 0.05),
                formula: "",
              },
            ],
          },
        },
      });
    } else if (Number(existingStructure.baseSalary) < 1_000_000) {
      // Naikkan gaji lama berbasis USD ke skala IDR
      await prisma.salaryStructure.update({
        where: { id: existingStructure.id },
        data: {
          name: "Struktur Standar 2026",
          baseSalary: empData.baseSalary,
        },
      });
    }
  }

  console.log("Membuat periode penggajian...");
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const monthName = startOfMonth.toLocaleString("id-ID", { month: "long" });
  const periodName = `Penggajian ${monthName} ${now.getFullYear()}`;

  const existingPeriod = await prisma.payrollPeriod.findFirst({
    where: {
      OR: [
        { name: periodName },
        {
          name: {
            contains: startOfMonth.toLocaleString("default", { month: "long" }),
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
  } else if (existingPeriod.name.startsWith("Payroll ")) {
    await prisma.payrollPeriod.update({
      where: { id: existingPeriod.id },
      data: { name: periodName },
    });
  }
}

export async function seedBulkHR(count: number) {
  console.log(`Menyiapkan ${count} karyawan massal...`);

  const departments = await prisma.department.findMany();
  const salaryComponents = await prisma.salaryComponent.findMany();

  if (departments.length === 0 || salaryComponents.length === 0) {
    console.warn(
      "Departemen atau komponen gaji belum tersedia. Lewati SDM massal.",
    );
    return;
  }

  const basicComp =
    salaryComponents.find((c) => c.name === BASIC_SALARY) ||
    salaryComponents.find((c) => c.name === "Basic Salary");
  const transportComp =
    salaryComponents.find((c) => c.name === TRANSPORT_ALLOWANCE) ||
    salaryComponents.find((c) => c.name === "Transport Allowance");
  const taxComp =
    salaryComponents.find((c) => c.name === INCOME_TAX) ||
    salaryComponents.find((c) => c.name === "Income Tax");

  if (!basicComp || !transportComp || !taxComp) {
    console.warn("Komponen gaji inti tidak ditemukan. Lewati SDM massal.");
    return;
  }

  const jobTitles = [
    "Staff Administrasi",
    "Sales Executive",
    "Akuntan Junior",
    "Teknisi Lapangan",
    "Analis Bisnis",
    "Supervisor Gudang",
    "HR Officer",
    "Customer Service",
    "Marketing Officer",
    "Programmer",
  ];

  for (let i = 0; i < count; i++) {
    const firstName = faker.person.firstName();
    const lastName = faker.person.lastName();
    const email = faker.internet
      .email({ firstName, lastName, provider: "perusahaan.co.id" })
      .toLowerCase();
    const dept = getRandomItem(departments);

    const contact = await prisma.contact.create({
      data: {
        name: `${firstName} ${lastName}`,
        email,
        type: ContactType.EMPLOYEE,
        isActive: true,
        phone: randomIndonesianPhone(),
        address: randomIndonesianAddress(),
      },
    });

    await prisma.employeeDetail.create({
      data: {
        contactId: contact.id,
        employeeNumber: `EMP-B-${String(i + 1).padStart(4, "0")}`,
        jobTitle: getRandomItem(jobTitles),
        department: dept.name,
        departmentId: dept.id,
        joinDate: faker.date.past({ years: 5 }),
        taxFilingStatus: getRandomItem(["TK0", "TK1", "K0", "K1"]),
        hasNpwp: true,
      },
    });

    const baseSalary = randomIdrAmount(4_500_000, 25_000_000);
    const transport = randomIdrAmount(300_000, 1_500_000);

    await prisma.salaryStructure.create({
      data: {
        name: `Struktur - ${contact.name}`,
        contactId: contact.id,
        baseSalary,
        isActive: true,
        items: {
          create: [
            { componentId: basicComp.id, amount: baseSalary, formula: "" },
            { componentId: transportComp.id, amount: transport, formula: "" },
            {
              componentId: taxComp.id,
              amount: Math.round(baseSalary * 0.05),
              formula: "",
            },
          ],
        },
      },
    });

    if (i % 100 === 0 && i > 0) {
      console.log(`  Diproses SDM ${i} / ${count}`);
    }
  }
}
