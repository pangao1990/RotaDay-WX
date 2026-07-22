const { createDefaultState, clone, DEFAULT_SHIFTS, THEMES, CYCLE_TEMPLATES } = require('./defaults');
const { isValidDateKey, addDays, todayKey } = require('./date');
const logger = require('./logger');

const STORAGE_KEY = 'rotaday_wechat_state_v1';
const MAX_SHIFTS = 32;
const MAX_MEMBERS = 80;
const MAX_PERSONAL_ASSIGNMENTS = 5000;
const MAX_TEAM_ASSIGNMENTS = 20000;
const MAX_CYCLE_PERIODS = 5000;
const MAX_BACKUP_LENGTH = 2 * 1024 * 1024;
const PERSONAL_MOMENT_SCENES = ['morning', 'day', 'night', 'rest', 'twoDays', 'afterNight', 'tired'];
const MOMENT_HISTORY_KEYS = PERSONAL_MOMENT_SCENES.concat(PERSONAL_MOMENT_SCENES.map((scene) => `team:${scene}`));
const MAX_MOMENT_MESSAGE_HISTORY = 30;
let cache;

function objectOr(value, fallback) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback;
}

function boundedNumber(value, fallback, min, max) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
}

function normalizeShifts(source) {
  const values = Array.isArray(source) ? source : [];
  const result = [];
  const seen = new Set();
  let customCount = 0;
  values.forEach((value) => {
    if (!value || typeof value.key !== 'string' || !/^[A-Za-z0-9_-]{1,48}$/.test(value.key) || seen.has(value.key)) return;
    const fallback = DEFAULT_SHIFTS.find((shift) => shift.key === value.key) || DEFAULT_SHIFTS[2];
    const builtIn = DEFAULT_SHIFTS.some((shift) => shift.key === value.key);
    if (!builtIn) {
      if (customCount >= MAX_SHIFTS - DEFAULT_SHIFTS.length) return;
      customCount += 1;
    }
    const isWork = builtIn ? fallback.isWork : value.isWork !== false;
    result.push({
      key: value.key,
      name: String(value.name || fallback.name).slice(0, 8) || fallback.name,
      shortName: String(value.shortName === undefined ? fallback.shortName : value.shortName).slice(0, 2),
      color: /^#[0-9A-Fa-f]{6}$/.test(String(value.color || '')) ? value.color.toUpperCase() : fallback.color,
      startMinutes: isWork ? boundedNumber(value.startMinutes, fallback.startMinutes, 0, 1439) : -1,
      endMinutes: isWork ? boundedNumber(value.endMinutes, fallback.endMinutes, 0, 1439) : -1,
      breakMinutes: isWork ? boundedNumber(value.breakMinutes, fallback.breakMinutes, 0, 360) : 0,
      isWork,
      builtIn
    });
    seen.add(value.key);
  });
  DEFAULT_SHIFTS.forEach((fallback) => {
    if (!seen.has(fallback.key)) result.push(clone(fallback));
  });
  result.sort((a, b) => {
    if (a.key === 'none') return -1;
    if (b.key === 'none') return 1;
    if (a.key === 'rest') return 1;
    if (b.key === 'rest') return -1;
    return 0;
  });
  return result;
}

function normalizeMembers(source, fallbackSelf) {
  const values = Array.isArray(source) ? source : [];
  const result = [];
  const seen = new Set();
  values.forEach((value) => {
    if (result.length >= MAX_MEMBERS) return;
    if (!value || typeof value.id !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value.id) || seen.has(value.id)) return;
    const name = String(value.name || '').trim().slice(0, 12);
    if (!name) return;
    result.push({
      id: value.id,
      name,
      role: String(value.role || '').trim().slice(0, 16),
      color: /^#[0-9A-Fa-f]{6}$/.test(String(value.color || '')) ? value.color.toUpperCase() : '#5687AD',
      isSelf: value.isSelf === true
    });
    seen.add(value.id);
  });

  const canonicalSelf = result.find((member) => member.id === fallbackSelf.id);
  const selectedSelf = canonicalSelf || result.find((member) => member.isSelf);
  result.forEach((member) => { member.isSelf = member === selectedSelf; });
  if (!selectedSelf) {
    if (result.length >= MAX_MEMBERS) result.pop();
    result.unshift(clone(fallbackSelf));
  }
  return result;
}

