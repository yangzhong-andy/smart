import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUserFromRequest, filterFieldsByPermission, canReadField, DEPARTMENT_CODES } from '@/lib/permissions'

export const dynamic = 'force-dynamic'

// 测试权限系统的 API
export async function GET(request: NextRequest) {
  try {
    // 获取用户信息
    const user = await getCurrentUserFromRequest(request)
    const departmentCode = user?.departmentCode || null
    
    // 测试数据
    const testData = {
      id: 'test-123',
      orderNumber: 'PO-20250124-001',
      kolContact: 'KOL联系方式',
      shippingNo: 'SF123456789',
      shippingFee: 100.50,
      paymentStatus: '已支付',
      paymentPassword: 'secret123',
      unitPrice: 50.00,
      totalAmount: 5000.00,
    }
    
    // 应用权限过滤
    const filtered = filterFieldsByPermission(testData, departmentCode)
    
    // 测试各个字段的权限
    const permissions = {
      kolContact: canReadField(departmentCode, 'kolContact'),
      shippingNo: canReadField(departmentCode, 'shippingNo'),
      shippingFee: canReadField(departmentCode, 'shippingFee'),
      paymentStatus: canReadField(departmentCode, 'paymentStatus'),
      paymentPassword: canReadField(departmentCode, 'paymentPassword'),
      unitPrice: canReadField(departmentCode, 'unitPrice'),
    }
    
    return NextResponse.json({
      success: true,
      message: '权限系统测试',
      user: {
        userId: user?.userId,
        departmentCode,
        departmentName: user?.departmentName,
        role: user?.role,
        hasToken: !!request.headers.get('authorization')
      },
      testData: {
        original: testData,
        filtered: filtered,
        fieldCount: {
          original: Object.keys(testData).length,
          filtered: Object.keys(filtered).length
        }
      },
      permissions,
      departmentCodes: DEPARTMENT_CODES,
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }, { status: 500 })
  }
}
