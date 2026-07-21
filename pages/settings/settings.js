const store = require('../../utils/store');
const schedule = require('../../utils/schedule');
const themeUtils = require('../../utils/theme');
const dateUtils = require('../../utils/date');
const privacy = require('../../utils/privacy');
const logger = require('../../utils/logger');
const navigation = require('../../utils/navigation');
const {
  THEMES,
  CYCLE_TEMPLATES,
  SHIFT_COLORS,
  CUSTOM_BRAND_COLORS,
  CUSTOM_PAGE_COLORS
} = require('../../utils/defaults');

function minutesFromClock(value) {
  const parts = String(value || '00:00').split(':').map(Number);
  return Math.max(0, Math.min(1439, (parts[0] || 0) * 60 + (parts[1] || 0)));
}

function titleForPanel(panel) {
  const titles = {
    mode: '使用模式',
    theme: '主题外观',
    calendar: '日历显示',
    moment: '打开小程序的片刻',
    shifts: '班次与循环',
    backup: '数据备份',
    about: '关于班妥了'
  };
  return titles[panel] || '';
}

function shiftPalette(selectedColor, expanded) {
  const limit = expanded ? SHIFT_COLORS.length : 8;
  const options = SHIFT_COLORS.slice(0, limit);
  const selected = String(selectedColor || '').toUpperCase();
  if (selected && !options.includes(selected)) return [selected].concat(options).slice(0, limit);
  return options;
}

