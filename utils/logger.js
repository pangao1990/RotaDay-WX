let logManager;

function getLogManager() {
  if (logManager !== undefined) return logManager;
  try {
    logManager = typeof wx !== 'undefined' && wx.getLogManager ? wx.getLogManager({ level: 0 }) : null;
  } catch (error) {
    logManager = null;
  }
  return logManager;
}

function detailText(detail) {
  if (detail === undefined || detail === null) return '';
  if (detail instanceof Error) return `${detail.name || 'Error'}: ${detail.message || ''}`.slice(0, 1800);
  if (typeof detail === 'string') return detail.slice(0, 1800);
  try {
    return JSON.stringify(detail).slice(0, 1800);
  } catch (error) {
    return String(detail).slice(0, 1800);
  }
}

function write(level, scope, detail) {
  const message = `[${String(scope || 'app').slice(0, 80)}] ${detailText(detail)}`;
  const manager = getLogManager();
  if (manager && typeof manager[level] === 'function') {
    manager[level](message);
    return;
  }
  if (typeof console !== 'undefined' && typeof console[level] === 'function') console[level](message);
}

module.exports = {
  info(scope, detail) { write('info', scope, detail); },
  warn(scope, detail) { write('warn', scope, detail); },
  error(scope, detail) { write('error', scope, detail); }
};
