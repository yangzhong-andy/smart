import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { clearCacheByPrefix } from "@/lib/redis";

export const dynamic = "force-dynamic";

// POST /api/payroll/generate
// body: { month: "2026-05", department?: "电商部" }
// 从员工档案自动生成工资单，带入底薪/社保/银行卡，拉取当月提成
// 根据入职/离职日期自动计算实际出勤天数
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const month = body.month;
    if (!month) return NextResponse.json({ error: "请选择月份" }, { status: 400 });

    // 1. 查询符合条件的员工（在职+试用期+当月离职，可选按部门过滤）
    // 注意：离职员工也要算当月工资（离职当月的工资）
    const empWhere: any = {
      status: { in: ["ACTIVE", "PROBATION", "INACTIVE"] },
    };

    const DEPT_MAP: Record<string, string> = {
      OPERATIONS: "电商部",
      EDITOR: "TK电商部",
      FINANCE: "财务部",
      PROCUREMENT: "采购部",
      LOGISTICS: "物流部",
      BD: "BD部",
    };

    const employees = await prisma.employee.findMany({ where: empWhere });
    if (employees.length === 0) {
      return NextResponse.json({ error: "没有找到员工档案，请先在员工档案中添加员工" }, { status: 400 });
    }

    // 2. 检查该月份是否已生成过
    const existing = await prisma.payroll.findMany({
      where: { periodLabel: month },
      select: { employeeId: true },
    });
    const existingEmpIds = new Set(existing.map((e) => e.employeeId));

    // 3. 查询当月提成记录（按员工汇总）
    const commissions = await prisma.commissionRecord.findMany({
      where: { periodLabel: month },
      select: { employeeId: true, amount: true },
    });
    const commissionByEmp: Record<string, number> = {};
    commissions.forEach((c) => {
      commissionByEmp[c.employeeId] = (commissionByEmp[c.employeeId] || 0) + Number(c.amount);
    });

    // 4. 计算当月天数
    const [year, mon] = month.split("-").map(Number);
    const monthDays = new Date(year, mon, 0).getDate();
    const monthStart = new Date(year, mon - 1, 1);
    const monthEnd = new Date(year, mon, 0);

    // 5. 为每个员工生成工资单
    const now = new Date();
    const created: any[] = [];
    let skipped = 0;

    for (const emp of employees) {
      if (existingEmpIds.has(emp.id)) {
        skipped++;
        continue;
      }

      const deptName = DEPT_MAP[emp.department] || emp.department || "未分类";
      if (body.department && body.department !== "all" && deptName !== body.department) {
        continue;
      }

      const baseSalary = Number(emp.baseSalary) || 2200;
      const positionSalary = Number(emp.positionSalary) || 0;
      const actualSalary = baseSalary + positionSalary;

      const restDays = Number(emp.restDays) || 7;
      const payableDays = monthDays - restDays > 0 ? monthDays - restDays : 24;

      // === 根据入职/离职日期计算实际在职天数 ===
      // 确定该员工在这个月的有效工作区间 [workStart, workEnd]
      let workStart = monthStart; // 默认月初
      let workEnd = monthEnd;     // 默认月末

      // 入职日期处理
      if (emp.joinDate) {
        const joinDate = new Date(emp.joinDate);
        if (joinDate > monthEnd) {
          // 入职日期在当月之后：还没入职，跳过
          skipped++;
          continue;
        }
        if (joinDate > monthStart) {
          workStart = joinDate; // 当月入职，从入职日开始算
        }
      }

      // 离职日期处理
      if (emp.leaveDate) {
        const leaveDate = new Date(emp.leaveDate);
        if (leaveDate < monthStart) {
          // 离职日期在当月之前：早就离职了，跳过
          skipped++;
          continue;
        }
        if (leaveDate < monthEnd) {
          workEnd = leaveDate; // 当月离职，算到离职日
        }
      }

      // 计算当月实际在职天数（含入职当天和离职当天）
      const inMonthDays = Math.floor((workEnd.getTime() - workStart.getTime()) / (1000 * 60 * 60 * 24)) + 1;

      // 判断是否整月在职
      const isFullMonth = workStart.getTime() === monthStart.getTime() && workEnd.getTime() === monthEnd.getTime();

      let actualAttendDays: number;
      let fullAttendanceAmt: number;

      if (isFullMonth) {
        // 整月在职：全勤
        actualAttendDays = payableDays;
        fullAttendanceAmt = Number(emp.fullAttendanceBonus) || 200;
      } else {
        // 非整月（入职/离职）：按比例折算
        actualAttendDays = Math.max(1, Math.round(payableDays * inMonthDays / monthDays));
        fullAttendanceAmt = 0; // 不满月不给满勤奖
      }

      const totalSalary = actualSalary + fullAttendanceAmt;
      const payableAmount = isFullMonth
        ? totalSalary
        : Math.round(totalSalary * (actualAttendDays / payableDays) * 100) / 100;

      const commissionAmount = commissionByEmp[emp.id] || 0;
      const pension = Number(emp.pensionInsurance) || 0;
      const unemployment = Number(emp.unemploymentInsurance) || 0;
      const medical = Number(emp.medicalInsurance) || 0;

      const grossSalary = payableAmount + commissionAmount;
      const netSalary = grossSalary - pension - unemployment - medical;

      const randomStr = Math.random().toString(36).slice(2, 6).toUpperCase();

      const record = await prisma.payroll.create({
        data: {
          payrollNo: `SAL-${month.replace("-", "")}-${randomStr}`,
          employeeId: emp.id,
          employeeName: emp.name,
          department: deptName,
          periodLabel: month,
          baseSalary,
          positionSalary,
          actualSalary,
          fullAttendance: fullAttendanceAmt,
          totalSalary,
          monthDays,
          workHourStandard: 8,
          restDays,
          payableDays,
          actualAttendDays,
          payableAmount,
          commission: Math.round(commissionAmount * 100) / 100,
          pension,
          unemployment,
          medical,
          grossSalary: Math.round(grossSalary * 100) / 100,
          netSalary: Math.round(netSalary * 100) / 100,
          bankAccount: emp.bankAccount || null,
          bankName: emp.bankName || null,
          idNumber: emp.idNumber || null,
          phone: emp.phone || null,
          status: "Draft",
        },
      });
      created.push({ ...record, isPartialMonth: !isFullMonth });
    }

    await clearCacheByPrefix("payroll");

    const partialCount = created.filter((c: any) => c.isPartialMonth).length;
    return NextResponse.json({
      success: true,
      created: created.length,
      skipped,
      total: employees.length,
      partialMonth: partialCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "生成工资单失败" }, { status: 500 });
  }
}
