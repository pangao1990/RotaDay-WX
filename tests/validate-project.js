const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const allowedWxmlTags = new Set(['view', 'text', 'button', 'image', 'scroll-view', 'picker', 'input', 'textarea', 'switch', 'slider', 'canvas', 'privacy-dialog', 'block', 'template', 'import', 'include']);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.name === 'node_modules' || entry.name === '.git') return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

function fail(message) {
  process.stderr.write(`✗ ${message}\n`);
  process.exitCode = 1;
}

const files = walk(root);

files.filter((file) => file.endsWith('.json')).forEach((file) => {
  try { JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { fail(`${path.relative(root, file)} JSON 无法解析：${error.message}`); }
});

files.filter((file) => file.endsWith('.js')).forEach((file) => {
  try { new vm.Script(fs.readFileSync(file, 'utf8'), { filename: file }); }
  catch (error) { fail(`${path.relative(root, file)} JavaScript 语法错误：${error.message}`); }
});

files.filter((file) => file.endsWith('.wxml')).forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  const tagPattern = /<\/?([a-zA-Z][\w-]*)\b/g;
  let match;
  while ((match = tagPattern.exec(source))) {
    if (!allowedWxmlTags.has(match[1])) fail(`${path.relative(root, file)} 使用了未登记的 WXML 标签 <${match[1]}>`);
  }
  const assetPattern = /(?:src|imageUrl)="(\/assets\/[^"}]+)"/g;
  while ((match = assetPattern.exec(source))) {
    if (!fs.existsSync(path.join(root, match[1]))) fail(`${path.relative(root, file)} 引用了不存在的资源 ${match[1]}`);
  }

  const stack = [];
  const tokenPattern = /<\/?([a-zA-Z][\w-]*)\b[^>]*>/g;
  while ((match = tokenPattern.exec(source))) {
    const token = match[0];
    const tag = match[1];
    if (token.startsWith('</')) {
      const expected = stack.pop();
      if (expected !== tag) fail(`${path.relative(root, file)} 标签闭合顺序错误：期望 </${expected || '无'}>，实际 </${tag}>`);
    } else if (!token.endsWith('/>') && !['input', 'image', 'switch', 'slider', 'import', 'include'].includes(tag)) {
      stack.push(tag);
    }
  }
  if (stack.length) fail(`${path.relative(root, file)} 存在未闭合标签：${stack.join(', ')}`);

  const scriptFile = file.replace(/\.wxml$/, '.js');
  if (fs.existsSync(scriptFile)) {
    const script = fs.readFileSync(scriptFile, 'utf8');
    const handlerPattern = /(?:bind|catch)(?:tap|change|input|blur|longpress|agreeprivacyauthorization)="([A-Za-z_$][\w$]*)"/g;
    while ((match = handlerPattern.exec(source))) {
      const handler = match[1];
      const definition = new RegExp(`\\n\\s*${handler.replace(/[$]/g, '\\$&')}\\s*\\(`);
      if (!definition.test(script)) fail(`${path.relative(root, file)} 绑定了未实现的事件方法 ${handler}`);
    }
  }
});

files.filter((file) => file.endsWith('.wxss')).forEach((file) => {
  const source = fs.readFileSync(file, 'utf8');
  const opens = (source.match(/{/g) || []).length;
  const closes = (source.match(/}/g) || []).length;
  if (opens !== closes) fail(`${path.relative(root, file)} WXSS 花括号不平衡：${opens}/${closes}`);
});

const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
const packageConfig = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const versionModule = require(path.join(root, 'utils/version'));
if (!/^\d+\.\d+\.\d+$/.test(packageConfig.version || '')) fail('package.json 必须使用标准三段式版本号');
if (versionModule.FALLBACK_VERSION !== packageConfig.version) fail('开发环境回退版本必须与 package.json 保持一致');
if (!appConfig.window || appConfig.window.navigationStyle !== 'default') {
  fail('app.json 必须使用微信原生导航栏，由系统为右上角胶囊和安全区留位');
}

const expectedTabPages = ['pages/index/index', 'pages/statistics/statistics', 'pages/settings/settings'];
const tabPages = appConfig.tabBar && Array.isArray(appConfig.tabBar.list)
  ? appConfig.tabBar.list.map((item) => item.pagePath)
  : [];
