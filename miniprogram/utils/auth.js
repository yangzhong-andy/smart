function getToken() {
  return wx.getStorageSync("erp_token") || "";
}

function saveSession(token, user) {
  wx.setStorageSync("erp_token", token);
  wx.setStorageSync("erp_user", user);
  getApp().globalData.user = user;
}

function clearSession() {
  wx.removeStorageSync("erp_token");
  wx.removeStorageSync("erp_user");
  getApp().globalData.user = null;
}

module.exports = { getToken, saveSession, clearSession };
