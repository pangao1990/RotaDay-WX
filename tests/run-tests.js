const assert = require('assert');
const fs = require('fs');
const path = require('path');

const memory = {};
global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = value; },
  setBackgroundColor() {},
  setNavigationBarTitle() {},
  setNavigationBarColor() {},
  showShareMenu() {},
  showToast() {},
  showLoading() {},
  hideLoading() {},
  navigateTo() {},
  reLaunch() {},
  switchTab() {},
  setClipboardData() {},
  getClipboardData() {},
  showModal() {},
  openSetting() {},
  openPrivacyContract() {},
  requirePrivacyAuthorize(options) { if (options && options.success) options.success(); },
  getLogManager() { return { debug() {}, info() {}, warn() {}, error() {} }; },
  getFileSystemManager() { return { writeFileSync() {} }; },
  env: { USER_DATA_PATH: '/tmp' }
};
const appInstance = { globalData: { pendingSettingsPanel: null } };
global.getApp = () => appInstance;

const defaults = require('../utils/defaults');
const dateUtils = require('../utils/date');
const schedule = require('../utils/schedule');
const themeUtils = require('../utils/theme');
const { getDailyGreeting } = require('../utils/greeting');
const moment = require('../utils/moment');
const store = require('../utils/store');
const privacy = require('../utils/privacy');
const navigation = require('../utils/navigation');

function test(name, fn) {
  try {
    fn();
    process.stdout.write(`✓ ${name}\n`);
  } catch (error) {
    process.stderr.write(`✗ ${name}\n${error.stack}\n`);
    process.exitCode = 1;
  }
}

test('跨午夜工时会落到次日并扣除休息', () => {
  assert.strictEqual(schedule.calculateDuration(1200, 480, 60, true), 660);
  assert.strictEqual(schedule.calculateDuration(480, 1020, 60, true), 480);
  assert.strictEqual(schedule.calculateDuration(-1, -1, 0, false), 0);
});

test('循环模板支持负日期偏移和单日覆盖', () => {
  const state = defaults.createDefaultState();
  state.cycleEnabled = true;
  state.cycleStartKey = '2026-07-01';
  assert.strictEqual(schedule.getPersonalShiftKey(state, '2026-07-01'), 'day');
  assert.strictEqual(schedule.getPersonalShiftKey(state, '2026-07-03'), 'night');
  assert.strictEqual(schedule.getPersonalShiftKey(state, '2026-07-05'), 'rest');
  assert.strictEqual(schedule.getPersonalShiftKey(state, '2026-06-30'), 'rest');
  state.assignments['2026-07-03'] = 'morning';
  assert.strictEqual(schedule.getPersonalShiftKey(state, '2026-07-03'), 'morning');
});

test('月历始终生成六行并包含相邻月份', () => {
  const state = defaults.createDefaultState();
  const days = schedule.buildCalendar(state, 2026, 6);
  assert.strictEqual(days.length, 42);
  assert(days.some((day) => !day.inMonth));
  assert.strictEqual(new Set(days.map((day) => day.dateKey)).size, 42);
});

test('个人版首次使用没有排班时统计保持为空', () => {
  const state = defaults.createDefaultState();
  assert.strictEqual(state.cycleEnabled, false);
  const stats = schedule.calculateMonthStatistics(state, 2026, 6);
  const counts = schedule.calculateMonthShiftCounts(state, 2026, 6);
  assert.strictEqual(stats.workDays, 0);
  assert.strictEqual(stats.restDays, 0);
  assert.strictEqual(stats.totalMinutes, 0);
  assert.strictEqual(counts.reduce((sum, item) => sum + item.count, 0), 0);
});

test('个人月度统计与班次分布保持一致', () => {
  const state = defaults.createDefaultState();
  state.cycleEnabled = true;
  state.cycleStartKey = '2026-07-01';
  const stats = schedule.calculateMonthStatistics(state, 2026, 6);
  const counts = schedule.calculateMonthShiftCounts(state, 2026, 6);
  const totalDays = counts.reduce((sum, item) => sum + item.count, 0);
  assert.strictEqual(totalDays, 31);
  assert.strictEqual(stats.workDays + stats.restDays, 31);
  assert(stats.totalMinutes > 0);
});

