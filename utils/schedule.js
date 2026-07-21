const { CYCLE_TEMPLATES, DEFAULT_SHIFTS } = require('./defaults');
const dateUtils = require('./date');

function positiveModulo(value, length) {
  return ((value % length) + length) % length;
}

function calculateDuration(startMinutes, endMinutes, breakMinutes, isWork) {
  if (!isWork || startMinutes < 0 || endMinutes < 0) return 0;
  let span = endMinutes - startMinutes;
  if (span <= 0) span += 1440;
  return Math.max(0, span - Math.max(0, breakMinutes || 0));
}

function formatClock(minutes, time24 = true) {
  if (minutes < 0) return '--';
  const normalized = positiveModulo(minutes, 1440);
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  if (time24) return `${dateUtils.pad(hour)}:${dateUtils.pad(minute)}`;
  const suffix = hour < 12 ? '上午' : '下午';
  const displayHour = hour % 12 || 12;
  return `${suffix}${displayHour}:${dateUtils.pad(minute)}`;
}

function decorateShift(value, time24 = true) {
  const shift = Object.assign({}, value);
  shift.durationMinutes = calculateDuration(shift.startMinutes, shift.endMinutes, shift.breakMinutes, shift.isWork);
  shift.compactTime = shift.isWork ? formatClock(shift.startMinutes, time24) : (shift.key === 'rest' ? '全天' : '--');
  if (!shift.isWork) {
    shift.timeText = shift.key === 'rest' ? '今天不用上班' : '当天暂无安排';
  } else {
    const nextDay = shift.endMinutes <= shift.startMinutes ? '次日 ' : '';
    const hours = shift.durationMinutes / 60;
    const durationText = Number.isInteger(hours) ? `${hours}` : `${Math.floor(hours)}.5`;
    shift.timeText = `${formatClock(shift.startMinutes, time24)} - ${nextDay}${formatClock(shift.endMinutes, time24)} · ${durationText} 小时`;
  }
  return shift;
}

function normalizedShifts(state) {
  const source = Array.isArray(state.shifts) && state.shifts.length ? state.shifts : DEFAULT_SHIFTS;
  return source.map((shift) => decorateShift(shift, state.time24 !== false));
}

function buildShiftLookup(state) {
  const shifts = normalizedShifts(state);
  const byKey = {};
  shifts.forEach((shift) => { byKey[shift.key] = shift; });
  const fallback = byKey.none || decorateShift(DEFAULT_SHIFTS[0], state.time24 !== false);
  return { shifts, byKey, fallback };
}

function shiftFromLookup(lookup, key) {
  return lookup.byKey[key] || lookup.fallback;
}

function getShift(state, key) {
  return shiftFromLookup(buildShiftLookup(state), key);
}

function getCycleShiftKey(state, dateKey) {
  const template = CYCLE_TEMPLATES[positiveModulo(Number(state.cycleTemplateIndex) || 0, CYCLE_TEMPLATES.length)];
  const offset = dateUtils.daysBetween(state.cycleStartKey, dateKey);
  return template.sequence[positiveModulo(offset, template.sequence.length)];
}

function getPersonalShiftKey(state, dateKey) {
  if (state.assignments && Object.prototype.hasOwnProperty.call(state.assignments, dateKey)) return state.assignments[dateKey];
  return state.cycleEnabled ? getCycleShiftKey(state, dateKey) : 'none';
}

function teamAssignmentKey(dateKey, memberId) {
  return `${dateKey}|${memberId}`;
}

function getTeamShiftKey(state, dateKey, memberId) {
  return (state.teamAssignments && state.teamAssignments[teamAssignmentKey(dateKey, memberId)]) || 'none';
}

function teamDetailsForDate(state, dateKey) {
  const lookup = buildShiftLookup(state);
  return (state.teamMembers || []).map((member) => {
    const shift = shiftFromLookup(lookup, getTeamShiftKey(state, dateKey, member.id));
    return { member, shift };
  }).filter((item) => item.shift.key !== 'none');
}

function teamCountForDate(state, dateKey) {
  const lookup = buildShiftLookup(state);
  return (state.teamMembers || []).reduce((count, member) => {
    const shift = shiftFromLookup(lookup, getTeamShiftKey(state, dateKey, member.id));
    return count + (shift.key === 'none' ? 0 : 1);
  }, 0);
}