function normalizeMomentHistory(source) {
  const value = objectOr(source, {});
  const result = {};
  const normalizeEntry = (stored) => {
    const messages = Array.isArray(stored) ? stored : (stored && Array.isArray(stored.messages) ? stored.messages : []);
    const unique = [];
    messages.forEach((item) => {
      const match = String(item).match(/^(\d+)-(\d+)$/);
      if (!match) return;
      const titleIndex = Number(match[1]);
      const bodyIndex = Number(match[2]);
      const id = `${titleIndex}-${bodyIndex}`;
      if (titleIndex >= 0 && titleIndex < 12 && bodyIndex >= 0 && bodyIndex < 10
        && !unique.includes(id) && unique.length < MAX_MOMENT_MESSAGE_HISTORY) unique.push(id);
    });
    const imageSource = stored && !Array.isArray(stored) && Array.isArray(stored.images) ? stored.images : [];
    const images = [];
    imageSource.forEach((item) => {
      const imageIndex = Number(item);
      if (Number.isInteger(imageIndex) && imageIndex >= 1 && imageIndex <= 6 && !images.includes(imageIndex) && images.length < 5) images.push(imageIndex);
    });
    return { messages: unique, images };
  };
  MOMENT_HISTORY_KEYS.forEach((historyKey) => {
    const entry = normalizeEntry(value[historyKey]);
    if (entry.messages.length || entry.images.length) result[historyKey] = entry;
  });
  if (!result['team:day'] && value.team) {
    const legacyTeam = normalizeEntry(value.team);
    if (legacyTeam.messages.length || legacyTeam.images.length) result['team:day'] = legacyTeam;
  }
  return result;
}

function normalizeTeamClipboard(source, memberIds, shiftKeys) {
  const value = objectOr(source, {});
  if (!isValidDateKey(value.sourceDateKey) || !Array.isArray(value.assignments)) return { sourceDateKey: '', assignments: [] };
  const assignments = [];
  const seenMembers = new Set();
  value.assignments.forEach((assignment) => {
    if (!assignment || assignments.length >= MAX_MEMBERS) return;
    const memberId = String(assignment.memberId || '');
    const shiftKey = String(assignment.shiftKey || '');
    if (!memberIds.has(memberId) || !shiftKeys.has(shiftKey) || shiftKey === 'none' || seenMembers.has(memberId)) return;
    assignments.push({ memberId, shiftKey });
    seenMembers.add(memberId);
  });
  return { sourceDateKey: value.sourceDateKey, assignments };
}

function normalizeCyclePeriods(source, cycleEnabled, cycleStartKey, cycleTemplateIndex) {
  const values = Array.isArray(source) ? source.slice(-MAX_CYCLE_PERIODS) : [];
  const periods = [];
  values.forEach((value) => {
    if (!value || typeof value !== 'object' || !isValidDateKey(value.startKey)) return;
    const endKey = value.endKey === '' || value.endKey === undefined || value.endKey === null ? '' : value.endKey;
    if (endKey && (!isValidDateKey(endKey) || endKey < value.startKey)) return;
    periods.push({
      startKey: value.startKey,
      endKey,
      anchorKey: isValidDateKey(value.anchorKey) ? value.anchorKey : value.startKey,
      templateIndex: Math.round(boundedNumber(value.templateIndex, 0, 0, CYCLE_TEMPLATES.length - 1))
    });
  });

  // Only the newest period may remain active. Malformed or legacy overlapping
  // periods are closed before the following period and remain read-only history.
  for (let index = 0; index < periods.length - 1; index += 1) {
    if (periods[index].endKey) continue;
    const nextStart = periods[index + 1].startKey;
    periods[index].endKey = nextStart > periods[index].startKey ? addDays(nextStart, -1) : periods[index].startKey;
  }

  const lastIndex = periods.length - 1;
  const activeIndex = lastIndex >= 0 && !periods[lastIndex].endKey ? lastIndex : -1;
  if (cycleEnabled) {
    if (activeIndex >= 0) {
      periods[activeIndex].anchorKey = cycleStartKey;
      periods[activeIndex].templateIndex = cycleTemplateIndex;
    } else {
      periods.push({
        startKey: cycleStartKey,
        endKey: '',
        anchorKey: cycleStartKey,
        templateIndex: cycleTemplateIndex
      });
    }
  } else if (activeIndex >= 0) {
    const currentKey = todayKey();
    if (periods[activeIndex].startKey > currentKey) periods.pop();
    else periods[activeIndex].endKey = currentKey;
  }
  return periods.slice(-MAX_CYCLE_PERIODS);
}

