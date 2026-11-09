/**
 * المنصة التعليمية — الخادم (Google Apps Script)
 * ثانوية أم حبيب — قسم الكيمياء والفيزياء
 *
 * التشغيل لأول مرة:
 *   1) setup            ← ينشئ «قاعدة بيانات المنصة التعليمية» في Drive ويسجّل صاحبة المشروع.
 *   2) testGemini        ← بعد إضافة GEMINI_API_KEY في «خصائص النص البرمجي».
 *   3) نشر ← تطبيق ويب (التنفيذ باسم: أنا · الوصول: أي شخص في moe.edu.kw).
 *   4) installTriggers   ← المزامنة اليومية وتقارير أولياء الأمور.
 */

/* ===================== الإعدادات ===================== */
var DB_NAME = 'قاعدة بيانات المنصة التعليمية';
var TZ = 'Asia/Kuwait';
var SHEETS = {
  Settings:    ['key', 'value'],
  Users:       ['email', 'name', 'roles', 'subjects', 'children', 'studentId'],
  Students:    ['id', 'name', 'cls', 'email', 'parentEmail', 'parent', 'abs', 'hw', 'goal', 'term', 'interests', 'digest'],
  Subjects:    ['id', 'name', 'teacher', 'teacherEmail', 'skills'],
  Upcoming:    ['cls', 'subj', 'title', 'when', 'date', 'skill', 'eventId'],
  Indicators:  ['sid', 'subj', 'skill', 'level', 'week', 'period', 'by', 'at'],
  Assessments: ['id', 'subj', 'cls', 'title', 'max', 'skill', 'week', 'status'],
  Grades:      ['aid', 'sid', 'v', 's', 'at'],
  Plans:       ['id', 'sid', 'subj', 'skill', 'title', 'why', 'min', 'day', 'time', 'kind', 'status', 'result', 'src', 'eventId', 'at'],
  Practice:    ['sid', 'subj', 'skill', 'game', 'score', 'total', 'items', 'mistakes', 'sec', 'at'],
  Audit:       ['t', 'who', 'what'],
  Requests:    ['sid', 'text', 't'],
  Reviews:     ['sid', 'data', 'at'],
  Alerts:      ['key', 'sid', 'subj', 'reason', 'at'],
  Quizzes:     ['formId', 'skill', 'url', 'edit', 'at'],
  Nominations: ['id', 'sid', 'role', 'by', 'domain', 'traits', 'note', 'status', 'at']
};
var SKILLS_CHEM = ['الأعداد الكمية', 'الترتيب الإلكتروني', 'مبدأ أوفباو', 'الجدول الدوري'];
var SUBJ_GC = { chem: '11', phys: '9', math: '5', bio: '2', arabic: '3', eng: '7', social: '6' };
var SUBJ_ICON = { chem: '🧪', phys: '🧲', math: '📐', bio: '🌿', arabic: '📖', eng: '🔤', social: '🌍' };

/* ===================== قاعدة البيانات ===================== */
function db_() {
  var id = PropertiesService.getScriptProperties().getProperty('DB_ID');
  if (!id) throw new Error('شغّلي setup أول مرة.');
  return SpreadsheetApp.openById(id);
}
function sheet_(name) {
  var ss = db_();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(SHEETS[name]); sh.setFrozenRows(1); }
  return sh;
}
function rows_(name) {
  var sh = sheet_(name), v = sh.getDataRange().getValues();
  var h = v.shift() || [];
  return v.filter(function (r) { return r.join('') !== ''; }).map(function (r, i) {
    var o = { _row: i + 2 };
    h.forEach(function (k, j) { o[k] = r[j]; });
    return o;
  });
}
function append_(name, obj) {
  var h = SHEETS[name];
  sheet_(name).appendRow(h.map(function (k) { return obj[k] == null ? '' : obj[k]; }));
}
function update_(name, row, obj) {
  var h = SHEETS[name], sh = sheet_(name);
  Object.keys(obj).forEach(function (k) {
    var c = h.indexOf(k);
    if (c >= 0) sh.getRange(row, c + 1).setValue(obj[k] == null ? '' : obj[k]);
  });
}
function json_(s, d) { try { return s ? JSON.parse(s) : d; } catch (e) { return d; } }
function settings_() {
  var o = {};
  rows_('Settings').forEach(function (r) { o[String(r.key).trim()] = r.value; });
  return o;
}
function now_() { return Utilities.formatDate(new Date(), TZ, 'dd/MM HH:mm'); }
function me_() { return (Session.getActiveUser().getEmail() || '').toLowerCase(); }
function lock_(fn) {
  var l = LockService.getScriptLock(); l.waitLock(20000);
  try { return fn(); } finally { l.releaseLock(); }
}

/* ===================== التهيئة ===================== */
function setup() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('DB_ID'), ss;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) { ss = SpreadsheetApp.create(DB_NAME); props.setProperty('DB_ID', ss.getId()); }
  Object.keys(SHEETS).forEach(function (n) {
    var sh = ss.getSheetByName(n);
    if (!sh) { sh = ss.insertSheet(n); sh.appendRow(SHEETS[n]); sh.setFrozenRows(1); sh.getRange(1, 1, 1, SHEETS[n].length).setFontWeight('bold'); }
  });
  var def = ss.getSheetByName('Sheet1') || ss.getSheetByName('ورقة1');
  if (def && ss.getSheets().length > 1) ss.deleteSheet(def);

  var email = Session.getEffectiveUser().getEmail().toLowerCase();
  if (!rows_('Users').some(function (u) { return String(u.email).toLowerCase() === email; })) {
    append_('Users', { email: email, name: 'أ. أفنان سامي', roles: 'teacher,admin,counselor', subjects: 'chem:10-6' });
  }
  if (!rows_('Subjects').length) {
    append_('Subjects', { id: 'chem', name: 'الكيمياء', teacher: 'أ. أفنان سامي', teacherEmail: email, skills: SKILLS_CHEM.join('|') });
    append_('Subjects', { id: 'phys', name: 'الفيزياء', teacher: 'معلمة الفيزياء', teacherEmail: '', skills: 'تحويل الوحدات|الحركة في خط مستقيم|المتجهات' });
  }
  if (!rows_('Settings').length) {
    [['appName', 'المنصة التعليمية'],
     ['school', 'ثانوية أم حبيب — قسم الكيمياء والفيزياء'],
     ['week', 6],
     ['chemHelper', 'https://notebook.google.com/notebook/b3dd47a5-818a-4102-b794-5bc359812ef3'],
     ['lessons', 'https://sites.google.com/view/hayy-chemistry'],
     ['booking', ''],
     ['chatWebhook', ''],
     ['geminiModel', 'gemini-flash-lite-latest'],
     ['audio:الأعداد الكمية', ''], ['audio:مبدأ أوفباو', ''], ['audio:الترتيب الإلكتروني', ''], ['audio:الجدول الدوري', '']
    ].forEach(function (r) { append_('Settings', { key: r[0], value: r[1] }); });
  }
  Logger.log('✅ جاهز: ' + ss.getUrl());
  return ss.getUrl();
}

