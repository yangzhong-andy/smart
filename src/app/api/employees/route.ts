import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { DepartmentEnum, EmploymentStatus } from '@prisma/client'
import { getCache, setCache, generateCacheKey, clearCacheByPrefix } from '@/lib/redis'
import { initialSalarySettings } from '@/lib/employee-profile'
import { requireApiUser } from '@/lib/api-auth'
import { parseEmploymentSettings } from '@/lib/employee-confirmation'

export const dynamic = 'force-dynamic'

// 缓存配置
const CACHE_TTL = 600; // 10分钟
const CACHE_KEY_PREFIX = 'employees';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status')
    const department = searchParams.get('department')
    const page = parseInt(searchParams.get("page") || "1")
    const pageSize = parseInt(searchParams.get("pageSize") || "20")
    const noCache = searchParams.get("noCache") === "true"

    // 生成缓存键
    const cacheKey = generateCacheKey(
      CACHE_KEY_PREFIX,
      'personnel-confirmation-v2',
      status || 'all',
      department || 'all',
      String(page),
      String(pageSize)
    )

    // 尝试从缓存获取（仅第一页）
    if (!noCache && page === 1) {
      const cached = await getCache<any>(cacheKey)
      if (cached) {
        return NextResponse.json(cached)
      }
    }

    const where: any = {}
    if (status) where.status = status as EmploymentStatus
    if (department) where.department = department as DepartmentEnum

    const [employees, total] = await prisma.$transaction([
      prisma.employee.findMany({
        where,
        select: {
          id: true, name: true, employeeNumber: true, department: true,
          position: true, joinDate: true, phone: true, email: true,
          status: true, responsibleInfluencers: true, responsibleSuppliers: true,
          responsibleStores: true, notes: true, createdAt: true, updatedAt: true,
          leaveDate: true, bankAccount: true, bankName: true, idNumber: true,
          baseSalary: true, positionSalary: true, fullAttendanceBonus: true,
          pensionInsurance: true, unemploymentInsurance: true, medicalInsurance: true,
          restDays: true,
          probationStartDate: true, expectedConfirmationDate: true, confirmationDate: true,
          probationBaseSalary: true, probationPositionSalary: true, probationFullAttendanceBonus: true,
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.employee.count({ where }),
    ])

    const response = {
      data: employees.map(e => ({
        id: e.id,
        name: e.name,
        employeeNumber: e.employeeNumber || undefined,
        department: e.department,
        position: e.position,
        joinDate: e.joinDate.toISOString(),
        phone: e.phone || undefined,
        email: e.email || undefined,
        status: e.status,
        responsibleInfluencers: e.responsibleInfluencers || [],
        responsibleSuppliers: e.responsibleSuppliers || [],
        responsibleStores: e.responsibleStores || [],
        notes: e.notes || undefined,
        leaveDate: e.leaveDate ? e.leaveDate.toISOString().split('T')[0] : undefined,
        bankAccount: e.bankAccount || undefined,
        bankName: e.bankName || undefined,
        idNumber: e.idNumber || undefined,
        baseSalary: e.baseSalary != null ? Number(e.baseSalary) : undefined,
        positionSalary: e.positionSalary != null ? Number(e.positionSalary) : undefined,
        fullAttendanceBonus: e.fullAttendanceBonus != null ? Number(e.fullAttendanceBonus) : undefined,
        pensionInsurance: e.pensionInsurance != null ? Number(e.pensionInsurance) : undefined,
        unemploymentInsurance: e.unemploymentInsurance != null ? Number(e.unemploymentInsurance) : undefined,
        medicalInsurance: e.medicalInsurance != null ? Number(e.medicalInsurance) : undefined,
        restDays: e.restDays,
        probationStartDate: e.probationStartDate?.toISOString().slice(0, 10),
        expectedConfirmationDate: e.expectedConfirmationDate?.toISOString().slice(0, 10),
        confirmationDate: e.confirmationDate?.toISOString().slice(0, 10),
        probationBaseSalary: e.probationBaseSalary ?? undefined,
        probationPositionSalary: e.probationPositionSalary ?? undefined,
        probationFullAttendanceBonus: e.probationFullAttendanceBonus ?? undefined,
        createdAt: e.createdAt.toISOString(),
        updatedAt: e.updatedAt.toISOString()
      })),
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) }
    }

    // 设置缓存（仅第一页）
    if (!noCache && page === 1) {
      await setCache(cacheKey, response, CACHE_TTL)
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch employees' },
      { status: 500 }
    )
  }
}

// POST - 创建新员工（清除缓存）
export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiUser(request, { roles: ['SUPER_ADMIN', 'ADMIN', 'MANAGER'] })
    if (auth.response) return auth.response
    const body = await request.json()
    let salary
    let employment
    try {
      salary = initialSalarySettings(body)
      employment = parseEmploymentSettings(body)
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : '薪资格式不正确' }, { status: 400 })
    }

    // 中文状态 -> EmploymentStatus 映射
    const STATUS_MAP: Record<string, string> = {
      '在职': 'ACTIVE', '试用期': 'PROBATION', '离职': 'INACTIVE',
    };
    const statusEnum = (STATUS_MAP[body.status] || body.status || 'ACTIVE') as any;

    const employee = await prisma.employee.create({
      data: {
        name: body.name,
        employeeNumber: body.employeeNumber || null,
        department: body.department,
        position: body.position,
        joinDate: new Date(body.joinDate),
        phone: body.phone || null,
        email: body.email || null,
        status: statusEnum,
        responsibleInfluencers: body.responsibleInfluencers || [],
        responsibleSuppliers: body.responsibleSuppliers || [],
        responsibleStores: body.responsibleStores || [],
        notes: body.notes || null,
        leaveDate: body.leaveDate ? new Date(body.leaveDate) : null,
        ...salary,
        ...employment,
      }
    })

    // 清除员工相关缓存
    await clearCacheByPrefix(CACHE_KEY_PREFIX)

    return NextResponse.json({
      id: employee.id,
      name: employee.name,
      department: employee.department,
      createdAt: employee.createdAt.toISOString()
    })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to create employee' },
      { status: 500 }
    )
  }
}
