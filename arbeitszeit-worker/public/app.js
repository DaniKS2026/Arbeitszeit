(function () {
  "use strict";
  var A = window.APP;
  var CATEGORIES = A.CATEGORIES, catById = A.catById;
  var VACATION_CATEGORY = A.VACATION_CATEGORY, VACATION_DAY_MINUTES = A.VACATION_DAY_MINUTES;
  var APPROVAL_THRESHOLD_MINUTES = A.APPROVAL_THRESHOLD_MINUTES, APPROVERS = A.APPROVERS;
  var toDateStr = A.toDateStr, parseDateStr = A.parseDateStr, minutesOf = A.minutesOf;
  var fmtHM = A.fmtHM, fmtDecimal = A.fmtDecimal, fmtDateDE = A.fmtDateDE, capitalize = A.capitalize, escapeHtml = A.escapeHtml;
  var mondayOf = A.mondayOf, calcBreakForDay = A.calcBreakForDay;
  var api = A.api;

  var APPROVER_PRIMARY = "Daniel Satzinger";
  var APPROVER_STANDIN = "Simon Demant";
  var PERMISSION_MSG = "Nur Daniel Satzinger oder Simon Demant sind dazu berechtigt.";

  var weekdayFmt = new Intl.DateTimeFormat("de-DE", { weekday: "long" });
  var dayMonthFmt = new Intl.DateTimeFormat("de-DE", { day: "2-digit", month: "long" });

  var state = {
    currentDate: toDateStr(new Date()),
    entries: [],
    absence: null,
    approval: null,
    approvalRequest: null,
    approvalWeekKey: null,
    editingId: null,
    me: null
  };

  var el = {
    brandMark: document.getElementById("brandMark"),
    brandSub: document.getElementById("brandSub"),
    whoName: document.getElementById("whoName"),
    adminLink: document.getElementById("adminLink"),
    logoutBtn: document.getElementById("logoutBtn"),
    dateLabelMain: document.getElementById("dateLabelMain"),
    dateLabelYear: document.getElementById("dateLabelYear"),
    datePicker: document.getElementById("datePicker"),
    prevDay: document.getElementById("prevDay"),
    nextDay: document.getElementById("nextDay"),
    jumpToday: document.getElementById("jumpToday"),
    entryForm: document.getElementById("entryForm"),
    fromInput: document.getElementById("fromInput"),
    toInput: document.getElementById("toInput"),
    catInput: document.getElementById("catInput"),
    noteInput: document.getElementById("noteInput"),
    addBtn: document.getElementById("addBtn"),
    cancelEditBtn: document.getElementById("cancelEditBtn"),
    formMsg: document.getElementById("formMsg"),
    entriesBody: document.getElementById("entriesBody"),
    entriesHint: document.getElementById("entriesHint"),
    dayTotal: document.getElementById("dayTotal"),
    dayTotalNote: document.getElementById("dayTotalNote"),
    histList: document.getElementById("histList"),
    weekTotal: document.getElementById("weekTotal"),
    absenceStatus: document.getElementById("absenceStatus"),
    absenceToggleBtn: document.getElementById("absenceToggleBtn"),
    absenceForm: document.getElementById("absenceForm"),
    absenceReasonSelect: document.getElementById("absenceReasonSelect"),
    absenceConfirmBtn: document.getElementById("absenceConfirmBtn"),
    absenceCancelBtn: document.getElementById("absenceCancelBtn"),
    absenceMsg: document.getElementById("absenceMsg"),
    approvalBanner: document.getElementById("approvalBanner"),
    approvalIcon: document.getElementById("approvalIcon"),
    approvalText: document.getElementById("approvalText"),
    approvalActions: document.getElementById("approvalActions"),
    approvalMsg: document.getElementById("approvalMsg"),
    vacationFrom: document.getElementById("vacationFrom"),
    vacationTo: document.getElementById("vacationTo"),
    vacationAddBtn: document.getElementById("vacationAddBtn"),
    vacationMsg: document.getElementById("vacationMsg"),
    vacationList: document.getElementById("vacationList"),
    exportFrom: document.getElementById("exportFrom"),
    exportTo: document.getElementById("exportTo"),
    exportBtn: document.getElementById("exportBtn"),
    exportMsg: document.getElementById("exportMsg")
  };

  CATEGORIES.forEach(function (c) {
    var o = document.createElement("option");
    o.value = c.id; o.textContent = c.label;
    el.catInput.appendChild(o);
  });
  function populateTimeOptions(selectEl) {
    for (var m = 0; m < 24 * 60; m += 15) {
      var o = document.createElement("option");
      o.value = fmtHM(m); o.textContent = fmtHM(m);
      selectEl.appendChild(o);
    }
  }
  populateTimeOptions(el.fromInput);
  populateTimeOptions(el.toInput);

  function chipHTML(catId) {
    var c = catById[catId] || CATEGORIES[CATEGORIES.length - 1];
    return '<span class="chip" style="background:var(--cat-' + c.var + '-soft); color:var(--cat-' + c.var + ')">'
      + '<span class="dot" style="background:var(--cat-' + c.var + ')"></span>' + c.label + '</span>';
  }

  function setToday() { state.currentDate = toDateStr(new Date()); syncDateUI(); renderAll(); }

  function syncDateUI() {
    var d = parseDateStr(state.currentDate);
    var isToday = state.currentDate === toDateStr(new Date());
    el.dateLabelMain.textContent = (isToday ? "Heute, " : "") + capitalize(weekdayFmt.format(d)) + ", " + dayMonthFmt.format(d);
    el.dateLabelYear.textContent = d.getFullYear();
    el.datePicker.value = state.currentDate;
  }

  function entriesForDate(dateStr) { return state.entries.filter(function (e) { return e.date === dateStr; }); }
  function dayNetMinutes(dateStr) {
    var dayEntries = entriesForDate(dateStr);
    var gross = dayEntries.reduce(function (s, e) { return s + e.durationMinutes; }, 0);
    return gross - calcBreakForDay(dayEntries, gross);
  }

  function renderEntryTable() {
    var todays = entriesForDate(state.currentDate).sort(function (a, b) { return a.start.localeCompare(b.start); });
    el.entriesHint.textContent = todays.length ? ("· " + todays.length + (todays.length === 1 ? " Eintrag" : " Einträge")) : "";
    if (!todays.length) {
      el.entriesBody.innerHTML = '<tr class="empty-row"><td colspan="6">Noch keine Einträge für diesen Tag.</td></tr>';
      el.dayTotal.textContent = "0:00";
      el.dayTotalNote.textContent = "";
      return;
    }
    var gross = 0;
    el.entriesBody.innerHTML = todays.map(function (e) {
      gross += e.durationMinutes;
      var rowClass = e.id === state.editingId ? ' class="editing-row"' : '';
      return '<tr' + rowClass + '>'
        + '<td class="time-cell">' + e.start + '</td>'
        + '<td class="time-cell">' + e.end + '</td>'
        + '<td class="dur-cell">' + fmtHM(e.durationMinutes) + '</td>'
        + '<td>' + chipHTML(e.category) + '</td>'
        + '<td class="note-cell" title="' + escapeHtml(e.note || "") + '">' + escapeHtml(e.note || "") + '</td>'
        + '<td><div class="row-actions">'
        + '<button class="edit-btn" data-id="' + e.id + '" aria-label="Eintrag bearbeiten">&#9998;</button>'
        + '<button class="del-btn" data-id="' + e.id + '" aria-label="Eintrag löschen">&times;</button>'
        + '</div></td></tr>';
    }).join("");
    var brk = calcBreakForDay(todays, gross);
    el.dayTotal.textContent = fmtHM(gross - brk);
    el.dayTotalNote.textContent = brk > 0 ? ("Brutto " + fmtHM(gross) + " − " + brk + " Min. Pause") : "";
  }

  function renderHistory() {
    var byDate = {};
    state.entries.forEach(function (e) { (byDate[e.date] = byDate[e.date] || []).push(e); });
    var dates = Object.keys(byDate).sort().reverse().slice(0, 30);
    if (!dates.length) {
      el.histList.innerHTML = '<div style="padding:20px 4px; color:var(--text-muted); font-size:13.5px;">Noch keine Einträge vorhanden.</div>';
      return;
    }
    el.histList.innerHTML = dates.map(function (ds) {
      var list = byDate[ds];
      var gross = list.reduce(function (s, e) { return s + e.durationMinutes; }, 0);
      var brk = calcBreakForDay(list, gross);
      var net = gross - brk;
      var totalTitle = brk > 0 ? ("Brutto " + fmtHM(gross) + " − " + brk + " Min. Pause") : "";
      var cats = {};
      list.forEach(function (e) { cats[e.category] = true; });
      var dots = Object.keys(cats).map(function (cid) {
        var c = catById[cid] || CATEGORIES[CATEGORIES.length - 1];
        return '<span class="dot" style="background:var(--cat-' + c.var + ')" title="' + c.label + '"></span>';
      }).join("");
      var d = parseDateStr(ds);
      var active = ds === state.currentDate ? " active" : "";
      return '<button class="hist-row' + active + '" data-date="' + ds + '">'
        + '<span class="hist-date">' + capitalize(weekdayFmt.format(d)) + ', ' + dayMonthFmt.format(d) + '</span>'
        + '<span class="hist-dots">' + dots + '</span>'
        + '<span class="hist-total" title="' + totalTitle + '">' + fmtHM(net) + ' Std.</span>'
        + '</button>';
    }).join("");
  }

  function currentWeekTotal() {
    var d = parseDateStr(state.currentDate);
    var mon = mondayOf(d);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    var monStr = toDateStr(mon), sunStr = toDateStr(sun);
    var datesInWeek = {};
    state.entries.forEach(function (e) { if (e.date >= monStr && e.date <= sunStr) datesInWeek[e.date] = true; });
    var total = Object.keys(datesInWeek).reduce(function (s, ds) { return s + dayNetMinutes(ds); }, 0);
    return { weekKey: monStr, total: total };
  }
  function renderWeekTotal() {
    var w = currentWeekTotal();
    el.weekTotal.textContent = fmtDecimal(w.total) + " Std.";
  }

  function renderAbsencePill() {
    var active = !!(state.absence && state.absence.active);
    if (active) {
      var reason = state.absence.reason ? " (" + escapeHtml(state.absence.reason) + ")" : "";
      el.absenceStatus.innerHTML = "Freigabe: <strong>" + APPROVER_STANDIN + "</strong>" + reason + " – Vertretung";
      el.absenceToggleBtn.textContent = "Daniel ist wieder da";
    } else {
      el.absenceStatus.innerHTML = "Freigabe: <strong>" + APPROVER_PRIMARY + "</strong>";
      el.absenceToggleBtn.textContent = "Vertretung aktivieren";
    }
  }
  function currentResponsibleApprover() {
    return (state.absence && state.absence.active) ? (APPROVER_STANDIN + " (Vertretung)") : APPROVER_PRIMARY;
  }

  function isPermissionError(err) { return err && (err.status === 403 || err.status === 401); }

  function loadApprovalStateForWeek(weekKey) {
    return Promise.all([
      api("/api/approvals/" + weekKey),
      api("/api/approval-requests/" + weekKey)
    ]).then(function (r) {
      state.approval = r[0];
      state.approvalRequest = r[1];
      renderApprovalBanner();
    });
  }

  function renderApprovalBanner() {
    var w = currentWeekTotal();
    var banner = el.approvalBanner;
    el.approvalMsg.textContent = "";

    if (state.approvalWeekKey !== w.weekKey) {
      state.approvalWeekKey = w.weekKey;
      state.approval = null;
      state.approvalRequest = null;
      loadApprovalStateForWeek(w.weekKey);
      return;
    }

    if (w.total <= APPROVAL_THRESHOLD_MINUTES) {
      banner.className = "approval-banner";
      return;
    }

    var approved = state.approval && state.approval.approvedBy;
    if (approved) {
      banner.className = "approval-banner show approved";
      el.approvalIcon.textContent = "✅";
      el.approvalText.innerHTML = "Woche ab " + fmtDateDE(w.weekKey) + " (<strong>" + fmtDecimal(w.total) + " Std.</strong>) freigegeben von "
        + escapeHtml(state.approval.approvedBy) + ", " + fmtDateDE(toDateStr(new Date(state.approval.approvedAt))) + ".";
      el.approvalActions.innerHTML = "";
      return;
    }

    banner.className = "approval-banner show pending";
    el.approvalIcon.textContent = "⚠️";
    var requested = state.approvalRequest && state.approvalRequest.requestedAt;

    if (!requested) {
      el.approvalText.innerHTML = "Woche ab " + fmtDateDE(w.weekKey) + ": <strong>" + fmtDecimal(w.total) + " Std.</strong> – mehr als 45 Std. Freigabe durch "
        + escapeHtml(currentResponsibleApprover()) + " erforderlich. Bitte Grund angeben und Freigabe anfordern.";
      el.approvalActions.innerHTML =
        '<textarea id="requestReason" class="reason-input" rows="2" maxlength="300" placeholder="Grund für die Überstunden (Pflichtfeld)"></textarea>'
        + '<button class="approve-btn" id="requestBtn" disabled>Freigabe anfordern</button>';
      var reasonInput = document.getElementById("requestReason");
      var requestBtn = document.getElementById("requestBtn");
      reasonInput.addEventListener("input", function () { requestBtn.disabled = !reasonInput.value.trim(); });
      requestBtn.addEventListener("click", function () {
        var reason = reasonInput.value.trim();
        if (!reason) return;
        requestBtn.disabled = true;
        api("/api/approval-requests/" + w.weekKey, { method: "PUT", body: { reason: reason, weekTotalMinutes: w.total } })
          .then(function () { return loadApprovalStateForWeek(w.weekKey); })
          .catch(function () {
            requestBtn.disabled = false;
            el.approvalMsg.textContent = "Anfrage fehlgeschlagen. Bitte erneut versuchen.";
          });
      });
    } else {
      el.approvalText.innerHTML = "Woche ab " + fmtDateDE(w.weekKey) + ": <strong>" + fmtDecimal(w.total) + " Std.</strong> – Freigabe angefordert am "
        + fmtDateDE(toDateStr(new Date(state.approvalRequest.requestedAt))) + ". Grund: „" + escapeHtml(state.approvalRequest.reason) + "“. Wartet auf Freigabe durch "
        + escapeHtml(currentResponsibleApprover()) + ".";
      el.approvalActions.innerHTML = '<button class="revoke-link" id="withdrawBtn">Anfrage zur&uuml;ckziehen</button>';
      document.getElementById("withdrawBtn").addEventListener("click", function () {
        var btn = this;
        btn.disabled = true;
        api("/api/approval-requests/" + w.weekKey, { method: "DELETE" })
          .then(function () { return loadApprovalStateForWeek(w.weekKey); })
          .catch(function () {
            btn.disabled = false;
            el.approvalMsg.textContent = "Zurückziehen fehlgeschlagen. Bitte erneut versuchen.";
          });
      });
    }
  }

  function renderVacationList() {
    var days = state.entries
      .filter(function (e) { return e.category === VACATION_CATEGORY; })
      .sort(function (a, b) { return b.date.localeCompare(a.date); })
      .slice(0, 40);
    if (!days.length) {
      el.vacationList.innerHTML = '<div class="vacation-empty">Noch keine Urlaubstage eingetragen.</div>';
      return;
    }
    el.vacationList.innerHTML = days.map(function (e) {
      var d = parseDateStr(e.date);
      return '<span class="vacation-chip">' + dayMonthFmt.format(d) + " " + d.getFullYear()
        + '<button class="vc-remove" data-id="' + e.id + '" aria-label="Urlaubstag entfernen">&times;</button></span>';
    }).join("");
  }

  function renderAll() {
    syncDateUI();
    renderEntryTable();
    renderHistory();
    renderWeekTotal();
    renderAbsencePill();
    renderApprovalBanner();
    renderVacationList();
  }

  function reloadEntries() {
    return api("/api/entries").then(function (list) {
      state.entries = list;
      renderAll();
    });
  }
  function reloadAbsence() {
    return api("/api/config/absence").then(function (a) {
      state.absence = a;
      renderAbsencePill();
      renderApprovalBanner();
    });
  }

  // ---- default time suggestion ----
  function suggestTimes() {
    var todays = entriesForDate(state.currentDate).sort(function (a, b) { return a.end.localeCompare(b.end); });
    var from = todays.length ? todays[todays.length - 1].end : "08:00";
    var fm = minutesOf(from) + 15;
    if (fm >= 24 * 60) fm = 24 * 60 - 15;
    el.fromInput.value = from;
    el.toInput.value = fmtHM(fm);
  }

  // ---- edit / delete ----
  function startEdit(e) {
    state.editingId = e.id;
    el.fromInput.value = e.start; el.toInput.value = e.end; el.catInput.value = e.category; el.noteInput.value = e.note || "";
    el.addBtn.textContent = "Speichern"; el.addBtn.classList.add("editing");
    el.cancelEditBtn.hidden = false; el.formMsg.textContent = "";
    renderEntryTable();
  }
  function stopEdit() {
    state.editingId = null;
    el.addBtn.textContent = "+ Eintrag"; el.addBtn.classList.remove("editing");
    el.cancelEditBtn.hidden = true; el.noteInput.value = "";
    suggestTimes(); renderEntryTable();
  }

  el.entriesBody.addEventListener("click", function (ev) {
    var editBtn = ev.target.closest(".edit-btn");
    if (editBtn) {
      var entry = state.entries.find(function (e) { return e.id === editBtn.getAttribute("data-id"); });
      if (entry) startEdit(entry);
      return;
    }
    var delBtn = ev.target.closest(".del-btn");
    if (delBtn) {
      var id = delBtn.getAttribute("data-id");
      delBtn.disabled = true;
      api("/api/entries/" + id, { method: "DELETE" }).then(function () {
        if (state.editingId === id) stopEdit();
        return reloadEntries();
      }).catch(function () {
        el.formMsg.textContent = "Eintrag konnte nicht gelöscht werden.";
        delBtn.disabled = false;
      });
    }
  });
  el.cancelEditBtn.addEventListener("click", function () { stopEdit(); });

  el.entryForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    el.formMsg.textContent = "";
    var from = el.fromInput.value, to = el.toInput.value, cat = el.catInput.value, note = el.noteInput.value.trim();
    if (!from || !to) { el.formMsg.textContent = "Bitte Von- und Bis-Zeit angeben."; return; }
    if (minutesOf(to) <= minutesOf(from)) { el.formMsg.textContent = "Die Bis-Zeit muss nach der Von-Zeit liegen."; return; }

    el.addBtn.disabled = true;
    var payload = { start: from, end: to, category: cat, note: note };
    var op;
    if (state.editingId) {
      op = api("/api/entries/" + state.editingId, { method: "PUT", body: payload });
    } else {
      payload.date = state.currentDate;
      op = api("/api/entries", { method: "POST", body: payload });
    }
    op.then(function () { return reloadEntries(); })
      .then(function () { stopEdit(); })
      .catch(function () { el.formMsg.textContent = "Eintrag konnte nicht gespeichert werden. Bitte erneut versuchen."; })
      .then(function () { el.addBtn.disabled = false; });
  });

  // ---- date navigation ----
  el.prevDay.addEventListener("click", function () {
    if (state.editingId) stopEdit();
    var d = parseDateStr(state.currentDate); d.setDate(d.getDate() - 1);
    state.currentDate = toDateStr(d); renderAll(); suggestTimes();
  });
  el.nextDay.addEventListener("click", function () {
    if (state.editingId) stopEdit();
    var d = parseDateStr(state.currentDate); d.setDate(d.getDate() + 1);
    state.currentDate = toDateStr(d); renderAll(); suggestTimes();
  });
  el.jumpToday.addEventListener("click", function () {
    if (state.editingId) stopEdit();
    setToday(); suggestTimes();
  });
  el.datePicker.addEventListener("change", function () {
    if (el.datePicker.value) {
      if (state.editingId) stopEdit();
      state.currentDate = el.datePicker.value; renderAll(); suggestTimes();
    }
  });
  el.histList.addEventListener("click", function (ev) {
    var row = ev.target.closest(".hist-row");
    if (row) {
      if (state.editingId) stopEdit();
      state.currentDate = row.getAttribute("data-date"); renderAll(); suggestTimes();
    }
  });

  // ---- absence toggle ----
  function writeAbsence(active, reason) {
    el.absenceMsg.textContent = "";
    el.absenceToggleBtn.disabled = true; el.absenceConfirmBtn.disabled = true;
    return api("/api/config/absence", { method: "PUT", body: { active: active, reason: reason || "" } })
      .then(function () { el.absenceForm.hidden = true; return reloadAbsence(); })
      .catch(function (err) {
        el.absenceMsg.textContent = isPermissionError(err) ? PERMISSION_MSG : "Aktion fehlgeschlagen. Bitte erneut versuchen.";
      }).then(function () { el.absenceToggleBtn.disabled = false; el.absenceConfirmBtn.disabled = false; });
  }
  el.absenceToggleBtn.addEventListener("click", function () {
    var active = !!(state.absence && state.absence.active);
    if (active) { writeAbsence(false, ""); }
    else { el.absenceMsg.textContent = ""; el.absenceForm.hidden = false; }
  });
  el.absenceCancelBtn.addEventListener("click", function () { el.absenceForm.hidden = true; });
  el.absenceConfirmBtn.addEventListener("click", function () { writeAbsence(true, el.absenceReasonSelect.value); });

  // ---- Urlaub ----
  var MAX_VACATION_RANGE_DAYS = 60;
  el.vacationAddBtn.addEventListener("click", function () {
    el.vacationMsg.textContent = ""; el.vacationMsg.className = "toast";
    var from = el.vacationFrom.value, to = el.vacationTo.value;
    if (!from || !to || to < from) { el.vacationMsg.textContent = "Bitte einen gültigen Zeitraum wählen."; el.vacationMsg.className = "toast err"; return; }
    el.vacationAddBtn.disabled = true;
    api("/api/vacation", { method: "POST", body: { from: from, to: to } }).then(function (r) {
      el.vacationMsg.textContent = (r.created || 0) + " Urlaubstag(e) eingetragen.";
      el.vacationMsg.className = "toast ok";
      return reloadEntries();
    }).catch(function (err) {
      el.vacationMsg.textContent = err && err.code === "range_too_large" ? ("Zeitraum zu groß (max. " + MAX_VACATION_RANGE_DAYS + " Tage).") : "Urlaubstage konnten nicht eingetragen werden.";
      el.vacationMsg.className = "toast err";
    }).then(function () { el.vacationAddBtn.disabled = false; });
  });
  el.vacationList.addEventListener("click", function (ev) {
    var btn = ev.target.closest(".vc-remove");
    if (!btn) return;
    var id = btn.getAttribute("data-id");
    btn.disabled = true;
    api("/api/entries/" + id, { method: "DELETE" }).then(function () { return reloadEntries(); }).catch(function () {
      el.vacationMsg.textContent = "Urlaubstag konnte nicht entfernt werden.";
      el.vacationMsg.className = "toast err";
    });
  });

  // ---- export ----
  function defaultExportRange() {
    var d = new Date();
    var first = new Date(d.getFullYear(), d.getMonth(), 1);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    el.exportFrom.value = toDateStr(first);
    el.exportTo.value = toDateStr(last);
  }

  el.exportBtn.addEventListener("click", function () {
    el.exportMsg.textContent = ""; el.exportMsg.className = "toast";
    if (typeof XLSX === "undefined") { el.exportMsg.textContent = "Excel-Bibliothek konnte nicht geladen werden."; el.exportMsg.className = "toast err"; return; }
    var from = el.exportFrom.value, to = el.exportTo.value;
    if (!from || !to || to < from) { el.exportMsg.textContent = "Bitte einen gültigen Zeitraum wählen."; el.exportMsg.className = "toast err"; return; }

    el.exportBtn.disabled = true;
    el.exportMsg.textContent = "Exportiere…";

    var rows = state.entries
      .filter(function (e) { return e.date >= from && e.date <= to; })
      .sort(function (a, b) { return a.date === b.date ? a.start.localeCompare(b.start) : a.date.localeCompare(b.date); });

    if (!rows.length) {
      el.exportMsg.textContent = "Keine Einträge im gewählten Zeitraum.";
      el.exportMsg.className = "toast err"; el.exportBtn.disabled = false; return;
    }

    var sheetData = rows.map(function (e) {
      return { "Datum": e.date, "Von": e.start, "Bis": e.end, "Dauer (Std.)": Math.round((e.durationMinutes / 60) * 100) / 100, "Tätigkeit": (catById[e.category] || {}).label || e.category, "Notiz": e.note || "" };
    });
    var totalMinutes = rows.reduce(function (s, e) { return s + e.durationMinutes; }, 0);
    sheetData.push({ "Datum": "", "Von": "", "Bis": "Gesamt (brutto)", "Dauer (Std.)": Math.round((totalMinutes / 60) * 100) / 100, "Tätigkeit": "", "Notiz": "" });

    var byCat = {};
    rows.forEach(function (e) { byCat[e.category] = (byCat[e.category] || 0) + e.durationMinutes; });
    var summaryData = CATEGORIES.filter(function (c) { return byCat[c.id]; }).map(function (c) { return { "Tätigkeit": c.label, "Dauer (Std.)": Math.round((byCat[c.id] / 60) * 100) / 100 }; });

    var byDay = {};
    rows.forEach(function (e) { (byDay[e.date] = byDay[e.date] || []).push(e); });
    var dayKeys = Object.keys(byDay).sort();
    var dayData = dayKeys.map(function (ds) {
      var g = byDay[ds].reduce(function (s, e) { return s + e.durationMinutes; }, 0);
      var b = calcBreakForDay(byDay[ds], g);
      return { "Datum": ds, "Brutto (Std.)": Math.round((g / 60) * 100) / 100, "Pause (Min.)": b, "Netto (Std.)": Math.round(((g - b) / 60) * 100) / 100 };
    });
    var grossAll = dayKeys.reduce(function (s, ds) { return s + byDay[ds].reduce(function (x, e) { return x + e.durationMinutes; }, 0); }, 0);
    var breakAll = dayKeys.reduce(function (s, ds) { var g = byDay[ds].reduce(function (x, e) { return x + e.durationMinutes; }, 0); return s + calcBreakForDay(byDay[ds], g); }, 0);
    dayData.push({ "Datum": "Gesamt", "Brutto (Std.)": Math.round((grossAll / 60) * 100) / 100, "Pause (Min.)": breakAll, "Netto (Std.)": Math.round(((grossAll - breakAll) / 60) * 100) / 100 });

    var wb = XLSX.utils.book_new();
    var ws1 = XLSX.utils.json_to_sheet(sheetData); ws1["!cols"] = [{ wch: 12 }, { wch: 7 }, { wch: 7 }, { wch: 13 }, { wch: 22 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, ws1, "Zeiterfassung");
    var ws3 = XLSX.utils.json_to_sheet(dayData); ws3["!cols"] = [{ wch: 12 }, { wch: 13 }, { wch: 12 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws3, "Tagesübersicht");
    var ws2 = XLSX.utils.json_to_sheet(summaryData); ws2["!cols"] = [{ wch: 22 }, { wch: 13 }];
    XLSX.utils.book_append_sheet(wb, ws2, "Nach Tätigkeit");

    var buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
    var blob = new Blob([buf], { type: "application/octet-stream" });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url; a.download = "Arbeitszeit_Rapport_Erik_" + from + "_bis_" + to + ".xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);

    el.exportMsg.textContent = "Excel-Datei wurde heruntergeladen.";
    el.exportMsg.className = "toast ok";
    el.exportBtn.disabled = false;
  });

  el.logoutBtn.addEventListener("click", function () {
    api("/api/logout", { method: "POST" }).then(function () { window.location.href = "/login.html"; });
  });

  // ---- init ----
  syncDateUI();
  defaultExportRange();
  suggestTimes();
  el.vacationFrom.value = state.currentDate;
  el.vacationTo.value = state.currentDate;

  api("/api/me").then(function (me) {
    state.me = me;
    el.brandMark.textContent = me.name.charAt(0);
    el.whoName.textContent = me.name;
    if (me.role === "admin") {
      el.adminLink.hidden = false;
      el.brandMark.classList.add("warn");
    }
    return reloadEntries();
  }).then(function () {
    return reloadAbsence();
  }).catch(function () {
    el.entriesBody.innerHTML = '<tr class="empty-row"><td colspan="6">Keine Verbindung zum Server.</td></tr>';
  });

  // light polling so changes made by others (or on another device) show up
  setInterval(function () {
    if (!state.editingId) reloadEntries().catch(function () {});
    reloadAbsence().catch(function () {});
  }, 20000);
})();