/* ===================== الصفحة ===================== */
function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle(String(settings_().appName || 'المنصة التعليمية'))
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getBootstrap() {
  var set = settings_();
  var audio = {};
  Object.keys(set).forEach(function (k) { if (k.indexOf('audio:') === 0 && set[k]) audio[k.slice(6)] = set[k]; });
  var config = {
    appName: set.appName || 'المنصة التعليمية', school: set.school || '',
    links: { audio: audio, chemHelper: set.chemHelper || '', lessons: set.lessons || '', booking: set.booking || '' }
  };
  var gemini = !!PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  var email = me_();
  var user = rows_('Users').filter(function (u) { return String(u.email).toLowerCase() === email; })[0];
  if (!email || !user) return { mode: 'demo', config: config, gemini: gemini };
  return { mode: 'live', config: config, gemini: gemini, state: buildState_(user, set) };
}

function buildState_(user, set) {
  var roleMap = { head: 'admin', principal: 'admin' };
  var roles = String(user.roles || '').split(',').map(function (r) { r = r.trim(); return roleMap[r] || r; })
    .filter(function (r, i, a) { return r && a.indexOf(r) === i; });
  var order = ['teacher', 'student', 'parent', 'admin', 'counselor'];
  roles.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
  if (!roles.length) roles = ['student'];
  var staff = roles.some(function (r) { return ['teacher', 'admin', 'counselor'].indexOf(r) >= 0; });
  var self = String(user.studentId || '');
  var children = String(user.children || '').split(',').map(function (s) { return s.trim(); }).filter(String);
  var allowed = staff ? null : [self].concat(children).filter(String);
  var ok = function (sid) { return !allowed || allowed.indexOf(String(sid)) >= 0; };

  var subjects = {};
  var mine = String(user.subjects || '').split(',').map(function (x) { return x.split(':')[0].trim(); }).filter(String);
  rows_('Subjects').sort(function (a, b) {
    var ia = mine.indexOf(a.id), ib = mine.indexOf(b.id);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  }).forEach(function (s) {
    subjects[s.id] = { name: s.name, teacher: s.teacher, skills: String(s.skills || '').split('|').filter(String) };
  });
  var students = rows_('Students').filter(function (s) { return ok(s.id); }).map(function (s) {
    return { id: String(s.id), name: s.name, cls: String(s.cls), parent: s.parent || '', abs: Number(s.abs) || 0, hw: Number(s.hw) || 0,
      goal: s.goal || '', term: json_(s.term, {}), interests: json_(s.interests, null), digest: s.digest || 'weekly' };
  });
  var clsSet = {}; students.forEach(function (s) { clsSet[s.cls] = 1; });
  var grades = {};
  rows_('Grades').forEach(function (g) {
    if (!ok(g.sid)) return;
    (grades[g.aid] = grades[g.aid] || {})[String(g.sid)] = { v: g.v === '' ? null : Number(g.v), s: g.s || 'ok' };
  });
  var plans = rows_('Plans').filter(function (p) { return ok(p.sid); }).map(function (p) {
    return { id: String(p.id), sid: String(p.sid), subj: p.subj, skill: p.skill || undefined, title: p.title, why: p.why, min: Number(p.min) || 15,
      day: Number(p.day), time: String(p.time || '17:00'), kind: p.kind || 'study', status: p.status || 'todo',
      result: p.result === '' ? null : Number(p.result), src: p.src || '' };
  });
  var supports = {};
  plans.forEach(function (p) {
    if (p.src.indexOf('خطة دعم') === 0) supports[p.sid + '|' + (p.skill || '')] = { sid: p.sid, subj: p.subj, skill: p.skill, week: Number(set.week) || 1, status: 'جارية' };
  });
  var reviews = {};
  rows_('Reviews').forEach(function (r) { if (ok(r.sid)) reviews[r.sid] = json_(r.data, {}); });

  return {
    week: Number(set.week) || 1,
    me: { name: user.name || '', roles: roles, self: self },
    subjects: subjects,
    classes: Object.keys(clsSet).map(function (c) { return { id: c, name: c.replace('-', '/') }; }),
    students: students,
    indicators: rows_('Indicators').filter(function (i) { return ok(i.sid); }).map(function (i) {
      return { sid: String(i.sid), subj: i.subj, skill: i.skill, level: i.level, week: Number(i.week), period: Number(i.period), by: i.by };
    }),
    assessments: rows_('Assessments').filter(function (a) { return staff || a.status === 'published'; }).map(function (a) {
      return { id: String(a.id), subj: a.subj, cls: String(a.cls), title: a.title, max: Number(a.max) || 10, skill: a.skill, week: Number(a.week), status: a.status || 'draft', grades: grades[a.id] || {} };
    }),
    plans: plans,
    supports: Object.keys(supports).map(function (k) { return supports[k]; }),
    practice: rows_('Practice').filter(function (p) { return ok(p.sid); }).map(function (p) {
      return { sid: String(p.sid), subj: p.subj, skill: p.skill, game: p.game, score: Number(p.score), total: Number(p.total),
        items: json_(p.items, []), mistakes: json_(p.mistakes, []), sec: Number(p.sec) || 0, at: p.at instanceof Date ? p.at.toISOString() : String(p.at) };
    }),
    audit: staff ? rows_('Audit').slice(-60).reverse().map(function (a) { return { t: a.t, who: a.who, what: a.what }; }) : [],
    requests: staff ? rows_('Requests').slice(-30).reverse().map(function (r) { return { sid: String(r.sid), text: r.text, t: r.t }; }) : [],
    reviews: reviews,
    nominations: rows_('Nominations').filter(function (n) { return ok(n.sid); }).map(function (n) {
      return { id: String(n.id), sid: String(n.sid), role: n.role, by: n.by, domain: n.domain, traits: json_(n.traits, []), note: n.note || '', status: n.status || 'new',
        at: n.at instanceof Date ? n.at.toISOString() : String(n.at) };
    }),
    chats: {},
    sentAlerts: {},
    upcoming: rows_('Upcoming').filter(function (u) { return staff || !u.cls || clsSet[String(u.cls)]; }).map(function (u) {
      var d = u.date instanceof Date ? Utilities.formatDate(u.date, TZ, 'yyyy-MM-dd') : String(u.date || '');
      return { subj: u.subj, title: u.title, when: u.when || '', date: d, skill: u.skill || undefined };
    })
  };
}

