const DEFAULT_SHIFTS = [
  { key: 'none', shortName: '', name: '无安排', color: '#929B97', startMinutes: -1, endMinutes: -1, breakMinutes: 0, isWork: false, builtIn: true },
  { key: 'morning', shortName: '早', name: '早班', color: '#368B78', startMinutes: 360, endMinutes: 840, breakMinutes: 0, isWork: true, builtIn: true },
  { key: 'day', shortName: '白', name: '白班', color: '#3D7DC4', startMinutes: 480, endMinutes: 1020, breakMinutes: 60, isWork: true, builtIn: true },
  { key: 'evening', shortName: '晚', name: '晚班', color: '#C2793E', startMinutes: 840, endMinutes: 1320, breakMinutes: 0, isWork: true, builtIn: true },
  { key: 'night', shortName: '夜', name: '夜班', color: '#675FA8', startMinutes: 1200, endMinutes: 480, breakMinutes: 60, isWork: true, builtIn: true },
  { key: 'rest', shortName: '休', name: '休息', color: '#7E8984', startMinutes: -1, endMinutes: -1, breakMinutes: 0, isWork: false, builtIn: true }
];

const CYCLE_TEMPLATES = [
  { key: 'two-two-two', name: '白白夜夜休休', description: '常见六天循环，适合白夜交替班制', sequence: ['day', 'day', 'night', 'night', 'rest', 'rest'] },
  { key: 'morning-evening', name: '早早晚晚休休', description: '早晚轮换，连续工作两天后休息', sequence: ['morning', 'morning', 'evening', 'evening', 'rest', 'rest'] },
  { key: 'three-two', name: '三班两休', description: '连续三个白班，随后休息两天', sequence: ['day', 'day', 'day', 'rest', 'rest'] },
  { key: 'four-two', name: '四班两休', description: '连续四个白班，随后休息两天', sequence: ['day', 'day', 'day', 'day', 'rest', 'rest'] }
];

const THEMES = [
  { key: 'calm', name: '晴和', description: '默认 · 清亮天蓝，打开就有好心情', recommended: true, page: '#F7FBFF', surface: '#FFFFFF', subtle: '#EAF4FF', text: '#172638', muted: '#52677C', faint: '#7B8C9C', border: '#D5E5F4', brand: '#2F73C9', brandSoft: '#DDEBFA', onBrand: '#FFFFFF', accent: '#32A89A', warm: '#F0B44C', overlay: 'rgba(23,38,56,.48)' },
  { key: 'night', name: '夜航', description: '夜班友好 · 深蓝高对比，夜间不刺眼', recommended: false, page: '#111A26', surface: '#182435', subtle: '#223146', text: '#F5F8FC', muted: '#B8C6D6', faint: '#91A3B7', border: '#31445A', brand: '#79C7E3', brandSoft: '#25465A', onBrand: '#10202B', accent: '#66C5A7', warm: '#F0C66B', overlay: 'rgba(8,14,22,.68)' },
  { key: 'breeze', name: '青柚', description: '清新青绿 · 像透光叶片，轻快有活力', recommended: false, page: '#F6FCF8', surface: '#FFFFFF', subtle: '#E8F7EE', text: '#153126', muted: '#4F6D61', faint: '#748B82', border: '#D2EADD', brand: '#238966', brandSoft: '#D7F0E4', onBrand: '#FFFFFF', accent: '#68B84F', warm: '#F0C64F', overlay: 'rgba(21,49,38,.48)' },
  { key: 'warm', name: '暖阳', description: '暖橙奶油 · 温暖明快，减少上班紧绷', recommended: false, page: '#FFF9F2', surface: '#FFFFFF', subtle: '#FFF0DF', text: '#382419', muted: '#755B4D', faint: '#947E70', border: '#F0DDC9', brand: '#D65F32', brandSoft: '#FBE2D5', onBrand: '#FFFFFF', accent: '#2F9D91', warm: '#F0B542', overlay: 'rgba(56,36,25,.48)' },
  { key: 'dawn', name: '桃晴', description: '柔和莓粉 · 轻盈有气色，亲切不甜腻', recommended: false, page: '#FFF7FA', surface: '#FFFFFF', subtle: '#FCE9F0', text: '#38222B', muted: '#755B65', faint: '#947C86', border: '#EFD6E0', brand: '#C84F78', brandSoft: '#F8DDEA', onBrand: '#FFFFFF', accent: '#4E93C0', warm: '#EFB44B', overlay: 'rgba(56,34,43,.48)' },
  { key: 'cloud', name: '轻虹', description: '清透淡紫 · 温柔不灰暗，给日常一点新鲜感', recommended: false, page: '#FAF8FF', surface: '#FFFFFF', subtle: '#F0EBFF', text: '#29223B', muted: '#675E7B', faint: '#887F98', border: '#E2DAF5', brand: '#7256C7', brandSoft: '#E7DEFA', onBrand: '#FFFFFF', accent: '#3FA6B6', warm: '#EDB64D', overlay: 'rgba(41,34,59,.48)' },
  { key: 'pine', name: '松风', description: '清透松绿 · 安定专注，与晴和明显区分', recommended: false, page: '#F5FAF6', surface: '#FFFFFF', subtle: '#E7F3EA', text: '#173126', muted: '#526B60', faint: '#778B82', border: '#D2E5D8', brand: '#1D7554', brandSoft: '#D6EBDE', onBrand: '#FFFFFF', accent: '#66A96F', warm: '#E4B64E', overlay: 'rgba(23,49,38,.48)' },
  { key: 'custom', name: '自定义', description: '按你的习惯搭配主题色和背景色', recommended: false, page: '#F7FBFF', surface: '#FFFFFF', subtle: '#EAF4FF', text: '#1D2935', muted: '#5B6B79', faint: '#82909C', border: '#D7E5F2', brand: '#2F73C9', brandSoft: '#DDEBFA', onBrand: '#FFFFFF', accent: '#32A89A', warm: '#F0B44C', overlay: 'rgba(29,41,53,.48)' }
];

