const logger = require('./logger');

function authorize(options) {
  const config = options || {};
  const success = typeof config.success === 'function' ? config.success : () => {};
  const fail = typeof config.fail === 'function' ? config.fail : () => {};

  if (typeof wx === 'undefined' || typeof wx.requirePrivacyAuthorize !== 'function') {
    success();
    return;
  }

  wx.requirePrivacyAuthorize({
    success,
    fail(error) {
      logger.warn('privacy_authorization_denied', error);
      fail(error);
    }
  });
}

function openContract(options) {
  const config = options || {};
  if (typeof wx === 'undefined') {
    if (typeof config.fail === 'function') config.fail(new Error('wx is unavailable'));
    return;
  }
  if (typeof wx.openPrivacyContract !== 'function') {
    wx.showToast({ title: '当前微信版本不支持打开隐私指引', icon: 'none' });
    if (typeof config.fail === 'function') config.fail(new Error('openPrivacyContract is unavailable'));
    return;
  }

  wx.openPrivacyContract({
    success: config.success,
    fail(error) {
      logger.warn('open_privacy_contract_failed', error);
      wx.showToast({ title: '暂时无法打开隐私保护指引', icon: 'none' });
      if (typeof config.fail === 'function') config.fail(error);
    }
  });
}

module.exports = { authorize, openContract };