test('团队排班按成员和日期组成复合键', () => {
  const state = defaults.createDefaultState();
  state.teamMembers.push({ id: 'nurse-a', name: '小林', role: '护士', color: '#2388CF', isSelf: false });
  state.teamAssignments[schedule.teamAssignmentKey('2026-07-21', 'self')] = 'day';
  state.teamAssignments[schedule.teamAssignmentKey('2026-07-21', 'nurse-a')] = 'night';
  assert.strictEqual(schedule.teamCountForDate(state, '2026-07-21'), 2);
  const stats = schedule.calculateTeamMonthStatistics(state, 2026, 6);
  assert.strictEqual(stats.workAssignments, 2);
  assert.strictEqual(stats.nightAssignments, 1);
  assert.strictEqual(stats.dailyCounts['2026-07-21'], 2);
  assert.strictEqual(stats.members.find((item) => item.member.id === 'nurse-a').nightDays, 1);
});

test('自定义深色主题自动生成可读文字与卡片色', () => {
  const theme = themeUtils.customTheme('#79C7E3', '#111A26');
  assert.strictEqual(theme.text, '#F5F8FC');
  assert.notStrictEqual(theme.surface, theme.page);
  assert(themeUtils.themeVars(theme).includes('--brand:#79C7E3'));
});

test('同一天同一时段问候语保持稳定', () => {
  const first = getDailyGreeting(new Date(2026, 6, 21, 8, 30));
  const second = getDailyGreeting(new Date(2026, 6, 21, 9, 59));
  assert.strictEqual(first, second);
});

test('片刻场景由班次和模式驱动', () => {
  const state = defaults.createDefaultState();
  const today = dateUtils.todayKey();
  state.appMode = 'team';
  state.teamAssignments[schedule.teamAssignmentKey(today, 'self')] = 'morning';
  assert.strictEqual(moment.sceneForState(state, new Date(2026, 6, 21, 9)), 'morning');
  const selected = moment.chooseMoment(state, 'rest');
  assert.strictEqual(selected.audience, 'team');
  assert.strictEqual(selected.sceneKey, 'rest');
  assert.strictEqual(selected.historyKey, 'team:rest');
  assert.strictEqual(selected.image, '/assets/moments/team.jpg');
  assert.strictEqual(selected.posterImage, '/assets/moments/team.jpg');
  assert.strictEqual(selected.fallbackPosterImage, '/assets/moments/team.jpg');
  [selected.image, selected.posterImage, selected.fallbackPosterImage].forEach((asset) => {
    assert(fs.existsSync(path.join(__dirname, '..', asset.slice(1))), `缺少片刻资源 ${asset}`);
  });
  Object.values(moment.SCENES).concat(Object.values(moment.TEAM_SCENES)).forEach((scene) => {
    assert(fs.existsSync(path.join(__dirname, '..', scene.posterImage.slice(1))));
  });
});

test('片刻文案与鸿蒙版保持同等丰富度并复用轻量图片', () => {
  assert.strictEqual(Object.keys(moment.SCENES).length, 7);
  assert.strictEqual(Object.keys(moment.TEAM_SCENES).length, 7);
  const allScenes = Object.values(moment.SCENES).concat(Object.values(moment.TEAM_SCENES));
  allScenes.forEach((scene) => {
    assert.strictEqual(scene.titles.length, 12, scene.key);
    assert.strictEqual(scene.bodies.length, 10, scene.key);
    assert.strictEqual(scene.titles.length * scene.bodies.length, 120, scene.key);
  });
  const totalCombinations = allScenes.reduce((sum, scene) => sum + scene.titles.length * scene.bodies.length, 0);
  assert.strictEqual(totalCombinations, 1680);
  assert.strictEqual(new Set(Object.values(moment.SCENES).map((scene) => scene.posterImage)).size, 7);
  assert.strictEqual(new Set(Object.values(moment.TEAM_SCENES).map((scene) => scene.posterImage)).size, 1);
});

