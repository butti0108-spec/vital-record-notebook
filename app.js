(function () {
  "use strict";

  var TEST_MODE = /(?:\?|&)test=1(?:&|$)/.test(location.search);
  var STORAGE_KEY = "vital-record-notebook-records" + (TEST_MODE ? "-test" : "");
  var PROFILE_KEY = "vital-record-notebook-profile" + (TEST_MODE ? "-test" : "");
  var storageReady = false;
  var records = [];
  var profile = { birthDate: "", height: null };
  var pendingDeleteId = null;
  var lastFocusedElement = null;
  var toastTimer = null;
  var pendingWarningSignature = "";
  var importedProfileCandidate = null;
  var activePeriod = "month";

  var elements = {};

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    cacheElements();
    setupTestMode();
    setInitialValues();
    bindEvents();
    initializeStorage();
    setInterval(updateCurrentDateTime, 30000);

    if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
      navigator.serviceWorker.register("service-worker.js").catch(function () {
        // オフライン機能が使えない場合でも、記録機能はそのまま利用できます。
      });
    }
  }

  function cacheElements() {
    elements.form = document.getElementById("vitalForm");
    elements.editingId = document.getElementById("editingId");
    elements.sys = document.getElementById("sys");
    elements.dia = document.getElementById("dia");
    elements.pulse = document.getElementById("pulse");
    elements.weight = document.getElementById("weight");
    elements.temp = document.getElementById("temp");
    elements.morningFields = document.getElementById("morningFields");
    elements.editNotice = document.getElementById("editNotice");
    elements.formError = document.getElementById("formError");
    elements.saveButton = document.getElementById("saveButton");
    elements.saveButtonText = document.getElementById("saveButtonText");
    elements.cancelEditButton = document.getElementById("cancelEditButton");
    elements.historyList = document.getElementById("historyList");
    elements.recordCount = document.getElementById("recordCount");
    elements.currentDateTime = document.getElementById("currentDateTime");
    elements.currentTimingLabel = document.getElementById("currentTimingLabel");
    elements.currentTimingIcon = document.getElementById("currentTimingIcon");
    elements.currentTimingText = document.getElementById("currentTimingText");
    elements.recordTab = document.getElementById("recordTab");
    elements.chartTab = document.getElementById("chartTab");
    elements.recordView = document.getElementById("recordView");
    elements.chartView = document.getElementById("chartView");
    elements.backToFormButton = document.getElementById("backToFormButton");
    elements.exportButton = document.getElementById("exportButton");
    elements.importFile = document.getElementById("importFile");
    elements.statusToast = document.getElementById("statusToast");
    elements.statusIcon = document.getElementById("statusIcon");
    elements.statusText = document.getElementById("statusText");
    elements.confirmDialog = document.getElementById("confirmDialog");
    elements.dialogCancel = document.getElementById("dialogCancel");
    elements.dialogConfirm = document.getElementById("dialogConfirm");
    elements.bpChart = document.getElementById("bpChart");
    elements.weightChart = document.getElementById("weightChart");
    elements.bpChartEmpty = document.getElementById("bpChartEmpty");
    elements.weightChartEmpty = document.getElementById("weightChartEmpty");
    elements.profileForm = document.getElementById("profileForm");
    elements.birthDate = document.getElementById("birthDate");
    elements.height = document.getElementById("height");
    elements.profileError = document.getElementById("profileError");
    elements.profileSummary = document.getElementById("profileSummary");
    elements.profileAge = document.getElementById("profileAge");
    elements.profileHeight = document.getElementById("profileHeight");
    elements.profileWeight = document.getElementById("profileWeight");
    elements.profileBmi = document.getElementById("profileBmi");
    elements.periodButtons = document.querySelectorAll("[data-period]");
    elements.customPeriod = document.getElementById("customPeriod");
    elements.periodStart = document.getElementById("periodStart");
    elements.periodEnd = document.getElementById("periodEnd");
    elements.applyPeriodButton = document.getElementById("applyPeriodButton");
    elements.periodSummary = document.getElementById("periodSummary");
    elements.periodError = document.getElementById("periodError");
    elements.analysisCount = document.getElementById("analysisCount");
    elements.analysisBp = document.getElementById("analysisBp");
    elements.analysisPulse = document.getElementById("analysisPulse");
    elements.analysisWeight = document.getElementById("analysisWeight");
    elements.analysisTrend = document.getElementById("analysisTrend");
    elements.healthAlert = document.getElementById("healthAlert");
    elements.healthAlertHeading = document.getElementById("healthAlertHeading");
    elements.healthAlertMessages = document.getElementById("healthAlertMessages");
    elements.testModePanel = document.getElementById("testModePanel");
    elements.testScenarioButtons = document.querySelectorAll("[data-test-scenario]");
  }

  function setInitialValues() {
    var today = new Date();
    var monthStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
    elements.birthDate.max = toLocalDateString(today);
    elements.periodStart.value = toLocalDateString(monthStart);
    elements.periodEnd.value = toLocalDateString(today);
    elements.periodStart.max = toLocalDateString(today);
    elements.periodEnd.max = toLocalDateString(today);
    updateCurrentDateTime();
    updateMorningFields();
    updatePeriodSummary(getPeriodBounds());
  }

  function updateCurrentDateTime() {
    var now = new Date();
    var timing = getTimingForDate(now);
    elements.currentDateTime.textContent = formatJapaneseDate(now) + " " + formatTime(now);
    elements.currentTimingIcon.textContent = elements.editingId.value ? "✏" : (timing === "朝" ? "☀" : "🌙");
    elements.currentTimingText.textContent = elements.editingId.value ? "修正" : timing;
    if (!elements.editingId.value) updateMorningFields();
    if (storageReady) renderProfile();
  }

  function bindEvents() {
    elements.form.addEventListener("submit", handleSubmit);
    elements.cancelEditButton.addEventListener("click", cancelEditing);
    elements.recordTab.addEventListener("click", function () {
      switchView("record");
    });
    elements.chartTab.addEventListener("click", function () {
      switchView("chart");
    });
    elements.backToFormButton.addEventListener("click", function () {
      switchView("record");
    });
    elements.exportButton.addEventListener("click", exportCsv);
    elements.importFile.addEventListener("change", handleImport);
    elements.profileForm.addEventListener("submit", handleProfileSubmit);
    for (var periodIndex = 0; periodIndex < elements.periodButtons.length; periodIndex += 1) {
      elements.periodButtons[periodIndex].addEventListener("click", handlePeriodChange);
    }
    elements.applyPeriodButton.addEventListener("click", applyCustomPeriod);
    for (var testIndex = 0; testIndex < elements.testScenarioButtons.length; testIndex += 1) {
      elements.testScenarioButtons[testIndex].addEventListener("click", loadTestScenario);
    }
    elements.dialogCancel.addEventListener("click", closeDeleteDialog);
    elements.dialogConfirm.addEventListener("click", confirmDelete);

    elements.form.addEventListener("input", function () {
      pendingWarningSignature = "";
      if (!elements.formError.hidden && elements.formError.classList.contains("warning-message")) {
        hideFormError();
        setSaving(false);
      }
    });

    elements.confirmDialog.addEventListener("click", function (event) {
      if (event.target === elements.confirmDialog) {
        closeDeleteDialog();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && !elements.confirmDialog.hidden) {
        closeDeleteDialog();
      }
    });

    var resizeTimer = null;
    window.addEventListener("resize", function () {
      if (elements.chartView.hidden) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(renderCharts, 180);
    });
  }

  function setupTestMode() {
    elements.testModePanel.hidden = !TEST_MODE;
    if (!TEST_MODE) return;
    document.title = "【運用検証】バイタル記録ノート";
  }

  function loadTestScenario(event) {
    if (!TEST_MODE || !storageReady) return;
    var scenario = event.currentTarget.getAttribute("data-test-scenario");

    if (scenario === "empty") {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(PROFILE_KEY);
    } else {
      var mockRecords = createMockRecords(scenario);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(mockRecords));
      localStorage.setItem(PROFILE_KEY, JSON.stringify({
        birthDate: "1950-08-01",
        height: 150
      }));
    }

    resetForm();
    loadProfile();
    loadRecords(function () {
      switchView("chart");
      var scenarioName =
        scenario === "normal" ? "通常データ" :
        scenario === "caution" ? "注意データ" :
        scenario === "danger" ? "緊急確認データ" : "空の状態";
      showToast(scenarioName + "に切り替えました。", "success", 4200);
    });
  }

  function createMockRecords(scenario) {
    var mockRecords = [];
    var days = scenario === "normal" ? 35 : 14;
    var today = new Date();

    for (var day = 0; day < days; day += 1) {
      var recordDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day);
      var dateText = toLocalDateString(recordDate);
      var isCaution = scenario === "caution" || scenario === "danger";
      var morningSys = isCaution ? 140 + (day % 5) : 117 + (day % 6);
      var morningDia = isCaution ? 86 + (day % 4) : 70 + (day % 5);
      var nightSys = isCaution ? 137 + (day % 5) : 115 + (day % 6);
      var nightDia = isCaution ? 84 + (day % 4) : 69 + (day % 5);

      if (scenario === "danger" && day === 0) {
        nightSys = 185;
        nightDia = 121;
      }

      mockRecords.push(createMockRecord(
        scenario + "-morning-" + day,
        dateText,
        "08:00",
        "朝",
        morningSys,
        morningDia,
        66 + (day % 8),
        Math.round((50.8 + day * 0.015) * 10) / 10,
        36.3 + (day % 3) * 0.1
      ));
      mockRecords.push(createMockRecord(
        scenario + "-night-" + day,
        dateText,
        "20:00",
        "夜",
        nightSys,
        nightDia,
        scenario === "danger" && day === 0 ? 145 : 68 + (day % 8),
        null,
        null
      ));
    }
    return mockRecords;
  }

  function createMockRecord(id, date, time, timing, sys, dia, pulse, weight, temp) {
    return {
      id: "test-" + id,
      date: date,
      time: time,
      timing: timing,
      measuredAt: date + "T" + time + ":00",
      sys: sys,
      dia: dia,
      pulse: pulse,
      weight: weight,
      temp: temp,
      createdAt: date + "T" + time + ":00",
      updatedAt: null
    };
  }

  function handlePeriodChange(event) {
    activePeriod = event.currentTarget.getAttribute("data-period") || "month";
    for (var i = 0; i < elements.periodButtons.length; i += 1) {
      var isActive = elements.periodButtons[i].getAttribute("data-period") === activePeriod;
      elements.periodButtons[i].classList.toggle("is-active", isActive);
      elements.periodButtons[i].setAttribute("aria-pressed", String(isActive));
    }
    elements.customPeriod.hidden = activePeriod !== "custom";
    elements.periodError.hidden = true;
    if (activePeriod === "custom") {
      elements.periodStart.focus();
    }
    renderDashboard();
  }

  function applyCustomPeriod() {
    var start = elements.periodStart.value;
    var end = elements.periodEnd.value;
    if (!start || !end) {
      showPeriodError("開始日と終了日を入力してください。");
      return;
    }
    if (start > end) {
      showPeriodError("開始日は終了日より前の日付にしてください。");
      return;
    }
    elements.periodError.hidden = true;
    renderDashboard();
  }

  function showPeriodError(message) {
    elements.periodError.textContent = message;
    elements.periodError.hidden = false;
  }

  function getPeriodBounds() {
    var today = new Date();
    var endText = toLocalDateString(today);
    var startDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var label = "直近1か月";

    if (activePeriod === "week") {
      startDate.setDate(startDate.getDate() - 6);
      label = "直近1週間";
    } else if (activePeriod === "year") {
      startDate.setDate(startDate.getDate() - 364);
      label = "直近1年";
    } else if (activePeriod === "custom") {
      return {
        start: elements.periodStart.value,
        end: elements.periodEnd.value,
        label: "指定期間"
      };
    } else {
      startDate.setDate(startDate.getDate() - 29);
    }

    return {
      start: toLocalDateString(startDate),
      end: endText,
      label: label
    };
  }

  function getFilteredRecords() {
    var bounds = getPeriodBounds();
    if (!bounds.start || !bounds.end || bounds.start > bounds.end) return [];
    return records.filter(function (record) {
      return record.date >= bounds.start && record.date <= bounds.end;
    });
  }

  function updatePeriodSummary(bounds) {
    if (!bounds || !bounds.start || !bounds.end) {
      elements.periodSummary.textContent = "表示期間を入力してください。";
      return;
    }
    elements.periodSummary.textContent =
      bounds.label + "：" + formatShortJapaneseDate(bounds.start) + " ～ " + formatShortJapaneseDate(bounds.end);
  }

  function initializeStorage() {
    if (!window.localStorage) {
      showToast("このスマートフォンでは記録を保存できません。", "error", 6000);
      elements.saveButton.disabled = true;
      return;
    }

    try {
      storageReady = true;
      loadProfile();
      loadRecords();
    } catch (error) {
      storageReady = false;
      showToast("記録の保存場所を準備できませんでした。", "error", 6000);
      elements.saveButton.disabled = true;
    }
  }

  function loadProfile() {
    try {
      var saved = localStorage.getItem(PROFILE_KEY);
      var parsed = saved ? JSON.parse(saved) : null;
      profile = parsed && typeof parsed === "object"
        ? { birthDate: String(parsed.birthDate || ""), height: hasValue(parsed.height) ? Number(parsed.height) : null }
        : { birthDate: "", height: null };
      elements.birthDate.value = profile.birthDate;
      elements.height.value = hasValue(profile.height) ? profile.height : "";
      renderProfile();
    } catch (error) {
      profile = { birthDate: "", height: null };
      renderProfile();
    }
  }

  function handleProfileSubmit(event) {
    event.preventDefault();
    elements.profileError.hidden = true;
    elements.profileError.textContent = "";

    var birthDate = elements.birthDate.value;
    var height = Number(elements.height.value);
    var age = calculateAge(birthDate, new Date());

    if (!birthDate) {
      showProfileError("生年月日を入力してください。", elements.birthDate);
      return;
    }
    if (age === null || age < 0 || age > 120) {
      showProfileError("生年月日をご確認ください。", elements.birthDate);
      return;
    }
    if (elements.height.value === "" || !isFinite(height) || height < 80 || height > 220) {
      showProfileError("身長は80～220cmの範囲で入力してください。", elements.height);
      return;
    }

    profile = { birthDate: birthDate, height: Math.round(height * 10) / 10 };
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
      elements.height.value = profile.height;
      renderProfile();
      showToast("体の情報を保存しました。", "success", 3800);
    } catch (error) {
      showProfileError("体の情報を保存できませんでした。", null);
    }
  }

  function showProfileError(message, element) {
    elements.profileError.textContent = message;
    elements.profileError.hidden = false;
    if (element) element.focus();
  }

  function renderProfile() {
    var age = calculateAge(profile.birthDate, new Date());
    var latestWeight = getLatestMorningWeight();
    var validHeight = hasValue(profile.height) && profile.height > 0;

    elements.profileAge.textContent = age === null ? "未設定" : age + "歳";
    elements.profileHeight.textContent = validHeight ? formatOneDecimal(profile.height) + "cm" : "未設定";
    elements.profileWeight.textContent = latestWeight === null ? "記録なし" : formatOneDecimal(latestWeight) + "kg";

    if (validHeight && latestWeight !== null) {
      var heightMeters = profile.height / 100;
      var bmi = latestWeight / (heightMeters * heightMeters);
      elements.profileBmi.textContent = formatOneDecimal(bmi);
    } else {
      elements.profileBmi.textContent = "―";
    }

    elements.profileSummary.textContent = age !== null && validHeight
      ? age + "歳・" + formatOneDecimal(profile.height) + "cm"
      : "未設定";
  }

  function getLatestMorningWeight() {
    for (var i = 0; i < records.length; i += 1) {
      if (records[i].timing === "朝" && hasValue(records[i].weight)) {
        return Number(records[i].weight);
      }
    }
    return null;
  }

  function loadRecords(callback) {
    if (!storageReady) return;
    try {
      var saved = localStorage.getItem(STORAGE_KEY);
      records = saved ? JSON.parse(saved) : [];
      if (!Array.isArray(records)) records = [];
      sortRecords();
      renderHistory();
      renderProfile();
      if (!elements.chartView.hidden) renderDashboard();
      if (callback) callback();
    } catch (error) {
      records = [];
      renderHistory();
      showToast("記録を読み込めませんでした。", "error");
    }
  }

  function persistRecords() {
    if (!storageReady) return false;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
      return true;
    } catch (error) {
      return false;
    }
  }

  function sortRecords() {
    records.sort(function (a, b) {
      var aKey = String(a.measuredAt || "") || String(a.date || "") + String(a.time || "") + String(a.createdAt || "");
      var bKey = String(b.measuredAt || "") || String(b.date || "") + String(b.time || "") + String(b.createdAt || "");
      return bKey.localeCompare(aKey);
    });
  }

  function handleSubmit(event) {
    event.preventDefault();
    hideFormError();

    if (!storageReady) {
      showFormError("保存場所を準備しています。少し待ってからもう一度押してください。");
      return;
    }

    var existingId = elements.editingId.value;
    var existingRecord = existingId ? findRecord(existingId) : null;
    var saveMoment = new Date();
    var timing = existingRecord ? existingRecord.timing : getTimingForDate(saveMoment);
    var sys = Number(elements.sys.value);
    var dia = Number(elements.dia.value);
    var pulse = Number(elements.pulse.value);
    var weight = elements.weight.value === "" ? null : Number(elements.weight.value);
    var temp = elements.temp.value === "" ? null : Number(elements.temp.value);
    var validation = validateVitalValues(sys, dia, pulse, weight, temp, timing);

    if (validation) {
      pendingWarningSignature = "";
      showFormError(validation.message);
      if (validation.element) validation.element.focus();
      return;
    }

    var warningSignature = [existingId, sys, dia, pulse, weight, temp].join("|");
    var warning = getPlausibilityWarning(sys, dia, pulse, weight, temp, timing);
    if (warning && pendingWarningSignature !== warningSignature) {
      pendingWarningSignature = warningSignature;
      showFormWarning(warning + " 入力が正しければ、もう一度「確認して保存する」を押してください。");
      elements.saveButtonText.textContent = "確認して保存する";
      return;
    }

    pendingWarningSignature = "";
    var measuredAt = existingRecord
      ? (existingRecord.measuredAt || existingRecord.createdAt || buildMeasuredAt(existingRecord.date, existingRecord.time, saveMoment.toISOString()))
      : saveMoment.toISOString();
    var measurementDate = existingRecord ? existingRecord.date : toLocalDateString(saveMoment);
    var measurementTime = existingRecord
      ? (existingRecord.time || timeFromStoredDate(existingRecord.createdAt))
      : formatTime(saveMoment);
    var record = {
      id: existingId || createId(),
      date: measurementDate,
      time: measurementTime,
      timing: timing,
      measuredAt: measuredAt,
      sys: sys,
      dia: dia,
      pulse: pulse,
      weight: timing === "朝" ? weight : null,
      temp: timing === "朝" ? temp : null,
      createdAt: existingRecord && existingRecord.createdAt ? existingRecord.createdAt : saveMoment.toISOString(),
      updatedAt: existingRecord ? saveMoment.toISOString() : null
    };

    setSaving(true);

    var replaced = false;
    for (var recordIndex = 0; recordIndex < records.length; recordIndex += 1) {
      if (records[recordIndex].id === record.id) {
        records[recordIndex] = record;
        replaced = true;
        break;
      }
    }
    if (!replaced) records.push(record);

    if (persistRecords()) {
      var wasEditing = Boolean(existingId);
      resetForm();
      setSaving(false);
      loadRecords(function () {
        var resultText = "血圧" + sys + "/" + dia + "、脈拍" + pulse + "を";
        showToast(resultText + (wasEditing ? "修正しました。" : "保存しました。"), "success", 5200);
      });
    } else {
      setSaving(false);
      showFormError("保存できませんでした。もう一度お試しください。");
    }
  }

  function validateVitalValues(sys, dia, pulse, weight, temp, timing) {
    if (elements.sys.value === "") {
      return { message: "最高血圧を入力してください。", element: elements.sys };
    }
    if (sys < 40 || sys > 300) {
      return { message: "最高血圧が入力できる範囲外です。40～300の範囲で入力してください。入力値：" + sys, element: elements.sys };
    }
    if (elements.dia.value === "") {
      return { message: "最低血圧を入力してください。", element: elements.dia };
    }
    if (dia < 30 || dia > 200) {
      return { message: "最低血圧が入力できる範囲外です。30～200の範囲で入力してください。入力値：" + dia, element: elements.dia };
    }
    if (dia >= sys) {
      return { message: "最低血圧が最高血圧以上になっています。最高・最低の入力欄をご確認ください。", element: elements.dia };
    }
    if (elements.pulse.value === "") {
      return { message: "脈拍を入力してください。", element: elements.pulse };
    }
    if (pulse < 20 || pulse > 250) {
      return { message: "脈拍が入力できる範囲外です。20～250の範囲で入力してください。入力値：" + pulse, element: elements.pulse };
    }
    if (timing === "朝" && weight !== null && (weight < 20 || weight > 200)) {
      return { message: "体重が入力できる範囲外です。20～200kgの範囲で入力してください。入力値：" + weight, element: elements.weight };
    }
    if (timing === "朝" && temp !== null && (temp < 30 || temp > 45)) {
      return { message: "体温が入力できる範囲外です。30.0～45.0℃の範囲で入力してください。入力値：" + temp, element: elements.temp };
    }
    return null;
  }

  function getPlausibilityWarning(sys, dia, pulse, weight, temp, timing) {
    var warnings = [];
    if (sys <= 80 || sys >= 180) warnings.push("最高血圧が通常と大きく異なる値（" + sys + "）です。");
    if (dia <= 50 || dia >= 120) warnings.push("最低血圧が通常と大きく異なる値（" + dia + "）です。");
    if (pulse <= 40 || pulse >= 140) warnings.push("脈拍が通常と大きく異なる値（" + pulse + "）です。");
    if (timing === "朝" && temp !== null && (temp < 35 || temp >= 39)) {
      warnings.push("体温が通常と大きく異なる値（" + temp + "℃）です。");
    }
    if (timing === "朝" && weight !== null && (weight < 30 || weight > 150)) {
      warnings.push("体重が通常と大きく異なる値（" + weight + "kg）です。");
    }
    return warnings.join(" ");
  }

  function setSaving(isSaving) {
    elements.saveButton.disabled = isSaving;
    elements.saveButtonText.textContent = isSaving
      ? "保存しています…"
      : (elements.editingId.value ? "修正した内容を保存する" : "この内容で保存する");
  }

  function resetForm() {
    elements.editingId.value = "";
    elements.sys.value = "";
    elements.dia.value = "";
    elements.pulse.value = "";
    elements.weight.value = "";
    elements.temp.value = "";
    elements.editNotice.hidden = true;
    elements.editNotice.textContent = "";
    pendingWarningSignature = "";
    updateCurrentDateTime();
    updateMorningFields();
    elements.saveButtonText.textContent = "この内容で保存する";
    elements.cancelEditButton.hidden = true;
    hideFormError();
  }

  function cancelEditing() {
    resetForm();
    showToast("修正を取り消しました。", "info", 2800);
  }

  function updateMorningFields() {
    var isMorning = getActiveTiming() === "朝";
    elements.morningFields.hidden = !isMorning;
    elements.morningFields.parentElement.classList.toggle("has-morning-fields", isMorning);
  }

  function getActiveTiming() {
    var editingRecord = elements.editingId.value ? findRecord(elements.editingId.value) : null;
    return editingRecord ? editingRecord.timing : getTimingForDate(new Date());
  }

  function getTimingForDate(date) {
    var hour = date.getHours();
    return hour >= 3 && hour < 15 ? "朝" : "夜";
  }

  function renderHistory() {
    elements.historyList.innerHTML = "";
    elements.recordCount.textContent = records.length + "件";

    if (records.length === 0) {
      var empty = document.createElement("p");
      empty.className = "empty-history";
      empty.textContent = "まだ記録がありません。上の欄から入力してください。";
      elements.historyList.appendChild(empty);
      return;
    }

    var displayed = records.slice(0, 14);
    for (var i = 0; i < displayed.length; i += 1) {
      elements.historyList.appendChild(createHistoryCard(displayed[i]));
    }
  }

  function createHistoryCard(record) {
    var article = document.createElement("article");
    var alertLevel = getRecordAlertLevel(record);
    article.className = "history-card" + (alertLevel ? " is-" + alertLevel : "");

    var head = document.createElement("div");
    head.className = "history-head";

    var date = document.createElement("span");
    date.className = "history-date";
    date.textContent = formatRecordDate(record.date) + " " + getRecordTime(record);

    var timing = document.createElement("span");
    timing.className = "timing-badge " + (record.timing === "朝" ? "morning" : "night");
    timing.textContent = record.timing === "朝" ? "☀ 朝" : "🌙 夜";

    var badges = document.createElement("div");
    badges.className = "history-badges";
    badges.appendChild(timing);
    if (alertLevel) {
      var alertBadge = document.createElement("span");
      alertBadge.className = "history-alert-badge " + alertLevel;
      alertBadge.textContent = alertLevel === "danger" ? "⚠ すぐ確認" : "△ 高め・注意";
      badges.appendChild(alertBadge);
    }

    head.appendChild(date);
    head.appendChild(badges);

    var primary = document.createElement("p");
    primary.className = "vital-primary";
    primary.textContent = record.sys + " / " + record.dia + " ";
    var unit = document.createElement("small");
    unit.textContent = "mmHg";
    primary.appendChild(unit);

    var secondary = document.createElement("p");
    secondary.className = "vital-secondary";
    appendDetail(secondary, "脈拍 " + record.pulse + "回/分");
    if (hasValue(record.weight)) appendDetail(secondary, "体重 " + record.weight + "kg");
    if (hasValue(record.temp)) appendDetail(secondary, "体温 " + record.temp + "℃");

    var actions = document.createElement("div");
    actions.className = "history-actions";

    var editButton = document.createElement("button");
    editButton.type = "button";
    editButton.className = "edit-button";
    editButton.textContent = "✏ 修正する";
    editButton.addEventListener("click", function () {
      startEditing(record.id);
    });

    var deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "delete-button";
    deleteButton.textContent = "🗑 削除する";
    deleteButton.addEventListener("click", function () {
      openDeleteDialog(record.id, deleteButton);
    });

    actions.appendChild(editButton);
    actions.appendChild(deleteButton);
    article.appendChild(head);
    article.appendChild(primary);
    article.appendChild(secondary);
    article.appendChild(actions);
    return article;
  }

  function getRecordAlertLevel(record) {
    var sys = Number(record.sys);
    var dia = Number(record.dia);
    var pulse = Number(record.pulse);
    var temp = hasValue(record.temp) ? Number(record.temp) : null;

    if (sys >= 180 || dia >= 120 || pulse <= 40 || pulse >= 140 || (temp !== null && temp >= 39)) {
      return "danger";
    }
    if (
      sys >= 135 || dia >= 85 ||
      sys <= 80 || dia <= 50 ||
      pulse <= 50 || pulse >= 120 ||
      (temp !== null && temp >= 38)
    ) {
      return "caution";
    }
    return "";
  }

  function appendDetail(parent, text) {
    var span = document.createElement("span");
    span.textContent = text;
    parent.appendChild(span);
  }

  function startEditing(id) {
    var record = findRecord(id);
    if (!record) return;

    switchView("record");
    elements.editingId.value = record.id;
    updateCurrentDateTime();
    elements.sys.value = record.sys;
    elements.dia.value = record.dia;
    elements.pulse.value = record.pulse;
    elements.weight.value = hasValue(record.weight) ? record.weight : "";
    elements.temp.value = hasValue(record.temp) ? record.temp : "";
    updateMorningFields();
    elements.editNotice.textContent =
      formatRecordDate(record.date) + " " + getRecordTime(record) + "（" + record.timing + "）の数値を修正しています。測定日時は変更されません。";
    elements.editNotice.hidden = false;
    elements.saveButtonText.textContent = "修正した内容を保存する";
    elements.cancelEditButton.hidden = false;
    hideFormError();

    scrollElementIntoView(document.getElementById("recordHeading"));
    setTimeout(function () {
      elements.sys.focus();
    }, 350);
  }

  function openDeleteDialog(id, sourceButton) {
    pendingDeleteId = id;
    lastFocusedElement = sourceButton || document.activeElement;
    elements.confirmDialog.hidden = false;
    document.body.style.overflow = "hidden";
    elements.dialogCancel.focus();
  }

  function closeDeleteDialog() {
    pendingDeleteId = null;
    elements.confirmDialog.hidden = true;
    document.body.style.overflow = "";
    if (lastFocusedElement && document.body.contains(lastFocusedElement)) {
      lastFocusedElement.focus();
    }
  }

  function confirmDelete() {
    if (!pendingDeleteId || !storageReady) return;

    var id = pendingDeleteId;
    elements.dialogConfirm.disabled = true;
    records = records.filter(function (record) {
      return record.id !== id;
    });

    if (persistRecords()) {
      elements.dialogConfirm.disabled = false;
      closeDeleteDialog();
      if (elements.editingId.value === id) resetForm();
      loadRecords(function () {
        showToast("記録を削除しました。", "info", 3500);
      });
    } else {
      elements.dialogConfirm.disabled = false;
      closeDeleteDialog();
      showToast("削除できませんでした。", "error");
    }
  }

  function switchView(viewName) {
    var showChart = viewName === "chart";
    elements.recordView.hidden = showChart;
    elements.chartView.hidden = !showChart;
    elements.recordTab.classList.toggle("is-active", !showChart);
    elements.chartTab.classList.toggle("is-active", showChart);
    elements.recordTab.setAttribute("aria-selected", String(!showChart));
    elements.chartTab.setAttribute("aria-selected", String(showChart));

    if (showChart) {
      setTimeout(renderDashboard, 30);
    }
    window.scrollTo(0, 0);
  }

  function exportCsv() {
    if (records.length === 0) {
      showToast("保存する記録がありません。", "error");
      return;
    }

    var headers = ["ID", "測定日時", "日付", "測定時刻", "時間帯", "最高血圧(mmHg)", "最低血圧(mmHg)", "脈拍(回/分)", "体重(kg)", "体温(℃)", "登録日時", "修正日時", "生年月日", "身長(cm)"];
    var rows = [headers];

    for (var i = 0; i < records.length; i += 1) {
      var r = records[i];
      rows.push([
        r.id,
        r.measuredAt || "",
        r.date,
        getRecordTime(r),
        r.timing,
        r.sys,
        r.dia,
        r.pulse,
        hasValue(r.weight) ? r.weight : "",
        hasValue(r.temp) ? r.temp : "",
        r.createdAt || "",
        r.updatedAt || "",
        profile.birthDate || "",
        hasValue(profile.height) ? profile.height : ""
      ]);
    }

    var csv = "\uFEFF" + rows.map(function (row) {
      return row.map(csvEscape).join(",");
    }).join("\r\n");

    var blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = "バイタル記録_" + toLocalDateString(new Date()) + ".csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    showToast("CSVファイルに保存しました。", "success", 4200);
  }

  function handleImport(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function () {
      try {
        var imported = parseCsvRecords(String(reader.result || ""));
        if (imported.length === 0) {
          throw new Error("記録が見つかりません");
        }
        saveImportedRecords(imported);
      } catch (error) {
        showToast("CSVを読み込めませんでした。ファイルをご確認ください。", "error", 6000);
      }
      elements.importFile.value = "";
    };
    reader.onerror = function () {
      showToast("ファイルを読み込めませんでした。", "error");
      elements.importFile.value = "";
    };
    reader.readAsText(file);
  }

  function parseCsvRecords(text) {
    importedProfileCandidate = null;
    text = text.replace(/^\uFEFF/, "");
    var rows = parseCsv(text);
    if (rows.length < 2) return [];

    var header = rows[0];
    var index = {};
    for (var i = 0; i < header.length; i += 1) {
      index[header[i].trim()] = i;
    }

    var dateIndex = findHeaderIndex(index, ["日付"]);
    var timeIndex = findHeaderIndex(index, ["測定時刻"]);
    var timingIndex = findHeaderIndex(index, ["時間帯"]);
    var sysIndex = findHeaderIndex(index, ["最高血圧(mmHg)", "最高血圧"]);
    var diaIndex = findHeaderIndex(index, ["最低血圧(mmHg)", "最低血圧"]);
    var pulseIndex = findHeaderIndex(index, ["脈拍(回/分)", "脈拍"]);
    var weightIndex = findHeaderIndex(index, ["体重(kg)", "体重"]);
    var tempIndex = findHeaderIndex(index, ["体温(℃)", "体温"]);
    var idIndex = findHeaderIndex(index, ["ID"]);
    var measuredIndex = findHeaderIndex(index, ["測定日時"]);
    var createdIndex = findHeaderIndex(index, ["登録日時"]);
    var updatedIndex = findHeaderIndex(index, ["修正日時"]);
    var birthDateIndex = findHeaderIndex(index, ["生年月日"]);
    var heightIndex = findHeaderIndex(index, ["身長(cm)", "身長"]);

    if (dateIndex < 0 || sysIndex < 0 || diaIndex < 0 || pulseIndex < 0) {
      throw new Error("必要な列がありません");
    }

    var imported = [];
    for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      var row = rows[rowIndex];
      if (row.join("").trim() === "") continue;

      var sys = Number(row[sysIndex]);
      var dia = Number(row[diaIndex]);
      var pulse = Number(row[pulseIndex]);
      var date = String(row[dateIndex] || "").trim();
      if (
        !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
        !isFinite(sys) || sys < 40 || sys > 300 ||
        !isFinite(dia) || dia < 30 || dia > 200 || dia >= sys ||
        !isFinite(pulse) || pulse < 20 || pulse > 250
      ) {
        continue;
      }

      var weightValue = weightIndex >= 0 ? String(row[weightIndex] || "").trim() : "";
      var tempValue = tempIndex >= 0 ? String(row[tempIndex] || "").trim() : "";
      var importedWeight = weightValue !== "" && isFinite(Number(weightValue)) ? Number(weightValue) : null;
      var importedTemp = tempValue !== "" && isFinite(Number(tempValue)) ? Number(tempValue) : null;
      if (
        (importedWeight !== null && (importedWeight < 20 || importedWeight > 200)) ||
        (importedTemp !== null && (importedTemp < 30 || importedTemp > 45))
      ) {
        continue;
      }
      var importedTime = timeIndex >= 0 && row[timeIndex] ? String(row[timeIndex]) : "";
      var importedCreatedAt = createdIndex >= 0 && row[createdIndex] ? String(row[createdIndex]) : new Date().toISOString();
      var importedMeasuredAt = measuredIndex >= 0 && row[measuredIndex]
        ? String(row[measuredIndex])
        : buildMeasuredAt(date, importedTime, importedCreatedAt);
      if (!importedProfileCandidate && birthDateIndex >= 0 && heightIndex >= 0) {
        var importedBirthDate = String(row[birthDateIndex] || "");
        var importedHeight = Number(row[heightIndex]);
        var importedAge = calculateAge(importedBirthDate, new Date());
        if (importedAge !== null && importedAge >= 0 && importedAge <= 120 && importedHeight >= 80 && importedHeight <= 220) {
          importedProfileCandidate = { birthDate: importedBirthDate, height: importedHeight };
        }
      }
      imported.push({
        id: idIndex >= 0 && row[idIndex] ? String(row[idIndex]) : createId(),
        date: date,
        time: importedTime || timeFromStoredDate(importedMeasuredAt),
        timing: timingIndex >= 0 && row[timingIndex] === "夜" ? "夜" : "朝",
        measuredAt: importedMeasuredAt,
        sys: sys,
        dia: dia,
        pulse: pulse,
        weight: importedWeight,
        temp: importedTemp,
        createdAt: importedCreatedAt,
        updatedAt: updatedIndex >= 0 && row[updatedIndex] ? String(row[updatedIndex]) : null
      });
    }
    return imported;
  }

  function saveImportedRecords(imported) {
    if (!storageReady) return;
    var byId = {};
    for (var currentIndex = 0; currentIndex < records.length; currentIndex += 1) {
      byId[records[currentIndex].id] = records[currentIndex];
    }
    for (var i = 0; i < imported.length; i += 1) {
      byId[imported[i].id] = imported[i];
    }
    records = Object.keys(byId).map(function (id) {
      return byId[id];
    });

    if (persistRecords()) {
      if (importedProfileCandidate) {
        profile = importedProfileCandidate;
        localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
        elements.birthDate.value = profile.birthDate;
        elements.height.value = profile.height;
      }
      loadRecords(function () {
        showToast(imported.length + "件の記録を読み込みました。", "success", 5200);
      });
    } else {
      showToast("CSVの記録を保存できませんでした。", "error");
    }
  }

  function parseCsv(text) {
    var rows = [];
    var row = [];
    var field = "";
    var inQuotes = false;

    for (var i = 0; i < text.length; i += 1) {
      var char = text[i];
      var next = text[i + 1];

      if (char === '"' && inQuotes && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === "," && !inQuotes) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !inQuotes) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(field);
        rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    if (field !== "" || row.length > 0) {
      row.push(field);
      rows.push(row);
    }
    return rows;
  }

  function findHeaderIndex(index, names) {
    for (var i = 0; i < names.length; i += 1) {
      if (Object.prototype.hasOwnProperty.call(index, names[i])) return index[names[i]];
    }
    return -1;
  }

  function csvEscape(value) {
    var text = String(value === null || value === undefined ? "" : value);
    return '"' + text.replace(/"/g, '""') + '"';
  }

  function renderDashboard() {
    var filtered = getFilteredRecords();
    updatePeriodSummary(getPeriodBounds());
    renderAnalysis(filtered);
    renderHealthAlerts(filtered);
    renderCharts(filtered);
  }

  function renderAnalysis(filteredRecords) {
    elements.analysisCount.textContent = filteredRecords.length + "回";
    if (filteredRecords.length === 0) {
      elements.analysisBp.textContent = "―";
      elements.analysisPulse.textContent = "―";
      elements.analysisWeight.textContent = "―";
      elements.analysisTrend.textContent = "この期間には記録がありません。";
      return;
    }

    var avgSys = averageValue(filteredRecords, "sys");
    var avgDia = averageValue(filteredRecords, "dia");
    var avgPulse = averageValue(filteredRecords, "pulse");
    elements.analysisBp.textContent = Math.round(avgSys) + " / " + Math.round(avgDia);
    elements.analysisPulse.textContent = Math.round(avgPulse) + "回/分";

    var chronological = filteredRecords.slice().reverse();
    var weightRecords = chronological.filter(function (record) {
      return hasValue(record.weight);
    });
    if (weightRecords.length === 0) {
      elements.analysisWeight.textContent = "記録なし";
    } else if (weightRecords.length === 1) {
      elements.analysisWeight.textContent = formatOneDecimal(weightRecords[0].weight) + "kg";
    } else {
      var weightDifference = Number(weightRecords[weightRecords.length - 1].weight) - Number(weightRecords[0].weight);
      var weightPrefix = weightDifference > 0 ? "+" : "";
      elements.analysisWeight.textContent = weightPrefix + formatOneDecimal(weightDifference) + "kg";
    }

    elements.analysisTrend.textContent = buildTrendText(chronological);
  }

  function buildTrendText(chronological) {
    if (chronological.length < 4) {
      return "傾向を見るには、同じ期間内に4回以上の記録が必要です。";
    }

    var middle = Math.floor(chronological.length / 2);
    var earlier = chronological.slice(0, middle);
    var later = chronological.slice(middle);
    var sysChange = averageValue(later, "sys") - averageValue(earlier, "sys");
    var diaChange = averageValue(later, "dia") - averageValue(earlier, "dia");
    var pulseChange = averageValue(later, "pulse") - averageValue(earlier, "pulse");
    var trends = [];

    if (sysChange >= 5 || diaChange >= 5) {
      trends.push("血圧は期間の前半より後半が高めです。");
    } else if (sysChange <= -5 || diaChange <= -5) {
      trends.push("血圧は期間の前半より後半が低めです。");
    } else {
      trends.push("血圧に大きな上昇・低下は見られません。");
    }

    if (pulseChange >= 8) {
      trends.push("脈拍は後半がやや速くなっています。");
    } else if (pulseChange <= -8) {
      trends.push("脈拍は後半がやや遅くなっています。");
    }
    return trends.join(" ");
  }

  function renderHealthAlerts(filteredRecords) {
    elements.healthAlertMessages.innerHTML = "";
    elements.healthAlert.classList.remove("is-ok", "is-caution", "is-danger");

    if (filteredRecords.length === 0) {
      elements.healthAlert.classList.add("is-ok");
      elements.healthAlertHeading.textContent = "今回の確認";
      appendHealthMessage("この期間には確認できる記録がありません。");
      return;
    }

    var latest = filteredRecords[0];
    var severity = "ok";
    var latestDate = formatRecordDate(latest.date);
    var urgentBp = Number(latest.sys) >= 180 || Number(latest.dia) >= 120;
    var urgentPulse = Number(latest.pulse) <= 40 || Number(latest.pulse) >= 140;

    if (urgentBp) {
      severity = "danger";
      appendHealthMessage(latestDate + "の血圧は、すぐに確認が必要な値です。1分程度安静にして測り直してください。胸痛、息苦しさ、ろれつが回らない、手足のまひ、激しい頭痛などがある場合は119番を検討してください。症状がなくても、早めに医療機関へ相談してください。");
    }
    if (urgentPulse) {
      severity = "danger";
      appendHealthMessage(latestDate + "の脈拍は大きく外れた値です。安静にして測り直し、胸痛・息苦しさ・めまい・意識が遠のく感じがある場合は、救急要請を検討してください。");
    }
    if (hasValue(latest.temp) && Number(latest.temp) >= 39) {
      severity = "danger";
      appendHealthMessage(latestDate + "の体温は39℃以上です。水分をとり、強いだるさ・息苦しさ・意識の変化などがあれば、速やかに医療機関へ相談してください。");
    }

    var avgSys = averageValue(filteredRecords, "sys");
    var avgDia = averageValue(filteredRecords, "dia");
    if (countUniqueRecordDates(filteredRecords) >= 5 && (avgSys >= 135 || avgDia >= 85)) {
      if (severity !== "danger") severity = "caution";
      appendHealthMessage("5日以上記録した家庭血圧の平均が135/85mmHg以上です。記録を医療機関に見せて相談してください。");
    }
    if (!urgentBp && (Number(latest.sys) <= 80 || Number(latest.dia) <= 50)) {
      if (severity !== "danger") severity = "caution";
      appendHealthMessage(latestDate + "の血圧は低めです。めまい・ふらつき・冷や汗などがある場合は、医療機関へ相談してください。");
    }
    if (!urgentPulse && (Number(latest.pulse) <= 50 || Number(latest.pulse) >= 120)) {
      if (severity !== "danger") severity = "caution";
      appendHealthMessage(latestDate + "の脈拍は注意が必要な範囲です。安静にして測り直し、続く場合は医療機関へ相談してください。");
    }
    if (hasValue(latest.temp) && Number(latest.temp) >= 38 && Number(latest.temp) < 39) {
      if (severity !== "danger") severity = "caution";
      appendHealthMessage(latestDate + "の体温は38℃以上です。体調を確認し、症状が強い場合や発熱が続く場合は医療機関へ相談してください。");
    }

    if (!elements.healthAlertMessages.children.length) {
      appendHealthMessage("今回の集計では、強い注意が必要な値は見つかりませんでした。引き続き同じ条件で記録してください。");
    }

    elements.healthAlert.classList.add("is-" + severity);
    elements.healthAlertHeading.textContent =
      severity === "danger" ? "すぐに確認してください" :
      severity === "caution" ? "注意して確認してください" : "今回の確認";
  }

  function appendHealthMessage(message) {
    var paragraph = document.createElement("p");
    paragraph.className = "health-alert-message";
    paragraph.textContent = message;
    elements.healthAlertMessages.appendChild(paragraph);
  }

  function averageValue(recordList, key) {
    var total = 0;
    for (var i = 0; i < recordList.length; i += 1) {
      total += Number(recordList[i][key]);
    }
    return recordList.length ? total / recordList.length : 0;
  }

  function countUniqueRecordDates(recordList) {
    var dates = {};
    for (var i = 0; i < recordList.length; i += 1) {
      dates[recordList[i].date] = true;
    }
    return Object.keys(dates).length;
  }

  function renderCharts(filteredRecords) {
    var chronological = (filteredRecords || getFilteredRecords()).slice().reverse();
    drawLineChart(elements.bpChart, chronological, {
      datasets: [
        { key: "sys", color: "#cf3030", label: "最高" },
        { key: "dia", color: "#1769c2", label: "最低" },
        { key: "pulse", color: "#a12a70", label: "脈拍" }
      ],
      fixedMin: 30,
      minimumMax: 180
    }, elements.bpChartEmpty);

    var weightRecords = chronological.filter(function (record) {
      return hasValue(record.weight);
    });
    drawLineChart(elements.weightChart, weightRecords, {
      datasets: [{ key: "weight", color: "#168553", label: "体重" }],
      padding: 2
    }, elements.weightChartEmpty);
  }

  function drawLineChart(canvas, chartRecords, options, emptyElement) {
    if (!canvas || !canvas.getContext) return;
    var hasData = chartRecords.length > 0;
    canvas.hidden = !hasData;
    emptyElement.hidden = hasData;
    if (!hasData) return;

    var cssWidth = Math.max(280, canvas.parentElement.clientWidth);
    var cssHeight = canvas.id === "weightChart" ? 225 : 285;
    var ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssWidth + "px";
    canvas.style.height = cssHeight + "px";
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);

    var context = canvas.getContext("2d");
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, cssWidth, cssHeight);

    var margin = { top: 18, right: 13, bottom: 47, left: 43 };
    var plotWidth = cssWidth - margin.left - margin.right;
    var plotHeight = cssHeight - margin.top - margin.bottom;
    var values = [];

    for (var d = 0; d < options.datasets.length; d += 1) {
      for (var r = 0; r < chartRecords.length; r += 1) {
        var value = Number(chartRecords[r][options.datasets[d].key]);
        if (isFinite(value)) values.push(value);
      }
    }

    var minValue = options.fixedMin !== undefined
      ? options.fixedMin
      : Math.floor(Math.min.apply(Math, values) - (options.padding || 5));
    var maxValue = Math.ceil(Math.max.apply(Math, values) + (options.padding || 5));
    if (options.minimumMax) maxValue = Math.max(options.minimumMax, maxValue);
    if (minValue === maxValue) {
      minValue -= 1;
      maxValue += 1;
    }

    context.strokeStyle = "#d8e0e8";
    context.fillStyle = "#536174";
    context.lineWidth = 1;
    context.font = "bold 12px sans-serif";
    context.textAlign = "right";
    context.textBaseline = "middle";

    var gridLines = 4;
    for (var line = 0; line <= gridLines; line += 1) {
      var gridY = margin.top + (plotHeight / gridLines) * line;
      var labelValue = Math.round(maxValue - ((maxValue - minValue) / gridLines) * line);
      context.beginPath();
      context.moveTo(margin.left, gridY);
      context.lineTo(cssWidth - margin.right, gridY);
      context.stroke();
      context.fillText(String(labelValue), margin.left - 7, gridY);
    }

    var pointGap = chartRecords.length === 1 ? 0 : plotWidth / (chartRecords.length - 1);
    for (var datasetIndex = 0; datasetIndex < options.datasets.length; datasetIndex += 1) {
      var dataset = options.datasets[datasetIndex];
      context.strokeStyle = dataset.color;
      context.fillStyle = dataset.color;
      context.lineWidth = 3;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.beginPath();

      for (var recordIndex = 0; recordIndex < chartRecords.length; recordIndex += 1) {
        var x = chartRecords.length === 1 ? margin.left + plotWidth / 2 : margin.left + pointGap * recordIndex;
        var chartValue = Number(chartRecords[recordIndex][dataset.key]);
        var y = margin.top + ((maxValue - chartValue) / (maxValue - minValue)) * plotHeight;
        if (recordIndex === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();

      for (var pointIndex = 0; pointIndex < chartRecords.length; pointIndex += 1) {
        var pointX = chartRecords.length === 1 ? margin.left + plotWidth / 2 : margin.left + pointGap * pointIndex;
        var pointValue = Number(chartRecords[pointIndex][dataset.key]);
        var pointY = margin.top + ((maxValue - pointValue) / (maxValue - minValue)) * plotHeight;
        context.beginPath();
        context.arc(pointX, pointY, 4, 0, Math.PI * 2);
        context.fill();
      }
    }

    context.fillStyle = "#536174";
    context.font = "bold 11px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "top";
    var labelStep = Math.max(1, Math.ceil(chartRecords.length / 7));
    for (var labelIndex = 0; labelIndex < chartRecords.length; labelIndex += labelStep) {
      var labelX = chartRecords.length === 1 ? margin.left + plotWidth / 2 : margin.left + pointGap * labelIndex;
      var dateText = String(chartRecords[labelIndex].date || "").slice(5).replace("-", "/");
      var timingText = getRecordTime(chartRecords[labelIndex]);
      context.fillText(dateText, labelX, cssHeight - margin.bottom + 8);
      context.fillText(timingText, labelX, cssHeight - margin.bottom + 24);
    }
  }

  function showFormError(message) {
    elements.formError.classList.remove("warning-message");
    elements.formError.textContent = message;
    elements.formError.hidden = false;
    scrollElementIntoView(elements.formError);
  }

  function showFormWarning(message) {
    elements.formError.classList.add("warning-message");
    elements.formError.textContent = message;
    elements.formError.hidden = false;
    scrollElementIntoView(elements.formError);
  }

  function hideFormError() {
    elements.formError.hidden = true;
    elements.formError.textContent = "";
    elements.formError.classList.remove("warning-message");
  }

  function showToast(message, type, duration) {
    clearTimeout(toastTimer);
    elements.statusText.textContent = message;
    elements.statusIcon.textContent = type === "error" ? "!" : "✓";
    elements.statusToast.classList.toggle("is-error", type === "error");
    elements.statusToast.hidden = false;
    toastTimer = setTimeout(function () {
      elements.statusToast.hidden = true;
    }, duration || 3800);
  }

  function findRecord(id) {
    for (var i = 0; i < records.length; i += 1) {
      if (records[i].id === id) return records[i];
    }
    return null;
  }

  function hasValue(value) {
    return value !== null && value !== undefined && value !== "";
  }

  function createId() {
    return "vital-" + Date.now() + "-" + Math.floor(Math.random() * 1000000);
  }

  function toLocalDateString(date) {
    return date.getFullYear() + "-" + pad2(date.getMonth() + 1) + "-" + pad2(date.getDate());
  }

  function pad2(value) {
    return value < 10 ? "0" + value : String(value);
  }

  function calculateAge(birthDateText, currentDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDateText || "")) return null;
    var parts = birthDateText.split("-");
    var birthDate = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (
      birthDate.getFullYear() !== Number(parts[0]) ||
      birthDate.getMonth() !== Number(parts[1]) - 1 ||
      birthDate.getDate() !== Number(parts[2])
    ) {
      return null;
    }
    var age = currentDate.getFullYear() - birthDate.getFullYear();
    var birthdayPassed =
      currentDate.getMonth() > birthDate.getMonth() ||
      (currentDate.getMonth() === birthDate.getMonth() && currentDate.getDate() >= birthDate.getDate());
    return birthdayPassed ? age : age - 1;
  }

  function formatOneDecimal(value) {
    return (Math.round(Number(value) * 10) / 10).toFixed(1);
  }

  function formatShortJapaneseDate(dateText) {
    var parts = String(dateText || "").split("-");
    if (parts.length !== 3) return dateText || "";
    return Number(parts[0]) + "年" + Number(parts[1]) + "月" + Number(parts[2]) + "日";
  }

  function formatTime(date) {
    return pad2(date.getHours()) + ":" + pad2(date.getMinutes());
  }

  function timeFromStoredDate(value) {
    if (!value) return "";
    var date = new Date(value);
    return isNaN(date.getTime()) ? "" : formatTime(date);
  }

  function getRecordTime(record) {
    return record.time || timeFromStoredDate(record.measuredAt || record.createdAt) || "--:--";
  }

  function buildMeasuredAt(dateText, timeText, fallback) {
    if (dateText && /^\d{2}:\d{2}$/.test(timeText || "")) {
      var date = new Date(dateText + "T" + timeText + ":00");
      if (!isNaN(date.getTime())) return date.toISOString();
    }
    return fallback || new Date().toISOString();
  }

  function scrollElementIntoView(element) {
    if (!element || !element.scrollIntoView) return;
    try {
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (error) {
      element.scrollIntoView(true);
    }
  }

  function formatJapaneseDate(date) {
    var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日（" + weekdays[date.getDay()] + "）";
  }

  function formatRecordDate(value) {
    var parts = String(value || "").split("-");
    if (parts.length !== 3) return value;
    var date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    var weekdays = ["日", "月", "火", "水", "木", "金", "土"];
    return Number(parts[0]) + "年" + Number(parts[1]) + "月" + Number(parts[2]) + "日（" + weekdays[date.getDay()] + "）";
  }
})();
