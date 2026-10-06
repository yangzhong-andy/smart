const { apiBaseUrl } = require("../config/env");
const { getToken, clearSession } = require("./auth");

function request(options) {
  const token = getToken();
  return new Promise((resolve, reject) => {
    wx.request({
      url: `${apiBaseUrl}${options.url}`,
      method: options.method || "GET",
      data: options.data,
      timeout: options.timeout || 20000,
      header: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.header || {}),
      },
      success(response) {
        if (response.statusCode === 401 && !options.skipAuthRedirect) {
          clearSession();
          wx.reLaunch({ url: "/pages/login/index" });
          reject(new Error("登录已过期，请重新登录"));
          return;
        }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const message = response.data && (response.data.error || response.data.message);
          reject(new Error(message || `请求失败（${response.statusCode}）`));
          return;
        }
        resolve(response.data);
      },
      fail(error) {
        reject(new Error(error.errMsg || "网络连接失败"));
      },
    });
  });
}

module.exports = { request };
