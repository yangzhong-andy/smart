const { clearSession } = require("../../utils/auth");
const { apiBaseUrl } = require("../../config/env");

Page({
  data: { user: null, apiBaseUrl },

  onShow() {
    if (!getApp().requireLogin()) return;
    this.setData({ user: wx.getStorageSync("erp_user") || null });
  },

  logout() {
    wx.showModal({
      title: "退出登录",
      content: "确定退出当前 ERP 账号吗？",
      confirmColor: "#b42318",
      success: (result) => {
        if (!result.confirm) return;
        clearSession();
        wx.reLaunch({ url: "/pages/login/index" });
      },
    });
  },
});