test('片刻近期三十条不重复且内容倾向会筛选真实文案', () => {
  const state = defaults.createDefaultState();
  const messages = new Set();
  for (let index = 0; index < 30; index += 1) {
    const selected = moment.chooseMoment(state, 'day');
    messages.add(`${selected.title}|${selected.copy}`);
    state.momentHistory[selected.historyKey] = selected.nextHistory;
  }
  assert.strictEqual(messages.size, 30);

  state.momentToneIndex = 1;
  const spiritual = moment.chooseMoment(state, 'day');
  assert.strictEqual(spiritual.tone.includes('鼓舞') || spiritual.tone.includes('情绪价值'), false);
  state.momentToneIndex = 2;
  const emotional = moment.chooseMoment(state, 'day');
  assert.strictEqual(emotional.tone.includes('鼓舞') || emotional.tone.includes('情绪价值'), true);
});

test('团队片刻按场景变化并与个人历史隔离', () => {
  const personalState = defaults.createDefaultState();
  const personal = moment.chooseMoment(personalState, 'night');
  personalState.momentHistory[personal.historyKey] = personal.nextHistory;
  personalState.appMode = 'team';
  const team = moment.chooseMoment(personalState, 'night');
  assert.strictEqual(personal.historyKey, 'night');
  assert.strictEqual(team.historyKey, 'team:night');
  assert.strictEqual(team.kicker, '团队夜班 · 守住节奏');
  assert.strictEqual(team.image, '/assets/moments/team.jpg');
});

test('设置快捷入口通过微信 tabBar 传递待打开面板', () => {
  const originalSwitchTab = wx.switchTab;
  let target = '';
  wx.switchTab = ({ url }) => { target = url; };
  navigation.requestSettings('shifts', 'cycle');
  assert.strictEqual(target, '/pages/settings/settings');
  assert.deepStrictEqual(navigation.consumeSettingsRequest(), { panel: 'shifts', tab: 'cycle' });
  assert.strictEqual(navigation.consumeSettingsRequest(), null);
  wx.switchTab = originalSwitchTab;
});

test('自定义 tabBar 会按真实路由切换并保留切换中的最后一次点击', () => {
  const originalSwitchTab = wx.switchTab;
  const originalGetCurrentPages = global.getCurrentPages;
  const calls = [];
  const completes = [];
  let route = 'pages/index/index';
  global.getCurrentPages = () => [{ route }];
  wx.switchTab = ({ url, complete }) => {
    calls.push(url);
    completes.push(() => {
      route = url.slice(1);
      if (complete) complete();
    });
  };

  const { instance } = instantiateComponent('../custom-tab-bar/index.js');
  instance.data.active = 'schedule';
  instance.switchPage({ currentTarget: { dataset: { page: 'statistics' } } });
  instance.switchPage({ currentTarget: { dataset: { page: 'settings' } } });
  assert.deepStrictEqual(calls, ['/pages/statistics/statistics']);
  completes.shift()();
  assert.deepStrictEqual(calls, ['/pages/statistics/statistics', '/pages/settings/settings']);
  completes.shift()();

  route = 'pages/statistics/statistics';
  instance.data.active = 'schedule';
  instance.switchPage({ currentTarget: { dataset: { page: 'schedule' } } });
  assert.strictEqual(calls[calls.length - 1], '/pages/index/index');
  completes.shift()();

  wx.switchTab = originalSwitchTab;
  global.getCurrentPages = originalGetCurrentPages;
});

test('备份可以完整导出和恢复', () => {
  const state = defaults.createDefaultState();
  state.assignments['2026-07-21'] = 'night';
  const backup = store.exportBackup(state);
  const restored = store.importBackup(backup);
  assert.strictEqual(restored.assignments['2026-07-21'], 'night');
  assert.strictEqual(restored.shifts.length, state.shifts.length);
});

test('隐私授权守卫只在微信授权成功后继续敏感操作', () => {
  const original = wx.requirePrivacyAuthorize;
  let continued = 0;
  let denied = 0;
  wx.requirePrivacyAuthorize = ({ success }) => success();
  privacy.authorize({ success: () => { continued += 1; }, fail: () => { denied += 1; } });
  assert.strictEqual(continued, 1);
  assert.strictEqual(denied, 0);

  wx.requirePrivacyAuthorize = ({ fail }) => fail({ errMsg: 'privacy permission is not authorized' });
  privacy.authorize({ success: () => { continued += 1; }, fail: () => { denied += 1; } });
  assert.strictEqual(continued, 1);
  assert.strictEqual(denied, 1);
  wx.requirePrivacyAuthorize = original;
});

