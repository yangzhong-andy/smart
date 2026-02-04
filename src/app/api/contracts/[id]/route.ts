import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// GET /api/contracts/[id] - 获取已生成的合同（用于预览/打印）
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params
    const contract = await prisma.generatedContract.findUnique({
      where: { id },
    })
    if (!contract) {
      return NextResponse.json({ error: '合同不存在' }, { status: 404 })
    }
    const snapshot = contract.snapshot as object
    return NextResponse.json({
      id: contract.id,
      contractNumber: contract.contractNumber,
      purchaseOrderId: contract.purchaseOrderId,
      purchaseContractId: contract.purchaseContractId,
      snapshot,
      createdAt: contract.createdAt.toISOString(),
    })
  } catch (error: any) {
    console.error('Contract fetch error:', error)
    return NextResponse.json(
      { error: error?.message || '获取合同失败' },
      { status: 500 }
    )
  }
}
