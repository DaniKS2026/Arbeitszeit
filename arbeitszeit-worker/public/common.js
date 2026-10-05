// Shared helpers used by index.html (app.js) and freigabe.html (freigabe.js).

window.APP = (function () {
  "use strict";

  var CATEGORIES = [
    { id: "angebot", label: "Angebotserstellung", var: "angebot" },
    { id: "auftrag", label: "Auftragsbearbeitung", var: "auftrag" },
    { id: "baustelle", label: "Baustellenbesuch", var: "baustelle" },
    { id: "kunde", label: "Kundentermin", var: "kunde" },
    { id: "projekt", label: "Projektbearbeitung / Betreuung", var: "projekt" },
    { id: "intern", label: "Internes Meeting", var: "intern" },
    { id: "pmeeting", label: "Projektmeeting", var: "pmeeting" },
    { id: "buero", label: "Büro / Verwaltung", var: "buero" },
    { id: "material", label: "Materialbeschaffung", var: "material" },
    { id: "urlaub", label: "Urlaub", var: "urlaub" },
    { id: "sonst", label: "Sonstiges (mit Notiz)", var: "sonst" }
  ];
  var catById = {};
  CATEGORIES.forEach(function (c) { catById[c.id] = c; });

  var VACATION_CATEGORY = "urlaub";
  var VACATION_DAY_MINUTES = 8 * 60;
  var APPROVAL_THRESHOLD_MINUTES = 45 * 60;
  var APPROVERS = ["Daniel Satzinger", "Simon Demant (Vertretung)"];

  function pad2(n) { return String(n).padStart(2, "0"); }
  function toDateStr(d) { return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function parseDateStr(s) { var p = s.split("-").map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function minutesOf(hhmm) { var p = hhmm.split(":").map(Number); return p[0] * 60 + p[1]; }
  function fmtHM(mins) { var h = Math.floor(mins / 60), m = mins % 60; return h + ":" + pad2(m); }
  function fmtDecimal(mins) { return (mins / 60).toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 2 }); }
  function fmtDateDE(iso) { return parseDateStr(iso).toLocaleDateString("de-DE"); }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  function mondayOf(d) {
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var m = new Date(d);
    m.setDate(d.getDate() + diff);
    m.setHours(0, 0, 0, 0);
    return m;
  }

  function calcBreakMinutes(grossMinutes) {
    if (grossMinutes > 9 * 60) return 45;
    if (grossMinutes >= 6 * 60) return 30;
    return 0;
  }
  function calcBreakForDay(dayEntries, grossMinutes) {
    var allVacation = dayEntries.length > 0 && dayEntries.every(function (e) { return e.category === VACATION_CATEGORY; });
    return allVacation ? 0 : calcBreakMinutes(grossMinutes);
  }

  // ---- API wrapper ----
  function api(path, options) {
    options = options || {};
    var opts = {
      method: options.method || "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin"
    };
    if (options.body) opts.body = JSON.stringify(options.body);
    return fetch(path, opts).then(function (res) {
      if (res.status === 401) {
        window.location.href = "/login.html?next=" + encodeURIComponent(window.location.pathname);
        return new Promise(function () {}); // never resolves, we're navigating away
      }
      return res.json().then(function (data) {
        if (!res.ok) {
          var err = new Error(data && data.error ? data.error : "request_failed");
          err.code = data && data.error;
          err.status = res.status;
          throw err;
        }
        return data;
      });
    });
  }

  return {
    CATEGORIES: CATEGORIES, catById: catById,
    VACATION_CATEGORY: VACATION_CATEGORY, VACATION_DAY_MINUTES: VACATION_DAY_MINUTES,
    APPROVAL_THRESHOLD_MINUTES: APPROVAL_THRESHOLD_MINUTES, APPROVERS: APPROVERS,
    pad2: pad2, toDateStr: toDateStr, parseDateStr: parseDateStr, minutesOf: minutesOf,
    fmtHM: fmtHM, fmtDecimal: fmtDecimal, fmtDateDE: fmtDateDE, capitalize: capitalize, escapeHtml: escapeHtml,
    mondayOf: mondayOf, calcBreakMinutes: calcBreakMinutes, calcBreakForDay: calcBreakForDay,
    api: api
  };
})();