test('损坏或越界的备份字段会被安全归一化', () => {
  const restored = store.normalizeState({
    themeIndex: 99,
    cycleTemplateIndex: -5,
    reminders: { shiftEnabled: true },
    shifts: [{ key: 'day', name: '', shortName: '超长简称', color: 'bad', startMinutes: -8, endMinutes: 5000, breakMinutes: 999, isWork: true }],
    teamMembers: [{ id: 'broken', name: '', color: 'bad' }],
    assignments: { bad: 'day', '2026-07-21': 'missing' }
  });
  assert.strictEqual(restored.themeIndex, 7);
  assert.strictEqual(restored.cycleTemplateIndex, 0);
  assert(restored.shifts.some((shift) => shift.key === 'none'));
  assert(restored.shifts.some((shift) => shift.key === 'rest'));
  assert(restored.teamMembers.some((member) => member.isSelf));
  assert.deepStrictEqual(restored.assignments, {});
  assert.strictEqual(Object.prototype.hasOwnProperty.call(restored, 'reminders'), false);
});

test('异常大备份会限制集合规模并丢弃未知字段', () => {
  const raw = defaults.createDefaultState();
  raw.unknownField = '不应保留';
  raw.customThemeBrand = 'bad';
  raw.customThemePage = '#112233';
  raw.teamMembers = Array.from({ length: store.MAX_MEMBERS + 12 }, (_, index) => ({
    id: `member_${index}`,
    name: `成员${index}`,
    role: '测试',
    color: '#2388CF',
    isSelf: false
  }));
  raw.momentHistory = {
    rest: { messages: ['0-0', '0-0', '12-10', '11-9', '1-2'] },
    'team:night': { messages: ['10-8', '99-99'] },
    bad: { messages: ['0-1'] }
  };
  const restored = store.normalizeState(raw);
  assert(restored.teamMembers.length <= store.MAX_MEMBERS);
  assert(restored.teamMembers.some((member) => member.isSelf));
  assert.strictEqual(restored.customThemeBrand, '#2F73C9');
  assert.strictEqual(restored.customThemePage, '#112233');
  assert.deepStrictEqual(restored.momentHistory.rest.messages, ['0-0', '11-9', '1-2']);
  assert.deepStrictEqual(restored.momentHistory['team:night'].messages, ['10-8']);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(restored, 'unknownField'), false);
  assert.throws(() => store.importBackup('x'.repeat(store.MAX_BACKUP_LENGTH + 1)), /备份文件过大/);
});

test('异常备份中的本人身份始终唯一且优先使用固定成员 ID', () => {
  const restored = store.normalizeState({
    teamMembers: [
      { id: 'self', name: '我', role: '负责人', color: '#368B78', isSelf: false },
      { id: 'leader', name: '代班负责人', role: '主管', color: '#2388CF', isSelf: true }
    ]
  });
  assert.strictEqual(new Set(restored.teamMembers.map((member) => member.id)).size, restored.teamMembers.length);
  assert.strictEqual(restored.teamMembers.filter((member) => member.isSelf).length, 1);
  assert.strictEqual(restored.teamMembers.find((member) => member.id === 'self').isSelf, true);
});