/* ===================== الحفظ ===================== */
function who_() {
  var e = me_();
  var u = rows_('Users').filter(function (x) { return String(x.email).toLowerCase() === e; })[0];
  if (!u) throw new Error('الحساب غير مسجّل في المنصة.');
  return u;
}
function audit_(who, what) { append_('Audit', { t: now_(), who: who, what: what }); }

function saveIndicator(rec) {
  var u = who_();
  return lock_(function () {
    rows_('Indicators').filter(function (i) {
      return String(i.sid) === String(rec.sid) && i.subj === rec.subj && i.skill === rec.skill && Number(i.week) === Number(rec.week) && Number(i.period) === Number(rec.period);
    }).reverse().forEach(function (i) { sheet_('Indicators').deleteRow(i._row); });
    append_('Indicators', { sid: rec.sid, subj: rec.subj, skill: rec.skill, level: rec.level, week: rec.week, period: rec.period, by: rec.by || u.name, at: new Date() });
    return true;
  });
}

function saveGrade(g) {
  var u = who_();
  return lock_(function () {
    var ex = rows_('Grades').filter(function (r) { return String(r.aid) === String(g.aid) && String(r.sid) === String(g.sid); })[0];
    var row = { aid: g.aid, sid: g.sid, v: g.v == null ? '' : g.v, s: g.s, at: new Date() };
    if (ex) update_('Grades', ex._row, row); else append_('Grades', row);
    var a = rows_('Assessments').filter(function (x) { return String(x.id) === String(g.aid); })[0];
    if (a && a.status !== 'draft') { update_('Assessments', a._row, { status: 'draft' }); audit_(u.name, 'رجعت «' + a.title + '» مسودة بسبب تعديل درجة'); }
    audit_(u.name, 'درجة ' + g.sid + ' في ' + (a ? a.title : g.aid) + ': ' + (g.s === 'ok' ? g.v : g.s));
    return true;
  });
}

function setAssessmentStatus(aid, status) {
  var u = who_();
  var a = rows_('Assessments').filter(function (x) { return String(x.id) === String(aid); })[0];
  if (!a) return false;
  update_('Assessments', a._row, { status: status });
  audit_(u.name, '«' + a.title + '» صارت ' + ({ draft: 'مسودة', approved: 'معتمدة', published: 'منشورة' }[status] || status));
  return true;
}

function createAssessment(a) {
  var u = who_();
  append_('Assessments', { id: a.id, subj: a.subj, cls: a.cls, title: a.title, max: a.max, skill: a.skill, week: a.week, status: 'draft' });
  audit_(u.name, 'أنشأت تقييم «' + a.title + '» كمسودة');
  return true;
}

function addTask(t) {
  who_();
  var st = rows_('Students').filter(function (s) { return String(s.id) === String(t.sid); })[0];
  var eventId = '';
  if (st && st.email) eventId = taskEvent_(t, st.email);
  append_('Plans', { id: t.id, sid: t.sid, subj: t.subj, skill: t.skill || '', title: t.title, why: t.why, min: t.min, day: t.day, time: t.time,
    kind: t.kind || 'study', status: t.status || 'todo', result: t.result == null ? '' : t.result, src: t.src || '', eventId: eventId, at: new Date() });
  return true;
}

function updateTask(p) {
  who_();
  var t = rows_('Plans').filter(function (x) { return String(x.id) === String(p.id); })[0];
  if (!t) return false;
  update_('Plans', t._row, { status: p.status, result: p.result == null ? '' : p.result });
  return true;
}

function savePractice(rec) {
  who_();
  return lock_(function () {
    append_('Practice', { sid: rec.sid, subj: rec.subj, skill: rec.skill, game: rec.game, score: rec.score, total: rec.total,
      items: JSON.stringify(rec.items || []), mistakes: JSON.stringify(rec.mistakes || []), sec: rec.sec || 0, at: rec.at || new Date().toISOString() });
    var lvl = rec.score >= 4 ? 'm' : rec.score >= 3 ? 'p' : 'h';
    append_('Indicators', { sid: rec.sid, subj: rec.subj, skill: rec.skill, level: lvl, week: Number(settings_().week) || 1, period: 4,
      by: rec.game === 'تقييم ذاتي' ? 'تدريب الكوتش' : 'لعبة التدريب', at: new Date() });
    return true;
  });
}

function helpRequest(sid) {
  var u = who_();
  append_('Requests', { sid: sid, text: 'طلبت مساعدة من صفحة خطتها', t: now_() });
  var st = rows_('Students').filter(function (s) { return String(s.id) === String(sid); })[0];
  var to = rows_('Users').filter(function (x) { return /teacher|counselor/.test(String(x.roles)); }).map(function (x) { return x.email; }).filter(String);
  if (to.length) safeMail_(to.join(','), '✋ طلب مساعدة — ' + (st ? st.name : sid), (st ? st.name : sid) + ' ضغطت «أحتاج مساعدة» من صفحة خطتها (' + now_() + ').');
  postChat_('✋ ' + (st ? st.name : sid) + ' طلبت مساعدة من المنصة.');
  return true;
}

function saveReview(sid, data) {
  who_();
  var ex = rows_('Reviews').filter(function (r) { return String(r.sid) === String(sid); })[0];
  var row = { sid: sid, data: JSON.stringify(data || {}), at: new Date() };
  if (ex) update_('Reviews', ex._row, row); else append_('Reviews', row);
  return true;
}

function saveNomination(n) {
  var u = who_();
  var roles = String(u.roles);
  var staff = /teacher|admin|counselor|head|principal/.test(roles);
  var kids = String(u.children || '').split(',').map(function (x) { return x.trim(); });
  if (!staff && kids.indexOf(String(n.sid)) < 0) throw new Error('غير مسموح.');
  if (n.status === 'referred' && !/counselor|admin/.test(roles)) throw new Error('التحويل للمرشدة فقط.');
  var st = rows_('Students').filter(function (s) { return String(s.id) === String(n.sid); })[0];
  append_('Nominations', { id: n.id, sid: n.sid, role: n.role === 'parent' ? (/parent/.test(roles) || !staff ? 'parent' : 'teacher') : (staff ? n.role : 'parent'), by: u.name || n.by, domain: n.domain,
    traits: JSON.stringify(n.traits || []), note: String(n.note || '').slice(0, 500), status: n.status === 'referred' ? 'referred' : 'new', at: new Date() });
  audit_(u.name, (n.status === 'referred' ? 'حوّلت للفحص: ' : 'ترشيح موهبة: ') + (st ? st.name : n.sid));
  var to = rows_('Users').filter(function (x) { return /counselor/.test(String(x.roles)); }).map(function (x) { return x.email; }).filter(String);
  if (n.status !== 'referred' && to.length) safeMail_(to.join(','), '🌟 ترشيح موهبة — ' + (st ? st.name : n.sid), (u.name || '') + ' رشّح ' + (st ? st.name : n.sid) + ' بمجال: ' + n.domain + '\n' + (n.note || ''));
  if (n.status === 'referred' && st && st.parentEmail) safeMail_(st.parentEmail, '🌟 ' + st.name + ' — ترشيح لفحص الموهبة',
    'السلام عليكم،\nعند ' + st.name + ' مؤشرات تميّز لاحظناها خلال السنة، ورشّحتها المرشدة للفحص الرسمي للموهبة. بنتواصل معكم بالخطوات والموعد.\nمع التحية — ' + (settings_().appName || 'المنصة التعليمية'));
  return true;
}

