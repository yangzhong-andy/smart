import assert from "node:assert/strict";
import test from "node:test";
import { tiktokAffiliateCommissionCost } from "./profit-affiliate-commissions";

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
