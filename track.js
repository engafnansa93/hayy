/* ===== حيّ الكيمياء · متابعة تعلّم الطالبة (لواجهة المعلمات) =====
   يسجّل بهدوء ويرسل لـ Google Sheet عن طريق Apps Script:
   - وين توقف الفيديو، ومتى ترجع لورا أو تعيد المقطع
   - كل سؤال: صح من أول محاولة؟ كم محاولة؟ نوعه (نظري / تطبيقي) ومهارته
   - متى تدخل وكم قعدت فعليًا
   - تعليقها آخر الدرس
   ما يغيّر أي شي بالدرس. وإذا ما فيه رابط (ENDPOINT) يخزّن الأحداث بالجهاز لين ينحط الرابط. */
(function () {
  'use strict';
  var ENDPOINT = ''; // ← رابط تطبيق الويب من Apps Script (…/exec)
  var VERSION = 1;

  var LESSON = /lesson3/.test(location.pathname) ? 3 : /lesson2/.test(location.pathname) ? 2 : /lesson1/.test(location.pathname) ? 1 : 0;
  if (!LESSON) return;

  var ls = {
    g: function (k) { try { return localStorage.getItem(k) || ''; } catch (e) { return ''; } },
    s: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var rid = function () { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); };
  var DID = ls.g('hayy.did') || (function () { var d = rid(); ls.s('hayy.did', d); return d; })();
  var SID = rid();
  var MODE = /[?&](all|teacher)\b/.test(location.search) ? 'teacher' : ls.g('hayy.judge') === '1' ? 'judge' : 'student';
  var clip = function (s, n) { s = String(s == null ? '' : s).replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
  var round1 = function (x) { return Math.round((+x || 0) * 10) / 10; };

  /* ---------- الطابور: نرسل دفعات، وإذا ما فيه رابط نخزّن ---------- */
  var QKEY = 'hayy.tq';
  var queue = []; try { queue = JSON.parse(ls.g(QKEY) || '[]') || []; } catch (e) { queue = []; }
  function persist() { if (queue.length > 600) queue = queue.slice(-600); ls.s(QKEY, JSON.stringify(queue)); }
  function emit(type, d) {
    d = d || {};
    queue.push({
      id: rid(), ts: new Date().toISOString(), v: VERSION, did: DID, sid: SID,
      name: clip(ls.g('omara.name'), 60), sec: clip(ls.g('omara.sec'), 30),
      lesson: LESSON, mode: MODE, type: type,
      where: clip(d.where, 80), item: clip(d.item, 60), q: clip(d.q, 160),
      ok: d.ok == null ? '' : (d.ok ? 1 : 0), first: d.first == null ? '' : (d.first ? 1 : 0),
      tries: d.tries == null ? '' : d.tries, kind: d.kind || '', skill: clip(d.skill, 80),
      t: d.t == null ? '' : round1(d.t), t2: d.t2 == null ? '' : round1(d.t2),
      value: d.value == null ? '' : d.value, text: clip(d.text, 600)
    });
    persist();
  }
  var sending = false;
  function flush(beacon) {
    if (!ENDPOINT || !queue.length || sending) return;
    if (!ls.g('omara.name')) return; // نستنّى لين تكتب اسمها
    var name = clip(ls.g('omara.name'), 60), sec = clip(ls.g('omara.sec'), 30);
    queue.forEach(function (e) { if (!e.name) { e.name = name; e.sec = sec; } });
    var batch = queue.slice(0, 80), body = JSON.stringify({ events: batch });
    var done = function () { queue = queue.slice(batch.length); persist(); sending = false; };
    if (beacon && navigator.sendBeacon) {
      try { if (navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'text/plain' }))) { done(); return; } } catch (e) {}
    }
    sending = true;
    try {
      fetch(ENDPOINT, { method: 'POST', mode: 'no-cors', keepalive: body.length < 60000, headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
        .then(done, function () { sending = false; });
    } catch (e) { sending = false; }
  }
  setInterval(function () { flush(false); }, 15000);
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') flush(true); });
  addEventListener('pagehide', function () { flush(true); });

  /* ---------- الوقت الفعلي: نحسب بس إذا الصفحة ظاهرة وفيه تفاعل آخر دقيقتين ---------- */
  var lastAct = Date.now(), activeAcc = 0;
  ['pointerdown', 'keydown', 'scroll', 'touchstart'].forEach(function (ev) { addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true, capture: true }); });
  function playingNow() {
    try { if (LESSON < 3 && typeof st !== 'undefined' && st.playing) return true; } catch (e) {}
    return !!document.querySelector('.vplay') && /إيقاف/.test((document.querySelector('.vplay') || {}).textContent || '');
  }
  setInterval(function () {
    if (document.visibilityState !== 'visible') return;
    if (Date.now() - lastAct < 120000 || playingNow()) activeAcc += 10;
    if (activeAcc >= 60) { emit('active', { value: activeAcc }); activeAcc = 0; }
  }, 10000);
  addEventListener('pagehide', function () { if (activeAcc) { emit('active', { value: activeAcc }); activeAcc = 0; } });

  emit('open', { where: location.hash || '', text: navigator.userAgent.indexOf('iPhone') >= 0 ? 'iPhone' : /Android/.test(navigator.userAgent) ? 'Android' : 'جهاز' });

  /* ---------- الدرس 1 و 2 (نفس المشغّل) ---------- */
  function hookL12() {
    if (typeof SEGS === 'undefined' || typeof st === 'undefined' || typeof seek !== 'function' || typeof setPlaying !== 'function') return;
    var segName = function (i) { return 'المقطع ' + (i + 1) + (SEGS[i] && SEGS[i].title ? ': ' + SEGS[i].title : ''); };
    var qOf = {}; SEGS.forEach(function (s, i) { (s.pauses || []).forEach(function (p) { qOf[p.id] = { q: p.q, seg: i }; }); });

    var origSet = setPlaying;
    setPlaying = function (v) {
      var was = st.playing, seg = st.seg, t = st.t;
      var r = origSet.apply(this, arguments);
      if (was && !v) setTimeout(function () {
        if (!st.ended && !st.waiting && st.view !== 'game' && st.view !== 'results') emit('pause', { where: segName(seg), item: 's' + (seg + 1), t: t });
      }, 0);
      if (!was && v) emit('play', { where: segName(st.seg), item: 's' + (st.seg + 1), t: st.t });
      return r;
    };
    var origSeek = seek;
    seek = function (segIdx, t, opts) {
      var fromSeg = st.seg, fromT = st.t, review = st.review;
      var r = origSeek.apply(this, arguments);
      opts = opts || {};
      if (review) emit('rewind', { where: segName(segIdx), item: 's' + (segIdx + 1), t: fromT, t2: t, kind: 'hint', text: 'رجعت للفيديو من اللعبة' });
      else if (opts.reset && t === 0 && segIdx === fromSeg && fromT > 3) emit('replay', { where: segName(segIdx), item: 's' + (segIdx + 1), t: fromT });
      else if (segIdx === fromSeg && t < fromT - 2) emit('rewind', { where: segName(segIdx), item: 's' + (segIdx + 1), t: fromT, t2: t });
      else if (segIdx < fromSeg) emit('rewind', { where: segName(segIdx), item: 's' + (segIdx + 1), t: fromT, t2: t, text: 'رجعت لمقطع سابق' });
      return r;
    };

    /* أسئلة الفيديو (فهم/نظري) + اللعبة (تطبيق/عملي): نقارن الحالة كل ثانية */
    var seenP = {}, seenG = {};
    var kindNames = { order: 'ترتيب التعبئة', cap: 'السعة القصوى', fill: 'تعبئة تحت المستوى لين سعته', count: 'حساب المتبقي', stop: 'التوقف عند نهاية الإلكترونات', early: 'التوقف عند نهاية الإلكترونات', '4s': '4s قبل 3d', find: 'تتبّع الأسهم' };
    setInterval(function () {
      try {
        if (typeof pauseStats !== 'undefined') Object.keys(pauseStats).forEach(function (id) {
          var ps = pauseStats[id], key = ps.tries + '|' + ps.first;
          if (!ps.tries || seenP[id] === key) return; seenP[id] = key;
          var info = qOf[id] || {};
          emit('answer', { item: 'L' + LESSON + ':' + id, q: info.q, where: info.seg != null ? segName(info.seg) : '', ok: !!ps.first || ps.tries > 0, first: !!ps.first, tries: ps.tries, kind: 'نظري', skill: info.seg != null ? (SEGS[info.seg].title || segName(info.seg)) : 'أسئلة الفيديو' });
        });
        if (typeof G !== 'undefined' && G.stats) G.stats.forEach(function (s, k) {
          var label, skill, first, tries = s.attempts != null ? s.attempts : (s.errors || 0) + (G.r > k || G.done || G.finished ? 1 : 0), weak = '';
          if (LESSON === 1 && typeof ROUNDS !== 'undefined') { label = ROUNDS[k].ask; skill = ROUNDS[k].axis; first = s.first; if (!s.attempts) return; }
          else if (LESSON === 2 && typeof ELEMS !== 'undefined') {
            var finished = G.r > k || (G.r === k && G.done) || G.finished;
            if (!finished && !s.errors) return;
            label = ELEMS[k].title + ' · ' + ELEMS[k].name + ' (' + ELEMS[k].sym + ')'; skill = ELEMS[k].title;
            first = finished && !s.errors; tries = (s.errors || 0) + (finished ? 1 : 0);
            weak = Array.from(s.kinds || []).map(function (x) { return kindNames[x] || x; }).filter(function (v, i, a) { return a.indexOf(v) === i; }).join('، ');
          } else return;
          var key = tries + '|' + first + '|' + (s.replays || 0) + '|' + weak + '|' + (G.r > k || G.finished);
          if (seenG[k] === key) return; seenG[k] = key;
          emit('answer', { item: 'L' + LESSON + ':g' + k, q: label, where: 'ورقة العمل التفاعلية', ok: G.r > k || G.finished || (G.r === k && (G.solved || G.done)), first: first, tries: tries, kind: 'تطبيقي', skill: skill, value: s.replays || 0, text: weak });
        });
      } catch (e) {}
    }, 1000);

    hookResults();
  }

  /* ---------- الدرس 3 ---------- */
  function hookL3() {
    var station = function () { var m = (location.hash || '').match(/^#lesson\/(\d+)/); return m ? +m[1] : 0; };
    var stName = function (n) { return 'المحطة ' + n + (typeof STATION !== 'undefined' && STATION[n] ? ': ' + STATION[n] : ''); };
    var secs = function (vp) { var m = ((vp && vp.querySelector('.vtime')) || {}).textContent; m = m && m.match(/(\d+):(\d\d)/); return m ? (+m[1]) * 60 + (+m[2]) : 0; };
    document.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('.vplay, .vre, .vskip'); if (!b) return;
      var vp = b.closest('.vp'), n = station(), w = n ? stName(n) : (location.hash || 'الفيديو'), t = secs(vp);
      if (b.classList.contains('vre')) emit('replay', { where: w, item: 'st' + n, t: t });
      else if (b.classList.contains('vskip')) emit('skip', { where: w, item: 'st' + n, t: t });
      else if (/إيقاف/.test(b.textContent)) emit('pause', { where: w, item: 'st' + n, t: t });
      else if (/إعادة/.test(b.textContent)) emit('replay', { where: w, item: 'st' + n, t: t });
      else emit('play', { where: w, item: 'st' + n, t: t });
    }, true);
    document.addEventListener('click', function (e) {
      var a = e.target.closest && e.target.closest('a.back, a[href^="#lesson/"]');
      if (a && /#g\//.test(location.hash)) emit('rewind', { where: stName(+((a.getAttribute('href') || '').split('/')[1] || 0)), kind: 'hint', text: 'رجعت للمحطة من اللعبة' });
    }, true);

    if (typeof choice === 'function') {
      var origChoice = choice;
      choice = function (host, q, opts, right) {
        var box = origChoice.apply(this, arguments);
        if (/^#g\//.test(location.hash)) return box; // الألعاب تنحسب من reward
        var n = station(), tries = 0, firstOk = null, doneQ = false, qt = clip(q, 160);
        try {
          box.addEventListener('click', function (e) {
            if (doneQ || !(e.target.closest && e.target.closest('.opt'))) return;
            setTimeout(function () {
              var ok = !!box.querySelector('.opt.right'); tries++; if (firstOk === null) firstOk = ok;
              if (ok) { doneQ = true; emit('answer', { item: 'L3:st' + n + ':' + qt.slice(0, 40), q: qt, where: stName(n), ok: true, first: firstOk, tries: tries, kind: 'نظري', skill: (typeof STATION !== 'undefined' && STATION[n]) || stName(n) }); }
            }, 0);
          });
        } catch (e) {}
        return box;
      };
    }
    var GAMES = { addr: 'وين عنواني؟ (الدورة والمجموعة)', fam: 'من عائلتي؟ (العائلات)', fix: 'صحّحي الخطأ', cmp: 'قارني بين عنصرين', exit: 'بطاقة الخروج' };
    if (typeof reward === 'function') {
      var origReward = reward, qn = 0, lastGame = '';
      reward = function (ok, key) {
        var g = ((location.hash || '').match(/^#g\/(\w+)/) || [])[1] || '';
        if (g !== lastGame) { lastGame = g; qn = 0; } qn++;
        var qEl = document.querySelector('#rd b'), qt = clip(qEl ? qEl.textContent : 'سؤال ' + qn, 160);
        emit('answer', { item: 'L3:g:' + g + ':' + qn + ':' + qt.slice(0, 30), q: qt, where: 'لعبة: ' + (GAMES[g] || g), ok: !!ok, first: !!ok, tries: 1, kind: 'تطبيقي', skill: GAMES[g] || g });
        return origReward.apply(this, arguments);
      };
    }
    if (typeof runTest === 'function') {
      var origTest = runTest;
      runTest = function (host, form, onEnd) {
        return origTest.call(this, host, form, function (s, n, ans) {
          emit('test', { item: form === 'B' ? 'post' : 'pre', where: form === 'B' ? 'الاختبار البعدي' : 'الاختبار القبلي', value: s + '/' + n, ok: s * 2 >= n });
          return onEnd.apply(this, arguments);
        });
      };
    }
    if (typeof lessonDone === 'function') {
      var origDone = lessonDone;
      lessonDone = function () { emit('finish', { where: 'خلصت الدرس 3' }); flush(false); return origDone.apply(this, arguments); };
    }
    addEventListener('hashchange', function () { var n = station(); if (n) emit('visit', { where: stName(n), item: 'st' + n }); setTimeout(addComment3, 300); });
    setTimeout(addComment3, 600);
  }

  /* ---------- صندوق التعليق ---------- */
  var CSS = '.hy-cm{margin:14px auto 4px;max-width:560px;background:#FFF8F1;border:1.5px dashed #E3A89C;border-radius:16px;padding:12px 14px;font-family:inherit;direction:rtl;text-align:right}' +
    '.hy-cm b{display:block;color:#8B3428;margin-bottom:6px}.hy-cm textarea{width:100%;box-sizing:border-box;min-height:64px;border:1.5px solid #E7D5CF;border-radius:12px;padding:8px 10px;font:inherit;resize:vertical;background:#fff}' +
    '.hy-cm .r{display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap}.hy-cm button{border:0;border-radius:99px;padding:8px 18px;background:#C64C39;color:#fff;font:inherit;font-weight:700;cursor:pointer}.hy-cm small{color:#8A6660}';
  function commentBox(where) {
    if (!document.getElementById('hy-cm-css')) { var s = document.createElement('style'); s.id = 'hy-cm-css'; s.textContent = CSS; document.head.appendChild(s); }
    var d = document.createElement('div'); d.className = 'hy-cm';
    d.innerHTML = '<b>💬 تبين تقولين شي للمعلمة؟</b><textarea placeholder="شنو ما فهمتي؟ شنو عجبج؟ أي سؤال…" aria-label="تعليقج"></textarea><div class="r"><button type="button">أرسلي</button><small>اختياري، والمعلمة بس تشوفه 🤍</small></div>';
    d.querySelector('button').onclick = function () {
      var v = d.querySelector('textarea').value.trim(); if (!v) return;
      emit('comment', { where: where, text: v }); flush(false);
      d.innerHTML = '<b>وصل تعليقج للمعلمة، شكرًا 🤍</b>';
    };
    return d;
  }
  function hookResults() {
    var host = document.getElementById('results'); if (!host) return;
    var add = function () { if (host.innerHTML && !host.querySelector('.hy-cm')) { host.appendChild(commentBox('آخر الدرس ' + LESSON)); if (!host.dataset.hyDone) { host.dataset.hyDone = 1; emit('finish', { where: 'خلصت الدرس ' + LESSON }); flush(false); } } };
    new MutationObserver(add).observe(host, { childList: true });
  }
  function addComment3() {
    if (!/^#(games|g\/exit)/.test(location.hash || '')) return;
    var v = document.getElementById('view'); if (!v || v.querySelector('.hy-cm')) return;
    v.appendChild(commentBox(location.hash === '#games' ? 'صفحة الألعاب · الدرس 3' : 'بطاقة الخروج · الدرس 3'));
  }

  try { if (LESSON === 3) hookL3(); else hookL12(); } catch (e) {}
  window.hayyTrack = { emit: emit, flush: flush, queue: function () { return queue.slice(); } };
})();