function saveInterests(sid, r) {
  var u = who_();
  var staff = /teacher|admin|counselor|head|principal/.test(String(u.roles));
  if (!staff && String(u.studentId) !== String(sid)) throw new Error('غير مسموح.');
  var st = rows_('Students').filter(function (s) { return String(s.id) === String(sid); })[0];
  if (!st) return false;
  var clean = {};
  ['research', 'practical', 'creative', 'social', 'leading', 'organizing'].forEach(function (k) { clean[k] = Math.max(1, Math.min(5, Math.round(Number(r && r[k]) || 1))); });
  update_('Students', st._row, { interests: JSON.stringify(clean) });
  audit_(u.name, 'نتيجة اختبار الميول: ' + (st.name || sid));
  return true;
}

function setDigest(sid, mode) {
  who_();
  var st = rows_('Students').filter(function (s) { return String(s.id) === String(sid); })[0];
  if (st) update_('Students', st._row, { digest: mode === 'daily' ? 'daily' : 'weekly' });
  return true;
}

/* ===================== التنبيهات ===================== */
function notifyAlert(a) {
  who_();
  return lock_(function () {
    if (rows_('Alerts').some(function (x) { return x.key === a.key; })) return false;
    append_('Alerts', { key: a.key, sid: a.sid, subj: a.subj || '', reason: a.reason, at: new Date() });
    var st = rows_('Students').filter(function (s) { return String(s.id) === String(a.sid); })[0];
    var subj = rows_('Subjects').filter(function (s) { return s.id === a.subj; })[0];
    var to = subj && subj.teacherEmail ? subj.teacherEmail : Session.getEffectiveUser().getEmail();
    var body = 'الطالبة: ' + (st ? st.name : a.sid) + '\nالسبب: ' + a.reason + '\n\nالدليل:\n- ' + (a.ev || []).join('\n- ') +
      '\n\nالإجراء المقترح: ' + a.action + '\nالمسؤولة: ' + a.owner + '\nالمراجعة: ' + a.review;
    safeMail_(to, '🔔 تحتاج متابعة — ' + (st ? st.name : a.sid), body);
    postChat_('🔔 تحتاج متابعة: ' + (st ? st.name : a.sid) + ' — ' + a.reason);
    return true;
  });
}
function safeMail_(to, subject, body) {
  try { if (to) MailApp.sendEmail({ to: to, subject: subject, body: body, name: String(settings_().appName || 'المنصة التعليمية') }); }
  catch (e) { console.warn('mail', e); }
}
function postChat_(text) {
  var url = settings_().chatWebhook;
  if (!url) return;
  try { UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json; charset=UTF-8', payload: JSON.stringify({ text: text }), muteHttpExceptions: true }); }
  catch (e) { console.warn('chat', e); }
}

/* ===================== Gemini ===================== */
function gemini_(prompt, asJson) {
  var key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) return { ok: false, error: 'no key' };
  var model = String(settings_().geminiModel || 'gemini-flash-lite-latest');
  var body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.6, maxOutputTokens: 800 } };
  if (asJson) body.generationConfig.responseMimeType = 'application/json';
  var res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
    method: 'post', contentType: 'application/json', headers: { 'x-goog-api-key': key }, payload: JSON.stringify(body), muteHttpExceptions: true
  });
  if (res.getResponseCode() !== 200) return { ok: false, error: res.getContentText().slice(0, 300) };
  var d = JSON.parse(res.getContentText());
  var text = (((d.candidates || [])[0] || {}).content || {}).parts;
  text = text ? text.filter(function (p) { return !p.thought; }).map(function (p) { return p.text || ''; }).join('') : '';
  return text ? { ok: true, text: text.trim() } : { ok: false, error: 'empty' };
}

var STYLE = 'اكتب بالعربية بلهجة كويتية خفيفة ومهذبة، باختصار، بدون مبالغة، ولا تخترع بيانات غير موجودة.';
function askGemini(kind, p) {
  who_();
  p = p || {};
  var prompt;
  if (kind === 'plan') {
    prompt = 'أنت مساعد معلمة كيمياء للصف العاشر في الكويت. طالبة متعثرة في مهارة «' + p.skill + '» (' + (p.subject || '') + ').\n' +
      'السبب: ' + p.reason + '\nالدليل: ' + (p.evidence || []).join('؛ ') + '\n' +
      'اقترح خطة دعم من 3 مهام قصيرة فقط. أعد JSON فقط: مصفوفة عناصر {"title","min","why","kind"} حيث kind واحد من study أو practice أو ask، ' +
      'المهمة الثانية kind=practice، والثالثة kind=ask (سؤال المعلمة أو Afnan I). why جملة وحدة. ' + STYLE;
    return gemini_(prompt, true);
  }
  if (kind === 'parent') {
    prompt = 'اكتب ملخصًا أسبوعيًا لولي أمر طالبة في 3 جمل: أنجزت ' + p.done + ' مهام' + (p.need ? '، وتحتاج دعمًا في «' + p.need + '»' : '') +
      (p.practice ? '، وآخر نتيجة تدريب ' + p.practice : '') + '. اختم باقتراح عملي واحد للبيت. ' + STYLE;
    return gemini_(prompt);
  }
  if (kind === 'admin') {
    prompt = 'أنت محلل بيانات لإدارة مدرسة. السؤال: «' + (p.q || 'ملخص') + '».\nأكثر مهارة تعثّر: ' + p.topSkill + ' (' + p.topCount + ' ملاحظات)، ' +
      'وعدد الطالبات اللي عندهن تنبيه: ' + p.alertCount + '.\nتفاصيل المهارات: ' + JSON.stringify(p.skills || []) +
      '\nأجب في 3 جمل كحد أقصى، واقترح إجراءً واحدًا. ' + STYLE;
    return gemini_(prompt);
  }
  if (kind === 'coach') {
    prompt = 'أنت «الكوتش»: تنظّم وقت طالبة في الصف العاشر ودراستها وجدولها فقط. لا تشرح المادة؛ إذا سألت عن شرح، حوّلها لـ Afnan I أو المعلمة.\n' +
      'وضعها: ' + p.summary + '. أقوى شي عندها: ' + p.strong + '. القادم: ' + p.next + '.\n' +
      'آخر المحادثة: ' + JSON.stringify(p.history || []) + '\nسؤالها: «' + p.q + '»\nرد بجملتين أو ثلاث، بخطوة عملية واحدة. خاطبها بصيغة المؤنث. ' + STYLE;
    return gemini_(prompt);
  }
  if (kind === 'talent') {
    prompt = (p.who === 'student' ? 'اكتب لطالبة في الصف العاشر' : 'اكتب لولي أمر طالبة في الصف العاشر') +
      ' خطة شهر قصيرة (4 أسابيع، سطر لكل أسبوع) لتنمية تميّزها في: ' + (p.domains || []).join(' و') + '.\nالمؤشرات: ' + (p.evidence || []).join('؛ ') +
      '\nأنشطة عملية متاحة بالمدرسة أو البيت بالكويت. لا تقل إنها «موهوبة» ولا تعد بنتيجة؛ قل «مؤشرات تميّز». ' + (p.who === 'student' ? 'خاطبها بصيغة المؤنث. ' : '') + STYLE;
    return gemini_(prompt);
  }
  if (kind === 'counsel') {
    prompt = 'أنت مساعد مرشدة طلابية. ميول الطالبة البارزة: ' + p.top + '. أداؤها الأقوى في: ' + p.strong + '.\n' +
      'اكتب فقرة قصيرة (3 جمل) تلخص ما يشير له ذلك، وذكّر إن القرار يكون بعد نقاش مع الطالبة وولي الأمر. لا تحدد مسارًا نهائيًا. ' + STYLE;
    return gemini_(prompt);
  }
  return { ok: false, error: 'unknown kind' };
}

