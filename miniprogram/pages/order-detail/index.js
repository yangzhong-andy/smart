const { money, dateTime, statusLabel, sourceLabel } = require("../../utils/format");

Page({
  data: { order: null },

  onLoad(options) {
    if (!getApp().requireLogin()) return;
    const stored = wx.getStorageSync("selected_order");
    if (!stored || stored.orderId !== options.orderId) {
      wx.showToast({ title: "订单数据已失效", icon: "none" });
      return;
    }
    const order = {
      ...stored,
      amountText: money(stored.totalAmount, stored.currency),
      statusText: statusLabel(stored.status),
      sourceText: sourceLabel(stored.sourceType),
      createTimeText: dateTime(stored.createTime),
      updateTimeText: dateTime(stored.updateTime),
      deliveryTimeText: dateTime(stored.deliveryTime),
    };
    this.setData({ order });
  },

  copyOrderId() {
    wx.setClipboardData({ data: this.data.order.orderId });
  },

  copyTracking() {
    if (!this.data.order.trackingNumber) return;
    wx.setClipboardData({ data: this.data.order.trackingNumber });
  },
});
