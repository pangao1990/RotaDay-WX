const DAY_MS = 24 * 60 * 60 * 1000;

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function formatDateKey(year, month, date) {
  return `${year}-${pad(month + 1)}-${pad(date)}`;
}

function todayKey() {
  const now = new Date();
  return formatDateKey(now.getFullYear(), now.getMonth(), now.getDate());
}

function parseDateKey(value) {
  const parts = String(value || '').split('-').map(Number);
  return { year: parts[0] || 1970, month: (parts[1] || 1) - 1, date: parts[2] || 1 };
}

function dateFromKey(value) {
  const parts = parseDateKey(value);
  return new Date(parts.year, parts.month, parts.date);
}

function daysBetween(fromKey, toKey) {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  const fromTime = Date.UTC(from.year, from.month, from.date);
  const toTime = Date.UTC(to.year, to.month, to.date);
  return Math.round((toTime - fromTime) / DAY_MS);
}

function addDays(value, offset) {
  const parts = parseDateKey(value);
  const date = new Date(parts.year, parts.month, parts.date + offset);
  return formatDateKey(date.getFullYear(), date.getMonth(), date.getDate());
}

function weekdayLabel(value, longForm) {
  const labels = longForm ? ['周日', '周一', '周二', '周三', '周四', '周五', '周六'] : ['日', '一', '二', '三', '四', '五', '六'];
  return labels[dateFromKey(value).getDay()];
}

function displayDate(value, includeYear) {
  const parts = parseDateKey(value);
  const prefix = includeYear ? `${parts.year}年` : '';
  return `${prefix}${parts.month + 1}月${parts.date}日`;
}

function monthLabel(year, month) {
  return `${year}年${month + 1}月`;
}

function isValidDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value || ''))) return false;
  const parts = parseDateKey(value);
  const date = new Date(parts.year, parts.month, parts.date);
  return date.getFullYear() === parts.year && date.getMonth() === parts.month && date.getDate() === parts.date;
}

module.exports = {
  DAY_MS,
  pad,
  formatDateKey,
  todayKey,
  parseDateKey,
  dateFromKey,
  daysBetween,
  addDays,
  weekdayLabel,
  displayDate,
  monthLabel,
  isValidDateKey
};
