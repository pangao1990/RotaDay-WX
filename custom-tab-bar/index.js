const TAB_URLS = {
  schedule: '/pages/index/index',
  statistics: '/pages/statistics/statistics',
  settings: '/pages/settings/settings'
};

function currentTabUrl() {
  if (typeof getCurrentPages !== 'function') return '';
  try {
    const pages = getCurrentPages();
    const current = pages && pages.length ? pages[pages.length - 1] : null;
    return current && current.route ? `/${current.route}` : '';
  } catch (error) {
    return '';
  }
}

Component({
  properties: {
    active: { type: String, value: 'schedule' },
    hidden: { type: Boolean, value: false },
    theme: {
      type: Object,
      value: {
        surface: '#FFFFFF',
        border: '#D5E5F4',
        brand: '#2F73C9',
        muted: '#52677C'
      }
    }
  },

  lifetimes: {
    detached() {
      if (this.tabSwitchTimer) clearTimeout(this.tabSwitchTimer);
      this.tabSwitchTimer = 0;
      this.tabSwitching = false;
      this.pendingTabUrl = '';
    }
  },

  methods: {
    switchPage(event) {
      const page = event.currentTarget.dataset.page;
      const url = TAB_URLS[page];
      if (!url) return;
      this.pendingTabUrl = url;
      this.flushTabSwitch();
    },

    flushTabSwitch() {
      if (this.tabSwitching) return;
      const url = this.pendingTabUrl;
      this.pendingTabUrl = '';
      if (!url || currentTabUrl() === url) return;

      this.tabSwitching = true;
      this.tabSwitchTimer = setTimeout(() => this.finishTabSwitch(), 1200);
      wx.switchTab({
        url,
        complete: () => this.finishTabSwitch()
      });
    },

    finishTabSwitch() {
      if (!this.tabSwitching) return;
      if (this.tabSwitchTimer) clearTimeout(this.tabSwitchTimer);
      this.tabSwitchTimer = 0;
      this.tabSwitching = false;
      if (this.pendingTabUrl) this.flushTabSwitch();
    }
  }
});