function setPath(target, pathValue, value) {
  const parts = pathValue.split('.');
  let cursor = target;
  parts.slice(0, -1).forEach((part) => {
    if (!cursor[part] || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  });
  cursor[parts[parts.length - 1]] = value;
}

function instantiatePage(relativePath) {
  let definition;
  global.Page = (value) => { definition = value; };
  const full = require.resolve(relativePath);
  delete require.cache[full];
  require(full);
  const instance = {};
  Object.keys(definition).forEach((key) => {
    if (key === 'data') return;
    instance[key] = typeof definition[key] === 'function' ? definition[key].bind(instance) : definition[key];
  });
  instance.data = JSON.parse(JSON.stringify(definition.data || {}));
  instance.setData = (updates, callback) => {
    Object.keys(updates).forEach((key) => setPath(instance.data, key, updates[key]));
    if (callback) callback();
  };
  return instance;
}

function instantiateComponent(relativePath) {
  let definition;
  global.Component = (value) => { definition = value; };
  const full = require.resolve(relativePath);
  delete require.cache[full];
  require(full);
  const instance = {};
  Object.keys(definition.methods || {}).forEach((key) => {
    instance[key] = definition.methods[key].bind(instance);
  });
  instance.data = JSON.parse(JSON.stringify(definition.data || {}));
  instance.setData = (updates) => {
    Object.keys(updates).forEach((key) => setPath(instance.data, key, updates[key]));
  };
  return { definition, instance };
}

test('海报生成会在完成或超时后解除加载状态', () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const originalHideLoading = wx.hideLoading;
  let timeoutCallback;
  let hideCount = 0;
  global.setTimeout = (callback) => { timeoutCallback = callback; return 7; };
  global.clearTimeout = () => {};
  wx.hideLoading = () => { hideCount += 1; };

  const page = instantiatePage('../pages/index/index.js');
  const firstToken = page.beginPosterGeneration();
  assert.strictEqual(page.isPosterGenerationActive(firstToken), true);
  assert.strictEqual(page.finishPosterGeneration(firstToken), true);
  assert.strictEqual(hideCount, 1);
  timeoutCallback();
  assert.strictEqual(hideCount, 1);

  const secondToken = page.beginPosterGeneration();
  assert.strictEqual(page.isPosterGenerationActive(secondToken), true);
  timeoutCallback();
  assert.strictEqual(page.isPosterGenerationActive(secondToken), false);
  assert.strictEqual(hideCount, 2);

  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
  wx.hideLoading = originalHideLoading;
});

test('片刻“每次打开”会在页面每次显示时重新触发', () => {
  const originalSetTimeout = global.setTimeout;
  const originalClearTimeout = global.clearTimeout;
  const callbacks = [];
  global.setTimeout = (callback) => { callbacks.push(callback); return callbacks.length; };
  global.clearTimeout = () => {};
  const page = instantiatePage('../pages/index/index.js');
  page.state = defaults.createDefaultState();
  page.state.momentFrequencyIndex = 2;
  page.scheduleAutomaticMoment();
  callbacks.shift()();
  assert.strictEqual(page.data.showMoment, true);
  page.closeMoment();
  page.scheduleAutomaticMoment();
  callbacks.shift()();
  assert.strictEqual(page.data.showMoment, true);
  global.setTimeout = originalSetTimeout;
  global.clearTimeout = originalClearTimeout;
});

test('休息时长覆盖整个班次时不会保存无效班次', () => {
  const originalShowToast = wx.showToast;
  let toastTitle = '';
  wx.showToast = ({ title }) => { toastTitle = title; };
  const page = instantiatePage('../pages/settings/settings.js');
  page.state = defaults.createDefaultState();
  page.data.shiftDraft = {
    creating: true,
    key: 'custom_invalid',
    name: '测试班',
    shortName: '测',
    color: '#368B78',
    startMinutes: 540,
    endMinutes: 600,
    breakMinutes: 60,
    isWork: true,
    builtIn: false
  };
  page.saveShift();
  assert.strictEqual(toastTitle, '休息时间不能等于或超过班次时长');
  assert.strictEqual(page.state.shifts.some((shift) => shift.key === 'custom_invalid'), false);
  wx.showToast = originalShowToast;
});

test('成员与班次数量达到上限时不会继续打开新增表单', () => {
  const originalShowToast = wx.showToast;
  const toasts = [];
  wx.showToast = ({ title }) => { toasts.push(title); };

  const indexPage = instantiatePage('../pages/index/index.js');
  indexPage.state = defaults.createDefaultState();
  indexPage.state.teamMembers = Array.from({ length: store.MAX_MEMBERS }, (_, index) => ({
    id: index === 0 ? 'self' : `member_${index}`,
    name: `成员${index}`,
    role: '',
    color: '#2388CF',
    isSelf: index === 0
  }));
  indexPage.showAddMember();
  assert.strictEqual(indexPage.data.showMemberEditor, false);

  const settingsPage = instantiatePage('../pages/settings/settings.js');
  settingsPage.state = defaults.createDefaultState();
  while (settingsPage.state.shifts.length < store.MAX_SHIFTS) {
    const index = settingsPage.state.shifts.length;
    settingsPage.state.shifts.splice(settingsPage.state.shifts.length - 1, 0, {
      key: `custom_${index}`,
      name: `班次${index}`,
      shortName: '班',
      color: '#368B78',
      startMinutes: 540,
      endMinutes: 1020,
      breakMinutes: 60,
      isWork: true,
      builtIn: false
    });
  }
  settingsPage.openShiftForm({ currentTarget: { dataset: {} } });
  assert.strictEqual(settingsPage.data.showShiftForm, false);
  assert(toasts.some((title) => title.includes('最多可添加')));
  assert(toasts.some((title) => title.includes('最多可保留')));
  wx.showToast = originalShowToast;
});

