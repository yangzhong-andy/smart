"use client";

import { useEffect, useMemo, useRef } from "react";
import useSWR from "swr";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { jsPDF } from "jspdf";
import html2canvas from "html2canvas";
import { amountToChineseUppercase } from "@/lib/amount-to-chinese";

type ContractItem = {
  sku: string;
  skuName?: string;
  spec?: string;
  productName?: string;
  material?: string;
  specDescription?: string;
  unitPrice: number;
  quantity: number;
  totalAmount: number;
};

type ContractSnapshotBuyer = {
  name: string;
  address?: string;
  phone?: string;
  contact?: string;
  bankAccount?: string;
  bankAccountName?: string;
  bankName?: string;
  taxId?: string;
};

type ContractSnapshot = {
  contractNumber: string;
  orderNumber?: string;
  /** 甲方（需方）：本公司信息 */
  buyer?: ContractSnapshotBuyer;
  supplierName: string;
  supplierContact?: string;
  supplierPhone?: string;
  supplierAddress?: string;
  supplierBankAccount?: string;
  supplierBankName?: string;
  supplierTaxId?: string;
  orderDate: string;
  deliveryDate: string;
  leadTimeDays: number;
  items: ContractItem[];
  totalAmount: number;
  amountUppercase: string;
  depositRate?: number;
  depositAmount?: number;
  tailPeriodDays?: number;
};

