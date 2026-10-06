const { request } = require("../../utils/request");
const { saveSession, getToken } = require("../../utils/auth");

Page({
  data: {
    email: "",
    password: "",
    showPassword: false,
    loading: false,
    error: "",
  },

  onLoad() {
    if (getToken()) wx.switchTab({ url: "/pages/orders/index" });
  },

  onEmailInput(event) {
    this.setData({ email: event.detail.value, error: "" });
  },

  onPasswordInput(event) {
    this.setData({ password: event.detail.value, error: "" });
  },

  togglePassword() {
    this.setData({ showPassword: !this.data.showPassword });
  },

  async submit() {
    const email = this.data.email.trim();
    const password = this.data.password;
    if (!email || !password) {
      this.setData({ error: "请输入 ERP 邮箱和密码" });
      return;
    }
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const result = await request({
        url: "/api/auth/simple-login",
        method: "POST",
        data: { email, password },
        skipAuthRedirect: true,
      });
      saveSession(result.token, result.user);
      wx.switchTab({ url: "/pages/orders/index" });
    } catch (error) {
      this.setData({ error: error.message || "登录失败" });
    } finally {
      this.setData({ loading: false });
    }
  },
});
