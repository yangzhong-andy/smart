import assert from "node:assert/strict";
import test from "node:test";
import { mercadoLivrePaymentFeeBreakdown } from "./mercado-livre-payment-fees";

test("sums the four Mercado Livre charges and subtracts refunds", () => {
  const result = mercadoLivrePaymentFeeBreakdown([{
    id: "payment-1",
    charges_details: [
      { name: "mp_financing_fee", amounts: { original: 4.57, refunded: 1.00 } },
      { name: "mp_processing_fee", amounts: { original: 3.51, refunded: 0.50 } },
      { name: "ml_sale_fee", amounts: { original: 12.98, refunded: 2.00 } },
      { name: "shp_cross_docking", amounts: { original: 21.65, refunded: 0 } },
    ],
  }]);

  assert.deepEqual(result, {
    financingFee: 3.57,
    processingFee: 3.01,
    saleCommission: 10.98,
    sellerShipping: 21.65,
    hasPaymentDetails: true,
    hasChargesDetails: true,
    hasFinancingFee: true,
    hasProcessingFee: true,
    hasSaleCommission: true,
    hasSellerShipping: true,
  });
});

test("uses legacy financing fields without counting financing transfer twice", () => {
  const result = mercadoLivrePaymentFeeBreakdown([{
    charges_details: [
      { name: "mp_financing_1x_fee", amount: 0.24 },
      { name: "financing_transfer", amount: 45.21 },
      { name: "financing_fee", amount: 1.25 },
    ],
  }]);
  assert.equal(result.financingFee, 1.49);
});

test("marks a payment with an empty charges list as available zero fees", () => {
  const result = mercadoLivrePaymentFeeBreakdown([{ id: "payment-2", charges_details: [] }]);
  assert.equal(result.hasPaymentDetails, true);
  assert.equal(result.hasChargesDetails, true);
  assert.equal(result.financingFee, 0);
  assert.equal(result.processingFee, 0);
});
