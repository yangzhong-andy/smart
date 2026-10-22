import assert from "node:assert/strict";
import test from "node:test";
import { tiktokAffiliateCommissionCost, tiktokAffiliateProfitCostCny } from "./profit-affiliate-commissions";
import { buildProfitComponentAmounts, contributionProfitFromComponents, defaultProfitComponents } from "./profit-schemes";
import { usTikTokProfitInput } from "./profit-us-tiktok";

test("counts TikTok organic affiliate commission", () => {
  const result = tiktokAffiliateCommissionCost({
    fee_tax_breakdown: { fee: { affiliate_commission_amount: "-3.25" } },
  });

  assert.deepEqual(result, { organic: 3.25, ads: 0, total: 3.25 });
});

test("counts TikTok ADS affiliate commission", () => {
  const result = tiktokAffiliateCommissionCost({
    fee_tax_breakdown: { fee: { affiliate_ads_commission_amount: "-1.98" } },
  });

  assert.deepEqual(result, { organic: 0, ads: 1.98, total: 1.98 });
});

test("adds organic and ADS affiliate commissions without losing reversals", () => {
  const result = tiktokAffiliateCommissionCost({
    fee_tax_breakdown: {
      fee: {
        affiliate_commission_amount: "-3",
        affiliate_ads_commission_amount: "1.5",
      },
    },
  });

  assert.deepEqual(result, { organic: 3, ads: -1.5, total: 1.5 });
});

test("treats missing and invalid affiliate fields as zero", () => {
  assert.deepEqual(tiktokAffiliateCommissionCost({}), { organic: 0, ads: 0, total: 0 });
  assert.deepEqual(tiktokAffiliateCommissionCost({
    fee_tax_breakdown: { fee: { affiliate_commission_amount: "not-a-number" } },
  }), { organic: 0, ads: 0, total: 0 });
});

test("profit report deducts a parsed affiliate debit instead of adding it to profit", () => {
  const parsed = tiktokAffiliateCommissionCost({
    fee_tax_breakdown: { fee: { affiliate_commission_amount: "-5.19" } },
  });
  const costCny = tiktokAffiliateProfitCostCny({ BRL: parsed.total }, (amount) => amount * 1.3275);
  assert.equal(parsed.total, 5.19);
  assert.ok(Math.abs(costCny - 6.889725) < 1e-9);
  const components = buildProfitComponentAmounts({ gmvCny: 100, affiliateCommissionCny: costCny },
    defaultProfitComponents("BR", "TIKTOK"));
  assert.ok(Math.abs(contributionProfitFromComponents(components) - (100 - costCny)) < 1e-9);
});

test("affiliate credit reversals reduce costs without changing the debit sign convention", () => {
  const reversal = tiktokAffiliateCommissionCost({
    fee_tax_breakdown: { fee: { affiliate_commission_amount: "1.5" } },
  });
  assert.equal(tiktokAffiliateProfitCostCny({ BRL: reversal.total }, (amount) => amount * 2), -3);
});

test("US settlement fee split receives the raw negative affiliate debit, not the positive profit cost", () => {
  const parsed = tiktokAffiliateCommissionCost({
    fee_tax_breakdown: { fee: { affiliate_commission_amount: "-1.20" } },
  });
  const result = usTikTokProfitInput({
    source: "SETTLED", revenueAmount: "23.76", feeTaxAmount: "-4.82",
    smartPromotionFeeAmount: "-0.83", affiliateCommissionAmount: -parsed.total,
  }, 0);
  assert.equal(parsed.total, 1.2);
  assert.equal(result.platformFeeOriginal, 2.79);
});