function testGemini() {
  var r = gemini_('قل «هلا، Gemini شغّال ✅» فقط.');
  Logger.log(r.ok ? r.text : ('❌ ' + r.error));
  return r;
}

/* ===================== Calendar ===================== */
function nextDay_(dow, time) {
  var d = new Date(); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7));
  var hm = String(time || '17:00').split(':'); d.setHours(Number(hm[0]) || 17, Number(hm[1]) || 0, 0, 0);
  if (d < new Date()) d.setDate(d.getDate() + 7);
  return d;
}
function taskEvent_(t, guest) {
  try {
    var s = nextDay_(Number(t.day), t.time), e = new Date(s.getTime() + (Number(t.min) || 15) * 60000);
    var ev = CalendarApp.getDefaultCalendar().createEvent((SUBJ_ICON[t.subj] || '') + ' ' + t.title, s, e,
      { description: t.why + '\n— من خطة الكوتش في ' + (settings_().appName || 'المنصة التعليمية'), guests: guest, sendInvites: true });
    if (SUBJ_GC[t.subj]) ev.setColor(SUBJ_GC[t.subj]);
    ev.addPopupReminder(15);
    return ev.getId();
  } catch (e) { console.warn('calendar', e); return ''; }
}

function syncClassCalendar() {
  var url = ScriptApp.getService().getUrl() || '';
  var stu = rows_('Students'), made = 0, cal = CalendarApp.getDefaultCalendar();
  rows_('Upcoming').forEach(function (u) {
    if (u.eventId || !u.date) return;
    var d = u.date instanceof Date ? u.date : new Date(u.date);
    if (isNaN(d) || d < new Date(new Date().toDateString())) return;
    var guests = stu.filter(function (s) { return s.email && (!u.cls || String(s.cls) === String(u.cls)); }).map(function (s) { return s.email; }).join(',');
    var ev = cal.createAllDayEvent((SUBJ_ICON[u.subj] || '📌') + ' ' + u.title, d, { guests: guests, sendInvites: !!guests });
    if (SUBJ_GC[u.subj]) ev.setColor(SUBJ_GC[u.subj]);
    var ids = [ev.getId()];
    if (u.skill) {
      var r = new Date(d); r.setDate(r.getDate() - 2); r.setHours(17, 0, 0, 0);
      if (r > new Date()) {
        var rv = cal.createEvent('🫧 مراجعة سريعة قبل ' + u.title, r, new Date(r.getTime() + 10 * 60000),
          { description: 'لعبة قصيرة وتصيرين جاهزة: ' + url + '?play=' + encodeURIComponent(u.skill), guests: guests, sendInvites: !!guests });
        if (SUBJ_GC[u.subj]) rv.setColor(SUBJ_GC[u.subj]);
        ids.push(rv.getId());
      }
    }
    update_('Upcoming', u._row, { eventId: ids.join(' ') });
    made += ids.length;
  });
  return { events: made };
}

/* ===================== Google Forms ===================== */
function createQuiz(skill, items) {
  var u = who_();
  var form = FormApp.create('اختبار قصير — ' + skill);
  form.setIsQuiz(true).setCollectEmail(true).setLimitOneResponsePerUser(true).setShuffleQuestions(true)
    .setDescription('اختبار يصحح نفسه، والنتيجة توصل للمعلمة تلقائيًا في ' + (settings_().appName || 'المنصة التعليمية') + '.');
  (items || []).forEach(function (it) {
    var q = form.addMultipleChoiceItem().setTitle(it.q).setPoints(1).setRequired(true);
    q.setChoices(it.choices.map(function (c) { return q.createChoice(c, c === it.correct); }));
  });
  ScriptApp.newTrigger('onQuizSubmit').forForm(form).onFormSubmit().create();
  var out = { url: form.getPublishedUrl(), edit: form.getEditUrl() };
  append_('Quizzes', { formId: form.getId(), skill: skill, url: out.url, edit: out.edit, at: new Date() });
  audit_(u.name, 'أنشأت اختبار Google Forms لـ «' + skill + '»');
  return out;
}

function onQuizSubmit(e) {
  var form = e.source, resp = e.response;
  var q = rows_('Quizzes').filter(function (x) { return x.formId === form.getId(); })[0];
  if (!q) return;
  var email = String(resp.getRespondentEmail() || '').toLowerCase();
  var st = rows_('Students').filter(function (s) { return String(s.email).toLowerCase() === email; })[0];
  if (!st) return;
  var got = 0, total = 0, items = [];
  resp.getGradableItemResponses().forEach(function (r) {
    var ok = r.getScore() > 0; total++; if (ok) got++;
    items.push({ k: r.getItem().getTitle().slice(0, 40), ok: ok });
  });
  var score5 = total ? Math.round(got / total * 5) : 0;
  append_('Practice', { sid: st.id, subj: 'chem', skill: q.skill, game: 'اختبار Google Forms', score: score5, total: 5,
    items: JSON.stringify(items), mistakes: '[]', sec: 0, at: new Date().toISOString() });
  append_('Indicators', { sid: st.id, subj: 'chem', skill: q.skill, level: score5 >= 4 ? 'm' : score5 >= 3 ? 'p' : 'h',
    week: Number(settings_().week) || 1, period: 4, by: 'Google Forms', at: new Date() });
}

