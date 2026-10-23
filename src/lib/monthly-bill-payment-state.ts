/** Never create a second active payment flow for the same monthly bill. */
export function monthlyBillPaymentState(
  status: string,
  paymentFlowId: string | null,
  activeFlowIds: string[],
): "new" | "already-paid" | "conflict" {
  if (status === "Paid") {
    return activeFlowIds.length === 1 && paymentFlowId === activeFlowIds[0]
      ? "already-paid"
      : "conflict";
  }
  if (paymentFlowId || activeFlowIds.length > 0) return "conflict";
  return status === "Approved" || status === "Cashier_Approved" ? "new" : "conflict";
}
