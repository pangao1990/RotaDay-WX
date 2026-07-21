const schedule = require('./schedule');
const dateUtils = require('./date');
const PERSONAL_MOMENT_CONTENT = require('./moment-content');

const SCENE_IMAGES = {
  morning: '/assets/moments/morning.jpg',
  day: '/assets/moments/day.jpg',
  night: '/assets/moments/night.jpg',
  rest: '/assets/moments/rest.jpg',
  twoDays: '/assets/moments/two-days.jpg',
  afterNight: '/assets/moments/after-night.jpg',
  tired: '/assets/moments/tired.jpg'
};

function attachPersonalAssets(source) {
  const scenes = {};
  Object.keys(source).forEach((key) => {
    scenes[key] = Object.assign({ key }, source[key], { posterImage: SCENE_IMAGES[key] || SCENE_IMAGES.day });
  });
  return scenes;
}

const SCENES = attachPersonalAssets(PERSONAL_MOMENT_CONTENT);

const TEAM_SCENE_SEEDS = [
  { key: 'morning', kicker: '团队早班 · 开始部署', alt: '团队早班排班板与任务卡片插画', focus: '早班安排', moment: '清晨' },
  { key: 'day', kicker: '团队白班 · 协调进行中', alt: '白天团队排班板与工作节奏插画', focus: '白班协调', moment: '白天' },
  { key: 'night', kicker: '团队夜班 · 守住节奏', alt: '夜班值守排班板与交接状态插画', focus: '夜班值守', moment: '深夜' },
  { key: 'rest', kicker: '今天可以少管一点', alt: '负责人休息日与安静排班板插画', focus: '休息安排', moment: '休息日' },
  { key: 'twoDays', kicker: '距离轮休还有 2 天', alt: '团队轮休进度与排班卡片插画', focus: '轮休前的安排', moment: '这两天' },
  { key: 'afterNight', kicker: '夜班交接完成', alt: '夜班交接完成与排班确认插画', focus: '交接收尾', moment: '交班后' },
  { key: 'tired', kicker: '负责人也会累', alt: '管理压力下的安静排班板插画', focus: '压力中的协调', moment: '疲惫时' }
];

function createTeamScene(seed) {
  return {
    key: seed.key,
    kicker: seed.kicker,
    alt: seed.alt,
    posterImage: '/assets/moments/team.jpg',
    titles: [
      seed.focus + '，先把节奏稳下来',
      '今天不需要一个人扛住所有事',
      '清楚安排，也给彼此留一点余地',
      '负责人不是永远不能累的人',
      '把' + seed.moment + '拆成几个可以确认的节点',
      '公平比看起来平均更重要',
      '先解决真正影响团队的那一件事',
      '稳定的团队来自清楚而温和的边界',
      '你可以负责，但不必包办',
      '每一次交接清楚，都会减少下一次慌张',
      '照顾团队，也别把自己漏掉',
      '愿' + seed.moment + '少一点临时变化，多一点顺利'
    ],
    bodies: [
      { text: '面对' + seed.focus + '，先确认人员、时间和关键岗位。信息清楚以后，压力会小很多。', tone: '情绪价值 · 稳住当下' },
      { text: '你需要做决定，但不代表所有结果都只能由你一个人承担。把责任分清，也是一种可靠。', tone: '精神价值 · 责任边界' },
      { text: '临时缺人时先守住安全和必要岗位，非关键事项可以调整。稳妥不是退让。', tone: '情绪价值 · 降低混乱' },
      { text: '成员的疲惫值得被看见，你的疲惫也一样。负责人身份不会取消人的正常需要。', tone: '精神价值 · 看见自己' },
      { text: '说明安排时把原因、时间和交接点讲清楚。清楚的沟通，比反复催促更能建立信任。', tone: '精神价值 · 建立信任' },
      { text: '排班无法让每个人每次都满意，但可以做到规则一致、过程透明、特殊情况有记录。', tone: '精神价值 · 公平原则' },
      { text: '遇到冲突先问事实，再谈方案。把情绪放缓一点，不等于忽视问题。', tone: '情绪价值 · 缓冲冲突' },
      { text: '可以请成员确认自己的班次和交接事项。让团队参与，不是失去控制，而是减少遗漏。', tone: '情绪价值 · 共同承担' },
      { text: '如果今天已经做了足够多，就允许自己停止反复复盘。管理不是靠持续自责变得更好。', tone: '精神价值 · 停止内耗' },
      { text: '愿' + seed.moment + '人员齐整、沟通顺畅、交接清楚，也愿你在照顾团队时保留自己的呼吸空间。', tone: '情绪价值 · 温柔祝愿' }
    ]
  };
}

