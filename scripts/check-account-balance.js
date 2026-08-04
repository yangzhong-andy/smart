const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const path = require('path');

// 读取 .env.local 文件获取 DATABASE_URL
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    });
  }
}

loadEnv();

const prisma = new PrismaClient();

async function checkAccountBalance() {
  try {
    // 查找"空中云汇"账户
    const account = await prisma.bankAccount.findFirst({
      where: {
        name: {
          contains: '空中云汇'
        }
      }
    });

    if (!account) {
      console.log('❌ 未找到"空中云汇"账户');
      return;
    }

    console.log('\n📊 账户信息：');
    console.log('==========================================');
    console.log(`账户名称: ${account.name}`);
    console.log(`账户ID: ${account.id}`);
    console.log(`币种: ${account.currency}`);
    console.log(`初始资金 (initialCapital): ${Number(account.initialCapital || 0)}`);
    console.log(`当前余额 (originalBalance): ${Number(account.originalBalance || 0)}`);
    console.log(`RMB余额 (rmbBalance): ${Number(account.rmbBalance || 0)}`);
    console.log(`账户类型: ${account.accountCategory}`);
    console.log(`父账户ID: ${account.parentId || '无'}`);

    // 计算总余额 = 初始资金 + 当前余额
    const totalBalance = Number(account.initialCapital || 0) + Number(account.originalBalance || 0);
    console.log(`\n💰 总余额 (initialCapital + originalBalance): ${totalBalance}`);

    // 查询该账户的所有流水记录
    const cashFlows = await prisma.cashFlow.findMany({
      where: {
        accountId: account.id,
        status: 'CONFIRMED',
        isReversal: false
      },
      orderBy: {
        date: 'asc'
      }
    });

    console.log(`\n📝 流水记录总数: ${cashFlows.length}`);
    console.log('==========================================');

    if (cashFlows.length > 0) {
      console.log('\n流水明细：');
      let calculatedBalance = Number(account.initialCapital || 0);
      console.log(`起始余额（从初始资金开始）: ${calculatedBalance}`);

      cashFlows.forEach((flow, index) => {
        const amount = Number(flow.amount);
        const beforeBalance = calculatedBalance;
        calculatedBalance += amount;
        
        console.log(`\n${index + 1}. ${flow.date.toISOString().slice(0, 10)}`);
        console.log(`   类型: ${flow.type} | 分类: ${flow.category}`);
        console.log(`   摘要: ${flow.summary}`);
        console.log(`   金额: ${amount > 0 ? '+' : ''}${amount}`);
        console.log(`   变动前余额: ${beforeBalance}`);
        console.log(`   变动后余额: ${calculatedBalance}`);
      });

      console.log(`\n✅ 计算后的总余额: ${calculatedBalance}`);
      console.log(`📊 数据库中的 originalBalance: ${Number(account.originalBalance || 0)}`);
      console.log(`📊 数据库中的 initialCapital: ${Number(account.initialCapital || 0)}`);
      console.log(`📊 数据库中的总余额 (initialCapital + originalBalance): ${totalBalance}`);
      
      if (Math.abs(calculatedBalance - totalBalance) > 0.01) {
        console.log(`\n⚠️  警告：计算余额与数据库余额不一致！`);
        console.log(`   差异: ${calculatedBalance - totalBalance}`);
      } else {
        console.log(`\n✅ 余额计算正确！`);
      }
    } else {
      console.log('\n该账户暂无流水记录');
      console.log(`总余额应该等于初始资金: ${Number(account.initialCapital || 0)}`);
    }

    // 查询内部划拨记录（如果有关联）
    const transfers = await prisma.cashFlow.findMany({
      where: {
        OR: [
          { accountId: account.id, category: '内部划拨' }
        ],
        status: 'CONFIRMED',
        isReversal: false
      },
      orderBy: {
        date: 'asc'
      }
    });

    if (transfers.length > 0) {
      console.log(`\n🔄 内部划拨记录: ${transfers.length} 条`);
      transfers.forEach((transfer, index) => {
        console.log(`\n${index + 1}. ${transfer.date.toISOString().slice(0, 10)}`);
        console.log(`   类型: ${transfer.type} | 金额: ${Number(transfer.amount)}`);
        console.log(`   摘要: ${transfer.summary}`);
        console.log(`   关联ID: ${transfer.relatedId || '无'}`);
      });
    }

  } catch (error) {
    console.error('❌ 查询失败:', error);
  } finally {
    await prisma.$disconnect();
  }
}

checkAccountBalance();