/* ===================== Classroom ===================== */
function syncClassroom() {
  if (typeof Classroom === 'undefined') throw new Error('فعّلي خدمة Google Classroom API من «الخدمات» في Apps Script.');
  var courses = (Classroom.Courses.list({ teacherId: 'me', courseStates: ['ACTIVE'] }).courses) || [];
  var stu = rows_('Students'), plans = rows_('Plans'), nS = 0, nW = 0;
  courses.forEach(function (c) {
    var cls = c.section || c.name;
    var list = (Classroom.Courses.Students.list(c.id).students) || [];
    list.forEach(function (s) {
      var id = 'g' + s.userId;
      var mail = (s.profile.emailAddress || '').toLowerCase();
      if (!stu.some(function (x) { return String(x.id) === id || (mail && String(x.email).toLowerCase() === mail); })) {
        append_('Students', { id: id, name: s.profile.name.fullName, cls: cls, email: mail, digest: 'weekly' });
        stu.push({ id: id, email: mail, cls: cls }); nS++;
      }
    });
    var work = (Classroom.Courses.CourseWork.list(c.id).courseWork) || [];
    work.forEach(function (w) {
      if (!w.dueDate) return;
      var due = new Date(w.dueDate.year, w.dueDate.month - 1, w.dueDate.day);
      if (due < new Date(new Date().toDateString())) return;
      stu.filter(function (s) { return String(s.cls) === String(cls); }).forEach(function (s) {
        var id = 'cw' + w.id + '-' + s.id;
        if (plans.some(function (p) { return String(p.id) === id; })) return;
        var t = { id: id, sid: s.id, subj: 'chem', title: '📚 ' + w.title, why: 'واجب Classroom — التسليم ' + Utilities.formatDate(due, TZ, 'dd/MM'),
          min: 30, day: (due.getDay() + 6) % 7, time: '17:00', kind: 'study', status: 'todo', result: null, src: 'Google Classroom' };
        addTaskRow_(t, s.email); plans.push({ id: id }); nW++;
      });
    });
  });
  return { students: nS, work: nW };
}
function addTaskRow_(t, guest) {
  var eventId = guest ? taskEvent_(t, guest) : '';
  append_('Plans', { id: t.id, sid: t.sid, subj: t.subj, skill: t.skill || '', title: t.title, why: t.why, min: t.min, day: t.day, time: t.time,
    kind: t.kind, status: 'todo', result: '', src: t.src, eventId: eventId, at: new Date() });
}

/* ===================== تقارير أولياء الأمور ===================== */
function parentSummary_(st) {
  var plans = rows_('Plans').filter(function (p) { return String(p.sid) === String(st.id); });
  var done = plans.filter(function (p) { return p.status === 'done'; }).length;
  var prac = rows_('Practice').filter(function (p) { return String(p.sid) === String(st.id); });
  var weekAgo = Date.now() - 7 * 864e5;
  var recent = prac.filter(function (p) { return new Date(p.at).getTime() > weekAgo; });
  var mins = Math.round(recent.reduce(function (a, p) { return a + (Number(p.sec) || 0); }, 0) / 60);
  var days = {}; recent.forEach(function (p) { days[Utilities.formatDate(new Date(p.at), TZ, 'EEEE')] = 1; });
  var mist = {}; recent.forEach(function (p) { json_(p.mistakes, []).forEach(function (m) { mist[m] = (mist[m] || 0) + 1; }); });
  var top = Object.keys(mist).sort(function (a, b) { return mist[b] - mist[a]; }).slice(0, 2);
  var last = prac[prac.length - 1];
  var ind = rows_('Indicators').filter(function (i) { return String(i.sid) === String(st.id) && (i.level === 'p' || i.level === 'h'); });
  var need = ind.length ? ind[ind.length - 1].skill : '';
  var g = gemini_('اكتب ملخصًا أسبوعيًا لولي أمر طالبة في 3 جمل: أنجزت ' + done + ' مهام' + (need ? '، وتحتاج دعمًا في «' + need + '»' : '') +
    (last ? '، وآخر نتيجة تدريب ' + last.score + ' من ' + last.total : '') + '. اختم باقتراح عملي واحد للبيت. ' + STYLE);
  var text = g.ok ? g.text : ('أنجزت ابنتكم ' + done + ' مهام من خطتها.' + (need ? ' ما زالت تحتاج دعمًا في «' + need + '».' : ' أداؤها مستقر.'));
  return text + '\n\n📍 وين وصلت: ' + (last ? last.skill + ' (' + last.game + ')' : 'ما بدأت التدريب بعد') +
    '\n🔁 الأخطاء المتكررة: ' + (top.length ? top.join('، ') : 'لا يوجد') +
    '\n⏱ وقت التدريب هالأسبوع: ' + mins + ' دقيقة' + (Object.keys(days).length ? ' (' + Object.keys(days).join('، ') + ')' : '');
}
function sendParentSummary(sid, text) {
  var u = who_();
  var st = rows_('Students').filter(function (s) { return String(s.id) === String(sid); })[0];
  if (!st) return false;
  var to = st.parentEmail || u.email;
  safeMail_(to, '📬 ملخص ' + st.name + ' — ' + (settings_().appName || 'المنصة التعليمية'), text || parentSummary_(st));
  return true;
}
function sendDigests() {
  var thursday = Number(Utilities.formatDate(new Date(), TZ, 'u')) === 4;
  rows_('Students').forEach(function (st) {
    if (!st.parentEmail) return;
    if (st.digest === 'daily' || thursday) safeMail_(st.parentEmail, '📬 ملخص ' + st.name + ' — ' + (settings_().appName || 'المنصة التعليمية'), parentSummary_(st));
  });
}
function dailySync() {
  try { syncClassroom(); } catch (e) { console.warn('classroom', e); }
  try { syncClassCalendar(); } catch (e) { console.warn('calendar', e); }
}

/* ===================== المؤقتات ===================== */
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (['sendDigests', 'dailySync'].indexOf(t.getHandlerFunction()) >= 0) ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('dailySync').timeBased().everyDays(1).atHour(6).inTimezone(TZ).create();
  ScriptApp.newTrigger('sendDigests').timeBased().everyDays(1).atHour(19).inTimezone(TZ).create();
  Logger.log('✅ المزامنة 6 الصبح، والتقارير 7 المسا (اليومية كل يوم، والأسبوعية الخميس).');
}

/* ===================== بيانات تجريبية (للعرض والفيديو) =====================
 * seedDemo  ← يضيف شعبة تجريبية (رموزها تبدأ بـ d) بدون أي إيميلات، فما ينرسل شي لأحد.
 * clearDemo ← يمسح كل الصفوف التجريبية ويرجّع الحساب معلمة فقط.
 */