test('编辑成员或班次时当前颜色始终出现在首屏色板中', () => {
  const indexPage = instantiatePage('../pages/index/index.js');
  indexPage.state = defaults.createDefaultState();
  indexPage.showEditMember({ currentTarget: { dataset: { memberId: 'self' } } });
  assert.strictEqual(indexPage.data.memberColorOptions.length, 8);
  assert(indexPage.data.memberColorOptions.includes(indexPage.data.memberDraft.color));

  const settingsPage = instantiatePage('../pages/settings/settings.js');
  settingsPage.state = defaults.createDefaultState();
  settingsPage.state.shifts.push({
    key: 'custom_color',
    name: '彩色班',
    shortName: '彩',
    color: '#ABCDEF',
    startMinutes: 540,
    endMinutes: 1020,
    breakMinutes: 60,
    isWork: true,
    builtIn: false
  });
  settingsPage.openShiftForm({ currentTarget: { dataset: { shiftKey: 'custom_color' } } });
  assert.strictEqual(settingsPage.data.shiftColorOptions.length, 8);
  assert(settingsPage.data.shiftColorOptions.includes('#ABCDEF'));
});

test('团队密度跟随主题色且年度 CSV 工时列保持纯数值', () => {
  const state = defaults.createDefaultState();
  state.appMode = 'team';
  state.themeIndex = 1;
  state.teamAssignments['2026-07-21|self'] = 'day';
  store.saveState(state);

  const page = instantiatePage('../pages/statistics/statistics.js');
  page.viewYear = 2026;
  page.viewMonth = 6;
  page.refreshPage();
  const density = page.data.dailyDensity.find((item) => item.day === 21);
  assert.strictEqual(density.background, 'rgba(121,199,227,1.000)');

  const originalSetClipboardData = wx.setClipboardData;
  let clipboard = '';
  wx.setClipboardData = ({ data, success }) => {
    clipboard = data;
    if (success) success();
  };
  page.data.period = 'year';
  page.data.periodLabel = '2026年';
  page.data.monthRhythm = [{ month: '7月', mainValue: 2, hours: '16', detail: '2 个工作班次 · 16 小时' }];
  page.data.memberLoad = [];
  page.exportTeamCsv();
  assert(clipboard.includes('"7月","2","16"'));
  assert(!clipboard.includes('2 个工作班次 · 16 小时'));
  wx.setClipboardData = originalSetClipboardData;
});

test('本地片刻插画会优先直接交给 CanvasImage 加载', () => {
  const originalGetImageInfo = wx.getImageInfo;
  let getImageInfoCalls = 0;
  let loadedSource = '';
  let loadedImage;
  wx.getImageInfo = () => { getImageInfoCalls += 1; };
  const canvas = {
    createImage() {
      const image = {};
      Object.defineProperty(image, 'src', {
        set(value) {
          loadedSource = value;
          image.onload();
        }
      });
      return image;
    }
  };
  const page = instantiatePage('../pages/index/index.js');
  page.loadPosterImage(canvas, ['/assets/moments/day-1.jpg'], {
    success: (image) => { loadedImage = image; },
    fail: (error) => { throw error; }
  });
  assert(loadedImage);
  assert.strictEqual(loadedSource, '/assets/moments/day-1.jpg');
  assert.strictEqual(getImageInfoCalls, 0);
  wx.getImageInfo = originalGetImageInfo;
});

