import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQianchuanAdvertTotal, normalizeQianchuanBaseUrl } from "./qianchuan-api";

test("normalizes the service base URL without changing its path", () => {
  assert.equal(normalizeQianchuanBaseUrl("https://ads.example.com/service///"), "https://ads.example.com/service");
  assert.throws(() => normalizeQianchuanBaseUrl("ftp://ads.example.com"), /HTTP/);
});

test("merges chart metrics by date and preserves explicit zero values", () => {
  const rows = normalizeQianchuanAdvertTotal({
    data: {
      reportChart: {
        stat_cost: [{ date: "2026-09-08", num: 100 }, { date: "2026-09-09", num: 0 }],
        pay_order_amount: [{ date: "2026-09-08", num: 350 }],
        roi: [{ date: "2026-09-08", num: 3.5 }, { date: "2026-09-09", num: 0 }],
        ecp_convert_cnt: [{ date: "2026-09-08", num: 12.9 }],
        ad_num: [["2026-09-08", 4]],
      },
    },
  }, "2026-09-08", "2026-09-09");
  assert.deepEqual(rows.map(({ rawData: _rawData, ...row }) => row), [
    { date: "2026-09-08", spend: 100, conversions: 12, attributedRevenue: 350, roi: 3.5, adCount: 4 },
    { date: "2026-09-09", spend: 0, conversions: null, attributedRevenue: null, roi: 0, adCount: null },
  ]);
});

test("reads object-style reportSum only for a single-day request", () => {
  const payload = {
    data: {
      reportSum: {
        stat_cost: { now: "12345.67" },
        ecp_convert_cnt: { now: "88" },
        pay_order_amount: { now: "45678.9" },
        roi: { now: "3.7" },
        ad_num: { now: "6" },
      },
    },
  };
  const rows = normalizeQianchuanAdvertTotal(payload, "2026-09-08", "2026-09-08");
  assert.equal(rows.length, 1);
  assert.deepEqual({ ...rows[0], rawData: undefined }, {
    date: "2026-09-08",
    spend: 12345.67,
    conversions: 88,
    attributedRevenue: 45678.9,
    roi: 3.7,
    adCount: 6,
    rawData: undefined,
  });
  assert.deepEqual(normalizeQianchuanAdvertTotal(payload, "2026-09-01", "2026-09-08"), []);
});
