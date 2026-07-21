const store = require('../../utils/store');
const dateUtils = require('../../utils/date');
const schedule = require('../../utils/schedule');
const themeUtils = require('../../utils/theme');
const privacy = require('../../utils/privacy');
const logger = require('../../utils/logger');
const navigation = require('../../utils/navigation');
const { getDailyGreeting } = require('../../utils/greeting');
const momentEngine = require('../../utils/moment');
const { MEMBER_COLORS } = require('../../utils/defaults');

function minutesText(minutes) {
  if (minutes < 60) return `${Math.max(1, Math.ceil(minutes))} 分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = Math.ceil(minutes % 60);
  return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}

function shiftStatusText(shift, dateKey) {
  if (shift.key === 'rest') return '今天不用上班，好好休息';
  if (!shift.isWork) return '今天暂无安排';
  if (dateKey !== dateUtils.todayKey()) return '当天班次已安排';
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, shift.startMinutes, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, shift.endMinutes, 0, 0);
  if (shift.endMinutes <= shift.startMinutes) end.setDate(end.getDate() + 1);
  if (now < start) return `还有 ${minutesText((start.getTime() - now.getTime()) / 60000)}上班`;
  if (now < end) return `距离下班还有 ${minutesText((end.getTime() - now.getTime()) / 60000)}`;
  return '今天辛苦了，记得好好休息';
}

function memberPalette(selectedColor, expanded) {
  const limit = expanded ? MEMBER_COLORS.length : 8;
  const options = MEMBER_COLORS.slice(0, limit);
  const selected = String(selectedColor || '').toUpperCase();
  if (selected && !options.includes(selected)) return [selected].concat(options).slice(0, limit);
  return options;
}

Page({
  data: {
    theme: {},
    themeVars: '',
    isTeam: false,
    greetingDate: '',
    greeting: '',
    monthLabel: '',
    weekdays: [],
    calendarDays: [],
    selectedDateKey: '',
    selectedDateTitle: '',
    todayShift: {},
    todayStatus: '',
    todayTeamCount: 0,
    todayTeamPreview: '',
    selectedShift: {},
    selectedHasOverride: false,
    selectedTeamDetails: [],
    nextRestText: '',
    shifts: [],
    showShiftEditor: false,
    editorShiftKey: 'none',
    editorDateTitle: '',
    editorHasOverride: false,
    showTeamManager: false,
    teamManagerTab: 'scheduled',
    teamScheduled: [],
    teamAvailable: [],
    clipboardText: '',
    showTeamShiftEditor: false,
    teamDraftMember: {},
    teamDraftShiftKey: 'none',
    showMemberEditor: false,
    memberDraft: {},
    memberColorOptions: MEMBER_COLORS.slice(0, 8),
    showAllMemberColors: false,
    showMoment: false,
    moment: {}
  },

  onLoad() {
    const now = new Date();
    this.skipInitialShowRefresh = true;
    this.state = store.loadState(true);
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.nextRestDays = -1;
    this.setData({ selectedDateKey: dateUtils.todayKey() });
    try {
      if (wx.showShareMenu) wx.showShareMenu({ menus: ['shareAppMessage', 'shareTimeline'] });
    } catch (error) {
      logger.warn('show_share_menu_failed', error);
    }
    this.refreshPage();
    this.autoMomentChecked = false;
  },

  onShow() {
    if (this.skipInitialShowRefresh) this.skipInitialShowRefresh = false;
    else if (this.state) this.refreshPage(true);
    this.scheduleAutomaticMoment();
  },

  onReady() {
    this.syncModalTabBar();
  },

  onUnload() {
    this.cancelAutomaticMoment();
    if (this.posterGenerationTimer) clearTimeout(this.posterGenerationTimer);
    this.posterGenerationTimer = 0;
    this.posterGenerationToken = 0;
    navigation.setTabBarHidden(this, false);
    wx.hideLoading();
  },

  onHide() {
    this.cancelAutomaticMoment();
  },

  hasOpenModal() {
    return !!(
      this.data.showShiftEditor
      || this.data.showTeamManager
      || this.data.showTeamShiftEditor
      || this.data.showMemberEditor
      || this.data.showMoment
    );
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

  refreshPage(forceLoad) {
    if (forceLoad) this.state = store.loadState(true);
    const state = this.state;
    const theme = themeUtils.resolveTheme(state);
    const selectedDateKey = this.data.selectedDateKey || dateUtils.todayKey();
    const calendarDays = schedule.buildCalendar(state, this.viewYear, this.viewMonth).map((day) => {
      const selected = day.dateKey === selectedDateKey;
      const classes = ['calendar-day'];
      if (!day.inMonth) classes.push('outside');
      if (day.isToday) classes.push('today');
      if (selected) classes.push('selected');
      if (day.isOverride) classes.push('override');
      return Object.assign({}, day, { classes: classes.join(' '), selected });
    });
    const today = dateUtils.todayKey();
    const todayShift = schedule.getShift(state, schedule.getPersonalShiftKey(state, today));
    const selectedShift = schedule.getShift(state, schedule.getPersonalShiftKey(state, selectedDateKey));
    const selectedTeamDetails = this.mapTeamDetails(selectedDateKey);
    const todayTeamDetails = this.mapTeamDetails(today);
    const nextRestDays = state.appMode === 'personal' ? schedule.findNextRestDays(state, today) : -1;
    this.nextRestDays = nextRestDays;
    let nextRestText = '';
    if (nextRestDays === 0) nextRestText = '今天就是休息日';
    else if (nextRestDays > 0) nextRestText = `再上 ${nextRestDays} 天，就能休息`; 
    else nextRestText = '未来 31 天还没有休息安排';

    this.setData({
      theme,
      themeVars: themeUtils.themeVars(theme),
      isTeam: state.appMode === 'team',
      greetingDate: `${dateUtils.displayDate(today)} ${dateUtils.weekdayLabel(today, true)}`,
      greeting: getDailyGreeting(new Date()),
      monthLabel: dateUtils.monthLabel(this.viewYear, this.viewMonth),
      weekdays: state.weekStart === 0 ? ['日', '一', '二', '三', '四', '五', '六'] : ['一', '二', '三', '四', '五', '六', '日'],
      calendarDays,
      selectedDateTitle: `${dateUtils.displayDate(selectedDateKey)} ${dateUtils.weekdayLabel(selectedDateKey, true)}`,
      todayShift,
      todayStatus: shiftStatusText(todayShift, today),
      todayTeamCount: todayTeamDetails.length,
      todayTeamPreview: todayTeamDetails.length ? todayTeamDetails.slice(0, 3).map((item) => `${item.name} ${item.shiftName}`).join(' · ') : '今天还没有安排成员',
      selectedShift,
      selectedHasOverride: !!(state.assignments && Object.prototype.hasOwnProperty.call(state.assignments, selectedDateKey)),
      selectedTeamDetails,
      nextRestText,
      shifts: schedule.normalizedShifts(state)
    });
    if (this.data.showTeamManager) this.rebuildTeamManagerData();
    navigation.syncTabBar(this, 'schedule', theme, this.hasOpenModal());
    try {
      wx.setNavigationBarTitle({ title: '班妥了' });
      wx.setBackgroundColor({ backgroundColor: theme.page, backgroundColorTop: theme.page, backgroundColorBottom: theme.page });
      wx.setNavigationBarColor({
        frontColor: themeUtils.luminance(theme.page) < 0.38 ? '#ffffff' : '#000000',
        backgroundColor: theme.page,
        animation: { duration: 0, timingFunc: 'linear' }
      });
    } catch (error) {
      // Older base libraries simply keep the page-level background color.
    }
  },

  mapTeamDetails(dateKey) {
    return schedule.teamDetailsForDate(this.state, dateKey).map((item) => ({
      id: item.member.id,
      name: item.member.name,
      role: item.member.role || '未设置岗位',
      color: item.member.color,
      initial: item.member.name.slice(0, 1),
      shiftKey: item.shift.key,
      shiftName: item.shift.name,
      shiftShortName: item.shift.shortName,
      shiftTime: item.shift.compactTime
    }));
  },

  selectCalendarDay(event) {
    const dateKey = event.currentTarget.dataset.date;
    const parts = dateUtils.parseDateKey(dateKey);
    this.viewYear = parts.year;
    this.viewMonth = parts.month;
    this.setData({ selectedDateKey: dateKey });
    this.refreshPage();
  },

  holdCalendarDay(event) {
    const dateKey = event.currentTarget.dataset.date;
    const parts = dateUtils.parseDateKey(dateKey);
    this.viewYear = parts.year;
    this.viewMonth = parts.month;
    this.setData({ selectedDateKey: dateKey });
    this.refreshPage();
    this.openSelectedEditor();
  },

  changeMonth(event) {
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    const date = new Date(this.viewYear, this.viewMonth + delta, 1);
    this.viewYear = date.getFullYear();
    this.viewMonth = date.getMonth();
    this.refreshPage();
  },

  goToday() {
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.setData({ selectedDateKey: dateUtils.todayKey() });
    this.refreshPage();
  },

  jumpNextRest() {
    if (this.nextRestDays < 0) {
      wx.showToast({ title: '未来 31 天还没有休息安排', icon: 'none' });
      return;
    }
    const dateKey = dateUtils.addDays(dateUtils.todayKey(), this.nextRestDays);
    const parts = dateUtils.parseDateKey(dateKey);
    this.viewYear = parts.year;
    this.viewMonth = parts.month;
    this.setData({ selectedDateKey: dateKey });
    this.refreshPage();
  },

  jumpDate(event) {
    const dateKey = event.detail.value;
    const parts = dateUtils.parseDateKey(dateKey);
    this.viewYear = parts.year;
    this.viewMonth = parts.month;
    this.setData({ selectedDateKey: dateKey });
    this.refreshPage();
  },

  openShiftSettings() {
    navigation.requestSettings('shifts', 'shifts');
  },

  editToday() {
    const parts = dateUtils.parseDateKey(dateUtils.todayKey());
    this.viewYear = parts.year;
    this.viewMonth = parts.month;
    this.setData({ selectedDateKey: dateUtils.todayKey() });
    this.refreshPage();
    this.openSelectedEditor();
  },

  openSelectedEditor() {
    if (this.state.appMode === 'team') this.openTeamManager();
    else this.openShiftEditor();
  },

  openShiftEditor() {
    const dateKey = this.data.selectedDateKey;
    this.updateModalState({
      showShiftEditor: true,
      editorShiftKey: schedule.getPersonalShiftKey(this.state, dateKey),
      editorDateTitle: `${dateUtils.displayDate(dateKey)} ${dateUtils.weekdayLabel(dateKey, true)}`,
      editorHasOverride: !!(this.state.assignments && Object.prototype.hasOwnProperty.call(this.state.assignments, dateKey))
    });
  },

  closeShiftEditor() {
    this.updateModalState({ showShiftEditor: false });
  },

  chooseEditorShift(event) {
    this.setData({ editorShiftKey: event.currentTarget.dataset.shiftKey });
  },

  savePersonalShift() {
    this.state.assignments[this.data.selectedDateKey] = this.data.editorShiftKey;
    store.saveState(this.state);
    this.updateModalState({ showShiftEditor: false });
    this.refreshPage();
    wx.showToast({ title: '已更新当天班次', icon: 'success' });
  },

  restoreCycle() {
    delete this.state.assignments[this.data.selectedDateKey];
    store.saveState(this.state);
    this.updateModalState({ showShiftEditor: false });
    this.refreshPage();
    wx.showToast({ title: this.state.cycleEnabled ? '已恢复循环' : '已清除当天覆盖', icon: 'success' });
  },

  openTeamManager() {
    this.updateModalState({ showTeamManager: true, teamManagerTab: 'scheduled' });
    this.rebuildTeamManagerData();
  },

  closeTeamManager() {
    this.updateModalState({ showTeamManager: false, showTeamShiftEditor: false, showMemberEditor: false });
    this.refreshPage();
  },

  switchTeamManagerTab(event) {
    this.setData({ teamManagerTab: event.currentTarget.dataset.tab });
  },

  rebuildTeamManagerData() {
    const dateKey = this.data.selectedDateKey;
    const scheduled = [];
    const available = [];
    (this.state.teamMembers || []).forEach((member) => {
      const shift = schedule.getShift(this.state, schedule.getTeamShiftKey(this.state, dateKey, member.id));
      const mapped = {
        id: member.id, name: member.name, role: member.role || '未设置岗位', color: member.color,
        initial: member.name.slice(0, 1), isSelf: !!member.isSelf, shiftKey: shift.key,
        shiftName: shift.name, shiftTime: shift.compactTime
      };
      if (shift.key === 'none') available.push(mapped);
      else scheduled.push(mapped);
    });
    const clipboard = this.state.teamClipboard || { sourceDateKey: '', assignments: [] };
    this.setData({
      teamScheduled: scheduled,
      teamAvailable: available,
      clipboardText: clipboard.sourceDateKey ? `已复制 ${dateUtils.displayDate(clipboard.sourceDateKey)}` : '尚未复制排班'
    });
  },

  openTeamShiftEditor(event) {
    const memberId = event.currentTarget.dataset.memberId;
    const member = this.state.teamMembers.find((item) => item.id === memberId);
    if (!member) return;
    this.updateModalState({
      showTeamShiftEditor: true,
      teamDraftMember: { id: member.id, name: member.name, role: member.role || '未设置岗位', color: member.color, initial: member.name.slice(0, 1) },
      teamDraftShiftKey: schedule.getTeamShiftKey(this.state, this.data.selectedDateKey, memberId)
    });
  },

  closeTeamShiftEditor() {
    this.updateModalState({ showTeamShiftEditor: false });
  },

  chooseTeamShift(event) {
    this.setData({ teamDraftShiftKey: event.currentTarget.dataset.shiftKey });
  },

  saveTeamShift() {
    const key = schedule.teamAssignmentKey(this.data.selectedDateKey, this.data.teamDraftMember.id);
    if (this.data.teamDraftShiftKey === 'none') delete this.state.teamAssignments[key];
    else this.state.teamAssignments[key] = this.data.teamDraftShiftKey;
    store.saveState(this.state);
    this.updateModalState({ showTeamShiftEditor: false });
    this.rebuildTeamManagerData();
    this.refreshPage();
    wx.showToast({ title: '成员班次已更新', icon: 'success' });
  },

  showAddMember() {
    if ((this.state.teamMembers || []).length >= store.MAX_MEMBERS) {
      wx.showToast({ title: `最多可添加 ${store.MAX_MEMBERS} 名成员`, icon: 'none' });
      return;
    }
    const used = (this.state.teamMembers || []).map((member) => member.color);
    const color = MEMBER_COLORS.find((item) => !used.includes(item)) || MEMBER_COLORS[0];
    this.updateModalState({
      showMemberEditor: true,
      showAllMemberColors: false,
      memberColorOptions: memberPalette(color, false),
      memberDraft: { id: '', name: '', role: '', color, isSelf: false, creating: true }
    });
  },

  showEditMember(event) {
    const member = this.state.teamMembers.find((item) => item.id === event.currentTarget.dataset.memberId);
    if (!member) return;
    this.updateModalState({
      showMemberEditor: true,
      showAllMemberColors: false,
      memberColorOptions: memberPalette(member.color, false),
      memberDraft: Object.assign({}, member, { creating: false })
    });
  },

  closeMemberEditor() {
    this.updateModalState({ showMemberEditor: false });
  },

  memberNameInput(event) {
    this.setData({ 'memberDraft.name': event.detail.value });
  },

  memberRoleInput(event) {
    this.setData({ 'memberDraft.role': event.detail.value });
  },

  chooseMemberColor(event) {
    this.setData({ 'memberDraft.color': event.currentTarget.dataset.color });
  },

  toggleMemberColors() {
    const expanded = !this.data.showAllMemberColors;
    this.setData({
      showAllMemberColors: expanded,
      memberColorOptions: memberPalette(this.data.memberDraft.color, expanded)
    });
  },

  saveMember() {
    const draft = Object.assign({}, this.data.memberDraft);
    draft.name = String(draft.name || '').trim().slice(0, 12);
    draft.role = String(draft.role || '').trim().slice(0, 16);
    if (!draft.name) {
      wx.showToast({ title: '请填写成员姓名', icon: 'none' });
      return;
    }
    if (draft.creating) {
      if ((this.state.teamMembers || []).length >= store.MAX_MEMBERS) {
        wx.showToast({ title: `最多可添加 ${store.MAX_MEMBERS} 名成员`, icon: 'none' });
        return;
      }
      draft.id = `member_${Date.now()}`;
      draft.isSelf = false;
      this.state.teamMembers.push(draft);
    } else {
      const index = this.state.teamMembers.findIndex((member) => member.id === draft.id);
      if (index >= 0) this.state.teamMembers[index] = { id: draft.id, name: draft.name, role: draft.role, color: draft.color, isSelf: !!this.state.teamMembers[index].isSelf };
    }
    store.saveState(this.state);
    this.updateModalState({ showMemberEditor: false });
    this.rebuildTeamManagerData();
    this.refreshPage();
    wx.showToast({ title: '成员资料已保存', icon: 'success' });
  },

  deleteMember() {
    const draft = this.data.memberDraft;
    if (draft.isSelf) return;
    wx.showModal({
      title: '删除成员',
      content: `删除 ${draft.name} 后，该成员的全部排班也会被清除。`,
      confirmColor: '#B04E43',
      success: (result) => {
        if (!result.confirm) return;
        this.state.teamMembers = this.state.teamMembers.filter((member) => member.id !== draft.id);
        Object.keys(this.state.teamAssignments).forEach((key) => {
          if (key.endsWith(`|${draft.id}`)) delete this.state.teamAssignments[key];
        });
        store.saveState(this.state);
        this.updateModalState({ showMemberEditor: false });
        this.rebuildTeamManagerData();
        this.refreshPage();
      }
    });
  },

  copyTeamDay() {
    this.state.teamClipboard = {
      sourceDateKey: this.data.selectedDateKey,
      assignments: this.data.teamScheduled.map((item) => ({ memberId: item.id, shiftKey: item.shiftKey }))
    };
    store.saveState(this.state);
    this.rebuildTeamManagerData();
    wx.showToast({ title: '已复制当天排班', icon: 'success' });
  },

  pasteTeamDay() {
    const clipboard = this.state.teamClipboard || {};
    if (!clipboard.sourceDateKey) {
      wx.showToast({ title: '请先复制一天的排班', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '粘贴排班',
      content: `将用 ${dateUtils.displayDate(clipboard.sourceDateKey)} 的排班覆盖 ${dateUtils.displayDate(this.data.selectedDateKey)}。`,
      confirmText: '覆盖粘贴',
      success: (result) => {
        if (!result.confirm) return;
        (this.state.teamMembers || []).forEach((member) => delete this.state.teamAssignments[schedule.teamAssignmentKey(this.data.selectedDateKey, member.id)]);
        (clipboard.assignments || []).forEach((assignment) => {
          if (this.state.teamMembers.some((member) => member.id === assignment.memberId)) {
            this.state.teamAssignments[schedule.teamAssignmentKey(this.data.selectedDateKey, assignment.memberId)] = assignment.shiftKey;
          }
        });
        store.saveState(this.state);
        this.rebuildTeamManagerData();
        this.refreshPage();
      }
    });
  },

  resetTeamDay() {
    wx.showModal({
      title: '清空当天排班',
      content: `只会清空 ${dateUtils.displayDate(this.data.selectedDateKey)} 的安排，不会删除成员资料。`,
      confirmText: '确认清空',
      confirmColor: '#B04E43',
      success: (result) => {
        if (!result.confirm) return;
        (this.state.teamMembers || []).forEach((member) => delete this.state.teamAssignments[schedule.teamAssignmentKey(this.data.selectedDateKey, member.id)]);
        store.saveState(this.state);
        this.rebuildTeamManagerData();
        this.refreshPage();
      }
    });
  },

  scheduleAutomaticMoment() {
    this.cancelAutomaticMoment();
    this.autoMomentChecked = false;
    this.autoMomentTimer = setTimeout(() => {
      this.autoMomentTimer = 0;
      this.maybeShowAutomaticMoment();
    }, 420);
  },

  cancelAutomaticMoment() {
    if (this.autoMomentTimer) clearTimeout(this.autoMomentTimer);
    this.autoMomentTimer = 0;
  },

  maybeShowAutomaticMoment() {
    if (this.autoMomentChecked) return;
    this.autoMomentChecked = true;
    if (this.hasOpenModal()) return;
    const state = this.state;
    const today = dateUtils.todayKey();
    const scene = momentEngine.sceneForState(state);
    const frequency = Number(state.momentFrequencyIndex) || 0;
    const shouldShow = frequency === 2 || ((frequency === 0 || frequency === 1) && state.lastMomentDate !== today && (frequency === 0 || ['rest', 'afterNight', 'twoDays'].includes(scene)));
    if (frequency !== 3 && shouldShow) this.showMoment(scene);
  },

  openMoment() {
    this.showMoment();
  },

  showMoment(sceneKey) {
    const selected = momentEngine.chooseMoment(this.state, sceneKey);
    this.state.momentHistory[selected.historyKey] = selected.nextHistory;
    this.state.lastMomentDate = dateUtils.todayKey();
    store.saveState(this.state);
    this.updateModalState({ showMoment: true, moment: selected });
  },

  refreshMoment() {
    this.showMoment(this.data.moment.sceneKey);
  },

  closeMoment() {
    this.updateModalState({ showMoment: false });
  },

  saveMomentPoster() {
    privacy.authorize({
      success: () => this.generateMomentPoster(),
      fail: () => wx.showToast({ title: '未授权相册使用，无法保存海报', icon: 'none' })
    });
  },

  generateMomentPoster() {
    const moment = Object.assign({}, this.data.moment);
    const generationToken = this.beginPosterGeneration();
    wx.showLoading({ title: '正在生成' });
    this.getPosterCanvas({
      success: ({ canvas, context }) => {
        if (!this.isPosterGenerationActive(generationToken)) return;
        this.loadPosterImage(canvas, [moment.posterImage, moment.fallbackPosterImage, moment.image], {
          success: (image) => {
            if (!this.isPosterGenerationActive(generationToken)) return;
            try {
              this.drawMomentPoster(context, image, moment);
            } catch (error) {
              this.failPosterGeneration(generationToken, 'moment_poster_draw_failed', error, '海报生成失败');
              return;
            }
            setTimeout(() => this.exportMomentPoster(canvas, generationToken), 80);
          },
          fail: (error) => this.failPosterGeneration(generationToken, 'moment_poster_image_load_failed', error, '插画加载失败')
        });
      },
      fail: (error) => this.failPosterGeneration(generationToken, 'moment_poster_canvas_init_failed', error, '海报画布初始化失败')
    });
  },

  getPosterCanvas(callbacks) {
    const success = callbacks && callbacks.success;
    const fail = callbacks && callbacks.fail;
    let query;
    try {
      query = typeof this.createSelectorQuery === 'function'
        ? this.createSelectorQuery()
        : wx.createSelectorQuery().in(this);
      query.select('#momentPosterCanvas').fields({ node: true, size: true }).exec((result) => {
        const canvas = result && result[0] && result[0].node;
        if (!canvas || typeof canvas.getContext !== 'function') {
          if (fail) fail(new Error('Canvas 2D node is unavailable'));
          return;
        }
        try {
          const exportScale = 2;
          canvas.width = 600 * exportScale;
          canvas.height = 900 * exportScale;
          const context = canvas.getContext('2d');
          context.scale(exportScale, exportScale);
          context.imageSmoothingEnabled = true;
          context.imageSmoothingQuality = 'high';
          if (success) success({ canvas, context });
        } catch (error) {
          if (fail) fail(error);
        }
      });
    } catch (error) {
      if (fail) fail(error);
    }
  },

  loadPosterImage(canvas, sources, callbacks) {
    const queue = Array.from(new Set((sources || []).filter(Boolean)));
    const success = callbacks && callbacks.success;
    const fail = callbacks && callbacks.fail;
    let lastError = new Error('No poster image source');
    const attemptErrors = [];

    const errorText = (error) => String((error && error.errMsg) || (error && error.message) || error || 'unknown error');
    const rememberFailure = (stage, source, error) => {
      const detail = `${stage}: ${source} (${errorText(error)})`;
      attemptErrors.push(detail);
      lastError = new Error(detail);
      logger.warn('moment_poster_image_attempt_failed', { stage, source, error: errorText(error) });
    };

    const loadCanvasImage = (source, stage, callback) => {
      let image;
      let settled = false;
      const complete = (error) => {
        if (settled) return;
        settled = true;
        if (image) {
          image.onload = null;
          image.onerror = null;
        }
        if (error) rememberFailure(stage, source, error);
        callback(error, image);
      };
      try {
        image = canvas.createImage();
        image.onload = () => complete(null);
        image.onerror = (error) => complete(error || new Error('CanvasImage onerror'));
        image.src = source;
      } catch (error) {
        complete(error);
      }
    };

    const loadCanvasCandidates = (candidates, stage, callback) => {
      const paths = Array.from(new Set((candidates || []).filter(Boolean)));
      const tryCandidate = () => {
        const candidate = paths.shift();
        if (!candidate) {
          callback(false);
          return;
        }
        loadCanvasImage(candidate, stage, (error, image) => {
          if (!error) {
            callback(true, image);
            return;
          }
          tryCandidate();
        });
      };
      tryCandidate();
    };

    const tryNext = () => {
      const source = queue.shift();
      if (!source) {
        if (attemptErrors.length) lastError = new Error(attemptErrors.slice(-8).join(' | '));
        if (fail) fail(lastError);
        return;
      }
      const packagePaths = [source];
      if (/^\/(?!\/)/.test(source)) {
        packagePaths.push(source.slice(1));
        packagePaths.push(`../..${source}`);
      }
      loadCanvasCandidates(packagePaths, 'package', (loaded, image) => {
        if (loaded) {
          if (success) success(image);
          return;
        }
        if (!wx.getImageInfo) {
          rememberFailure('getImageInfo', source, new Error('API unavailable'));
          tryNext();
          return;
        }
        wx.getImageInfo({
          src: source,
          success: (imageInfo) => {
            const temporaryPaths = [imageInfo.path, imageInfo.tempFilePath].filter((path) => path && !packagePaths.includes(path));
            loadCanvasCandidates(temporaryPaths, 'temporary', (temporaryLoaded, temporaryImage) => {
              if (temporaryLoaded) {
                if (success) success(temporaryImage);
                return;
              }
              if (!temporaryPaths.length) rememberFailure('getImageInfo', source, new Error('No usable image path returned'));
              tryNext();
            });
          },
          fail: (error) => {
            rememberFailure('getImageInfo', source, error);
            tryNext();
          }
        });
      });
    };
    tryNext();
  },

  drawMomentPoster(context, image, moment) {
    const brand = (this.data.theme && this.data.theme.brand) || '#2F73C9';
    context.clearRect(0, 0, 600, 900);
    context.fillStyle = '#FFFFFF';
    context.fillRect(0, 0, 600, 900);
    context.drawImage(image, 0, 0, 600, 360);
    context.textAlign = 'left';
    context.textBaseline = 'top';

    context.fillStyle = brand;
    context.fillRect(42, 398, 6, 31);
    context.font = '600 24px sans-serif';
    context.fillText(moment.kicker || '', 61, 399);

    context.fillStyle = '#172638';
    context.font = '700 42px sans-serif';
    const titleLines = this.drawWrappedText(context, moment.title, 42, 458, 516, 54, 2);

    context.fillStyle = '#52677C';
    context.font = '400 27px sans-serif';
    const copyY = 458 + titleLines * 54 + 27;
    this.drawWrappedText(context, moment.copy, 42, copyY, 516, 42, 4);

    context.fillStyle = '#E3EBF2';
    context.fillRect(42, 803, 516, 1);
    context.fillStyle = brand;
    context.font = '700 24px sans-serif';
    context.fillText('班妥了', 42, 829);
    context.fillStyle = '#7B8C9C';
    context.font = '400 19px sans-serif';
    context.fillText('排班不纠结，班妥了就行', 145, 834);
  },

  exportMomentPoster(canvas, generationToken) {
    if (!this.isPosterGenerationActive(generationToken)) return;
    wx.canvasToTempFilePath({
      canvas,
      x: 0,
      y: 0,
      width: canvas.width,
      height: canvas.height,
      destWidth: canvas.width,
      destHeight: canvas.height,
      fileType: 'png',
      success: (file) => {
        if (!this.finishPosterGeneration(generationToken)) return;
        wx.saveImageToPhotosAlbum({
          filePath: file.tempFilePath,
          success: () => wx.showToast({ title: '已保存到相册', icon: 'success' }),
          fail: (error) => this.handlePhotoAlbumSaveError(error)
        });
      },
      fail: (error) => this.failPosterGeneration(generationToken, 'moment_poster_canvas_export_failed', error, '海报生成失败')
    }, this);
  },

  failPosterGeneration(generationToken, eventName, error, message) {
    logger.warn(eventName, error);
    if (this.finishPosterGeneration(generationToken)) wx.showToast({ title: message, icon: 'none' });
  },

  beginPosterGeneration() {
    if (this.posterGenerationTimer) clearTimeout(this.posterGenerationTimer);
    const token = Date.now();
    this.posterGenerationToken = token;
    this.posterGenerationTimer = setTimeout(() => {
      if (!this.isPosterGenerationActive(token)) return;
      this.posterGenerationToken = 0;
      this.posterGenerationTimer = 0;
      wx.hideLoading();
      logger.warn('moment_poster_generation_timeout', { timeoutMs: 15000 });
      wx.showToast({ title: '生成超时，请稍后重试', icon: 'none' });
    }, 15000);
    return token;
  },

  isPosterGenerationActive(token) {
    return !!token && this.posterGenerationToken === token;
  },

  finishPosterGeneration(token) {
    if (!this.isPosterGenerationActive(token)) return false;
    if (this.posterGenerationTimer) clearTimeout(this.posterGenerationTimer);
    this.posterGenerationTimer = 0;
    this.posterGenerationToken = 0;
    wx.hideLoading();
    return true;
  },

  handlePhotoAlbumSaveError(error) {
    logger.warn('save_moment_poster_failed', error);
    const message = String((error && error.errMsg) || error || '');
    if (!/auth|authorize|permission|deny/i.test(message)) {
      wx.showToast({ title: '海报保存失败，请稍后重试', icon: 'none' });
      return;
    }
    wx.showModal({
      title: '需要相册权限',
      content: '请在微信设置中允许写入相册，然后再次点击保存。',
      confirmText: '去设置',
      success: (result) => {
        if (!result.confirm) return;
        if (typeof wx.openSetting !== 'function') {
          wx.showToast({ title: '请在微信中手动开启相册权限', icon: 'none' });
          return;
        }
        wx.openSetting({ fail: (settingError) => logger.warn('open_setting_failed', settingError) });
      }
    });
  },

  drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
    const lines = [];
    let line = '';
    let truncated = false;
    for (const char of Array.from(String(text || '').trim())) {
      const test = line + char;
      if (line && context.measureText(test).width > maxWidth) {
        lines.push(line);
        line = char;
        if (lines.length >= maxLines) {
          truncated = true;
          break;
        }
      } else {
        line = test;
      }
    }
    if (!truncated && line && lines.length < maxLines) lines.push(line);
    if (!lines.length) lines.push('');
    if (truncated) {
      let lastLine = lines[maxLines - 1] || '';
      while (lastLine && context.measureText(`${lastLine}…`).width > maxWidth) lastLine = lastLine.slice(0, -1);
      lines[maxLines - 1] = `${lastLine}…`;
    }
    lines.slice(0, maxLines).forEach((value, index) => context.fillText(value, x, y + index * lineHeight));
    return Math.min(lines.length, maxLines);
  },

  onShareAppMessage() {
    if (this.data.showMoment && this.data.moment.title) {
      return { title: `${this.data.moment.title}｜班妥了`, path: '/pages/index/index', imageUrl: this.data.moment.posterImage || this.data.moment.image };
    }
    return { title: '班妥了｜智能倒班排班助手', path: '/pages/index/index' };
  },

  onShareTimeline() {
    if (this.data.showMoment && this.data.moment.title) {
      return { title: `${this.data.moment.title}｜班妥了`, query: '', imageUrl: this.data.moment.posterImage || this.data.moment.image };
    }
    return { title: '班妥了｜智能倒班排班助手', query: '' };
  },

  noop() {}
});