function seedDemo() {
  clearDemo();
  var names = ['سارة', 'نورة', 'دانة', 'ريم', 'هيا', 'لطيفة', 'مها', 'جود'];
  var meta = [
    { abs: 1, hw: 0, goal: 'أرفع درجة الكيمياء', term: { chem: 74, phys: 88, math: 85, bio: 90, arabic: 82, eng: 86, social: 80 }, interests: { research: 5, social: 4, practical: 3, creative: 2, leading: 3, organizing: 3 } },
    { abs: 0, hw: 0, goal: 'أشارك في أولمبياد الكيمياء', term: { chem: 98, phys: 97, math: 96, bio: 95, arabic: 90, eng: 94, social: 88 }, interests: { research: 5, practical: 4, creative: 2, social: 3, leading: 3, organizing: 2 } },
    { abs: 0, hw: 0, goal: 'أكتشف مجال التصميم', term: { chem: 92, phys: 94, math: 96, bio: 85, arabic: 78, eng: 84, social: 76 }, interests: { creative: 5, social: 4, research: 2, practical: 3, leading: 2, organizing: 2 } },
    { abs: 2, hw: 1, goal: '', term: { chem: 68, phys: 72 }, interests: null },
    { abs: 0, hw: 2, goal: '', term: { chem: 75, phys: 66, math: 70, bio: 78, arabic: 85, eng: 80, social: 84 }, interests: { social: 5, leading: 4, organizing: 3, creative: 3, research: 2, practical: 2 } },
    { abs: 4, hw: 1, goal: '', term: { chem: 70, phys: 74, math: 72, bio: 76, arabic: 88, eng: 79, social: 90 }, interests: { social: 4, creative: 4, organizing: 3, research: 2, practical: 2, leading: 3 } },
    { abs: 0, hw: 0, goal: '', term: { chem: 84, phys: 82, math: 80, bio: 86, arabic: 83, eng: 88, social: 82 }, interests: { organizing: 5, leading: 4, research: 3, social: 3, practical: 2, creative: 2 } },
    { abs: 1, hw: 0, goal: '', term: { chem: 78, phys: 80, math: 83, bio: 79, arabic: 81, eng: 77, social: 80 }, interests: { practical: 5, research: 4, creative: 3, organizing: 2, social: 2, leading: 2 } }
  ];
  var sh = sheet_('Students'), rows = [];
  names.forEach(function (n, i) {
    var m = meta[i];
    rows.push(['d' + (i + 1), n, '10-6', '', '', 'ولي أمر ' + n, m.abs, m.hw, m.goal, JSON.stringify(m.term), m.interests ? JSON.stringify(m.interests) : '', 'weekly']);
  });
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);

  var ind = [], add = function (sid, subj, skill, levels, w0) {
    levels.forEach(function (l, i) { ind.push([sid, subj, skill, l, w0 + Math.floor(i / 2), (i % 2) ? 3 : 1, subj === 'chem' ? 'أ. أفنان سامي' : 'معلمة الفيزياء', new Date()]); });
  };
  add('d1', 'chem', 'الأعداد الكمية', ['m', 'm'], 3); add('d1', 'chem', 'الترتيب الإلكتروني', ['m', 'p'], 5); add('d1', 'phys', 'تحويل الوحدات', ['m', 'm', 'm'], 3);
  add('d2', 'chem', 'الأعداد الكمية', ['m', 'm'], 3); add('d2', 'chem', 'الترتيب الإلكتروني', ['m', 'm'], 5); add('d2', 'chem', 'مبدأ أوفباو', ['m'], 6); add('d2', 'phys', 'تحويل الوحدات', ['m', 'm'], 3);
  add('d3', 'chem', 'الأعداد الكمية', ['m', 'm'], 3); add('d3', 'chem', 'الترتيب الإلكتروني', ['m'], 5); add('d3', 'phys', 'تحويل الوحدات', ['m', 'm'], 3);
  add('d4', 'chem', 'الأعداد الكمية', ['p'], 3);
  add('d5', 'chem', 'الأعداد الكمية', ['m', 'p', 'm'], 3); add('d5', 'chem', 'مبدأ أوفباو', ['p'], 6); add('d5', 'phys', 'تحويل الوحدات', ['p', 'm'], 3);
  add('d6', 'chem', 'الأعداد الكمية', ['p', 'm'], 3); add('d6', 'chem', 'مبدأ أوفباو', ['p'], 6); add('d6', 'phys', 'تحويل الوحدات', ['m'], 3);
  add('d7', 'chem', 'الأعداد الكمية', ['m', 'm'], 3); add('d7', 'chem', 'مبدأ أوفباو', ['m'], 6); add('d7', 'phys', 'تحويل الوحدات', ['m', 'm'], 3);
  add('d8', 'chem', 'الأعداد الكمية', ['m', 'p', 'm'], 3); add('d8', 'chem', 'مبدأ أوفباو', ['p'], 6); add('d8', 'phys', 'الحركة في خط مستقيم', ['m', 'p'], 4);
  var si = sheet_('Indicators'); si.getRange(si.getLastRow() + 1, 1, ind.length, ind[0].length).setValues(ind);

  var A = [['da1', 'chem', '10-6', 'قصير 1 — الأعداد الكمية', 10, 'الأعداد الكمية', 3, 'published'],
           ['da2', 'chem', '10-6', 'قصير 2 — الترتيب الإلكتروني', 10, 'الترتيب الإلكتروني', 6, 'draft'],
           ['dp1', 'phys', '10-6', 'قصير 1 — تحويل الوحدات', 10, 'تحويل الوحدات', 3, 'published'],
           ['dp2', 'phys', '10-6', 'قصير 2 — الحركة', 10, 'الحركة في خط مستقيم', 5, 'published']];
  var sa = sheet_('Assessments'); sa.getRange(sa.getLastRow() + 1, 1, A.length, A[0].length).setValues(A);
  var G = { da1: [8, 10, 9, 6, 7, 'absent', 8, 7], da2: [5, 9.5, 9, 'ungraded', 'missing', 6, 8, 7], dp1: [9, 10, 10, 7, 6, 7, 8, 8], dp2: [9, 9.5, 9.5, 7, 5, 7, 8, 7] }, g = [];
  Object.keys(G).forEach(function (aid) { G[aid].forEach(function (v, i) { g.push([aid, 'd' + (i + 1), typeof v === 'number' ? v : '', typeof v === 'number' ? 'ok' : v, new Date()]); }); });
  var sg = sheet_('Grades'); sg.getRange(sg.getLastRow() + 1, 1, g.length, g[0].length).setValues(g);

  var today = new Date().getDay(), P = [], n = 0;
  names.forEach(function (x, i) {
    var sid = 'd' + (i + 1);
    [['phys', '', 'مراجعة درس الحركة وحل 3 مسائل', 'عندك تقرير مختبر الثلاثاء، والمراجعة اليوم تخفف الضغط.', 20, today, '16:30', 'study'],
     ['math', '', 'واجب الرياضيات', 'موعد التسليم الأربعاء.', 30, today, '17:30', 'study'],
     ['chem', '', 'قراءة درس مبدأ أوفباو قبل الحصة', 'قصير 3 الأحد القادم عن هذا الدرس.', 15, (today + 1) % 7, '17:00', 'study'],
     ['eng', '', 'قراءة قصة الأسبوع', 'هدف أسبوعي ثابت في خطتك.', 20, (today + 2) % 7, '18:00', 'study'],
     ['chem', 'مبدأ أوفباو', '🫧 مراجعة سريعة قبل قصير 3', 'قبل الاختبار بيومين: لعبة قصيرة وتصيرين جاهزة.', 10, 5, '17:00', 'practice']
    ].forEach(function (t) {
      P.push(['dt' + (++n), sid, t[0], t[1], t[2], t[3], t[4], t[5], t[6], t[7], (sid === 'd2' && t[2] === 'واجب الرياضيات') ? 'done' : 'todo', '', t[1] ? 'تقويم الشعبة' : 'الكوتش', '', new Date()]);
    });
  });
  var sp = sheet_('Plans'); sp.getRange(sp.getLastRow() + 1, 1, P.length, P[0].length).setValues(P);

  var ago = function (d) { return new Date(Date.now() - d * 864e5).toISOString(); };
  var games = { 'الأعداد الكمية': 'سكّني الإلكترونات', 'مبدأ أوفباو': 'رتّبي الطوابق', 'الترتيب الإلكتروني': 'فقاعات الترتيب' };
  var pr = function (sid, skill, score, mist, keys, sec, d) {
    return [sid, 'chem', skill, games[skill], score, 5, JSON.stringify(keys.map(function (k) { return { k: k.replace('!', ''), ok: k.charAt(0) !== '!' }; })), JSON.stringify(mist), sec, ago(d)];
  };
  var PR = [pr('d1', 'الأعداد الكمية', 5, [], ['orb-N', 'orb-O', 'orb-C', 'orb-Mn', 'orb-Fe'], 240, 3),
            pr('d1', 'مبدأ أوفباو', 4, ['ترتيب 4s و 3d'], ['ord-2', '!ord-1', 'ord-5', 'ord-6', 'ord-3'], 310, 2),
            pr('d2', 'الأعداد الكمية', 5, [], ['orb-N', 'orb-O', 'orb-C', 'orb-Mn', 'orb-F'], 150, 4),
            pr('d2', 'مبدأ أوفباو', 5, [], ['ord-1', 'ord-2', 'ord-3', 'ord-4', 'ord-5'], 140, 3),
            pr('d2', 'الترتيب الإلكتروني', 5, [], ['cfg-Na', 'cfg-K', 'cfg-Fe', 'cfg-S', 'cfg-Cl'], 200, 1),
            pr('d5', 'الأعداد الكمية', 3, ['ازدواج قبل ملء الأفلاك منفردة', 'ازدواج قبل ملء الأفلاك منفردة'], ['orb-N', '!orb-O', 'orb-C', '!orb-Fe', 'orb-Mn'], 420, 2)];
  var sr = sheet_('Practice'); sr.getRange(sr.getLastRow() + 1, 1, PR.length, PR[0].length).setValues(PR);

  var nd = function (dow) { var d = new Date(); d.setDate(d.getDate() + (((dow - d.getDay() + 7) % 7) || 7)); return Utilities.formatDate(d, TZ, 'yyyy-MM-dd'); };
  [['10-6', 'chem', 'قصير 3 — مبدأ أوفباو', 'الأحد', nd(0), 'مبدأ أوفباو'],
   ['10-6', 'phys', 'تسليم تقرير المختبر', 'الثلاثاء', nd(2), ''],
   ['10-6', 'math', 'اختبار قصير', 'الأربعاء', nd(3), '']].forEach(function (u) {
    append_('Upcoming', { cls: u[0], subj: u[1], title: u[2], when: u[3], date: "'" + u[4], skill: u[5], eventId: 'demo' });
  });

  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  var u = rows_('Users').filter(function (x) { return String(x.email).toLowerCase() === me; })[0];
  if (u) update_('Users', u._row, { roles: 'teacher,student,parent,admin,counselor', studentId: 'd1', children: 'd1' });
  append_('Nominations', { id: 'dn1', sid: 'd3', role: 'parent', by: 'ولي أمر دانة', domain: 'art', traits: '[]', note: 'ترسم وتصمم على الآيباد من صغرها، وصممت شعار نادي المدرسة.', status: 'new', at: new Date() });
  append_('Nominations', { id: 'dn2', sid: 'd2', role: 'teacher', by: 'أ. أفنان سامي', domain: 'sci', traits: JSON.stringify(['فضول وأسئلة عميقة', 'تتعلّم بسرعة', 'أفكار أصلية']), note: 'تحل أسئلة الأولمبياد بطرق ما درّسناها.', status: 'new', at: new Date() });
  var gm = rows_('Settings').filter(function (r) { return r.key === 'geminiModel'; })[0];
  if (gm) update_('Settings', gm._row, { value: 'gemini-flash-lite-latest' });
  Logger.log('✅ انضافت شعبة تجريبية 10/6 (8 طالبات بدون إيميلات).');
}

