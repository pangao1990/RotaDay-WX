const { THEMES } = require('./defaults');

function isHexColor(value) {
  return /^#[0-9A-Fa-f]{6}$/.test(String(value || ''));
}

function channels(color) {
  const normalized = isHexColor(color) ? color : '#000000';
  return [parseInt(normalized.slice(1, 3), 16), parseInt(normalized.slice(3, 5), 16), parseInt(normalized.slice(5, 7), 16)];
}

function toHex(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0').toUpperCase();
}

function mix(base, overlay, weight) {
  const a = channels(base);
  const b = channels(overlay);
  return `#${toHex(a[0] * (1 - weight) + b[0] * weight)}${toHex(a[1] * (1 - weight) + b[1] * weight)}${toHex(a[2] * (1 - weight) + b[2] * weight)}`;
}

function luminance(color) {
  return channels(color).reduce((sum, value, index) => {
    const normalized = value / 255;
    const linear = normalized <= 0.03928 ? normalized / 12.92 : Math.pow((normalized + 0.055) / 1.055, 2.4);
    return sum + linear * [0.2126, 0.7152, 0.0722][index];
  }, 0);
}

function customTheme(brandValue, pageValue) {
  const brand = isHexColor(brandValue) ? brandValue.toUpperCase() : '#2F73C9';
  const page = isHexColor(pageValue) ? pageValue.toUpperCase() : '#F7FBFF';
  const dark = luminance(page) < 0.38;
  const text = dark ? '#F5F8FC' : '#1D2935';
  const muted = dark ? '#B8C6D6' : '#5B6B79';
  return {
    key: 'custom', name: '自定义', description: '按你的习惯搭配主题色和背景色', page,
    surface: mix(page, '#FFFFFF', dark ? 0.08 : 0.72), subtle: mix(page, brand, dark ? 0.2 : 0.09),
    text, muted, faint: muted, border: mix(page, text, dark ? 0.22 : 0.14), brand,
    brandSoft: mix(page, brand, dark ? 0.3 : 0.16), onBrand: luminance(brand) > 0.52 ? '#20242D' : '#FFFFFF',
    accent: mix(brand, '#32A89A', 0.38), warm: mix(brand, '#F0B44C', 0.38),
    overlay: dark ? 'rgba(8,14,22,.72)' : 'rgba(29,41,53,.48)'
  };
}

function resolveTheme(state) {
  const index = ((Number(state.themeIndex) || 0) % THEMES.length + THEMES.length) % THEMES.length;
  return index === THEMES.length - 1 ? customTheme(state.customThemeBrand, state.customThemePage) : Object.assign({}, THEMES[index]);
}

function themeVars(theme) {
  const shadow = luminance(theme.page) < 0.38 ? 'rgba(0,0,0,.22)' : 'rgba(37,78,112,.06)';
  return [
    `--page:${theme.page}`,
    `--surface:${theme.surface}`,
    `--subtle:${theme.subtle}`,
    `--text:${theme.text}`,
    `--muted:${theme.muted}`,
    `--faint:${theme.faint}`,
    `--border:${theme.border}`,
    `--brand:${theme.brand}`,
    `--brand-soft:${theme.brandSoft}`,
    `--on-brand:${theme.onBrand}`,
    `--accent:${theme.accent}`,
    `--warm:${theme.warm}`,
    `--overlay:${theme.overlay}`,
    `--shadow:${shadow}`,
    `background:${theme.page}`,
    `color:${theme.text}`
  ].join(';');
}

module.exports = { isHexColor, mix, luminance, customTheme, resolveTheme, themeVars };
