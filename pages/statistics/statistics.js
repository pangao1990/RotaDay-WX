const store = require('../../utils/store');
const schedule = require('../../utils/schedule');
const dateUtils = require('../../utils/date');
const themeUtils = require('../../utils/theme');
const navigation = require('../../utils/navigation');
const logger = require('../../utils/logger');

function hoursText(minutes) {
  const hours = minutes / 60;
  if (Number.isInteger(hours)) return `${hours}`;
  return hours.toFixed(1).replace(/\.0$/, '');
}

function colorWithAlpha(color, alpha) {
  const normalized = themeUtils.isHexColor(color) ? color : '#2F73C9';
  const opacity = Math.max(0, Math.min(1, Number(alpha) || 0));
  const red = parseInt(normalized.slice(1, 3), 16);
  const green = parseInt(normalized.slice(3, 5), 16);
  const blue = parseInt(normalized.slice(5, 7), 16);
  return `rgba(${red},${green},${blue},${opacity.toFixed(3)})`;
}

Page({
  data: {
    theme: {},
    themeVars: '',
    isTeam: false,
    period: 'month',
    title: '',
    periodLabel: '',
    showPeriodReset: false,
    summaryCards: [],
    distribution: [],
    memberLoad: [],
    dailyDensity: [],
    monthRhythm: [],
    emptyData: false
  },

  onLoad() {
    const now = new Date();
    this.skipInitialShowRefresh = true;
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.refreshPage();
  },

  onShow() {
    if (this.skipInitialShowRefresh) this.skipInitialShowRefresh = false;
    else if (this.viewYear) this.refreshPage();
  },

  refreshPage() {
    this.state = store.loadState(true);
    const theme = themeUtils.resolveTheme(this.state);
    const isTeam = this.state.appMode === 'team';
    const monthMode = this.data.period === 'month';
    const periodLabel = monthMode ? dateUtils.monthLabel(this.viewYear, this.viewMonth) : `${this.viewYear}年`;
    const now = new Date();
    const showPeriodReset = monthMode
      ? this.viewYear !== now.getFullYear() || this.viewMonth !== now.getMonth()
      : this.viewYear !== now.getFullYear();
    const title = monthMode ? (isTeam ? '团队月报' : '本月统计') : (isTeam ? '团队年度回顾' : '年度回顾');
    let summaryCards = [];
    let distribution = [];
    let memberLoad = [];
    let dailyDensity = [];
    let monthRhythm = [];
    let emptyData = false;

    if (!isTeam && monthMode) {
      const stats = schedule.calculateMonthStatistics(this.state, this.viewYear, this.viewMonth);
      const counts = schedule.calculateMonthShiftCounts(this.state, this.viewYear, this.viewMonth);
      const maxCount = Math.max(1, ...counts.map((item) => item.count));
      summaryCards = [
        { label: '工作天数', value: stats.workDays, unit: '天', icon: '日' },
        { label: '总工时', value: hoursText(stats.totalMinutes), unit: '小时', icon: '时' },
        { label: '夜班', value: stats.nightDays, unit: '天', icon: '夜' },
        { label: '休息', value: stats.restDays, unit: '天', icon: '休' }
      ];
      distribution = counts.map((item) => ({
        key: item.shift.key,
        name: item.shift.name,
        color: item.shift.color,
        count: item.count,
        width: `${Math.max(item.count ? 5 : 0, Math.round(item.count / maxCount * 100))}%`
      }));
      emptyData = stats.workDays + stats.restDays === 0;
    } else if (!isTeam) {
      const stats = schedule.calculateYearStatistics(this.state, this.viewYear);
      const maxWork = Math.max(1, ...stats.months.map((item) => item.workDays));
      summaryCards = [
        { label: '工作天数', value: stats.workDays, unit: '天', icon: '日' },
        { label: '总工时', value: hoursText(stats.totalMinutes), unit: '小时', icon: '时' },
        { label: '夜班', value: stats.nightDays, unit: '天', icon: '夜' },
        { label: '最长连班', value: stats.longestWorkStreak, unit: '天', icon: '连' }
      ];
      monthRhythm = stats.months.map((item) => ({
        month: `${item.month + 1}月`,
        mainValue: item.workDays,
        hours: hoursText(item.totalMinutes),
        detail: `${item.workDays} 天 · ${hoursText(item.totalMinutes)} 小时`,
        width: `${Math.max(item.workDays ? 5 : 0, Math.round(item.workDays / maxWork * 100))}%`
      }));
      emptyData = stats.workDays + stats.restDays === 0;
    } else if (monthMode) {
      const stats = schedule.calculateTeamMonthStatistics(this.state, this.viewYear, this.viewMonth);
      const maxMinutes = Math.max(1, ...stats.members.map((item) => item.totalMinutes));
      summaryCards = [
        { label: '团队人数', value: stats.memberCount, unit: '人', icon: '人' },
        { label: '工作班次', value: stats.workAssignments, unit: '次', icon: '班' },
        { label: '夜班', value: stats.nightAssignments, unit: '次', icon: '夜' },
        { label: '总工时', value: hoursText(stats.totalMinutes), unit: '小时', icon: '时' }
      ];
      memberLoad = stats.members.map((item) => ({
        id: item.member.id,
        name: item.member.name,
        role: item.member.role || '未设置岗位',
        color: item.member.color,
        initial: item.member.name.slice(0, 1),
        workDays: item.workDays,
        nightDays: item.nightDays,
        hours: hoursText(item.totalMinutes),
        width: `${Math.max(item.totalMinutes ? 5 : 0, Math.round(item.totalMinutes / maxMinutes * 100))}%`
      }));
      const dayCount = new Date(this.viewYear, this.viewMonth + 1, 0).getDate();
      const counts = [];
      for (let day = 1; day <= dayCount; day += 1) {
        const dateKey = dateUtils.formatDateKey(this.viewYear, this.viewMonth, day);
        counts.push({ day, count: stats.dailyCounts[dateKey] || 0 });
      }
      const maxCount = Math.max(1, ...counts.map((item) => item.count));
      dailyDensity = counts.map((item) => {
        const level = item.count ? Math.max(.18, item.count / maxCount) : 0;
        return { day: item.day, count: item.count, level, background: colorWithAlpha(theme.brand, level) };
      });
      emptyData = stats.assignmentCount === 0;
    } else {
      const stats = schedule.calculateTeamYearStatistics(this.state, this.viewYear);
      const maxAssignments = Math.max(1, ...stats.months.map((item) => item.workAssignments));
      const maxMinutes = Math.max(1, ...stats.members.map((item) => item.totalMinutes));
      summaryCards = [
        { label: '团队人数', value: stats.memberCount, unit: '人', icon: '人' },
        { label: '工作班次', value: stats.workAssignments, unit: '次', icon: '班' },
        { label: '夜班', value: stats.nightAssignments, unit: '次', icon: '夜' },
        { label: '总工时', value: hoursText(stats.totalMinutes), unit: '小时', icon: '时' }
      ];
      monthRhythm = stats.months.map((item) => ({
        month: `${item.month + 1}月`,
        mainValue: item.workAssignments,
        hours: hoursText(item.totalMinutes),
        detail: `${item.workAssignments} 个工作班次 · ${hoursText(item.totalMinutes)} 小时`,
        width: `${Math.max(item.workAssignments ? 5 : 0, Math.round(item.workAssignments / maxAssignments * 100))}%`
      }));
      memberLoad = stats.members.map((item) => ({
        id: item.member.id,
        name: item.member.name,
        role: item.member.role || '未设置岗位',
        color: item.member.color,
        initial: item.member.name.slice(0, 1),
        workDays: item.workDays,
        nightDays: item.nightDays,
        hours: hoursText(item.totalMinutes),
        width: `${Math.max(item.totalMinutes ? 5 : 0, Math.round(item.totalMinutes / maxMinutes * 100))}%`
      }));
      emptyData = stats.assignmentCount === 0;
    }

    this.setData({
      theme,
      themeVars: themeUtils.themeVars(theme),
      isTeam,
      title,
      periodLabel,
      showPeriodReset,
      summaryCards,
      distribution,
      memberLoad,
      dailyDensity,
      monthRhythm,
      emptyData
    });
    navigation.syncTabBar(this, 'statistics', theme);
    try {
      wx.setNavigationBarTitle({ title });
      wx.setBackgroundColor({ backgroundColor: theme.page, backgroundColorTop: theme.page, backgroundColorBottom: theme.page });
      wx.setNavigationBarColor({
        frontColor: themeUtils.luminance(theme.page) < 0.38 ? '#ffffff' : '#000000',
        backgroundColor: theme.page,
        animation: { duration: 0, timingFunc: 'linear' }
      });
    } catch (error) {
      // Older base libraries keep the page-level theme colors.
    }
  },

  switchPeriod(event) {
    this.setData({ period: event.currentTarget.dataset.period });
    this.refreshPage();
  },

  changePeriod(event) {
    const delta = Number(event.currentTarget.dataset.delta) || 0;
    if (this.data.period === 'month') {
      const date = new Date(this.viewYear, this.viewMonth + delta, 1);
      this.viewYear = date.getFullYear();
      this.viewMonth = date.getMonth();
    } else this.viewYear += delta;
    this.refreshPage();
  },

  goCurrent() {
    const now = new Date();
    this.viewYear = now.getFullYear();
    this.viewMonth = now.getMonth();
    this.refreshPage();
  },

  exportTeamCsv() {
    if (!this.data.isTeam) return;
    const rows = [['班妥了团队统计', this.data.periodLabel], []];
    if (this.data.period === 'month') {
      rows.push(['成员', '岗位', '工作班次', '夜班', '工时']);
      this.data.memberLoad.forEach((item) => rows.push([item.name, item.role, item.workDays, item.nightDays, item.hours]));
    } else {
      rows.push(['月份', '工作班次', '工时']);
      this.data.monthRhythm.forEach((item) => rows.push([item.month, item.mainValue, item.hours]));
      rows.push([], ['成员', '岗位', '工作班次', '夜班', '工时']);
      this.data.memberLoad.forEach((item) => rows.push([item.name, item.role, item.workDays, item.nightDays, item.hours]));
    }
    const csv = `\uFEFF${rows.map((row) => row.map((cell) => `"${String(cell === undefined ? '' : cell).replace(/"/g, '""')}"`).join(',')).join('\n')}`;
    const fileName = `班妥了-${this.data.periodLabel}-团队统计.csv`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
    try {
      wx.getFileSystemManager().writeFileSync(filePath, csv, 'utf8');
      if (wx.shareFileMessage) {
        wx.shareFileMessage({ filePath, fileName, fail: () => this.copyCsv(csv) });
      } else this.copyCsv(csv);
    } catch (error) {
      this.copyCsv(csv);
    }
  },

  copyCsv(csv) {
    wx.setClipboardData({
      data: csv,
      success: () => wx.showToast({ title: '统计表已复制', icon: 'success' }),
      fail: (error) => {
        logger.warn('copy_team_csv_failed', error);
        wx.showToast({ title: '统计表导出失败，请稍后重试', icon: 'none' });
      }
    });
  },

  onShareAppMessage() {
    return { title: `${this.data.title}｜班妥了`, path: '/pages/statistics/statistics' };
  }
});