function clearDemo() {
  ['Students', 'Indicators', 'Grades', 'Plans', 'Practice', 'Requests', 'Reviews', 'Alerts', 'Nominations'].forEach(function (n) {
    var col = n === 'Students' ? 'id' : n === 'Alerts' ? 'sid' : 'sid';
    if (n === 'Grades') col = 'sid';
    rows_(n).filter(function (r) { return /^d\d+$/.test(String(r[col])); }).reverse().forEach(function (r) { sheet_(n).deleteRow(r._row); });
  });
  rows_('Assessments').filter(function (r) { return /^d[ap]\d+$/.test(String(r.id)); }).reverse().forEach(function (r) { sheet_('Assessments').deleteRow(r._row); });
  rows_('Upcoming').filter(function (r) { return r.eventId === 'demo'; }).reverse().forEach(function (r) { sheet_('Upcoming').deleteRow(r._row); });
  var me = Session.getEffectiveUser().getEmail().toLowerCase();
  var u = rows_('Users').filter(function (x) { return String(x.email).toLowerCase() === me; })[0];
  if (u && u.studentId === 'd1') update_('Users', u._row, { roles: 'teacher,admin,counselor', studentId: '', children: '' });
  Logger.log('🧹 انمسحت البيانات التجريبية.');
}
