import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix, getCache, setCache, generateCacheKey } from "@/lib/redis";

export const dynamic = "force-dynamic";
const CACHE_TTL = 300;

// GET /api/payroll?month=2026-05&department=电商部&status=Draft
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const month = searchParams.get("month");
    const department = searchParams.get("department");
    const status = searchParams.get("status");
    const employeeId = searchParams.get("employeeId");
    const noCache = searchParams.get("noCache") === "true";

    const where: any = {};
    if (month) where.periodLabel = month;
    if (department && department !== "all") where.department = department;
    if (status && status !== "all") where.status = status;
    if (employeeId) where.employeeId = employeeId;

    const cacheKey = generateCacheKey("payroll", { month, department, status, employeeId });
    if (!noCache) {
      const cached = await getCache<any>(cacheKey);
      if (cached) return NextResponse.json(cached);
    }

    const records = await prisma.payroll.findMany({
      where,
      orderBy: [{ department: "asc" }, { employeeName: "asc" }],
    });

    const response = { data: records, total: records.length };
    if (!noCache) await setCache(cacheKey, response, CACHE_TTL);
    return NextResponse.json(response);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "获取工资单失败" }, { status: 500 });
  }
}

// POST /api/payroll - 创建单条工资单
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 生成工资单号
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
    const randomStr = Math.random().toString(36).slice(2, 6).toUpperCase();
    const payrollNo = body.payrollNo || `SAL-${dateStr}-${randomStr}`;

    // 计算派生字段
    const baseSalary = Number(body.baseSalary) || 0;
    const positionSalary = Number(body.positionSalary) || 0;
    const actualSalary = baseSalary + positionSalary;
    const fullAttendance = Number(body.fullAttendance) || 0;
    const totalSalary = actualSalary + fullAttendance;

    const payableDays = Number(body.payableDays) || 24;
    const actualAttendDays = Number(body.actualAttendDays) || payableDays;
    const payableAmount = payableDays > 0 ? totalSalary * (actualAttendDays / payableDays) : 0;

    const performance = Number(body.performance) || 0;
    const commission = Number(body.commission) || 0;
    const otherAllowance = Number(body.otherAllowance) || 0;

    const absenteeism = Number(body.absenteeism) || 0;
    const advancePayment = Number(body.advancePayment) || 0;
    const otherDeduction = Number(body.otherDeduction) || 0;
    // 解析 JSON 扣款
    const lateAmount = Array.isArray(body.lateRecords)
      ? body.lateRecords.reduce((s: number, r: any) => s + (Number(r?.amount) || 0), 0)
      : 0;
    const missedPunchAmount = body.missedPunch ? (Number(body.missedPunch.amount) || 0) : 0;
    const leaveAmount = body.leaveDeduction ? (Number(body.leaveDeduction.amount) || 0) : 0;
    const totalDeduction = absenteeism + lateAmount + missedPunchAmount + leaveAmount + advancePayment + otherDeduction;

    const grossSalary = payableAmount + performance + commission + otherAllowance - totalDeduction;

    const pension = Number(body.pension) || 0;
    const unemployment = Number(body.unemployment) || 0;
    const medical = Number(body.medical) || 0;
    const incomeTax = Number(body.incomeTax) || 0;
    const netSalary = grossSalary - pension - unemployment - medical - incomeTax;

    const record = await prisma.payroll.create({
      data: {
        payrollNo,
        employeeId: body.employeeId,
        employeeName: body.employeeName,
        department: body.department || "未分类",
        periodLabel: body.periodLabel,
        baseSalary,
        positionSalary,
        actualSalary,
        fullAttendance,
        totalSalary,
        monthDays: Number(body.monthDays) || 31,
        workHourStandard: Number(body.workHourStandard) || 8,
        restDays: Number(body.restDays) || 7,
        legalHolidays: Number(body.legalHolidays) || 0,
        injuryHolidays: Number(body.injuryHolidays) || 0,
        paidLeaveTotal: Number(body.paidLeaveTotal) || 0,
        payableDays,
        personalLeave: body.personalLeave || null,
        sickLeave: body.sickLeave || null,
        actualAttendDays,
        payableAmount,
        performance,
        commission,
        otherAllowance,
        absenteeism,
        lateRecords: body.lateRecords || null,
        missedPunch: body.missedPunch || null,
        leaveDeduction: body.leaveDeduction || null,
        advancePayment,
        otherDeduction,
        totalDeduction,
        grossSalary,
        pension,
        unemployment,
        medical,
        incomeTax,
        netSalary,
        bankAccount: body.bankAccount || null,
        bankName: body.bankName || null,
        idNumber: body.idNumber || null,
        phone: body.phone || null,
        notes: body.notes || null,
        status: body.status || "Draft",
      },
    });

    await clearCacheByPrefix("payroll");
    return NextResponse.json(record);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "创建工资单失败" }, { status: 500 });
  }
}