if (!appConfig.tabBar || appConfig.tabBar.custom !== true || JSON.stringify(tabPages) !== JSON.stringify(expectedTabPages)) {
  fail('app.json 必须使用微信官方自定义 tabBar，并登记排班、统计和设置三个标签页');
}

appConfig.pages.forEach((page) => {
  ['.js', '.json', '.wxml', '.wxss'].forEach((extension) => {
    const file = path.join(root, `${page}${extension}`);
    if (!fs.existsSync(file)) fail(`app.json 页面缺少文件：${page}${extension}`);
  });
});

['index', 'statistics', 'settings'].forEach((name) => {
  const pageRoot = path.join(root, `pages/${name}/${name}`);
  const config = JSON.parse(fs.readFileSync(`${pageRoot}.json`, 'utf8'));
  if (config.navigationStyle === 'custom') fail(`pages/${name}/${name}.json 不得覆盖为自定义导航栏`);
  const wxml = fs.readFileSync(`${pageRoot}.wxml`, 'utf8');
  if (wxml.includes('statusBarHeight')) fail(`pages/${name}/${name}.wxml 不得手工计算微信状态栏或胶囊占位`);
  if (wxml.includes('<app-tabbar')) fail(`pages/${name}/${name}.wxml 应交由微信官方 custom-tab-bar 渲染底部导航`);
});

['.js', '.json', '.wxml', '.wxss'].forEach((extension) => {
  if (!fs.existsSync(path.join(root, `custom-tab-bar/index${extension}`))) fail(`微信官方 custom-tab-bar 缺少 index${extension}`);
});

const runtimeText = files
  .filter((file) => /\.(js|json|wxml|wxss)$/.test(file) && !path.relative(root, file).startsWith('tests/'))
  .map((file) => fs.readFileSync(file, 'utf8'))
  .join('\n');
if (runtimeText.includes('打开 App 的片刻')) fail('用户文案必须使用“打开小程序的片刻”，不得沿用鸿蒙 App 表述');
if (runtimeText.includes('statusBarHeight')) fail('运行时代码不得保留手工状态栏高度计算');

let momentModule;
try {
  momentModule = require(path.join(root, 'utils/moment'));
} catch (error) {
  fail(`片刻文案模块无法加载：${error.message}`);
}
if (momentModule) {
  const personalScenes = Object.values(momentModule.SCENES || {});
  const teamScenes = Object.values(momentModule.TEAM_SCENES || {});
  if (personalScenes.length !== 7 || teamScenes.length !== 7) fail('片刻必须保留鸿蒙版的 7 个个人场景和 7 个团队场景');
  const allMomentScenes = personalScenes.concat(teamScenes);
  allMomentScenes.forEach((scene) => {
    if (!Array.isArray(scene.titles) || scene.titles.length !== 12 || !Array.isArray(scene.bodies) || scene.bodies.length !== 10) {
      fail(`片刻场景 ${scene.key || '未知'} 未保留 12 个标题和 10 段正文`);
    }
  });
  const momentCombinationCount = allMomentScenes.reduce((sum, scene) => sum + scene.titles.length * scene.bodies.length, 0);
  if (momentCombinationCount !== 1680) fail(`片刻文案组合应为 1680 种，实际为 ${momentCombinationCount} 种`);
  if (new Set(teamScenes.map((scene) => scene.posterImage)).size !== 1) fail('团队片刻应复用轻量图片，避免为文案多样性增加包体');
}

const defaultState = require(path.join(root, 'utils/defaults')).createDefaultState();
if (defaultState.cycleEnabled !== false) fail('个人版首次使用必须保持空班表，不得默认生成循环排班统计');
if (defaultState.schemaVersion !== 2 || !Array.isArray(defaultState.cyclePeriods) || defaultState.cyclePeriods.length) {
  fail('循环历史必须使用第二版数据结构，且首次使用不得预置历史区间');
}

files.filter((file) => file.endsWith('.json')).forEach((file) => {
  const config = JSON.parse(fs.readFileSync(file, 'utf8'));
  Object.values(config.usingComponents || {}).forEach((componentPath) => {
    if (typeof componentPath !== 'string' || componentPath.includes('://')) return;
    const base = componentPath.startsWith('/')
      ? path.resolve(root, `.${componentPath}`)
      : path.resolve(path.dirname(file), componentPath);
    ['.js', '.json', '.wxml', '.wxss'].forEach((extension) => {
      if (!fs.existsSync(`${base}${extension}`)) fail(`${path.relative(root, file)} 注册的组件缺少文件：${path.relative(root, base)}${extension}`);
    });
  });
});