const TEAM_SCENES = {};
TEAM_SCENE_SEEDS.forEach((seed) => {
  TEAM_SCENES[seed.key] = createTeamScene(seed);
});

function selfMemberId(state) {
  const members = Array.isArray(state.teamMembers) ? state.teamMembers : [];
  const member = members.find((item) => item && item.isSelf) || members[0];
  return member ? member.id : '';
}

function shiftKeyForDate(state, dateKey) {
  if (state.appMode !== 'team') return schedule.getPersonalShiftKey(state, dateKey);
  const memberId = selfMemberId(state);
  return memberId ? schedule.getTeamShiftKey(state, dateKey, memberId) : 'none';
}

function findNextAudienceRestDays(state, fromKey) {
  if (state.appMode !== 'team') return schedule.findNextRestDays(state, fromKey);
  for (let offset = 0; offset <= 31; offset += 1) {
    if (shiftKeyForDate(state, dateUtils.addDays(fromKey, offset)) === 'rest') return offset;
  }
  return -1;
}

function sceneForState(state, now = new Date()) {
  const today = dateUtils.todayKey();
  const shift = schedule.getShift(state, shiftKeyForDate(state, today));
  const previous = schedule.getShift(state, shiftKeyForDate(state, dateUtils.addDays(today, -1)));
  const hour = now.getHours();
  if (hour < 11 && previous.key === 'night') return 'afterNight';
  if (shift.key === 'rest') return 'rest';
  const nextRest = findNextAudienceRestDays(state, today);
  if (nextRest > 0 && nextRest <= 2) return 'twoDays';
  if (shift.key === 'night') return 'night';
  if (shift.key === 'morning' && hour < 11) return 'morning';
  if (hour >= 22) return 'tired';
  return 'day';
}

function matchesTone(tone, preference) {
  const emotional = String(tone || '').includes('鼓舞') || String(tone || '').includes('情绪价值');
  if (Number(preference) === 1) return !emotional;
  if (Number(preference) === 2) return emotional;
  return true;
}

function messageCombinations(scene, preference) {
  const combinations = [];
  scene.titles.forEach((title, titleIndex) => {
    scene.bodies.forEach((body, bodyIndex) => {
      if (matchesTone(body.tone, preference)) {
        combinations.push({ id: titleIndex + '-' + bodyIndex, title, body });
      }
    });
  });
  return combinations;
}

function chooseMoment(state, requestedScene) {
  const audience = state.appMode === 'team' ? 'team' : 'personal';
  let sceneKey = requestedScene || sceneForState(state);
  if (sceneKey === 'team') sceneKey = sceneForState(state);
  const scenes = audience === 'team' ? TEAM_SCENES : SCENES;
  const scene = scenes[sceneKey] || scenes.day;
  sceneKey = scene.key;
  const historyKey = audience === 'team' ? 'team:' + sceneKey : sceneKey;
  const storedHistory = (state.momentHistory && state.momentHistory[historyKey]) || {};
  const history = Array.isArray(storedHistory) ? storedHistory : (storedHistory.messages || []);
  let combinations = messageCombinations(scene, state.momentToneIndex);
  if (!combinations.length) combinations = messageCombinations(scene, 0);
  const available = combinations.filter((item) => !history.includes(item.id));
  const pool = available.length ? available : combinations;
  const selected = pool[Math.floor(Math.random() * pool.length)];
  const nextHistory = [selected.id].concat(history.filter((id) => id !== selected.id)).slice(0, 30);
  return {
    audience,
    sceneKey,
    historyKey,
    kicker: scene.kicker,
    title: selected.title,
    copy: selected.body.text,
    tone: selected.body.tone,
    alt: scene.alt,
    image: scene.posterImage,
    posterImage: scene.posterImage,
    fallbackPosterImage: scene.posterImage,
    nextHistory: { messages: nextHistory, images: [] }
  };
}

module.exports = {
  SCENES,
  TEAM_SCENES,
  sceneForState,
  chooseMoment,
  matchesTone
};