const currency = (n: number) =>
  new Intl.NumberFormat("zh-CN", {
    style: "currency",
    currency: "CNY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);

export default function ContractPreviewPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;
  const printRef = useRef<HTMLDivElement>(null);

  const fetcher = async (url: string) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error("获取合同失败");
    return res.json();
  };
  const { data, error, isLoading: loading, mutate } = useSWR<{
    id: string;
    contractNumber: string;
    snapshot: ContractSnapshot;
  } | null>(id ? `/api/contracts/${id}` : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 60000,
  });
  useEffect(() => {
    if (error) toast.error("加载合同失败");
  }, [error]);

  const items = data?.snapshot?.items ?? [];
  const groupedByPrototype = useMemo(() => {
    const key = (item: ContractItem) => item.skuName || item.productName || item.sku || "";
    const map = new Map<string, ContractItem[]>();
    for (const item of items) {
      const k = key(item);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(item);
    }
    return Array.from(map.entries()).map(([name, items]) => ({ name, items }));
  }, [items]);

  const totalAmountFront = useMemo(
    () => items.reduce((sum, i) => sum + i.totalAmount, 0),
    [items]
  );
  const amountUppercaseFront = useMemo(
    () => amountToChineseUppercase(totalAmountFront),
    [totalAmountFront]
  );

  const handleDownloadPdf = async () => {
    if (!printRef.current || !data) return;
    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2,
        useCORS: true,
        logging: false,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png", 1);
      const pdf = new jsPDF("p", "mm", "a4");
      const w = 210;
      const h = (canvas.height * w) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, w, h);
      pdf.save(`采购合同-${data.snapshot.contractNumber}.pdf`);
      toast.success("PDF 已下载");
    } catch (e) {
      console.error(e);
      toast.error("导出 PDF 失败");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">加载中...</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <p className="text-slate-400">合同不存在</p>
        <Link href="/procurement/purchase-orders" className="ml-4 text-cyan-400 hover:underline">
          返回采购订单
        </Link>
      </div>
    );
  }

  const s = data.snapshot;

  return (
    <div className="min-h-screen bg-slate-800 py-6 px-4">
      <div className="max-w-4xl mx-auto">
        {/* 操作栏 */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/procurement/purchase-orders"
            className="inline-flex items-center gap-2 text-slate-400 hover:text-slate-200"
          >
            <ArrowLeft className="w-4 h-4" />
            返回采购订单
          </Link>
          <button
            type="button"
            onClick={handleDownloadPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white"
          >
            <Download className="w-4 h-4" />
            下载 PDF
          </button>
        </div>

        {/* A4 合同内容 - 打印区域 */}
        <div
          ref={printRef}
          className="bg-white text-black rounded-lg shadow-xl overflow-hidden"
          style={{ width: "210mm", minHeight: "297mm", margin: "0 auto" }}
        >
          <div className="p-10 text-sm" style={{ fontFamily: "SimSun, serif", fontSize: "12px" }}>
            {/* 标题：公司名 + 采购订单，右侧订单编号 */}
            <div className="flex justify-between items-start mb-6">
              <h1 className="text-xl font-bold">采购订单</h1>
              <p className="font-semibold">订单编号：【{s.contractNumber}】</p>
            </div>

            {/* 甲乙双方 */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="font-semibold mb-2">甲方（需方）</p>
                <p>名称：{s.buyer?.name ?? "_________________________"}</p>
                <p>地址：{s.buyer?.address ?? "_________________________"}</p>
                <p>电话：{s.buyer?.phone ?? "_________________________"}</p>
                <p>联系代表：{s.buyer?.contact ?? "_________________________"}</p>
              </div>
              <div>
                <p className="font-semibold mb-2">乙方（供方）</p>
                <p>名称：{s.supplierName}</p>
                {s.supplierAddress && <p>地址：{s.supplierAddress}</p>}
                {s.supplierPhone && <p>电话：{s.supplierPhone}</p>}
                {s.supplierContact && <p>联系代表：{s.supplierContact}</p>}
              </div>
            </div>

            <p className="mb-4"><span className="font-semibold">合同编号：</span>{s.contractNumber}</p>
            <p className="mb-4"><span className="font-semibold">交货日期：</span>{s.deliveryDate}</p>
            <p className="mb-6"><span className="font-semibold">合同日期：</span>{s.orderDate}</p>

            {/* 货品信息表：产品名称、型号、颜色、单价(不含税)、数量、总价(不含税)、规格、产品尺寸信息 */}
            <p className="font-semibold mb-2">货品信息</p>
            <table className="w-full border-collapse border border-slate-400 text-sm mb-4">
              <thead>
                <tr className="bg-slate-100">
                  <th className="border border-slate-400 px-2 py-1.5 text-left">产品名称</th>
                  <th className="border border-slate-400 px-2 py-1.5 text-left">产品型号</th>
                  <th className="border border-slate-400 px-2 py-1.5 text-left">产品颜色</th>
                  <th className="border border-slate-400 px-2 py-1.5 text-right">单价（不含税）</th>
                  <th className="border border-slate-400 px-2 py-1.5 text-right">数量</th>
                  <th className="border border-slate-400 px-2 py-1.5 text-right">总价（不含税）</th>
                  <th className="border border-slate-400 px-2 py-1.5 text-center">规格</th>
                  <th className="border border-slate-400 px-2 py-1.5 text-left">产品尺寸信息</th>
                </tr>
              </thead>
              <tbody>
                {s.items.map((item, idx) => (
                  <tr key={idx}>
                    <td className="border border-slate-400 px-2 py-1.5">{item.skuName || item.productName || item.sku || "—"}</td>
                    <td className="border border-slate-400 px-2 py-1.5">{item.sku}</td>
                    <td className="border border-slate-400 px-2 py-1.5">{item.spec ? `${item.spec}（见样布颜色）` : "—"}</td>
                    <td className="border border-slate-400 px-2 py-1.5 text-right">{currency(item.unitPrice)}</td>
                    <td className="border border-slate-400 px-2 py-1.5 text-right">{item.quantity}</td>
                    <td className="border border-slate-400 px-2 py-1.5 text-right">{currency(item.totalAmount)}</td>
                    <td className="border border-slate-400 px-2 py-1.5 text-center">个</td>
                    <td className="border border-slate-400 px-2 py-1.5">{item.specDescription || "—"}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 font-semibold">
                  <td className="border border-slate-400 px-2 py-1.5" colSpan={4}>总金额</td>
                  <td className="border border-slate-400 px-2 py-1.5 text-right">{items.reduce((sum, i) => sum + i.quantity, 0)}</td>
                  <td className="border border-slate-400 px-2 py-1.5 text-right">{currency(totalAmountFront)}</td>
                  <td className="border border-slate-400 px-2 py-1.5" colSpan={2}></td>
                </tr>
              </tfoot>
            </table>

            {/* 总金额：大写、小写、币种 */}
            <div className="mb-6 space-y-1">
              <p><span className="font-semibold">总金额（大写）：</span>{amountUppercaseFront}</p>
              <p><span className="font-semibold">（小写）：</span><span className="font-bold text-red-600">{currency(totalAmountFront)}</span></p>
              <p><span className="font-semibold">币种：</span><span className="font-bold">[人民币]</span></p>
            </div>

            {/* 付款条款 */}
            <div className="mb-6">
              <p className="font-semibold mb-2">付款条款</p>
              <p className="leading-relaxed">
                付款方式：自本合同签订之日起，买方需在2个工作日之内支付货款的百分之{s.depositRate ?? 30}（预付款：{s.depositAmount != null ? Math.round(s.depositAmount).toLocaleString() : Math.round(totalAmountFront * ((s.depositRate ?? 30) / 100)).toLocaleString()}人民币）预付款，卖方在收到买方预付款后需立即进行材料采购安排生产。买方确认数量无误，需立即支付所发产品剩余的百分之{100 - (s.depositRate ?? 30)}的货款（具体金额根据实际出货量计算）。
              </p>
            </div>

            {/* 账号信息 */}
            <div className="grid grid-cols-2 gap-6 mb-6">
              <div>
                <p className="font-semibold mb-1">收款账号</p>
                <p>卡号：{s.supplierBankAccount || "_________________________"}</p>
                <p>姓名：{s.supplierContact || "_________________________"}</p>
                <p>开户行：{s.supplierBankName || "_________________________"}</p>
              </div>
              <div>
                <p className="font-semibold mb-1">付款账号</p>
                <p>卡号：{s.buyer?.bankAccount ?? "_________________________"}</p>
                <p>姓名：{s.buyer?.bankAccountName ?? "_________________________"}</p>
                <p>开户行：{s.buyer?.bankName ?? "_________________________"}</p>
              </div>
            </div>

            {/* 交货、运输、质量要求 */}
            <div className="mb-6 space-y-1">
              <p><span className="font-semibold">交货时间：</span>{s.deliveryDate}</p>
              <p><span className="font-semibold">运输方式：</span>生产工厂交货</p>
              <p><span className="font-semibold">其它质量要求：</span>[不良率不得高于1%]</p>
            </div>

            {/* 违约责任 */}
            <div className="mb-6">
              <p className="font-semibold mb-2">违约责任</p>
              <p className="leading-relaxed text-xs">
                若非卖方原因，逾期付款将按每日总货款千分之三由买方承担违约金；若非买方原因导致未能按时交货，逾期将按每日总货款千分之三由卖方承担违约金；如有其他违约由违约方赔偿对方相应损失（包括诉讼费、律师费、交通费等）。
              </p>
            </div>

            {/* 包装要求 */}
            <div className="mb-6">
              <p className="font-semibold mb-2">包装要求</p>
              <ol className="list-decimal list-inside space-y-1 text-xs leading-relaxed">
                <li>用甲方所提供图纸的纸箱包装，纸箱上需清晰印刷甲方要求内容。</li>
                <li>商品标签贴在纸箱侧唛上。</li>
                <li>胶带封箱时，箱口封紧不要留空隙，用透明胶带封箱。</li>
                <li>保持产品完整，若纸箱有破损或纸箱不符合要求的要重新包装后再出货。</li>
                <li>产品需要做防水涂层。</li>
                <li>一套包括：产品、好评卡、说明书、包装袋、气泡袋、外箱。</li>
              </ol>
            </div>

            {/* 不合格品 */}
            <div className="mb-6">
              <p className="font-semibold mb-2">不合格品</p>
              <p className="leading-relaxed text-xs">
                如买方在验货时发现不合格品，卖方须立即退回重做或补充其它合格品；如所发现的不合格品数量占验货数量的比例超出10%的，买方有权全部退回并取消订单，卖方应承担退货运费、退回买方已付款并承担订单总金额的30%的违约金。
              </p>
            </div>

            {/* 其他 */}
            <div className="mb-8">
              <p className="font-semibold mb-2">其他</p>
              <p className="leading-relaxed text-xs">
                本合同一式两份，经双方签字盖章后生效，具有相同法律效力。本合同甲、乙双方各执一份，具有同等法律效力。签约双方若有不尽事宜，均可通过补充协议的方式协商解决。本合同若发生经济纠纷，由甲方所在地人民法院管辖。
              </p>
            </div>

            {/* 签字盖章 */}
            <div className="grid grid-cols-2 gap-12 mt-10">
              <div>
                <p className="font-semibold mb-1">甲方盖章</p>
                <p className="mt-6">代表签字：_________________________</p>
                <p className="mt-2">日期：_________________________</p>
              </div>
              <div>
                <p className="font-semibold mb-1">乙方盖章</p>
                <p className="mt-6">代表签字：_________________________</p>
                <p className="mt-2">日期：_________________________</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