function buildCalendar(state, year, month) {
  const firstWeekday = new Date(year, month, 1).getDay();
  const startOffset = positiveModulo(firstWeekday - (state.weekStart === 0 ? 0 : 1), 7);
  const today = dateUtils.todayKey();
  const result = [];
  let teamCounts = null;
  if (state.appMode === 'team') {
    teamCounts = {};
    const memberIds = new Set((state.teamMembers || []).map((member) => member.id));
    const shiftKeys = new Set(normalizedShifts(state).filter((shift) => shift.key !== 'none').map((shift) => shift.key));
    Object.keys(state.teamAssignments || {}).forEach((key) => {
      const separator = key.indexOf('|');
      if (separator <= 0) return;
      const dateKey = key.slice(0, separator);
      const memberId = key.slice(separator + 1);
      if (!memberIds.has(memberId) || !shiftKeys.has(state.teamAssignments[key])) return;
      teamCounts[dateKey] = (teamCounts[dateKey] || 0) + 1;
    });
  }
  for (let index = 0; index < 42; index += 1) {
    const current = new Date(year, month, 1 - startOffset + index);
    const dateKey = dateUtils.formatDateKey(current.getFullYear(), current.getMonth(), current.getDate());
    if (state.appMode === 'team') {
      const count = teamCounts[dateKey] || 0;
      result.push({
        dateKey, date: current.getDate(), year: current.getFullYear(), month: current.getMonth(),
        inMonth: current.getFullYear() === year && current.getMonth() === month,
        isToday: dateKey === today, count, shortName: count ? `${count}人` : '', color: ''
      });
    } else {
      const shiftKey = getPersonalShiftKey(state, dateKey);
      const shift = getShift(state, shiftKey);
      result.push({
        dateKey, date: current.getDate(), year: current.getFullYear(), month: current.getMonth(), shiftKey,
        inMonth: current.getFullYear() === year && current.getMonth() === month, isToday: dateKey === today,
        isOverride: !!(state.assignments && Object.prototype.hasOwnProperty.call(state.assignments, dateKey)),
        shortName: shift.shortName, color: shift.color
      });
    }
  }
  return result;
}

function emptyStats() {
  return { workDays: 0, restDays: 0, nightDays: 0, totalMinutes: 0, morningDays: 0, dayDays: 0, eveningDays: 0 };
}

function addPersonalShift(stats, shift) {
  if (shift.key === 'rest') stats.restDays += 1;
  else if (shift.isWork) {
    stats.workDays += 1;
    stats.totalMinutes += shift.durationMinutes;
  }
  if (shift.isWork && (shift.key === 'night' || shift.endMinutes <= shift.startMinutes)) stats.nightDays += 1;
  else if (shift.key === 'morning') stats.morningDays += 1;
  else if (shift.key === 'day') stats.dayDays += 1;
  else if (shift.key === 'evening') stats.eveningDays += 1;
}

function calculateMonthStatistics(state, year, month) {
  const stats = emptyStats();
  const lookup = buildShiftLookup(state);
  const dayCount = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= dayCount; day += 1) {
    addPersonalShift(stats, shiftFromLookup(lookup, getPersonalShiftKey(state, dateUtils.formatDateKey(year, month, day))));
  }
  return stats;
}

function calculateMonthShiftCounts(state, year, month) {
  const lookup = buildShiftLookup(state);
  const counts = lookup.shifts.filter((shift) => shift.key !== 'none').map((shift) => ({ shift, count: 0 }));
  const countByKey = {};
  counts.forEach((item) => { countByKey[item.shift.key] = item; });
  const dayCount = new Date(year, month + 1, 0).getDate();
  for (let day = 1; day <= dayCount; day += 1) {
    const key = getPersonalShiftKey(state, dateUtils.formatDateKey(year, month, day));
    const item = countByKey[key];
    if (item) item.count += 1;
  }
  return counts;
}

function calculateYearStatistics(state, year) {
  const now = new Date();
  const lookup = buildShiftLookup(state);
  const result = Object.assign(emptyStats(), { year, longestWorkStreak: 0, months: [] });
  let currentStreak = 0;
  for (let month = 0; month < 12; month += 1) {
    const monthStats = emptyStats();
    let limit = new Date(year, month + 1, 0).getDate();
    if (year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth())) limit = 0;
    else if (year === now.getFullYear() && month === now.getMonth()) limit = now.getDate();
    for (let day = 1; day <= limit; day += 1) {
      const shift = shiftFromLookup(lookup, getPersonalShiftKey(state, dateUtils.formatDateKey(year, month, day)));
      addPersonalShift(monthStats, shift);
      if (shift.isWork) {
        currentStreak += 1;
        result.longestWorkStreak = Math.max(result.longestWorkStreak, currentStreak);
      } else currentStreak = 0;
    }
    result.months.push(Object.assign({ month }, monthStats));
    Object.keys(emptyStats()).forEach((key) => { result[key] += monthStats[key]; });
  }
  return result;
}