const SHIFT_COLORS = ['#368B78', '#3D7DC4', '#C2793E', '#675FA8', '#B95D70', '#52796F', '#8B6F47', '#5B7FA3', '#2F8F9D', '#5978C7', '#8C67A8', '#B65F8B', '#C65D4B', '#C38A34', '#7B8B3E', '#3E8B64'];
const MEMBER_COLORS = ['#009B83', '#2388CF', '#D8792A', '#6B5FB5', '#C7516D', '#438175', '#9A733D', '#5687AD', '#2E9AA5', '#4E6FC3', '#8A62A8', '#B85A8D', '#C65B4C', '#C18A32', '#748C3D', '#388A63', '#287D92', '#5367A5', '#755B99', '#A65475', '#AF6044', '#A97C35', '#667C45', '#47736A'];
const CUSTOM_BRAND_COLORS = ['#2F73C9', '#238966', '#D65F32', '#C84F78', '#7256C7', '#1D7554', '#187DA4', '#3FA69A', '#E09A2D', '#182435'];
const CUSTOM_PAGE_COLORS = ['#F7FBFF', '#F6FCF8', '#FFF9F2', '#FFF7FA', '#FAF8FF', '#F5FAF6', '#F5FBFE', '#FFFDF5', '#182435', '#111A26'];

function pad(value) {
  return value < 10 ? `0${value}` : `${value}`;
}

function firstDayKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function createDefaultState() {
  return {
    schemaVersion: 1,
    appMode: 'personal',
    themeIndex: 0,
    customThemeBrand: '#2F73C9',
    customThemePage: '#F7FBFF',
    weekStart: 1,
    time24: true,
    assignments: {},
    cycleEnabled: true,
    cycleTemplateIndex: 0,
    cycleStartKey: firstDayKey(),
    shifts: clone(DEFAULT_SHIFTS),
    teamMembers: [{ id: 'self', name: '我', role: '负责人', color: '#368B78', isSelf: true }],
    teamAssignments: {},
    teamClipboard: { sourceDateKey: '', assignments: [] },
    momentFrequencyIndex: 0,
    momentToneIndex: 0,
    momentHistory: {},
    lastMomentDate: ''
  };
}

module.exports = {
  DEFAULT_SHIFTS,
  CYCLE_TEMPLATES,
  THEMES,
  SHIFT_COLORS,
  MEMBER_COLORS,
  CUSTOM_BRAND_COLORS,
  CUSTOM_PAGE_COLORS,
  createDefaultState,
  clone
};