function normalizeState(raw) {
  const defaults = createDefaultState();
  const source = objectOr(raw, {});
  const state = createDefaultState();
  state.appMode = ['personal', 'team'].includes(source.appMode) ? source.appMode : defaults.appMode;
  state.themeIndex = Math.round(boundedNumber(source.themeIndex, defaults.themeIndex, 0, THEMES.length - 1));
  state.customThemeBrand = /^#[0-9A-Fa-f]{6}$/.test(String(source.customThemeBrand || '')) ? source.customThemeBrand.toUpperCase() : defaults.customThemeBrand;
  state.customThemePage = /^#[0-9A-Fa-f]{6}$/.test(String(source.customThemePage || '')) ? source.customThemePage.toUpperCase() : defaults.customThemePage;
  state.cycleTemplateIndex = Math.round(boundedNumber(source.cycleTemplateIndex, defaults.cycleTemplateIndex, 0, CYCLE_TEMPLATES.length - 1));
  state.weekStart = Number(source.weekStart) === 0 ? 0 : 1;
  state.time24 = source.time24 !== false;
  state.cycleEnabled = source.cycleEnabled === undefined ? defaults.cycleEnabled : source.cycleEnabled === true;
  state.cycleStartKey = isValidDateKey(source.cycleStartKey) ? source.cycleStartKey : defaults.cycleStartKey;
  state.cyclePeriods = normalizeCyclePeriods(
    source.cyclePeriods,
    state.cycleEnabled,
    state.cycleStartKey,
    state.cycleTemplateIndex
  );
  state.momentFrequencyIndex = Math.round(boundedNumber(source.momentFrequencyIndex, defaults.momentFrequencyIndex, 0, 3));
  state.momentToneIndex = Math.round(boundedNumber(source.momentToneIndex, defaults.momentToneIndex, 0, 2));
  state.momentHistory = normalizeMomentHistory(source.momentHistory);
  state.lastMomentDate = isValidDateKey(source.lastMomentDate) ? source.lastMomentDate : '';
  state.shifts = normalizeShifts(source.shifts);
  state.teamMembers = normalizeMembers(source.teamMembers, defaults.teamMembers[0]);
  const shiftKeys = new Set(state.shifts.map((shift) => shift.key));
  state.assignments = {};
  let assignmentCount = 0;
  Object.keys(objectOr(source.assignments, {})).some((dateKey) => {
    const shiftKey = source.assignments[dateKey];
    if (isValidDateKey(dateKey) && shiftKeys.has(shiftKey)) {
      state.assignments[dateKey] = shiftKey;
      assignmentCount += 1;
    }
    return assignmentCount >= MAX_PERSONAL_ASSIGNMENTS;
  });
  const memberIds = new Set(state.teamMembers.map((member) => member.id));
  state.teamAssignments = {};
  let teamAssignmentCount = 0;
  Object.keys(objectOr(source.teamAssignments, {})).some((key) => {
    const separator = key.indexOf('|');
    const dateKey = key.slice(0, separator);
    const memberId = key.slice(separator + 1);
    const shiftKey = source.teamAssignments[key];
    if (separator > 0 && isValidDateKey(dateKey) && memberIds.has(memberId) && shiftKeys.has(shiftKey) && shiftKey !== 'none') {
      state.teamAssignments[key] = shiftKey;
      teamAssignmentCount += 1;
    }
    return teamAssignmentCount >= MAX_TEAM_ASSIGNMENTS;
  });
  state.teamClipboard = normalizeTeamClipboard(source.teamClipboard, memberIds, shiftKeys);
  state.schemaVersion = 2;
  return state;
}

function loadState(force) {
  if (cache && !force) return clone(cache);
  let stored;
  try {
    stored = wx.getStorageSync(STORAGE_KEY);
  } catch (error) {
    logger.warn('state_load_failed', error);
    stored = undefined;
  }
  cache = normalizeState(stored);
  return clone(cache);
}

function saveState(state) {
  cache = normalizeState(state);
  try {
    wx.setStorageSync(STORAGE_KEY, cache);
    return true;
  } catch (error) {
    logger.warn('state_save_failed', error);
    return false;
  }
}

function resetState() {
  cache = createDefaultState();
  try {
    wx.setStorageSync(STORAGE_KEY, cache);
  } catch (error) {
    logger.warn('state_reset_failed', error);
    // The in-memory fallback still keeps the app usable for this session.
  }
  return clone(cache);
}

function exportBackup(state) {
  return JSON.stringify({ app: '班妥了', platform: 'wechat-miniprogram', schemaVersion: 2, exportedAt: new Date().toISOString(), data: normalizeState(state) }, null, 2);
}

function importBackup(text) {
  if (typeof text !== 'string' || text.length > MAX_BACKUP_LENGTH) throw new Error('备份文件过大或格式不正确');
  const parsed = JSON.parse(text);
  const data = parsed && parsed.data ? parsed.data : parsed;
  if (!data || typeof data !== 'object' || !Array.isArray(data.shifts)) throw new Error('备份格式不正确');
  return normalizeState(data);
}

module.exports = {
  STORAGE_KEY,
  MAX_SHIFTS,
  MAX_MEMBERS,
  MAX_PERSONAL_ASSIGNMENTS,
  MAX_TEAM_ASSIGNMENTS,
  MAX_CYCLE_PERIODS,
  MAX_BACKUP_LENGTH,
  normalizeState,
  loadState,
  saveState,
  resetState,
  exportBackup,
  importBackup
};