function calculateTeamMonthStatistics(state, year, month) {
  const members = (state.teamMembers || []).map((member) => ({ member, workDays: 0, restDays: 0, nightDays: 0, totalMinutes: 0 }));
  const memberMap = {};
  members.forEach((item) => { memberMap[item.member.id] = item; });
  const lookup = buildShiftLookup(state);
  const result = { memberCount: members.length, assignmentCount: 0, workAssignments: 0, nightAssignments: 0, totalMinutes: 0, members, dailyCounts: {} };
  const prefix = `${year}-${dateUtils.pad(month + 1)}-`;
  Object.keys(state.teamAssignments || {}).forEach((key) => {
    const split = key.indexOf('|');
    const dateKey = key.slice(0, split);
    const memberId = key.slice(split + 1);
    if (!dateKey.startsWith(prefix)) return;
    const memberStats = memberMap[memberId];
    if (!memberStats) return;
    const shift = shiftFromLookup(lookup, state.teamAssignments[key]);
    if (shift.key === 'none') return;
    result.assignmentCount += 1;
    result.dailyCounts[dateKey] = (result.dailyCounts[dateKey] || 0) + 1;
    if (shift.isWork) {
      result.workAssignments += 1;
      result.totalMinutes += shift.durationMinutes;
      memberStats.workDays += 1;
      memberStats.totalMinutes += shift.durationMinutes;
      if (shift.key === 'night' || shift.endMinutes <= shift.startMinutes) {
        result.nightAssignments += 1;
        memberStats.nightDays += 1;
      }
    } else if (shift.key === 'rest') memberStats.restDays += 1;
  });
  return result;
}

function calculateTeamYearStatistics(state, year) {
  const result = { year, memberCount: (state.teamMembers || []).length, assignmentCount: 0, workAssignments: 0, nightAssignments: 0, totalMinutes: 0, months: [], members: [] };
  const memberMap = {};
  (state.teamMembers || []).forEach((member) => {
    memberMap[member.id] = { member, workDays: 0, restDays: 0, nightDays: 0, totalMinutes: 0 };
  });
  for (let month = 0; month < 12; month += 1) {
    const stats = calculateTeamMonthStatistics(state, year, month);
    result.months.push({ month, assignmentCount: stats.assignmentCount, workAssignments: stats.workAssignments, nightAssignments: stats.nightAssignments, totalMinutes: stats.totalMinutes });
    result.assignmentCount += stats.assignmentCount;
    result.workAssignments += stats.workAssignments;
    result.nightAssignments += stats.nightAssignments;
    result.totalMinutes += stats.totalMinutes;
    stats.members.forEach((item) => {
      const target = memberMap[item.member.id];
      target.workDays += item.workDays;
      target.restDays += item.restDays;
      target.nightDays += item.nightDays;
      target.totalMinutes += item.totalMinutes;
    });
  }
  result.members = Object.keys(memberMap).map((key) => memberMap[key]);
  return result;
}

function findNextRestDays(state, fromKey) {
  for (let offset = 0; offset <= 31; offset += 1) {
    if (getPersonalShiftKey(state, dateUtils.addDays(fromKey, offset)) === 'rest') return offset;
  }
  return -1;
}

function isShiftInUse(state, shiftKey) {
  return Object.values(state.assignments || {}).includes(shiftKey) || Object.values(state.teamAssignments || {}).includes(shiftKey) || (state.cycleEnabled && CYCLE_TEMPLATES.some((template) => template.sequence.includes(shiftKey)));
}

module.exports = {
  positiveModulo,
  calculateDuration,
  formatClock,
  decorateShift,
  normalizedShifts,
  getShift,
  getCycleShiftKey,
  getPersonalShiftKey,
  teamAssignmentKey,
  getTeamShiftKey,
  teamDetailsForDate,
  teamCountForDate,
  buildCalendar,
  calculateMonthStatistics,
  calculateMonthShiftCounts,
  calculateYearStatistics,
  calculateTeamMonthStatistics,
  calculateTeamYearStatistics,
  findNextRestDays,
  isShiftInUse
};
