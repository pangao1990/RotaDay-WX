const privacy = require('../../utils/privacy');
const logger = require('../../utils/logger');

Component({
  properties: {
    theme: { type: Object, value: {} }
  },

  data: {
    visible: false,
    privacyContractName: '《班妥了小程序用户隐私保护指引》'
  },

  lifetimes: {
    attached() {
      this._privacyResolvers = [];
      this._privacyListener = (resolve) => this.handlePrivacyRequired(resolve);
      this.registerPrivacyListener();
    },

    detached() {
      this.unregisterPrivacyListener();
      this.resolvePending('disagree');
    }
  },

  pageLifetimes: {
    show() {
      this.registerPrivacyListener();
    },

    hide() {
      this.unregisterPrivacyListener();
      this.resolvePending('disagree');
    }
  },

  methods: {
    registerPrivacyListener() {
      if (this._privacyListenerRegistered || typeof wx.onNeedPrivacyAuthorization !== 'function') return;
      wx.onNeedPrivacyAuthorization(this._privacyListener);
      this._privacyListenerRegistered = true;
    },

    unregisterPrivacyListener() {
      if (!this._privacyListenerRegistered) return;
      if (typeof wx.offNeedPrivacyAuthorization === 'function') wx.offNeedPrivacyAuthorization(this._privacyListener);
      this._privacyListenerRegistered = false;
    },

    handlePrivacyRequired(resolve) {
      if (typeof resolve === 'function') this._privacyResolvers.push(resolve);
      this.setData({ visible: true });
      if (typeof wx.getPrivacySetting !== 'function') return;
      wx.getPrivacySetting({
        success: (result) => {
          if (result && result.privacyContractName) this.setData({ privacyContractName: result.privacyContractName });
        },
        fail: (error) => logger.warn('get_privacy_setting_failed', error)
      });
    },

    handleAgreePrivacyAuthorization() {
      this.resolvePending('agree');
    },

    declinePrivacyAuthorization() {
      this.resolvePending('disagree');
    },

    resolvePending(eventName) {
      const resolvers = (this._privacyResolvers || []).slice();
      this._privacyResolvers = [];
      if (this.data.visible) this.setData({ visible: false });
      resolvers.forEach((resolve) => {
        if (eventName === 'agree') resolve({ event: 'agree', buttonId: 'agree-btn' });
        else resolve({ event: 'disagree' });
      });
    },

    openPrivacyContract() {
      privacy.openContract();
    },

    noop() {}
  }
});
