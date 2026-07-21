const TAB_PATHS = {
  schedule: '/pages/index/index',
  statistics: '/pages/statistics/statistics',
  settings: '/pages/settings/settings'
};

function appInstance() {
  try {
    return typeof getApp === 'function' ? getApp() : null;
  } catch (error) {
    return null;
  }
}

function tabBarForPage(page) {
  if (!page || typeof page.getTabBar !== 'function') return;
  try {
    const tabBar = page.getTabBar();
    return tabBar && typeof tabBar.setData === 'function' ? tabBar : null;
  } catch (error) {
    // The framework can briefly omit the custom tab bar while a tab is mounting.
    return null;
  }
}

function syncTabBar(page, active, theme, hidden) {
  const tabBar = tabBarForPage(page);
  if (tabBar) tabBar.setData({ active, theme, hidden: !!hidden });
}

function setTabBarHidden(page, hidden) {
  const tabBar = tabBarForPage(page);
  if (tabBar) tabBar.setData({ hidden: !!hidden });
}

function switchTab(page) {
  const url = TAB_PATHS[page];
  if (!url || typeof wx === 'undefined' || typeof wx.switchTab !== 'function') return;
  wx.switchTab({ url });
}

function requestSettings(panel, tab) {
  const app = appInstance();
  if (app) {
    if (!app.globalData) app.globalData = {};
    app.globalData.pendingSettingsPanel = { panel: panel || '', tab: tab || '' };
  }
  switchTab('settings');
}

function consumeSettingsRequest() {
  const app = appInstance();
  if (!app || !app.globalData || !app.globalData.pendingSettingsPanel) return null;
  const request = app.globalData.pendingSettingsPanel;
  app.globalData.pendingSettingsPanel = null;
  return request;
}

module.exports = {
  TAB_PATHS,
  syncTabBar,
  setTabBarHidden,
  switchTab,
  requestSettings,
  consumeSettingsRequest
};