test('CanvasImage 本地根路径失败时会尝试兼容路径', () => {
  const originalGetImageInfo = wx.getImageInfo;
  let getImageInfoCalls = 0;
  const attempted = [];
  let loadedSource = '';
  wx.getImageInfo = () => { getImageInfoCalls += 1; };
  const canvas = {
    createImage() {
      const image = {};
      Object.defineProperty(image, 'src', {
        set(value) {
          attempted.push(value);
          if (value === '../../assets/moments/day-1.jpg') {
            loadedSource = value;
            image.onload();
          } else {
            image.onerror({ errMsg: `cannot load ${value}` });
          }
        }
      });
      return image;
    }
  };
  const page = instantiatePage('../pages/index/index.js');
  page.loadPosterImage(canvas, ['/assets/moments/day-1.jpg'], {
    success: () => {},
    fail: (error) => { throw error; }
  });
  assert.deepStrictEqual(attempted, [
    '/assets/moments/day-1.jpg',
    'assets/moments/day-1.jpg',
    '../../assets/moments/day-1.jpg'
  ]);
  assert.strictEqual(loadedSource, '../../assets/moments/day-1.jpg');
  assert.strictEqual(getImageInfoCalls, 0);
  wx.getImageInfo = originalGetImageInfo;
});

test('隐私弹窗会用官方按钮结果继续或终止待处理接口', () => {
  const originalOnNeed = wx.onNeedPrivacyAuthorization;
  const originalOffNeed = wx.offNeedPrivacyAuthorization;
  const originalGetSetting = wx.getPrivacySetting;
  let listener;
  wx.onNeedPrivacyAuthorization = (callback) => { listener = callback; };
  wx.offNeedPrivacyAuthorization = () => { listener = undefined; };
  wx.getPrivacySetting = ({ success }) => success({ privacyContractName: '《测试隐私指引》' });

  const { definition, instance } = instantiateComponent('../components/privacy-dialog/index.js');
  definition.lifetimes.attached.call(instance);
  let result;
  listener((value) => { result = value; });
  assert.strictEqual(instance.data.visible, true);
  assert.strictEqual(instance.data.privacyContractName, '《测试隐私指引》');
  instance.handleAgreePrivacyAuthorization();
  assert.deepStrictEqual(result, { event: 'agree', buttonId: 'agree-btn' });
  assert.strictEqual(instance.data.visible, false);

  listener((value) => { result = value; });
  instance.declinePrivacyAuthorization();
  assert.deepStrictEqual(result, { event: 'disagree' });
  definition.lifetimes.detached.call(instance);
  wx.onNeedPrivacyAuthorization = originalOnNeed;
  wx.offNeedPrivacyAuthorization = originalOffNeed;
  wx.getPrivacySetting = originalGetSetting;
});

test('排班、统计和设置页面可在最小小程序运行时完成首屏计算', () => {
  store.resetState();
  const originalSetTimeout = global.setTimeout;
  global.setTimeout = () => 0;
  const indexPage = instantiatePage('../pages/index/index.js');
  indexPage.onLoad();
  assert.strictEqual(indexPage.data.calendarDays.length, 42);
  assert(indexPage.data.todayShift.name);
  indexPage.openShiftEditor();
  indexPage.setData({ editorShiftKey: 'night' });
  indexPage.savePersonalShift();
  assert.strictEqual(store.loadState(true).assignments[indexPage.data.selectedDateKey], 'night');

  const statisticsPage = instantiatePage('../pages/statistics/statistics.js');
  statisticsPage.onLoad();
  assert.strictEqual(statisticsPage.data.summaryCards.length, 4);
  assert.strictEqual(statisticsPage.data.showPeriodReset, false);
  statisticsPage.changePeriod({ currentTarget: { dataset: { delta: -1 } } });
  assert.strictEqual(statisticsPage.data.showPeriodReset, true);
  statisticsPage.goCurrent();
  assert.strictEqual(statisticsPage.data.showPeriodReset, false);
  statisticsPage.switchPeriod({ currentTarget: { dataset: { period: 'year' } } });
  assert.strictEqual(statisticsPage.data.showPeriodReset, false);
  statisticsPage.changePeriod({ currentTarget: { dataset: { delta: -1 } } });
  assert.strictEqual(statisticsPage.data.showPeriodReset, true);
  statisticsPage.goCurrent();
  assert.strictEqual(statisticsPage.data.showPeriodReset, false);

  const settingsPage = instantiatePage('../pages/settings/settings.js');
  settingsPage.onLoad({ panel: 'theme' });
  assert.strictEqual(settingsPage.data.themeCards.length, 8);
  assert.strictEqual(settingsPage.data.panel, 'theme');
  global.setTimeout = originalSetTimeout;
});

if (process.exitCode) process.exit(process.exitCode);
