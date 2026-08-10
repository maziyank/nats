import { ContactType, EmploymentStatus, Gender, MaritalStatus, TaxFilingStatus, AttendanceStatus, LeaveType, LeaveRequestStatus } from '@/prisma/generated/prisma/client';

export type { ActionResponse } from '@/types/actions';

export interface CreateEmployeeDTO {
    // Contact Info
    name: string;
    email?: string;
    phone?: string;
    address?: string;
    taxId?: string; // Contact tax ID

    // Employee Details
    employeeNumber?: string;
    joinDate: Date;
    terminationDate?: Date;
    employmentStatus: EmploymentStatus;
    jobTitle: string;
    /** @deprecated Prefer departmentId */
    department?: string;
    departmentId?: string;
    managerId?: string;

    // Personal Info
    dateOfBirth?: Date;
    gender?: Gender;
    maritalStatus?: MaritalStatus;
    nationalId?: string;
    employeeTaxId?: string; // EmployeeDetail tax ID
    taxFilingStatus?: TaxFilingStatus;
    hasNpwp?: boolean;

    // Emergency Contact
    emergencyContactName?: string;
    emergencyContactPhone?: string;

    // Bank Details
    bankName?: string;
    bankAccount?: string;
    bankHolder?: string;
}

export interface UpdateEmployeeDTO extends Partial<CreateEmployeeDTO> {
    isActive?: boolean;
}

export interface CreateAttendanceDTO {
    employeeDetailId: string;
    date: Date;
    status: AttendanceStatus;
    checkIn?: Date;
    checkOut?: Date;
    overtimeHours?: number;
    notes?: string;
}

export interface ImportAttendanceRowDTO {
    /** Employee number (preferred), or contact email as fallback identifier */
    employeeNumber?: string;
    email?: string;
    date: Date;
    status: AttendanceStatus;
    checkIn?: Date;
    checkOut?: Date;
    overtimeHours?: number;
    notes?: string;
}

export interface ImportAttendanceResult {
    imported: number;
    failed: number;
    errors: { row: number; message: string }[];
}

export interface CreateLeaveRequestDTO {
    employeeDetailId: string;
    leaveType: LeaveType;
    startDate: Date;
    endDate: Date;
    days: number;
    reason?: string;
}

export interface ReviewLeaveRequestDTO {
    requestId: string;
    status: Extract<LeaveRequestStatus, 'APPROVED' | 'REJECTED' | 'CANCELLED'>;
    approvedById?: string;
}

// Re-export unused import guard
export type { ContactType };
