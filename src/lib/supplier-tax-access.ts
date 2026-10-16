export function supplierTaxRole(user: { role: string; departmentCode: string | null }): 'admin' | 'finance' | 'viewer' {
  if (['SUPER_ADMIN', 'ADMIN'].includes(user.role)) return 'admin';
  if (user.role === 'FINANCE' || user.departmentCode === 'FINANCE_CENTER') return 'finance';
  return 'viewer';
}
