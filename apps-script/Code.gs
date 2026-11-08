/**
 * حيّ الكيمياء · خادم متابعة الطالبات (Google Apps Script)
 *
 * طريقة التشغيل (مرة وحدة):
 *  1) افتحي Google Sheet جديد ← Extensions ← Apps Script ← الصقي هالكود مكان الموجود ← Save.
 *  2) اختاري الدالة setup من فوق ← Run ← وافقي على الصلاحيات.
 *     (تنشئ تبويب «الأحداث» وتبويب «المعلمات» وفيه سطر لج برمز سري.)
 *  3) Deploy ← New deployment ← Web app:
 *       Execute as: Me    ·    Who has access: Anyone
 *     ← Deploy ← انسخي رابط Web app (ينتهي بـ /exec) وعطيني إياه.
 *  4) بتبويب «المعلمات» أضيفي كل معلمة: الاسم · رمز سري تختارينه · شعبها (مفصولة بفواصل، أو * للكل).
 *
 * الطالبات يرسلن (POST) بدون تسجيل دخول، بس القراءة (GET) ما تصير إلا برمز معلمة،
 * وكل معلمة تشوف شعبها بس.
 */

var EVENTS = 'الأحداث';
var TEACHERS = 'المعلمات';
var COLS = ['received', 'id', 'ts', 'did', 'sid', 'name', 'sec', 'lesson', 'mode', 'type', 'where', 'item', 'q',
            'ok', 'first', 'tries', 'kind', 'skill', 't', 't2', 'value', 'text', 'v'];

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var ev = ss.getSheetByName(EVENTS) || ss.insertSheet(EVENTS);
  if (ev.getLastRow() === 0) { ev.appendRow(COLS); ev.setFrozenRows(1); }
  var tc = ss.getSheetByName(TEACHERS) || ss.insertSheet(TEACHERS);
  if (tc.getLastRow() === 0) {
    tc.appendRow(['الاسم', 'الرمز السري', 'الشعب (مفصولة بفواصل، أو * للكل)']);
    tc.appendRow(['أ. أفنان سامي', 'hayy-' + Math.random().toString(36).slice(2, 8), '*']);
    tc.setFrozenRows(1);
    tc.setColumnWidths(1, 3, 220);
  }
  SpreadsheetApp.getUi && Logger.log('تم ✅ — رمزج بتبويب «المعلمات»');
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var list = (body.events || []).slice(0, 200);
    if (!list.length) return out_({ ok: true, n: 0 });
    lock.waitLock(20000);
    var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS);
    var now = new Date().toISOString();
    var rows = list.map(function (x) {
      return COLS.map(function (c) {
        if (c === 'received') return now;
        var v = x[c];
        if (v == null) return '';
        v = String(v);
        if (/^[=+\-@]/.test(v)) v = "'" + v; // حماية من الصيغ
        return v.length > 1000 ? v.slice(0, 1000) : v;
      });
    });
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, COLS.length).setValues(rows);
    return out_({ ok: true, n: rows.length });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var who = teacher_(p.key);
  if (!who) return out_({ ok: false, error: 'الرمز غير صحيح' }, p.callback);
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(EVENTS);
  var last = sh.getLastRow();
  var data = last > 1 ? sh.getRange(2, 1, last - 1, COLS.length).getDisplayValues() : [];
  var since = p.since || '';
  var rows = [];
  for (var i = 0; i < data.length; i++) {
    var r = data[i];
    if (since && r[0] <= since) continue;
    if (!who.all && who.secs.indexOf(norm_(r[6])) < 0) continue;
    rows.push(r);
  }
  return out_({ ok: true, teacher: who.name, all: who.all, secs: who.raw, cols: COLS, rows: rows, now: new Date().toISOString() }, p.callback);
}

function teacher_(key) {
  key = String(key || '').trim();
  if (!key) return null;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TEACHERS);
  var v = sh.getDataRange().getDisplayValues();
  for (var i = 1; i < v.length; i++) {
    if (String(v[i][1]).trim() === key) {
      var raw = String(v[i][2] || '').trim();
      return { name: v[i][0], raw: raw, all: raw === '*', secs: raw.split(/[,،]/).map(norm_).filter(String) };
    }
  }
  return null;
}

/* «عاشر ٣» و «10/3» و «3» كلها نفس الشعبة: نشيل كل شي إلا آخر رقم */
function norm_(s) {
  s = String(s || '').replace(/[٠-٩]/g, function (d) { return '٠١٢٣٤٥٦٧٨٩'.indexOf(d); })
                     .replace(/[۰-۹]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'.indexOf(d); });
  var m = s.match(/\d+/g);
  return m ? m[m.length - 1] : s.trim();
}

function out_(obj, cb) {
  var s = JSON.stringify(obj);
  if (cb && /^[\w.]+$/.test(cb)) return ContentService.createTextOutput(cb + '(' + s + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
