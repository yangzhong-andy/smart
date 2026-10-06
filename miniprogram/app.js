const { getToken } = require("./utils/auth");

App({
  globalData: {
    user: null,
  },

  onLaunch() {
    const user = wx.getStorageSync("erp_user");
    this.globalData.user = user || null;
  },

  requireLogin() {
    if (getToken()) return true;
    wx.reLaunch({ url: "/pages/login/index" });
    return false;
  },
});