const projectConfig = JSON.parse(fs.readFileSync(path.join(root, 'project.config.json'), 'utf8'));
if (!/^wx[a-zA-Z0-9]{16}$/.test(projectConfig.appid || '')) fail('project.config.json 未配置正式小程序 AppID');
if (!projectConfig.setting || projectConfig.setting.urlCheck !== true) fail('project.config.json 发布配置必须启用 urlCheck');
if (!projectConfig.setting || projectConfig.setting.minified !== true || projectConfig.setting.minifyWXML !== true || projectConfig.setting.minifyWXSS !== true) {
  fail('project.config.json 发布配置必须启用代码、WXML 和 WXSS 压缩');
}

const privateConfig = JSON.parse(fs.readFileSync(path.join(root, 'project.private.config.json'), 'utf8'));
if (!privateConfig.setting || privateConfig.setting.urlCheck !== true) fail('project.private.config.json 不应覆盖关闭 urlCheck');

const sitemap = JSON.parse(fs.readFileSync(path.join(root, 'sitemap.json'), 'utf8'));
const sitemapActions = new Map((sitemap.rules || []).map((rule) => [rule.page, rule.action]));
if (sitemapActions.get('pages/index/index') !== 'allow') fail('sitemap.json 必须允许排班首页索引');
['pages/statistics/statistics', 'pages/settings/settings'].forEach((page) => {
  if (sitemapActions.get(page) !== 'disallow') fail(`sitemap.json 必须禁止 ${page} 被索引`);
});

const settingsWxml = fs.readFileSync(path.join(root, 'pages/settings/settings.wxml'), 'utf8');
if (!settingsWxml.includes('open-type="contact"')) fail('设置页缺少微信原生客服入口');
if (!settingsWxml.includes('open-type="feedback"')) fail('设置页缺少微信原生意见反馈入口');
if (settingsWxml.includes('隐私保护指引') || settingsWxml.includes('openPrivacyContract')) fail('设置页不应展示单独的隐私保护指引入口');
if (!settingsWxml.includes('class="setting-control-row no-border"')) fail('日历显示面板不应保留多余分隔线');
if (!settingsWxml.includes('src="/assets/logo.png"') || settingsWxml.includes('webp="{{true}}"')) {
  fail('关于页 Logo 必须使用真机兼容的本地 PNG 资源');
}
if (!settingsWxml.includes('微信小程序版 {{appVersion}}') || /微信小程序版\s+\d+\.\d+\.\d+/.test(settingsWxml)) {
  fail('关于页版本号必须绑定微信运行时版本，不得写死在 WXML 中');
}
if (settingsWxml.includes('个人与团队排班、统计、主题和数据备份永久免费、无广告、无需登录。')) {
  fail('关于页不得保留已要求删除的免费与广告说明');
}
const expectedAboutDescription = '专为护士、安保、工厂、门店、物业等轮班人群打造的轻量化排班工具。自定义早中夜班、周期循环排班，一键生成月度班表。支持个人版和团队版智能排班。极简无冗余设计，倒班、值班、轮休一件事全部办妥。';
if (!settingsWxml.includes(expectedAboutDescription)) {
  fail('关于页产品介绍必须与确认文案完全一致');
}
if (settingsWxml.includes('鸿蒙桌面小组件') || settingsWxml.includes('班次闹钟准时推送')) {
  fail('微信小程序关于页不得宣传尚未提供的鸿蒙组件或班次闹钟能力');
}

