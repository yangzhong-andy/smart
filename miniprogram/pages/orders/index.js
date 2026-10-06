const { request } = require("../../utils/request");
const { pageSize } = require("../../config/env");
const { money, dateTime, statusLabel, sourceLabel } = require("../../utils/format");

const STATUS_OPTIONS = [
  { label: "全部状态", value: "" },
  { label: "待发货", value: "AWAITING_SHIPMENT" },
  { label: "运输中", value: "IN_TRANSIT" },
  { label: "已送达", value: "DELIVERED" },
  { label: "已完成", value: "COMPLETED" },
  { label: "已取消", value: "CANCELLED" },
];

function decorateOrder(order) {
  return {
    ...order,
    statusText: statusLabel(order.status),
    sourceText: sourceLabel(order.sourceType),
    amountText: money(order.totalAmount, order.currency),
    createTimeText: dateTime(order.createTime),
    displayItems: (order.itemSummary || []).slice(0, 3),
    extraItemCount: Math.max(0, (order.itemSummary || []).length - 3),
  };
}

Page({
  data: {
    orders: [],
    shops: [],
    shopOptions: [{ label: "全部店铺", value: "" }],
    statusOptions: STATUS_OPTIONS,
    selectedShopIndex: 0,
    selectedStatusIndex: 0,
    keywordInput: "",
    keyword: "",
    page: 1,
    total: 0,
    deliveryAlertCount: 0,
    deliveryAlertOnly: false,
    loading: true,
    loadingMore: false,
    hasMore: true,
    error: "",
  },

  onLoad() {
    if (!getApp().requireLogin()) return;
    this.initialize();
  },

  onShow() {
    if (!getApp().requireLogin()) return;
    if (this.data.orders.length) this.loadOrders(true);
  },

  async initialize() {
    this.setData({ loading: true, error: "" });
    await Promise.all([this.loadShops(), this.loadOrders(true)]);
  },

  async loadShops() {
    try {
      const result = await request({ url: "/api/tiktok/data?type=shops" });
      const shops = result.shops || [];
      this.setData({
        shops,
        shopOptions: [{ label: "全部店铺", value: "" }].concat(
          shops.map((shop) => ({ label: shop.shopName, value: shop.shopId }))
        ),
      });
    } catch (error) {
      this.setData({ error: error.message });
    }
  },

  buildQuery(page) {
    const shop = this.data.shopOptions[this.data.selectedShopIndex];
    const status = this.data.statusOptions[this.data.selectedStatusIndex];
    const query = [
      "type=orders",
      `page=${page}`,
      `pageSize=${pageSize}`,
    ];
    if (shop && shop.value) query.push(`shopId=${encodeURIComponent(shop.value)}`);
    if (status && status.value) query.push(`status=${encodeURIComponent(status.value)}`);
    if (this.data.keyword) query.push(`keyword=${encodeURIComponent(this.data.keyword)}`);
    if (this.data.deliveryAlertOnly) query.push("deliveryAlert=1");
    return query.join("&");
  },

  async loadOrders(reset) {
    if (this.data.loadingMore) return;
    const nextPage = reset ? 1 : this.data.page + 1;
    this.setData(reset ? { loading: true, error: "" } : { loadingMore: true });
    try {
      const result = await request({ url: `/api/tiktok/data?${this.buildQuery(nextPage)}` });
      const incoming = (result.data || []).map(decorateOrder);
      const orders = reset ? incoming : this.data.orders.concat(incoming);
      this.setData({
        orders,
        page: nextPage,
        total: result.total || 0,
        deliveryAlertCount: result.deliveryAlertCount || 0,
        hasMore: orders.length < (result.total || 0),
      });
    } catch (error) {
      this.setData({ error: error.message || "订单加载失败" });
    } finally {
      this.setData({ loading: false, loadingMore: false });
      wx.stopPullDownRefresh();
    }
  },

  onPullDownRefresh() {
    this.loadOrders(true);
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) this.loadOrders(false);
  },

  onKeywordInput(event) {
    this.setData({ keywordInput: event.detail.value });
  },

  search() {
    this.setData({ keyword: this.data.keywordInput.trim() }, () => this.loadOrders(true));
  },

  clearSearch() {
    this.setData({ keywordInput: "", keyword: "" }, () => this.loadOrders(true));
  },

  onShopChange(event) {
    this.setData({ selectedShopIndex: Number(event.detail.value) }, () => this.loadOrders(true));
  },

  onStatusChange(event) {
    this.setData({ selectedStatusIndex: Number(event.detail.value), deliveryAlertOnly: false }, () => this.loadOrders(true));
  },

  toggleDeliveryAlert() {
    this.setData({ deliveryAlertOnly: !this.data.deliveryAlertOnly, selectedStatusIndex: 0 }, () => this.loadOrders(true));
  },

  openOrder(event) {
    const index = Number(event.currentTarget.dataset.index);
    const order = this.data.orders[index];
    if (!order) return;
    wx.setStorageSync("selected_order", order);
    wx.navigateTo({ url: `/pages/order-detail/index?orderId=${encodeURIComponent(order.orderId)}` });
  },
});
