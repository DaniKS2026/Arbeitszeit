(function () {
  "use strict";
  var A = window.APP;
  var APPROVERS = A.APPROVERS;
  var toDateStr = A.toDateStr, parseDateStr = A.parseDateStr, fmtDateDE = A.fmtDateDE, fmtDecimal = A.fmtDecimal, escapeHtml = A.escapeHtml, mondayOf = A.mondayOf, calcBreakForDay = A.calcBreakForDay;
  var api = A.api;
  var PERMISSION_MSG = "Nur Daniel Satzinger oder Simon Demant sind dazu berechtigt.";

  var el = {
    whoName: document.getElementById("whoName"),
    logoutBtn: document.getElementById("logoutBtn"),
    globalMsg: document.getElementById("globalMsg"),
    pendingHint: document.getElementById("pendingHint"),
    pendingList: document.getElementById("pendingList"),
    approvedList: document.getElementById("approvedList")
  };

  var data = { entries: [], requests: [], approvals: [] };

  function entriesForDate(ds) { return data.entries.filter(function (e) { return e.date === ds; }); }
  function dayNetMinutes(ds) {
    var dayEntries = entriesForDate(ds);
    var gross = dayEntries.reduce(function (s, e) { return s + e.durationMinutes; }, 0);
    return gross - calcBreakForDay(dayEntries, gross);
  }
  function weekTotalForKey(weekKey) {
    var mon = parseDateStr(weekKey);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    var monStr = toDateStr(mon), sunStr = toDateStr(sun);
    var datesInWeek = {};
    data.entries.forEach(function (e) { if (e.date >= monStr && e.date <= sunStr) datesInWeek[e.date] = true; });
    return Object.keys(datesInWeek).reduce(function (s, ds) { return s + dayNetMinutes(ds); }, 0);
  }
  function weekLabel(weekKey) {
    var mon = parseDateStr(weekKey);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    return fmtDateDE(weekKey) + " – " + sun.toLocaleDateString("de-DE");
  }

  function render() {
    var approvedByWeek = {};
    data.approvals.forEach(function (a) { approvedByWeek[a.weekKey] = a; });

    var pending = data.requests.filter(function (r) { return !approvedByWeek[r.weekKey]; });
    el.pendingHint.textContent = pending.length ? ("· " + pending.length) : "";

    if (!pending.length) {
      el.pendingList.innerHTML = '<div class="admin-empty">Keine offenen Anfragen.</div>';
    } else {
      el.pendingList.innerHTML = pending.map(function (r) {
        var hours = weekTotalForKey(r.weekKey);
        return '<div class="req-card" data-week="' + r.weekKey + '">'
          + '<div class="req-head"><span class="req-week">Woche ' + weekLabel(r.weekKey) + '</span><span class="req-hours">' + fmtDecimal(hours) + ' Std.</span></div>'
          + '<div class="req-meta">Angefordert von ' + escapeHtml(r.requestedBy || "Erik") + ' am ' + fmtDateDE(toDateStr(new Date(r.requestedAt))) + '</div>'
          + '<div class="req-reason">' + escapeHtml(r.reason || "") + '</div>'
          + '<div class="req-actions">'
          + '<select class="req-approver">' + APPROVERS.map(function (a) { return '<option value="' + escapeHtml(a) + '">' + escapeHtml(a) + '</option>'; }).join("") + '</select>'
          + '<button class="approve-btn req-approve-btn">Freigeben</button>'
          + '</div><div class="req-msg"></div></div>';
      }).join("");
    }

    var recentApproved = data.approvals.slice(0, 10);
    if (!recentApproved.length) {
      el.approvedList.innerHTML = '<div class="admin-empty">Noch keine Freigaben.</div>';
    } else {
      el.approvedList.innerHTML = recentApproved.map(function (a) {
        return '<div class="approved-row" data-week="' + a.weekKey + '">'
          + '<span>Woche ' + weekLabel(a.weekKey) + ' &middot; <strong class="mono">' + fmtDecimal(a.weekTotalMinutes || weekTotalForKey(a.weekKey)) + ' Std.</strong></span>'
          + '<span class="ar-by">freigegeben von ' + escapeHtml(a.approvedBy) + ', ' + fmtDateDE(toDateStr(new Date(a.approvedAt))) + ' &middot; <button class="revoke-link admin-revoke-btn">zur&uuml;ckziehen</button></span>'
          + '</div>';
      }).join("");
    }
  }

  el.pendingList.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".req-approve-btn");
    if (!btn) return;
    var card = btn.closest(".req-card");
    var weekKey = card.getAttribute("data-week");
    var approver = card.querySelector(".req-approver").value;
    var msgEl = card.querySelector(".req-msg");
    msgEl.textContent = "";
    btn.disabled = true;
    api("/api/approvals/" + weekKey, { method: "PUT", body: { approvedBy: approver, weekTotalMinutes: weekTotalForKey(weekKey) } })
      .then(function () { return refresh(); })
      .catch(function (err) {
        btn.disabled = false;
        msgEl.textContent = err && err.status === 403 ? PERMISSION_MSG : "Freigabe fehlgeschlagen. Bitte erneut versuchen.";
      });
  });

  el.approvedList.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".admin-revoke-btn");
    if (!btn) return;
    var row = btn.closest(".approved-row");
    var weekKey = row.getAttribute("data-week");
    btn.disabled = true;
    api("/api/approvals/" + weekKey, { method: "DELETE" })
      .then(function () { return refresh(); })
      .catch(function (err) {
        btn.disabled = false;
        el.globalMsg.textContent = err && err.status === 403 ? PERMISSION_MSG : "Zurücknehmen fehlgeschlagen. Bitte erneut versuchen.";
      });
  });

  function refresh() {
    return Promise.all([
      api("/api/entries"),
      api("/api/approval-requests"),
      api("/api/approvals")
    ]).then(function (r) {
      data.entries = r[0]; data.requests = r[1]; data.approvals = r[2];
      render();
    });
  }

  el.logoutBtn.addEventListener("click", function () {
    api("/api/logout", { method: "POST" }).then(function () { window.location.href = "/login.html"; });
  });

  api("/api/me").then(function (me) {
    el.whoName.textContent = me.name;
    if (me.role !== "admin") {
      document.body.innerHTML = '<div class="shell-narrow"><div class="auth-card"><h1>Kein Zugriff</h1><p>Dieser Bereich ist nur f&uuml;r Daniel Satzinger und Simon Demant. <a href="/index.html">Zur&uuml;ck zur Zeiterfassung</a></p></div></div>';
      return;
    }
    return refresh();
  }).catch(function () {
    el.globalMsg.textContent = "Verbindung zum Server fehlgeschlagen.";
  });

  setInterval(function () { refresh().catch(function () {}); }, 20000);
})();