const homeWxml = fs.readFileSync(path.join(root, 'pages/index/index.wxml'), 'utf8');
const homeJs = fs.readFileSync(path.join(root, 'pages/index/index.js'), 'utf8');
if (!homeWxml.includes('class="edit-pencil"') || homeWxml.includes('class="today-action-mark">调</text>')) {
  fail('首页调整按钮必须使用编辑图标，避免“调 / 调整”重复表达');
}
if (!homeWxml.includes('<canvas type="2d" id="momentPosterCanvas"') || homeJs.includes('createCanvasContext(')) {
  fail('片刻海报必须使用 Canvas 2D 节点，避免真机导出丢失插画或文字');
}
if (!homeJs.includes('momentHistory[selected.historyKey]')) {
  fail('团队与个人片刻必须使用独立历史键，避免互相消耗去重记录');
}
if (!homeWxml.includes('class="moment-action-icon download-icon"') || !homeWxml.includes('class="moment-action-icon share-icon"')) {
  fail('片刻保存与分享按钮必须使用统一的代码矢量图标');
}
const iconOnlyButtonTags = `${homeWxml}\n${settingsWxml}`.match(/<button[^>]*class="[^"]*(?:close-button|moment-close|color-choice|shift-color-choice)[^"]*"[^>]*>/g) || [];
if (!iconOnlyButtonTags.length || iconOnlyButtonTags.some((tag) => !tag.includes('aria-label='))) {
  fail('关闭、编辑与颜色选择等纯图标按钮必须提供无障碍说明');
}
if (/setData\s*\(\s*\{[^}]*\b(?:viewYear|viewMonth|nextRestDays)\s*:/s.test(homeJs)) {
  fail('首页内部日历游标和休息天数不得通过 setData 触发无效渲染');
}

const customModalTags = `${settingsWxml}\n${homeWxml}`.match(/<scroll-view class="modal-scroll"[^>]*>/g) || [];
if (!customModalTags.length || customModalTags.some((tag) => !tag.includes('enhanced="{{true}}"') || !tag.includes('show-scrollbar="{{false}}"'))) {
  fail('所有自定义弹窗必须使用增强型可滚动容器');
}

const settingsWxss = fs.readFileSync(path.join(root, 'pages/settings/settings.wxss'), 'utf8');
const settingsJs = fs.readFileSync(path.join(root, 'pages/settings/settings.js'), 'utf8');
if (!settingsJs.includes("require('../../utils/version')") || !settingsJs.includes('getMiniProgramVersion()')) {
  fail('设置页必须通过统一版本工具动态读取微信小程序版本');
}
if (!/\.segmented button\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(settingsWxss)) {
  fail('设置页分段按钮文字必须水平、垂直居中');
}
if (!/\.option-card\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(settingsWxss)) {
  fail('设置页选项卡文字必须水平、垂直居中');
}
if (!/\.shift-color-grid\s*\{[^}]*grid-template-columns:\s*repeat\(4,/s.test(settingsWxss)
  || !/\.mini-color-grid\s*\{[^}]*grid-template-columns:\s*repeat\(5,/s.test(settingsWxss)) {
  fail('设置页颜色选择器必须使用对称网格，避免最后一个色块单独换行');
}
if (/setData\s*\(\s*\{[^}]*\bcycleTemplateIndex\s*:/s.test(settingsJs)) {
  fail('循环模板索引未直接绑定 WXML，不应通过 setData 传入渲染层');
}

const homeWxss = fs.readFileSync(path.join(root, 'pages/index/index.wxss'), 'utf8');
if (!/\.segmented button\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(homeWxss)) {
  fail('团队排班分段按钮文字必须水平、垂直居中');
}
if (!homeWxml.includes('class="selected-shift-dot"') || !/\.selected-shift-dot\s*\{[^}]*width:\s*22rpx;[^}]*height:\s*22rpx;[^}]*flex:\s*none;/s.test(homeWxss) || /\.selected-shift\s*>\s*view\s*\{/.test(homeWxss)) {
  fail('首页班次圆点样式必须只作用于圆点，不得压缩班次文字容器');
}
if (!/\.rest-action\s*\{[^}]*min-width:\s*104rpx;[^}]*min-height:\s*104rpx;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(homeWxss)) {
  fail('首页“查看”按钮必须保留不小于 44px 的小屏点击区域');
}
if (!/\.member-edit-button\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(homeWxss)) {
  fail('团队成员编辑图标必须在按钮内水平、垂直居中');
}
if (!/\.color-grid\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*repeat\(4,/s.test(homeWxss)) {
  fail('成员颜色选择器必须使用四列对称网格');
}
if (!/\.manager-action-grid \.danger-outline\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;/s.test(homeWxss)) {
  fail('团队排班的清空操作必须独占整行，避免半行悬空');
}

const statisticsWxss = fs.readFileSync(path.join(root, 'pages/statistics/statistics.wxss'), 'utf8');
const statisticsJs = fs.readFileSync(path.join(root, 'pages/statistics/statistics.js'), 'utf8');
const statisticsWxml = fs.readFileSync(path.join(root, 'pages/statistics/statistics.wxml'), 'utf8');
if (/setData\s*\(\s*\{[^}]*\b(?:viewYear|viewMonth)\s*:/s.test(statisticsJs)) {
  fail('统计页内部日期游标不得通过 setData 触发无效渲染');
}
if (!statisticsWxml.includes('class="period-reset" wx:if="{{showPeriodReset}}"') || !statisticsJs.includes('showPeriodReset')) {
  fail('统计页仅在偏离本月或今年时显示返回当前周期按钮');
}
if (!/\.period-reset\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(statisticsWxss)) {
  fail('统计页“回本月 / 回今年”按钮必须水平、垂直居中');
}
if (!/\.segmented button\s*\{[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*justify-content:\s*center;/s.test(statisticsWxss)) {
  fail('统计页月 / 年切换文字必须水平、垂直居中');
}
if (!statisticsWxml.includes('style="background:{{item.background}}"') || statisticsWxml.includes('rgba(47,115,201,{{item.level}})')) {
  fail('团队每日密度必须跟随当前主题色');
}

const appWxss = fs.readFileSync(path.join(root, 'app.wxss'), 'utf8');
if (!/\.page-body\s*\{[^}]*padding:\s*28rpx\s+32rpx\s+200rpx;/s.test(appWxss)) {
  fail('页面底部必须为微信 tabBar 额外保留约 10px 的视觉缓冲');
}
if (!/\.modal-card\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*overflow:\s*hidden;/s.test(appWxss)
  || !/\.modal-scroll\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1\s+1\s+auto;/s.test(appWxss)) {
  fail('弹窗必须使用受视口约束的弹性滚动布局');
}

const customTabBarWxml = fs.readFileSync(path.join(root, 'custom-tab-bar/index.wxml'), 'utf8');
const customTabBarJs = fs.readFileSync(path.join(root, 'custom-tab-bar/index.js'), 'utf8');
const navigationJs = fs.readFileSync(path.join(root, 'utils/navigation.js'), 'utf8');
if (!customTabBarWxml.includes('wx:if="{{!hidden}}"') || !navigationJs.includes('setTabBarHidden')) {
  fail('自定义弹窗打开时必须能够隐藏微信底部 tabBar');
}
if (customTabBarJs.includes('page !== this.data.active') || !customTabBarJs.includes('getCurrentPages') || !customTabBarJs.includes('pendingTabUrl') || !customTabBarJs.includes('finishTabSwitch')) {
  fail('自定义 tabBar 必须按真实页面路由切换，并保留切换过程中的最后一次点击');
}

const privacyWxml = fs.readFileSync(path.join(root, 'components/privacy-dialog/index.wxml'), 'utf8');
if (!privacyWxml.includes('open-type="agreePrivacyAuthorization"') || !privacyWxml.includes('id="agree-btn"')) {
  fail('隐私授权组件必须使用微信官方 agreePrivacyAuthorization 按钮');
}
if (!privacyWxml.includes('class="privacy-scroll"') || !privacyWxml.includes('enhanced="{{true}}"')) {
  fail('隐私授权弹窗必须在小屏设备上完整滚动展示');
}

const runtimeFiles = files.filter((file) => {
  const relative = path.relative(root, file);
  return !relative.startsWith('tests/')
    && !['README.md', 'RELEASE_CHECKLIST.md', 'package.json', 'project.config.json', 'project.private.config.json'].includes(relative);
});
const runtimeBytes = runtimeFiles.reduce((sum, file) => sum + fs.statSync(file).size, 0);
const mediaBytes = runtimeFiles
  .filter((file) => /\.(?:png|jpe?g|gif|webp|svg|mp3|aac|wav|m4a|ogg)$/i.test(file))
  .reduce((sum, file) => sum + fs.statSync(file).size, 0);
if (mediaBytes > 200 * 1024) fail(`图片和音频资源超过 200 KB：${(mediaBytes / 1024).toFixed(1)} KB`);
if (runtimeBytes > 2 * 1024 * 1024) fail(`运行包源文件超过 2 MB：${(runtimeBytes / 1024 / 1024).toFixed(2)} MB`);

if (!process.exitCode) process.stdout.write(`✓ 项目静态校验通过（${files.length} 个文件，运行包源文件约 ${(runtimeBytes / 1024 / 1024).toFixed(2)} MB）\n`);
