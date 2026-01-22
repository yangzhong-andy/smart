"use client";

import React, { useState, useEffect, useMemo } from "react";
import { getPaymentRequests, savePaymentRequests, getPaymentRequestsByStatus, type PaymentRequest } from "@/lib/payment-request-store";
import { type BillStatus } from "@/lib/reconciliation-store";
import { getStores, type Store } from "@/lib/store-store";
import { getAccounts, saveAccounts, type BankAccount } from "@/lib/finance-store";
import { formatCurrency } from "@/lib/currency-utils";
import { COUNTRIES } from "@/lib/country-config";
import ImageUploader from "@/components/ImageUploader";
import { FileText, Filter, Plus, Edit, Send, CheckCircle, XCircle, Clock, DollarSign } from "lucide-react";

export default function PaymentRequestPage() {
  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">通用付款申请</h1>
      <p className="text-slate-400">页面功能正在恢复中，请稍候...</p>
    </div>
  );
}
