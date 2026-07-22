const FALLBACK_VERSION = '1.0.1';

function getMiniProgramVersion() {
  try {
    if (typeof wx !== 'undefined' && typeof wx.getAccountInfoSync === 'function') {
      const accountInfo = wx.getAccountInfoSync();
      const miniProgram = accountInfo && accountInfo.miniProgram;
      const version = miniProgram && miniProgram.version;
      if (miniProgram && miniProgram.envVersion !== 'develop' && typeof version === 'string' && version.trim()) {
        return version.trim();
      }
    }
  } catch (error) {
    // Development tools and older base libraries fall back to the local build version.
  }
  return FALLBACK_VERSION;
}

module.exports = {
  FALLBACK_VERSION,
  getMiniProgramVersion
};
