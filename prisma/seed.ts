import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

// 密码哈希函数
async function hashPassword(password: string): Promise<string> {
  const salt = await bcrypt.genSalt(10)
  return bcrypt.hash(password, salt)
}

/**
 * 部门定义
 * 7个部门：品牌增长中心、媒介战略部、全球供应链部、履约物流中心、视觉传达部、内容生产工厂、财经中心
 */
const departments = [
  {
    name: '品牌增长中心',
    code: 'BRAND_GROWTH',
    description: '负责品牌增长、市场拓展等'
  },
  {
    name: '媒介战略部',
    code: 'MEDIA_STRATEGY',
    description: '负责媒介策略、广告投放等'
  },
  {
    name: '全球供应链部',
    code: 'GLOBAL_SUPPLY_CHAIN',
    description: '负责全球供应链管理、采购等'
  },
  {
    name: '履约物流中心',
    code: 'FULFILLMENT_LOGISTICS',
    description: '负责物流配送、仓储管理、履约等'
  },
  {
    name: '视觉传达部',
    code: 'VISUAL_COMMUNICATION',
    description: '负责视觉设计、平面设计等'
  },
  {
    name: '内容生产工厂',
    code: 'CONTENT_PRODUCTION',
    description: '负责内容制作、视频剪辑等'
  },
  {
    name: '财经中心',
    code: 'FINANCE_CENTER',
    description: '负责财务管理、账务处理等'
  }
]

async function main() {
  console.log('开始初始化部门数据...')

  // 创建或更新部门
  const departmentMap: Record<string, string> = {} // 存储部门名称到ID的映射
  
  for (const dept of departments) {
    const department = await prisma.department.upsert({
      where: { name: dept.name },
      update: {
        code: dept.code,
        description: dept.description,
        isActive: true
      },
      create: {
        name: dept.name,
        code: dept.code,
        description: dept.description,
        isActive: true
      }
    })
    departmentMap[dept.name] = department.id
    console.log(`✓ ${department.name} (${department.code}) - ${department.id}`)
  }

  console.log('部门数据初始化完成！')
  console.log(`共创建/更新 ${departments.length} 个部门`)

  // 创建管理员用户
  console.log('\n开始初始化管理员用户...')
  
  // 获取财经中心ID（如果存在）
  const financeCenterDeptId = departmentMap['财经中心'] || null
  
  // 默认管理员密码（建议首次登录后修改）
  const defaultAdminPassword = process.env.ADMIN_DEFAULT_PASSWORD || 'admin123456'
  const hashedPassword = await hashPassword(defaultAdminPassword)

  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@yourcompany.com' },
    update: {
      // 如果用户已存在，可以选择是否更新密码
      // password: hashedPassword, // 取消注释以重置密码
      name: '老板',
      role: 'SUPER_ADMIN',
      departmentId: financeCenterDeptId,
      isActive: true
    },
    create: {
      email: 'admin@yourcompany.com',
      password: hashedPassword,
      name: '老板',
      role: 'SUPER_ADMIN',
      departmentId: financeCenterDeptId,
      isActive: true
    }
  })

  console.log(`✓ 管理员用户创建成功`)
  console.log(`  邮箱: ${adminUser.email}`)
  console.log(`  姓名: ${adminUser.name}`)
  console.log(`  角色: ${adminUser.role}`)
  console.log(`  部门: ${financeCenterDeptId ? '财经中心' : '未分配'}`)
  console.log(`  默认密码: ${defaultAdminPassword}`)
  console.log(`⚠️  请首次登录后立即修改默认密码！`)
  
  console.log('\n数据初始化完成！')
}

main()
  .catch((e) => {
    console.error('Seed 执行失败:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