Page({
  data: {
    theme: {},
    themeVars: '',
    panel: '',
    panelTitle: '',
    appMode: 'personal',
    themeIndex: 0,
    themeCards: [],
    customBrandInput: '#2F73C9',
    customPageInput: '#F7FBFF',
    customBrandColors: CUSTOM_BRAND_COLORS,
    customPageColors: CUSTOM_PAGE_COLORS,
    weekStart: 1,
    time24: true,
    momentFrequencyIndex: 0,
    momentToneIndex: 0,
    shiftTab: 'cycle',
    cycleEnabled: true,
    cycleStartKey: '',
    cycleTemplates: [],
    shifts: [],
    showShiftForm: false,
    shiftDraft: {},
    shiftColorOptions: SHIFT_COLORS.slice(0, 8),
    showAllShiftColors: false
  },

  onLoad(options) {
    this.skipInitialShowRefresh = true;
    this.initialPanel = options && options.panel ? options.panel : '';
    this.initialShiftTab = options && options.tab ? options.tab : '';
    this.refreshPage();
    if (this.initialPanel) {
      this.updateModalState({
        panel: this.initialPanel,
        panelTitle: titleForPanel(this.initialPanel),
        shiftTab: this.initialShiftTab || this.data.shiftTab
      });
      this.initialPanel = '';
      this.initialShiftTab = '';
    }
  },

  onShow() {
    if (this.skipInitialShowRefresh) this.skipInitialShowRefresh = false;
    else if (this.state) this.refreshPage();
    const pending = navigation.consumeSettingsRequest();
    const panel = pending && pending.panel ? pending.panel : this.initialPanel;
    const tab = pending && pending.tab ? pending.tab : this.initialShiftTab;
    if (panel) {
      this.updateModalState({ panel, panelTitle: titleForPanel(panel), shiftTab: tab || this.data.shiftTab });
    }
    this.initialPanel = '';
    this.initialShiftTab = '';
  },

  onReady() {
    this.syncModalTabBar();
  },

  onHide() {
    if (this.data.panel || this.data.showShiftForm) this.updateModalState({ panel: '', showShiftForm: false });
    else navigation.setTabBarHidden(this, false);
  },

  onUnload() {
    navigation.setTabBarHidden(this, false);
  },

  hasOpenModal() {
    return !!(this.data.panel || this.data.showShiftForm);
  },

  syncModalTabBar() {
    navigation.setTabBarHidden(this, this.hasOpenModal());
  },

  updateModalState(data, callback) {
    this.setData(data, () => {
      this.syncModalTabBar();
      if (typeof callback === 'function') callback();
    });
  },

  refreshPage() {
    this.state = store.loadState(true);
    const theme = themeUtils.resolveTheme(this.state);
    const themeCards = THEMES.map((item, index) => {
      const resolved = index === THEMES.length - 1 ? themeUtils.customTheme(this.state.customThemeBrand, this.state.customThemePage) : item;
      return Object.assign({}, resolved, { index, selected: index === this.state.themeIndex, recommended: !!item.recommended });
    });
    const cycleTemplates = CYCLE_TEMPLATES.map((template, index) => ({
      key: template.key,
      name: template.name,
      description: template.description,
      index,
      selected: index === Number(this.state.cycleTemplateIndex),
      preview: template.sequence.map((key, previewIndex) => {
        const shift = schedule.getShift(this.state, key);
        return { key: `${template.key}-${previewIndex}`, name: shift.shortName, color: shift.color };
      })
    }));
    this.setData({
      theme,
      themeVars: themeUtils.themeVars(theme),
      appMode: this.state.appMode,
      themeIndex: Number(this.state.themeIndex) || 0,
      themeCards,
      customBrandInput: this.state.customThemeBrand,
      customPageInput: this.state.customThemePage,
      weekStart: this.state.weekStart,
      time24: this.state.time24 !== false,
      momentFrequencyIndex: Number(this.state.momentFrequencyIndex) || 0,
      momentToneIndex: Number(this.state.momentToneIndex) || 0,
      cycleEnabled: !!this.state.cycleEnabled,
      cycleStartKey: this.state.cycleStartKey,
      cycleTemplates,
      shifts: schedule.normalizedShifts(this.state)
    });
    navigation.syncTabBar(this, 'settings', theme, this.hasOpenModal());
    try {
      wx.setNavigationBarTitle({ title: '设置' });
      wx.setBackgroundColor({ backgroundColor: theme.page, backgroundColorTop: theme.page, backgroundColorBottom: theme.page });
      wx.setNavigationBarColor({
        frontColor: themeUtils.luminance(theme.page) < 0.38 ? '#ffffff' : '#000000',
        backgroundColor: theme.page,
        animation: { duration: 0, timingFunc: 'linear' }
      });
    } catch (error) {
      // Page background remains correct through CSS variables.
    }
  },

  openPanel(event) {
    const panel = event.currentTarget.dataset.panel;
    this.updateModalState({ panel, panelTitle: titleForPanel(panel) });
  },

  closePanel() {
    this.updateModalState({ panel: '', showShiftForm: false });
  },

  selectMode(event) {
    const mode = event.currentTarget.dataset.mode;
    if (!['personal', 'team'].includes(mode)) return;
    this.state.appMode = mode;
    store.saveState(this.state);
    navigation.switchTab('schedule');
  },

  selectTheme(event) {
    const index = Number(event.currentTarget.dataset.index);
    this.state.themeIndex = index;
    store.saveState(this.state);
    this.refreshPage();
  },

  customBrandInput(event) {
    this.setData({ customBrandInput: event.detail.value });
  },

  customPageInput(event) {
    this.setData({ customPageInput: event.detail.value });
  },

  chooseCustomBrand(event) {
    const color = event.currentTarget.dataset.color;
    this.setData({ customBrandInput: color }, () => this.applyCustomTheme());
  },

  chooseCustomPage(event) {
    const color = event.currentTarget.dataset.color;
    this.setData({ customPageInput: color }, () => this.applyCustomTheme());
  },

  applyCustomTheme() {
    if (!themeUtils.isHexColor(this.data.customBrandInput) || !themeUtils.isHexColor(this.data.customPageInput)) {
      wx.showToast({ title: '请输入完整的六位十六进制颜色', icon: 'none' });
      return;
    }
    this.state.themeIndex = 7;
    this.state.customThemeBrand = this.data.customBrandInput.toUpperCase();
    this.state.customThemePage = this.data.customPageInput.toUpperCase();
    store.saveState(this.state);
    this.refreshPage();
    wx.showToast({ title: '自定义主题已应用', icon: 'success' });
  },

  setWeekStart(event) {
    this.state.weekStart = Number(event.currentTarget.dataset.value);
    store.saveState(this.state);
    this.refreshPage();
  },

  toggleTime24(event) {
    this.state.time24 = !!event.detail.value;
    store.saveState(this.state);
    this.refreshPage();
  },

  selectMomentFrequency(event) {
    this.state.momentFrequencyIndex = Number(event.currentTarget.dataset.index);
    store.saveState(this.state);
    this.refreshPage();
  },

  selectMomentTone(event) {
    this.state.momentToneIndex = Number(event.currentTarget.dataset.index);
    store.saveState(this.state);
    this.refreshPage();
  },

  switchShiftTab(event) {
    this.setData({ shiftTab: event.currentTarget.dataset.tab });
  },

  toggleCycle(event) {
    this.state.cycleEnabled = !!event.detail.value;
    store.saveState(this.state);
    this.refreshPage();
  },

  chooseCycleTemplate(event) {
    this.state.cycleTemplateIndex = Number(event.currentTarget.dataset.index);
    store.saveState(this.state);
    this.refreshPage();
  },

  changeCycleStart(event) {
    this.state.cycleStartKey = event.detail.value;
    store.saveState(this.state);
    this.refreshPage();
  },

  openShiftForm(event) {
    const key = event.currentTarget.dataset.shiftKey;
    if (!key && (this.state.shifts || []).length >= store.MAX_SHIFTS) {
      wx.showToast({ title: `最多可保留 ${store.MAX_SHIFTS} 个班次`, icon: 'none' });
      return;
    }
    let shift;
    if (key) {
      shift = schedule.getShift(this.state, key);
    } else {
      shift = schedule.decorateShift({
        key: `custom_${Date.now()}`,
        name: '新班次',
        shortName: '新',
        color: SHIFT_COLORS[0],
        startMinutes: 540,
        endMinutes: 1080,
        breakMinutes: 60,
        isWork: true,
        builtIn: false
      });
    }
    this.updateModalState({
      showShiftForm: true,
      showAllShiftColors: false,
      shiftColorOptions: shiftPalette(shift.color, false),
      shiftDraft: Object.assign({}, shift, {
        creating: !key,
        startTime: schedule.formatClock(shift.startMinutes, true),
        endTime: schedule.formatClock(shift.endMinutes, true)
      })
    });
  },

  closeShiftForm() {
    this.updateModalState({ showShiftForm: false });
  },

  shiftNameInput(event) {
    this.setData({ 'shiftDraft.name': event.detail.value });
  },

  shiftShortInput(event) {
    this.setData({ 'shiftDraft.shortName': event.detail.value });
  },

  shiftStartChange(event) {
    this.setData({ 'shiftDraft.startTime': event.detail.value, 'shiftDraft.startMinutes': minutesFromClock(event.detail.value) });
  },

  shiftEndChange(event) {
    this.setData({ 'shiftDraft.endTime': event.detail.value, 'shiftDraft.endMinutes': minutesFromClock(event.detail.value) });
  },

  shiftBreakChange(event) {
    this.setData({ 'shiftDraft.breakMinutes': Number(event.detail.value) || 0 });
  },

  chooseShiftColor(event) {
    this.setData({ 'shiftDraft.color': event.currentTarget.dataset.color });
  },

  toggleShiftColors() {
    const expanded = !this.data.showAllShiftColors;
    this.setData({
      showAllShiftColors: expanded,
      shiftColorOptions: shiftPalette(this.data.shiftDraft.color, expanded)
    });
  },

  saveShift() {
    const draft = Object.assign({}, this.data.shiftDraft);
    draft.name = String(draft.name || '').trim().slice(0, 8);
    draft.shortName = String(draft.shortName || '').trim().slice(0, 2);
    if (!draft.name || (draft.key !== 'none' && !draft.shortName)) {
      wx.showToast({ title: '请填写班次名称和简称', icon: 'none' });
      return;
    }
    if (draft.isWork && schedule.calculateDuration(Number(draft.startMinutes), Number(draft.endMinutes), Number(draft.breakMinutes) || 0, true) <= 0) {
      wx.showToast({ title: '休息时间不能等于或超过班次时长', icon: 'none' });
      return;
    }
    const saved = {
      key: draft.key,
      name: draft.name,
      shortName: draft.shortName,
      color: draft.color,
      startMinutes: draft.isWork ? Number(draft.startMinutes) : -1,
      endMinutes: draft.isWork ? Number(draft.endMinutes) : -1,
      breakMinutes: draft.isWork ? Number(draft.breakMinutes) || 0 : 0,
      isWork: !!draft.isWork,
      builtIn: !!draft.builtIn
    };
    const index = this.state.shifts.findIndex((shift) => shift.key === saved.key);
    if (index >= 0) this.state.shifts[index] = saved;
    else {
      if ((this.state.shifts || []).length >= store.MAX_SHIFTS) {
        wx.showToast({ title: `最多可保留 ${store.MAX_SHIFTS} 个班次`, icon: 'none' });
        return;
      }
      this.state.shifts.splice(Math.max(1, this.state.shifts.length - 1), 0, saved);
    }
    store.saveState(this.state);
    this.updateModalState({ showShiftForm: false });
    this.refreshPage();
    wx.showToast({ title: '班次已保存', icon: 'success' });
  },

  deleteShift() {
    const draft = this.data.shiftDraft;
    if (draft.builtIn) return;
    if (schedule.isShiftInUse(this.state, draft.key)) {
      wx.showToast({ title: '该班次仍在排班中使用', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '删除自定义班次',
      content: `确认删除“${draft.name}”？`,
      confirmColor: '#B04E43',
      success: (result) => {
        if (!result.confirm) return;
        this.state.shifts = this.state.shifts.filter((shift) => shift.key !== draft.key);
        store.saveState(this.state);
        this.updateModalState({ showShiftForm: false });
        this.refreshPage();
      }
    });
  },

  exportBackup() {
    const text = store.exportBackup(this.state);
    wx.setClipboardData({
      data: text,
      success: () => wx.showModal({ title: '备份已复制', content: '完整备份 JSON 已复制到剪贴板。请粘贴到安全的位置保存。', showCancel: false }),
      fail: (error) => {
        logger.warn('export_backup_clipboard_failed', error);
        wx.showToast({ title: '复制失败，请稍后重试', icon: 'none' });
      }
    });
  },

  importBackup() {
    privacy.authorize({
      success: () => this.readBackupFromClipboard(),
      fail: () => wx.showToast({ title: '未授权读取剪贴板，无法恢复备份', icon: 'none' })
    });
  },

  readBackupFromClipboard() {
    wx.getClipboardData({
      success: (result) => {
        let restored;
        try {
          restored = store.importBackup(result.data);
        } catch (error) {
          wx.showToast({ title: '剪贴板中没有有效备份', icon: 'none' });
          return;
        }
        wx.showModal({
          title: '确认导入备份',
          content: '导入会覆盖当前的个人排班、团队成员、主题和片刻设置。',
          confirmText: '覆盖并恢复',
          success: (confirm) => {
            if (!confirm.confirm) return;
            store.saveState(restored);
            this.refreshPage();
            wx.showToast({ title: '备份已恢复', icon: 'success' });
          }
        });
      },
      fail: (error) => {
        logger.warn('import_backup_clipboard_failed', error);
        wx.showToast({ title: '读取剪贴板失败，请稍后重试', icon: 'none' });
      }
    });
  },

  resetAllData() {
    wx.showModal({
      title: '重置全部数据',
      content: '这会清除个人与团队排班、成员、主题和设置，且不能撤销。建议先导出备份。',
      confirmText: '确认重置',
      confirmColor: '#B04E43',
      success: (result) => {
        if (!result.confirm) return;
        store.resetState();
        this.refreshPage();
        this.closePanel();
        wx.showToast({ title: '已恢复初始状态', icon: 'success' });
      }
    });
  },

  onShareAppMessage() {
    return { title: '班妥了｜排班不纠结，班妥了就行', path: '/pages/index/index' };
  },

  noop() {}
});
