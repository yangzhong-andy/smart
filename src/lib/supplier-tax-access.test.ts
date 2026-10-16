import test from 'node:test';
import assert from 'node:assert/strict';
import { supplierTaxRole } from './supplier-tax-access';

test('开票权限使用ERP当前管理员、财务部门，其他账号只读', () => {
  for (const role of ['SUPER_ADMIN', 'ADMIN']) assert.equal(supplierTaxRole({ role, departmentCode: null }), 'admin');
  assert.equal(supplierTaxRole({ role: 'FINANCE', departmentCode: null }), 'finance');
  assert.equal(supplierTaxRole({ role: 'USER', departmentCode: 'FINANCE_CENTER' }), 'finance');
  for (const role of ['USER', 'MANAGER', 'unknown', 'admin']) assert.equal(supplierTaxRole({ role, departmentCode: 'BRAND_GROWTH' }), 'viewer');
});
