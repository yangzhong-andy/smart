import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

/**
 * 从「已支付」的采购合同定金支出申请同步到合同财务状态
 * 用于修复：定金在审批中心标记为已支付后，合同列表的已付总额/还欠未更新的历史数据
 * 仅当合同当前 depositPaid 为 0 且存在对应 Paid 申请时才更新，避免重复累加
 */
export async function POST() {
  try {
    const allPaid = await prisma.expenseRequest.findMany({
      where: { status: 'Paid' }
    });
    const paidDepositRequests = allPaid.filter((r) => r.summary && r.summary.includes('采购合同定金'));

    let synced = 0;
    for (const req of paidDepositRequests) {
      const contractNumber = (req.summary
        .replace(/^采购合同定金\s*[-\－:：]\s*/i, '')
        .trim() || req.summary.replace('采购合同定金', '').trim());
      const amount = Number(req.amount);
      if (!contractNumber || !Number.isFinite(amount) || amount <= 0) continue;

      const contract = await prisma.purchaseContract.findUnique({
        where: { contractNumber }
      });
      if (!contract) continue;
      const currentDeposit = Number(contract.depositPaid);
      if (currentDeposit > 0) continue; // 已同步过，跳过

      const totalAmount = Number(contract.totalAmount);
      const newTotalPaid = Number(contract.totalPaid) + amount;
      const newTotalOwed = totalAmount - newTotalPaid;
      await prisma.purchaseContract.update({
        where: { id: contract.id },
        data: {
          depositPaid: amount,
          totalPaid: newTotalPaid,
          totalOwed: newTotalOwed,
          status: newTotalPaid >= totalAmount ? 'SETTLED' : contract.status,
          updatedAt: new Date()
        }
      });
      synced++;
    }

    return NextResponse.json({ ok: true, synced });
  } catch (e) {
    console.error('Sync deposit from expenses:', e);
    return NextResponse.json(
      { error: '同步失败', details: (e as Error).message },
      { status: 500 }
    );
  }
}
