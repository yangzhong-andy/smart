const STATUS_LABELS = {
  UNPAID: "未付款",
  ON_HOLD: "暂停",
  IN_TRANSIT: "运输中",
  DELIVERED: "已送达",
  COMPLETED: "已完成",
  CANCELLED: "已取消",
  AWAITING_COLLECTION: "待揽收",
  AWAITING_SHIPMENT: "待发货",
  IN_REVIEW: "审核中",
  PARTIAL_SHIPPING: "部分发货",
};

const SOURCE_LABELS = {
  NORMAL: "普通订单",
  AFFILIATE_ORGANIC: "达人自然流",
  AFFILIATE_ADS: "达人 ADS 投放",
  FREE_SAMPLE: "达人免费样品",
};

function money(value, currency) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "-";
  return `${currency || "BRL"} ${amount.toFixed(2)}`;
}

function dateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ];
  const time = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  return `${parts.join("-")} ${time}`;
}

function statusLabel(value) {
  return STATUS_LABELS[value] || value || "未知";
}

function sourceLabel(value) {
  return SOURCE_LABELS[value] || "普通订单";
}

module.exports = { STATUS_LABELS, SOURCE_LABELS, money, dateTime, statusLabel, sourceLabel };
