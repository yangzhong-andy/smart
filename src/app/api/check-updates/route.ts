import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export const dynamic = 'force-dynamic'

// 检查所有更新是否生效的 API
export async function GET() {
  const checks: Record<string, boolean> = {}
  const details: Record<string, any> = {}
  
  // 检查 1: 权限系统文件
  const permissionsFile = path.join(process.cwd(), 'src/lib/permissions.ts')
  if (fs.existsSync(permissionsFile)) {
    const content = fs.readFileSync(permissionsFile, 'utf-8')
    checks.permissions = content.includes('DEPARTMENT_CODES') && content.includes('canReadField')
    details.permissions = {
      exists: true,
      hasDepartmentCodes: content.includes('DEPARTMENT_CODES'),
      hasCanReadField: content.includes('canReadField'),
      size: content.length
    }
  } else {
    checks.permissions = false
    details.permissions = { exists: false }
  }
  
  // 检查 2: 动态工作台文件
  const dashboardLayout = path.join(process.cwd(), 'src/components/DashboardLayout.tsx')
  const contentDashboard = path.join(process.cwd(), 'src/components/dashboards/ContentProductionDashboard.tsx')
  const supplyDashboard = path.join(process.cwd(), 'src/components/dashboards/SupplyChainDashboard.tsx')
  const financeDashboard = path.join(process.cwd(), 'src/components/dashboards/FinanceDashboard.tsx')
  
  checks.dashboardLayout = fs.existsSync(dashboardLayout)
  checks.contentDashboard = fs.existsSync(contentDashboard)
  checks.supplyDashboard = fs.existsSync(supplyDashboard)
  checks.financeDashboard = fs.existsSync(financeDashboard)
  
  // 检查 3: API 路由更新
  const purchaseOrdersRoute = path.join(process.cwd(), 'src/app/api/purchase-orders/route.ts')
  if (fs.existsSync(purchaseOrdersRoute)) {
    const content = fs.readFileSync(purchaseOrdersRoute, 'utf-8')
    checks.purchaseOrdersAPI = content.includes('getCurrentUserFromRequest') && content.includes('filterFieldsByPermission')
    details.purchaseOrdersAPI = {
      hasGetCurrentUser: content.includes('getCurrentUserFromRequest'),
      hasFilterFields: content.includes('filterFieldsByPermission')
    }
  } else {
    checks.purchaseOrdersAPI = false
  }
  
  // 检查 4: 首页更新
  const homePage = path.join(process.cwd(), 'src/app/page.tsx')
  if (fs.existsSync(homePage)) {
    const content = fs.readFileSync(homePage, 'utf-8')
    checks.homePage = content.includes('DashboardLayout') && content.includes('shouldShowDashboard')
    details.homePage = {
      hasDashboardLayout: content.includes('DashboardLayout'),
      hasShouldShowDashboard: content.includes('shouldShowDashboard')
    }
  } else {
    checks.homePage = false
  }
  
  // 检查 5: 数据库 schema
  const schemaFile = path.join(process.cwd(), 'prisma/schema.prisma')
  if (fs.existsSync(schemaFile)) {
    const content = fs.readFileSync(schemaFile, 'utf-8')
    checks.schema = content.includes('kolContact') && content.includes('shippingNo') && content.includes('paymentStatus')
    details.schema = {
      hasKolContact: content.includes('kolContact'),
      hasShippingNo: content.includes('shippingNo'),
      hasPaymentStatus: content.includes('paymentStatus')
    }
  } else {
    checks.schema = false
  }
  
  const allPassed = Object.values(checks).every(v => v === true)
  
  return NextResponse.json({
    success: allPassed,
    message: allPassed ? '所有更新已生效' : '部分更新未生效',
    checks,
    details,
    timestamp: new Date().toISOString()
  })
}
