const store = require('./utils/store');
const logger = require('./utils/logger');

App({
  globalData: {
    pendingSettingsPanel: null
  },

  onLaunch() {
    store.loadState();
  },

  onError(error) {
    logger.error('app_error', error);
  },

  onUnhandledRejection(result) {
    logger.error('unhandled_rejection', result && result.reason ? result.reason : result);
  },

  onPageNotFound(result) {
    logger.warn('page_not_found', {
      path: result && result.path,
      query: result && result.query,
      isEntryPage: !!(result && result.isEntryPage)
    });
    wx.switchTab({
      url: '/pages/index/index',
      fail: (error) => logger.error('page_not_found_fallback_failed', error)
    });
  }
});
