import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

// GET /api/payroll/[id]
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const record = await prisma.payroll.findUnique({ where: { id: params.id } });
    if (!record) return NextResponse.json({ error: "未找到" }, { status: 404 });
    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// PATCH /api/payroll/[id] - 更新工资单（支持字段级编辑和状态变更）
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json();
    const data: any = { updatedAt: new Date() };

    // 基础字段更新
    const numFields = [
      "baseSalary", "positionSalary", "fullAttendance", "monthDays", "workHourStandard",
      "restDays", "legalHolidays", "injuryHolidays", "paidLeaveTotal", "payableDays",
      "actualAttendDays", "performance", "commission", "otherAllowance", "absenteeism",
      "advancePayment", "otherDeduction", "pension", "unemployment", "medical", "incomeTax",
    ];
    numFields.forEach((f) => {
      if (body[f] !== undefined) data[f] = Number(body[f]) || 0;
    });

    const strFields = [
      "personalLeave", "sickLeave", "bankAccount", "bankName", "idNumber", "phone", "notes",
      "payrollNo", "employeeName", "department", "periodLabel",
    ];
    strFields.forEach((f) => {
      if (body[f] !== undefined) data[f] = body[f];
    });

    // JSON 字段
    if (body.lateRecords !== undefined) data.lateRecords = body.lateRecords;
    if (body.missedPunch !== undefined) data.missedPunch = body.missedPunch;
    if (body.leaveDeduction !== undefined) data.leaveDeduction = body.leaveDeduction;

    // 状态字段
    if (body.status !== undefined) data.status = body.status;
    if (body.submittedAt !== undefined) data.submittedAt = body.submittedAt ? new Date(body.submittedAt) : null;
    if (body.approvedBy !== undefined) data.approvedBy = body.approvedBy;
    if (body.approvedAt !== undefined) data.approvedAt = body.approvedAt ? new Date(body.approvedAt) : null;
    if (body.rejectionReason !== undefined) data.rejectionReason = body.rejectionReason;

    // 财务关联字段
    if (body.outFlowId !== undefined) data.outFlowId = body.outFlowId;
    if (body.outAccountId !== undefined) data.outAccountId = body.outAccountId;
    if (body.outAccountName !== undefined) data.outAccountName = body.outAccountName;
    if (body.businessNumber !== undefined) data.businessNumber = body.businessNumber;
    if (body.paidBy !== undefined) data.paidBy = body.paidBy;
    if (body.paidAt !== undefined) data.paidAt = body.paidAt ? new Date(body.paidAt) : null;
    if (body.paymentVoucher !== undefined) data.paymentVoucher = body.paymentVoucher;

    // 如果改了关键字段，重新计算派生金额
    const needsRecalc = numFields.some((f) => body[f] !== undefined) || body.lateRecords !== undefined || body.missedPunch !== undefined || body.leaveDeduction !== undefined;

    if (needsRecalc) {
      // 先拿到更新后的值
      const current = await prisma.payroll.findUnique({ where: { id: params.id } });
      if (current) {
        const merged = { ...current, ...data };
        const actualSalary = (Number(merged.baseSalary) || 0) + (Number(merged.positionSalary) || 0);
        const totalSalary = actualSalary + (Number(merged.fullAttendance) || 0);
        const payableDays = Number(merged.payableDays) || 24;
        const actualAttendDays = Number(merged.actualAttendDays) || payableDays;
        const payableAmount = payableDays > 0 ? totalSalary * (actualAttendDays / payableDays) : 0;

        const lateAmount = Array.isArray(merged.lateRecords)
          ? merged.lateRecords.reduce((s: number, r: any) => s + (Number(r?.amount) || 0), 0)
          : 0;
        const missedPunchAmount = merged.missedPunch ? (Number((merged.missedPunch as any)?.amount) || 0) : 0;
        const leaveAmount = merged.leaveDeduction ? (Number((merged.leaveDeduction as any)?.amount) || 0) : 0;
        const totalDeduction =
          (Number(merged.absenteeism) || 0) + lateAmount + missedPunchAmount + leaveAmount +
          (Number(merged.advancePayment) || 0) + (Number(merged.otherDeduction) || 0);

        const grossSalary =
          payableAmount + (Number(merged.performance) || 0) + (Number(merged.commission) || 0) +
          (Number(merged.otherAllowance) || 0) - totalDeduction;

        const netSalary =
          grossSalary - (Number(merged.pension) || 0) - (Number(merged.unemployment) || 0) -
          (Number(merged.medical) || 0) - (Number(merged.incomeTax) || 0);

        data.actualSalary = actualSalary;
        data.totalSalary = totalSalary;
        data.payableAmount = Math.round(payableAmount * 100) / 100;
        data.totalDeduction = Math.round(totalDeduction * 100) / 100;
        data.grossSalary = Math.round(grossSalary * 100) / 100;
        data.netSalary = Math.round(netSalary * 100) / 100;
      }
    }

    const updated = await prisma.payroll.update({ where: { id: params.id }, data });
    await clearCacheByPrefix("payroll");
    return NextResponse.json(updated);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "更新失败" }, { status: 500 });
  }
}

// DELETE /api/payroll/[id]
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.payroll.delete({ where: { id: params.id } });
    await clearCacheByPrefix("payroll");
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
