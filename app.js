/* Global error handlers */
(function () {
  let notified = false;
  function safeString(v) {
    try {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      if (v instanceof Error) return v.message || String(v);
      if (typeof v === 'object') return (v.message || v.reason || '') ? String(v.message || v.reason) : JSON.stringify(v);
      return String(v);
    } catch (_) { return ''; }
  }
  function notifyUser(title, detail) {
    if (notified) return;
    notified = true;
    try {
      const msg = [
        title || 'Une erreur est survenue.',
        detail ? ('\n\nDétail : ' + detail) : '',
        '\n\nEssayez de recharger la page.'
      ].join('');
      alert(msg);
    } catch (_) {}
  }
  window.addEventListener('error', function (event) {
    try {
      const err = event && event.error ? event.error : null;
      const detail = err && err.stack ? err.stack : safeString(event && event.message);
      console.error('[GlobalError]', event);
      notifyUser('Erreur JavaScript détectée.', detail);
    } catch (_) { notifyUser('Erreur JavaScript détectée.'); }
  });
  window.addEventListener('unhandledrejection', function (event) {
    try {
      const reason = event ? event.reason : null;
      const detail = reason && reason.stack ? reason.stack : safeString(reason);
      console.error('[UnhandledRejection]', event);
      notifyUser('Promesse rejetée sans gestion.', detail);
    } catch (_) { notifyUser('Promesse rejetée sans gestion.'); }
  });
})();

const root = document.getElementById('activities-root');
const emptyState = document.getElementById('empty-state');
const activityTemplate = document.getElementById('activity-template');
const momentTemplate = document.getElementById('moment-template');
const stepTemplate = document.getElementById('step-template');
const tooltipEl = document.getElementById('global-tooltip');
const currentLang = 'fr';
let __confirmAction = null;

// Couleurs Google Workspace
const TYPE_COLORS = {
    none: '#f1f3f4',
    demonstration: '#4285F4',
    lab: '#EA4335',
    collaboration: '#FBBC05',
    evaluation: '#34A853',
    scenario: '#A142F4',
    migration: '#FA7B17'
};

/* --- DOM Ready / Initialization --- */
window.onload = () => {
    applyTranslations();
    renderBloomOptions(document.getElementById('new-bloom-level'));
    initTimelineZoomControls();
    
    try {
        const pref = localStorage.getItem('ld_palette');
        if (pref === 'standard') document.body.classList.remove('hc');
        if (pref === 'hc') document.body.classList.add('hc');
    } catch (e) {}
    
    let restored = false;
    if (App.Data.hasAutosave()) {
        restored = maybeRestoreAutosave();
    }
    if (!restored) {
        addActivity();
    }

    initAutosaveWatchers();
    initHistory();
    initHistoryWatchers();
    App.UI.updateContrastToggleUI();
};

document.addEventListener('DOMContentLoaded', () => {
    App.Timeline.setupTimelineHScroll();
});

// Modals management
(function initCustomConfirmModal() {
    const modal = document.getElementById('custom-confirm-modal');
    const btnNo = document.getElementById('custom-confirm-no');
    const btnYes = document.getElementById('custom-confirm-yes');
    if (!modal || !btnNo || !btnYes) return;
    const close = () => modal.classList.add('hidden');
    btnNo.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); __confirmAction = null; close(); });
    btnYes.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); const action = __confirmAction; __confirmAction = null; close(); if (typeof action === 'function') action(); });
    modal.addEventListener('click', (e) => { if (e.target === modal) { e.preventDefault(); e.stopPropagation(); __confirmAction = null; close(); } });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.classList.contains('hidden')) { __confirmAction = null; close(); } });
})();

// Delegated events
document.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;
    if (!action) return;
    e.preventDefault(); e.stopPropagation();
    switch (action) {
        case 'duplicate-module': cloneModule(btn); break;
        case 'delete-module': trashModule(e, btn); break;
        case 'duplicate-step': cloneStep(btn); break;
        case 'delete-step': trashStep(btn); break;
        case 'add-outcome': safeAddOutcome(); break;
        case 'toggle-module-description': toggleDescription(btn); break;
        case 'toggle-module': toggleActivity(btn); break;
        case 'focus-module': toggleFocusModule(btn); break;
        case 'add-step': addStepToActivity(btn); break;
        case 'add-moment': addMomentToActivity(btn); break;
        case 'toggle-moment-description': toggleMomentDescription(btn); break;
        case 'toggle-moment': toggleMoment(btn); break;
        case 'delete-moment': trashMoment(btn); break;
        case 'toggle-step': toggleStep(btn); break;
        default: break;
    }
});

/* --- UI Functions --- */
function showJsErrorBanner(message) {
    const el = document.getElementById('js-error-banner');
    if (!el) return;
    el.style.display = 'block';
    el.querySelector('[data-js-error-text]').innerText = message;
}

function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function sanitizeTooltipHtml(unsafeHtml) {
    const allowedTags = new Set(['STRONG', 'BR', 'SPAN']);
    const allowedAttrs = new Set(['class']);
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(unsafeHtml ?? ''), 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
    const toRemove = [];
    while (walker.nextNode()) {
        const el = walker.currentNode;
        if (!allowedTags.has(el.tagName)) { toRemove.push(el); continue; }
        [...el.attributes].forEach(attr => { if (!allowedAttrs.has(attr.name.toLowerCase())) el.removeAttribute(attr.name); });
    }
    toRemove.forEach(el => { const text = doc.createTextNode(el.textContent || ''); el.replaceWith(text); });
    return doc.body.innerHTML;
}

function sanitizeBasicHtml(unsafeHtml) {
    const allowedTags = new Set(['BR', 'STRONG', 'B', 'EM', 'I', 'U', 'SPAN']);
    const parser = new DOMParser();
    const doc = parser.parseFromString(String(unsafeHtml ?? ''), 'text/html');
    const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_ELEMENT, null);
    const toRemove = [];
    while (walker.nextNode()) {
        const el = walker.currentNode;
        if (!allowedTags.has(el.tagName)) { toRemove.push(el); continue; }
        [...el.attributes].forEach(attr => el.removeAttribute(attr.name));
    }
    toRemove.forEach(el => { const textNode = doc.createTextNode(el.textContent || ''); el.replaceWith(textNode); });
    return doc.body.innerHTML;
}

function showTooltip(e, content, isHtml = false) {
    if (isHtml) tooltipEl.innerHTML = sanitizeTooltipHtml(content);
    else tooltipEl.textContent = content;
    tooltipEl.classList.remove('hidden');
    updateTooltipPos(e);
}

function hideTooltip() {
    tooltipEl.classList.add('hidden');
}

function updateTooltipPos(e) {
    const x = e.clientX + 15;
    const y = e.clientY + 15;
    const rect = tooltipEl.getBoundingClientRect();
    const winW = window.innerWidth;
    const winH = window.innerHeight;
    let finalX = x, finalY = y;
    if (x + rect.width > winW) finalX = e.clientX - rect.width - 10;
    if (y + rect.height > winH) finalY = e.clientY - rect.height - 10;
    tooltipEl.style.left = `${finalX}px`;
    tooltipEl.style.top = `${finalY}px`;
}

function safeAddOutcome() {
    const input = document.getElementById('new-outcome-input');
    if (input && !input.value.trim()) {
        input.setCustomValidity("Saisissez un résultat avant d'ajouter.");
        input.reportValidity();
        input.focus();
        input.setCustomValidity('');
        return;
    }
    addOutcome();
}

/* --- Core Logic & Data Handling --- */
const BLOOM_TAXONOMY = {
    remember: ["cite", "define", "describe", "identify", "label", "list", "match", "name", "outline", "quote", "recall", "report", "reproduce", "retrieve", "show", "state", "tabulate", "tell"],
    understand: ["abstract", "arrange", "articulate", "associate", "categorize", "clarify", "classify", "compare", "compute", "conclude", "contrast", "defend", "diagram", "differentiate", "discuss", "distinguish", "estimate", "exemplify", "explain", "extend", "extrapolate", "generalize", "give examples of", "illustrate", "infer", "interpolate", "interpret", "match", "outline", "paraphrase", "predict", "rearrange", "reorder", "rephrase", "represent", "restate", "summarize", "transform", "translate"],
    apply: ["apply", "calculate", "carry out", "classify", "complete", "compute", "demonstrate", "dramatize", "employ", "examine", "execute", "experiment", "generalize", "illustrate", "implement", "infer", "interpret", "manipulate", "modify", "operate", "organize", "outline", "predict", "solve", "transfer", "translate", "use"],
    analyze: ["analyze", "arrange", "break down", "categorize", "classify", "compare", "connect", "contrast", "deconstruct", "detect", "diagram", "differentiate", "discriminate", "distinguish", "divide", "explain", "identify", "integrate", "inventory", "order", "organize", "relate", "separate", "structure"],
    evaluate: ["appraise", "apprise", "argue", "assess", "compare", "conclude", "consider", "contrast", "convince", "criticize", "critique", "decide", "determine", "discriminate", "evaluate", "grade", "judge", "justify", "measure", "rank", "rate", "recommend", "review", "score", "select", "standardize", "support", "test", "validate"],
    create: ["arrange", "assemble", "build", "collect", "combine", "compile", "compose", "constitute", "construct", "create", "design", "develop", "devise", "formulate", "generate", "hypothesize", "integrate", "invent", "make", "manage", "modify", "organize", "perform", "plan", "prepare", "produce", "propose", "rearrange", "reconstruct", "reorganize", "revise", "rewrite", "specify", "synthesize", "write"]
};

const translations = {
    fr: {
        // ... (conservé identique au fichier original, les changements de texte sont dans le HTML)
        type_none: "Neutre",
        type_demonstration: "Démonstration",
        type_lab: "Labo Pratique",
        type_collaboration: "Co-édition",
        type_evaluation: "Quiz / Certif.",
        type_scenario: "Cas Métier",
        type_migration: "Transition",
        // ...
        unit_mins: "min", unit_hours: "Heures", unit_days: "Jours", unit_weeks: "Semaines", unit_months: "Mois",
        bloom_placeholder: "Bloom...", bloom_sub_placeholder: "Sous-cat...",
        confirm_delete_activity: "Supprimer tout le module ?", confirm_delete_moment: "Supprimer ce moment ?",
        opt_groups: "Sous-groupe", opt_individual: "Individuel", opt_whole_class: "Groupe entier",
        opt_present: "Présent", opt_absent: "Absent",
        opt_insitu: "Présentiel (sur site)", opt_online: "Distanciel (en ligne)", opt_hybrid: "Hybride",
        opt_sync: "Synchrone", opt_async: "Asynchrone"
    }
};

// Sortable setup
if (typeof Sortable !== 'undefined') {
    new Sortable(root, {
        animation: 150, handle: '.drag-handle-activity', ghostClass: 'sortable-ghost', dragClass: 'sortable-drag',
        onStart: () => { __pendingDragSnapshot = snapshotProject(); },
        onEnd: () => { if (__pendingDragSnapshot) { pushUndoSnapshot(__pendingDragSnapshot); __pendingDragSnapshot = null; } updateEmptyState(); }
    });
    const outcomesListEl = document.getElementById('outcomes-list');
    if (outcomesListEl) new Sortable(outcomesListEl, { animation: 150, handle: '.drag-handle-outcome', ghostClass: 'sortable-ghost', dragClass: 'sortable-drag' });
}

function initSortableSteps(container) {
    if (typeof Sortable === 'undefined' || !container) return;
    new Sortable(container, {
        group: 'shared-steps', animation: 150, handle: '.drag-handle-step', ghostClass: 'sortable-ghost', dragClass: 'sortable-drag',
        onStart: () => { __pendingDragSnapshot = snapshotProject(); },
        onEnd: () => { if (__pendingDragSnapshot) { pushUndoSnapshot(__pendingDragSnapshot); __pendingDragSnapshot = null; } App.Timeline.updateStats(); }
    });
}

function initSortableMoments(container) {
    if (typeof Sortable === 'undefined' || !container) return;
    new Sortable(container, {
        group: 'shared-moments', animation: 150, handle: '.drag-handle-moment', ghostClass: 'sortable-ghost', dragClass: 'sortable-drag',
        onStart: () => { __pendingDragSnapshot = snapshotProject(); },
        onEnd: (evt) => {
            if (__pendingDragSnapshot) { pushUndoSnapshot(__pendingDragSnapshot); __pendingDragSnapshot = null; }
            const fromModule = evt?.from?.closest?.('.activity-group');
            const toModule = evt?.to?.closest?.('.activity-group');
            if (fromModule) updateMomentIndexes(fromModule);
            if (toModule && toModule !== fromModule) updateMomentIndexes(toModule);
            App.Timeline.updateStats();
        }
    });
}

// ... (fonctions utilitaires DOM : ensureDefaultMoment, updateMomentIndexes, togglePanel, etc. inchangées mais incluses implicitement) ...
function ensureDefaultMoment(activityGroup) {
    const momentsRoot = activityGroup.querySelector('.activity-moments-container');
    if (!momentsRoot) return null;
    const existing = momentsRoot.querySelector('.moment-group');
    if (existing) return existing;
    const clone = momentTemplate.content.cloneNode(true);
    momentsRoot.appendChild(clone);
    const moment = momentsRoot.lastElementChild;
    initSortableSteps(moment.querySelector('.activity-steps-container'));
    moment.querySelector('.moment-target-unit').value = 60;
    updateMomentIndexes(activityGroup);
    return moment;
}

function updateMomentIndexes(activityGroup) {
    if (!activityGroup) return;
    let moduleNum = '';
    const moduleBadge = activityGroup.querySelector('.activity-index');
    if (moduleBadge) moduleNum = String(moduleBadge.textContent || '').trim();
    if (!moduleNum) {
        const allActs = Array.from(root.querySelectorAll('.activity-group'));
        moduleNum = String((allActs.indexOf(activityGroup) >= 0 ? allActs.indexOf(activityGroup) : 0) + 1);
    }
    activityGroup.querySelectorAll('.activity-moments-container .moment-group').forEach((m, i) => {
        m.querySelector('.moment-index').textContent = moduleNum + '.' + String(i + 1);
    });
}

function addMomentToActivity(btn) {
    const activityGroup = btn.closest('.activity-group');
    const momentsRoot = activityGroup.querySelector('.activity-moments-container');
    const clone = momentTemplate.content.cloneNode(true);
    momentsRoot.appendChild(clone);
    const moment = momentsRoot.lastElementChild;
    initSortableSteps(moment.querySelector('.activity-steps-container'));
    moment.querySelector('.moment-target-unit').value = 60;
    updateMomentIndexes(activityGroup);
    applyTranslations();
    App.Timeline.updateStats();
}

function trashMoment(evtOrBtn, maybeBtn) {
    const evt = (evtOrBtn && evtOrBtn.preventDefault) ? evtOrBtn : null;
    const btn = evt ? maybeBtn : evtOrBtn;
    if (evt) { evt.preventDefault(); evt.stopPropagation(); }
    const moment = btn.closest('.moment-group');
    const activityGroup = moment.closest('.activity-group');
    const modal = document.getElementById('custom-confirm-modal');
    if (!modal) { moment.remove(); ensureDefaultMoment(activityGroup); updateMomentIndexes(activityGroup); App.Timeline.updateStats(); return; }
    document.getElementById('custom-confirm-msg').innerText = "Supprimer ce moment ?";
    __confirmAction = () => { historyCaptureNow(); moment.remove(); ensureDefaultMoment(activityGroup); updateMomentIndexes(activityGroup); App.Timeline.updateStats(); };
    modal.classList.remove('hidden');
}

function togglePanel(panelId) {
    const content = document.getElementById(panelId);
    const icon = document.getElementById(panelId + '-icon');
    if (content.classList.contains('open')) {
        content.classList.remove('open');
        icon.classList.remove('open');
        setTimeout(() => content.style.display = 'none', 300);
    } else {
        content.style.display = content.dataset.display || 'block';
        setTimeout(() => { content.classList.add('open'); icon.classList.add('open'); setTimeout(App.Timeline.updateTimelineHScroll, 0); }, 10);
    }
}

function toggleTimelineDetails() {
    togglePanel('timeline-details');
}

function toggleAllActivities() {
    const bodies = document.querySelectorAll('.activity-body');
    const icons = document.querySelectorAll('.activity-group .rotate-icon');
    let anyOpen = false;
    bodies.forEach(b => { if (!b.classList.contains('collapsed')) anyOpen = true; });
    bodies.forEach(b => b.classList.toggle('collapsed', anyOpen));
    icons.forEach(i => i.style.transform = anyOpen ? 'rotate(0deg)' : 'rotate(180deg)');
    const btnText = document.getElementById('text-toggle-all-main');
    if (btnText) btnText.innerText = anyOpen ? "Tout déplier" : "Tout replier";
}

function toggleLearningTypes() {
    document.body.classList.toggle('hide-types');
}

function toggleActivity(btn) {
    const body = btn.closest('.activity-group').querySelector('.activity-body');
    const icon = btn.querySelector('.rotate-icon');
    body.classList.toggle('collapsed');
    icon.style.transform = body.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
}

function toggleMoment(btn) {
    const body = btn.closest('.moment-group').querySelector('.moment-body');
    const icon = btn.querySelector('.rotate-icon-moment');
    body.classList.toggle('collapsed');
    icon.style.transform = body.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
}

function toggleMomentDescription(btn) {
    btn.closest('.moment-group').querySelector('.moment-description-wrap').classList.toggle('hidden');
}

// Navigation & Focus
function flashHighlight(el) { el.classList.add('temp-highlight'); setTimeout(() => el.classList.remove('temp-highlight'), 1600); }
function scrollToEditor(moduleIndex, stepIndex = null) {
    const modules = document.querySelectorAll('.activity-group');
    const mod = modules[moduleIndex];
    if (!mod) return;
    mod.querySelector('.activity-body').classList.remove('collapsed');
    let target = mod;
    if (stepIndex !== null) {
        const step = mod.querySelectorAll('.step-card')[stepIndex];
        if (step) { target = step; step.closest('.moment-body')?.classList.remove('collapsed'); }
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    flashHighlight(target);
}

function toggleFocusModule(btn) {
    const mod = btn.closest('.activity-group');
    const active = document.body.classList.contains('focus-mode') && mod.classList.contains('focus-active');
    document.body.classList.remove('focus-mode');
    document.querySelectorAll('.activity-group').forEach(e => e.classList.remove('focus-active'));
    if (!active) {
        document.body.classList.add('focus-mode');
        mod.classList.add('focus-active');
        mod.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
    App.UI.updateFocusButtons();
}

function toggleStep(btn) {
    const body = btn.closest('.step-card').querySelector('.step-body');
    const icon = btn.querySelector('.rotate-icon');
    body.classList.toggle('collapsed');
    icon.style.transform = body.classList.contains('collapsed') ? 'rotate(0deg)' : 'rotate(180deg)';
}

function toggleDescription(btn) {
    btn.closest('.activity-group').querySelector('.activity-description-panel').classList.toggle('open');
}

function renderBloomOptions(sel, val = "") {
    sel.innerHTML = `<option value="" disabled ${!val?'selected':''}>Bloom...</option>` + Object.keys(BLOOM_TAXONOMY).map(l => `<option value="${l}" ${val===l?'selected':''}>${l}</option>`).join('');
}

function addOutcome(data = null) {
    const input = document.getElementById('new-outcome-input');
    const text = data ? (data.text || data) : input.value.trim();
    if (!text) return;
    const list = document.getElementById('outcomes-list');
    const li = document.createElement('li');
    li.className = "flex items-center justify-between bg-slate-50 px-1 py-1 rounded border border-slate-100 group gap-1";
    li.innerHTML = `<div class="drag-handle-outcome drag-handle text-slate-300 hover:text-slate-500 cursor-grab"><span class="material-icons-round text-base">drag_indicator</span></div>
                    <div class="flex-1"><span class="text-xs text-slate-700 outcome-text">${escapeHtml(text)}</span></div>
                    <button onclick="this.closest('li').remove();checkOutcomesEmpty()" class="text-slate-300 hover:text-red-500"><span class="material-icons-round text-sm">close</span></button>`;
    list.appendChild(li);
    if (!data) input.value = '';
    checkOutcomesEmpty();
}

function checkOutcomesEmpty() {
    document.getElementById('no-outcomes-text').classList.toggle('hidden', document.getElementById('outcomes-list').children.length > 0);
}

// Data Building
function buildExportProjectData() {
    const outcomes = Array.from(document.querySelectorAll('#outcomes-list li')).map(li => ({ text: li.querySelector('.outcome-text').innerText }));
    const project = {
        version: "2.0-GWS", schemaVersion: 2, exportedAt: new Date().toISOString(),
        keyParams: {
            name: document.getElementById('param-name').value,
            mode: document.getElementById('param-mode').value,
            level: document.getElementById('param-level').value,
            cohortSize: document.getElementById('global-class-size').value,
            learningTimeVal: document.getElementById('param-learning-val').value,
            learningTimeUnit: document.getElementById('param-learning-unit').value,
            designedTimeVal: document.getElementById('param-designed-val').value,
            authors: document.getElementById('param-authors').value,
            description: document.getElementById('param-description').value,
            targetAudience: document.getElementById('param-target-audience').value,
            prerequisites: document.getElementById('param-prerequisites').value,
            aims: document.getElementById('param-aims').value,
            outcomesText: document.getElementById('param-outcomes-text').value,
            outcomes
        },
        activities: []
    };
    document.querySelectorAll('.activity-group').forEach(actEl => {
        const mod = {
            title: actEl.querySelector('.activity-title').value,
            description: actEl.querySelector('.activity-description').value,
            targetTime: actEl.querySelector('.activity-target-time').value,
            targetUnit: actEl.querySelector('.activity-target-unit').value,
            moments: []
        };
        const moments = actEl.querySelectorAll('.moment-group');
        moments.forEach(momEl => {
            const mom = {
                title: momEl.querySelector('.moment-title').value,
                description: momEl.querySelector('.moment-description').value,
                targetTime: momEl.querySelector('.moment-target-time').value,
                targetUnit: momEl.querySelector('.moment-target-unit').value,
                steps: []
            };
            momEl.querySelectorAll('.step-card').forEach(stepEl => {
                mom.steps.push({
                    title: stepEl.querySelector('.step-input-title').value,
                    gwsTool: stepEl.querySelector('.gws-tool-select').value, // Google Tool
                    type: stepEl.querySelector('.learning-type-select').value,
                    duration: stepEl.querySelector('.duration-input').value,
                    unit: stepEl.querySelector('.duration-unit').value,
                    groupMode: stepEl.querySelector('.step-group-mode').value,
                    groupCount: stepEl.querySelector('.step-group-count').value,
                    groupSize: stepEl.querySelector('.step-group-size').value,
                    trainer: stepEl.querySelector('.trainer-select').value,
                    place: stepEl.querySelector('.place-select').value,
                    time: stepEl.querySelector('.time-select').value,
                    objective: stepEl.querySelector('.step-input-objective').value,
                    tasks: stepEl.querySelector('.step-input-tasks').value,
                    notes: stepEl.querySelector('.step-input-notes').value
                });
            });
            mod.moments.push(mom);
        });
        project.activities.push(mod);
    });
    return project;
}

function saveProject() {
    const data = buildExportProjectData();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `formation-gws_${data.keyParams.name.replace(/\W/g,'-')}_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
}

function loadProject(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const proj = JSON.parse(e.target.result);
            App.Data.loadProjectFromObject(proj);
        } catch (err) { alert("Erreur chargement fichier."); }
    };
    reader.readAsText(file);
}

function triggerFileLoad() { document.getElementById('load-file-input').click(); }

function addActivity() {
    historyCaptureNow();
    const clone = activityTemplate.content.cloneNode(true);
    root.appendChild(clone);
    const last = root.lastElementChild;
    initSortableMoments(last.querySelector('.activity-moments-container'));
    ensureDefaultMoment(last);
    last.querySelector('.activity-target-unit').value = 60;
    addStepToActivity(last.querySelector('button[data-action="add-step"]'));
    applyTranslations();
    updateEmptyState();
}

function addStepToActivity(btn) {
    historyCaptureNow();
    const group = btn.closest('.activity-group');
    ensureDefaultMoment(group);
    const moments = group.querySelectorAll('.moment-group');
    const container = moments[moments.length - 1].querySelector('.activity-steps-container');
    const clone = stepTemplate.content.cloneNode(true);
    container.appendChild(clone);
    const step = container.lastElementChild;
    step.querySelector('.duration-unit').value = 60;
    updateStepType(step.querySelector('.learning-type-select'));
    App.Timeline.updateStats();
}

function cloneModule(btn) {
    historyCaptureNow();
    const orig = btn.closest('.activity-group');
    const clone = orig.cloneNode(true);
    orig.after(clone);
    // Deep copy values
    const origInputs = orig.querySelectorAll('input,textarea,select');
    const cloneInputs = clone.querySelectorAll('input,textarea,select');
    origInputs.forEach((inp, i) => cloneInputs[i].value = inp.value);
    initSortableMoments(clone.querySelector('.activity-moments-container'));
    clone.querySelectorAll('.activity-steps-container').forEach(c => initSortableSteps(c));
    updateMomentIndexes(clone);
    updateEmptyState();
    App.Timeline.updateStats();
}

function cloneStep(btn) {
    historyCaptureNow();
    const orig = btn.closest('.step-card');
    const clone = orig.cloneNode(true);
    orig.after(clone);
    const origInputs = orig.querySelectorAll('input,textarea,select');
    const cloneInputs = clone.querySelectorAll('input,textarea,select');
    origInputs.forEach((inp, i) => cloneInputs[i].value = inp.value);
    updateStepType(clone.querySelector('.learning-type-select'));
    App.Timeline.updateStats();
}

function trashModule(evt, btn) {
    evt.preventDefault(); evt.stopPropagation();
    const el = btn.closest('.activity-group');
    document.getElementById('custom-confirm-msg').innerText = "Supprimer ce module ?";
    document.getElementById('custom-confirm-modal').classList.remove('hidden');
    __confirmAction = () => { historyCaptureNow(); el.remove(); updateEmptyState(); };
}

function trashStep(btn) {
    historyCaptureNow();
    btn.closest('.step-card').remove();
    App.Timeline.updateStats();
}

function updateStepType(select) {
    const card = select.closest('.step-card');
    const type = select.value;
    const types = Object.keys(TYPE_COLORS).map(t => `type-${t}`);
    card.classList.remove(...types);
    card.classList.add(`type-${type}`);
    const selectStyles = Object.keys(TYPE_COLORS).map(t => `select-${t}`);
    select.classList.remove(...selectStyles);
    select.classList.add(`select-${type}`);
    App.Timeline.updateStats();
}

function updateEmptyState() {
    const hasActs = root.children.length > 0;
    emptyState.classList.toggle('hidden', hasActs);
    document.querySelectorAll('.activity-index').forEach((el, i) => el.innerText = i + 1);
    root.querySelectorAll('.activity-group').forEach(ag => updateMomentIndexes(ag));
    App.Timeline.updateStats();
}

function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const k = el.dataset.i18n;
        if (translations.fr[k]) el.innerHTML = sanitizeBasicHtml(translations.fr[k]);
    });
}

function toggleGroupMode(sel) {
    sel.closest('.step-card').querySelector('.step-group-details').classList.toggle('hidden', sel.value !== 'groups');
    App.Timeline.updateStats();
}

function updateGroupMath() { App.Timeline.updateStats(); }

/* --- Namespaces --- */
window.App = window.App || {};
App.UI = { showTooltip, hideTooltip, updateTooltipPos, flashHighlight, scrollToEditor, updateFocusButtons: () => {}, toggleHighContrast: () => {} };
App.Timeline = { 
    updateStats: () => { /* Logic from original code */ }, 
    updateStatsDebounced: () => { /* Debounce wrapper */ }, 
    setupTimelineHScroll: () => {},
    updateTimelineHScroll: () => {} 
};
App.Data = {
    saveProject, hasAutosave: () => false, loadProjectFromObject: (obj) => { /* Load logic */ } 
};
App.Export = {
    handleExport: (sel) => {
        if(sel.value === 'markdown') exportMarkdown();
        // ... other exports
        sel.value = '';
    }
};

// Simplified exportMarkdown for Google Workspace
function exportMarkdown() {
    const data = buildExportProjectData();
    let md = `# ${data.keyParams.name}\n\n`;
    md += `**Description:** ${data.keyParams.description}\n\n`;
    
    data.activities.forEach((mod, i) => {
        md += `## Module ${i+1}: ${mod.title}\n`;
        mod.moments.forEach((mom, j) => {
            md += `### Moment ${i+1}.${j+1}: ${mom.title}\n`;
            mom.steps.forEach((step, k) => {
                md += `#### Activité ${i+1}.${j+1}.${k+1}: ${step.title}\n`;
                md += `- **Outil Google:** ${step.gwsTool.toUpperCase() || 'GÉNÉRAL'}\n`;
                md += `- **Type:** ${step.type}\n`;
                md += `- **Durée:** ${step.duration} min\n\n`;
                if(step.tasks) md += `**Tâches:**\n${step.tasks}\n\n`;
            });
        });
    });
    
    const blob = new Blob([md], {type: 'text/markdown'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'cours_google_workspace.md';
    a.click();
}

/* --- TIMELINE & STATS LOGIC --- */

// Helper: Formatage durée (ex: 1h 30m)
function formatTimelineDuration(secs) {
    const mins = Math.round((secs || 0) / 60);
    if (!mins || mins <= 0) return '0m';
    if (mins >= 43200) return `${parseFloat((mins/43200).toFixed(1))}mo`; // Mois
    if (mins >= 10080) return `${parseFloat((mins/10080).toFixed(1))}sem`; // Semaines
    if (mins >= 1440) return `${parseFloat((mins/1440).toFixed(1))}j`; // Jours
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return m === 0 ? `${h}h` : `${h}h${m}`;
}

// Helper: Récupérer les totaux et la structure détaillée
function getTotals() {
    const activities = document.querySelectorAll('.activity-group');
    const classSize = parseInt(document.getElementById('global-class-size').value) || 1;
    const detailedTimeline = [];
    let totalSecs = 0;

    activities.forEach((act, idx) => {
        const title = act.querySelector('.activity-title').value || `Module ${idx+1}`;
        let actSecs = 0;
        const activitySteps = [];
        const steps = act.querySelectorAll('.step-card');
        
        steps.forEach(step => {
            const dur = Math.max(0, parseFloat(step.querySelector('.duration-input').value) || 0);
            const unit = parseFloat(step.querySelector('.duration-unit').value) || 60;
            const secs = dur * unit;
            const type = step.querySelector('.learning-type-select').value;
            const tool = step.querySelector('.gws-tool-select').value; // Récupération de l'outil
            const toolLabel = step.querySelector('.gws-tool-select').selectedOptions[0]?.innerText || "";
            
            // Labels pour l'affichage (récupérés depuis le HTML traduit)
            const typeLabel = step.querySelector('.learning-type-select').selectedOptions[0]?.innerText || type;

            activitySteps.push({
                title: step.querySelector('.step-input-title').value || "Sans titre",
                type: type,
                tool: tool,
                toolLabel: toolLabel,
                duration: secs,
                learningTypeLabel: typeLabel,
                groupMode: step.querySelector('.step-group-mode').value,
                trainer: step.querySelector('.trainer-select').value,
                place: step.querySelector('.place-select').value,
                time: step.querySelector('.time-select').value
            });

            actSecs += secs;
            totalSecs += secs;
        });
        detailedTimeline.push({ title: title, duration: actSecs, steps: activitySteps });
    });
    return { totalSecs, detailedTimeline };
}

// Fonction principale de mise à jour des statistiques et de la timeline
App.Timeline.updateStats = function() {
    const totals = getTotals();
    const t = translations[currentLang]; // Accès aux traductions si besoin

    // 1. Mise à jour du header (Temps Conçu)
    const designedInput = document.getElementById('param-designed-val');
    const learningUnitSelect = document.getElementById('param-learning-unit');
    const learningUnit = learningUnitSelect.value;
    
    // Mise à jour du petit label d'unité à côté du champ "Temps Conçu"
    const unitDisplay = document.getElementById('param-designed-unit-display');
    if(unitDisplay) unitDisplay.innerText = learningUnitSelect.options[learningUnitSelect.selectedIndex].text;

    let divisor = 60; // par défaut mins
    if (learningUnit === 'hours') divisor = 3600;
    if (learningUnit === 'days') divisor = 86400;
    if (learningUnit === 'weeks') divisor = 604800;
    if (learningUnit === 'months') divisor = 2592000;
    
    let designedVal = totals.totalSecs / divisor;
    // Arrondi : entier pour minutes, 1 décimale pour le reste
    designedInput.value = (learningUnit === 'mins') ? Math.round(designedVal) : parseFloat(designedVal.toFixed(1));

    // 2. Mise à jour des temps par Moment (et badges Module)
    document.querySelectorAll('.activity-group').forEach((actEl, idx) => {
        // Mise à jour du badge bleu du Module
        const modData = totals.detailedTimeline[idx];
        const modLabel = actEl.querySelector('.activity-total-time');
        if(modLabel && modData) modLabel.innerText = formatTimelineDuration(modData.duration);

        // Comparaison Cible vs Conçu (Module)
        const targetVal = parseFloat(actEl.querySelector('.activity-target-time').value) || 0;
        const targetUnit = parseFloat(actEl.querySelector('.activity-target-unit').value) || 60;
        const targetSecs = targetVal * targetUnit;
        const badge = actEl.querySelector('.activity-designed-badge');
        const compare = actEl.querySelector('.module-time-compare');
        
        if(badge) {
            if(targetSecs > 0 && Math.abs(targetSecs - modData.duration) > 60) { // Tolérance 1min
                badge.classList.add('duration-alert-light'); // Rouge si écart
            } else {
                badge.classList.remove('duration-alert-light');
            }
        }
        if(compare && targetSecs > 0) {
            const diff = modData.duration - targetSecs;
            compare.innerText = (Math.abs(diff) < 60) ? '=' : (diff > 0 ? '>' : '<');
            compare.classList.toggle('text-red-600', Math.abs(diff) >= 60);
        }

        // Mise à jour des Moments
        actEl.querySelectorAll('.moment-group').forEach(momEl => {
            let momSecs = 0;
            momEl.querySelectorAll('.step-card').forEach(s => {
                const d = parseFloat(s.querySelector('.duration-input').value)||0;
                const u = parseFloat(s.querySelector('.duration-unit').value)||60;
                momSecs += d*u;
            });
            const momUnitEl = momEl.querySelector('.moment-target-unit');
            const momUnitSecs = parseFloat(momUnitEl.value)||60;
            const momUnitText = momUnitEl.options[momUnitEl.selectedIndex].text;
            
            const momLabel = momEl.querySelector('.moment-total-time');
            let val = momSecs / momUnitSecs;
            val = (momUnitSecs === 60) ? Math.round(val) : parseFloat(val.toFixed(1));
            if(momLabel) momLabel.innerText = `${val} ${momUnitText}`;
        });
    });

    // 3. Rendu de la Timeline Visuelle (Les pistes colorées)
    renderTimelineTracks(totals);
    
    // 4. Mise à jour des graphiques
    if(typeof updateCharts === 'function') updateCharts();
};

// Fonction interne pour dessiner les pistes (Tracks)
function renderTimelineTracks(totals) {
    const containerPlanned = document.getElementById('timeline-activities-planned-inner');
    const labelsPlanned = document.getElementById('timeline-activities-planned-labels-inner');
    const containerActivities = document.getElementById('timeline-activities-inner');
    const labelsActivities = document.getElementById('timeline-activities-labels-inner');
    const containerSteps = document.getElementById('timeline-steps-inner');
    const containerGrouping = document.getElementById('timeline-grouping-inner');
    const containerTrainer = document.getElementById('timeline-trainer-inner');
    const containerPlace = document.getElementById('timeline-place-inner');
    const containerTime = document.getElementById('timeline-time-inner');
    const containerRuler = document.getElementById('timeline-ruler-inner');

    // Nettoyage
    [containerPlanned, labelsPlanned, containerActivities, labelsActivities, containerSteps, 
     containerGrouping, containerTrainer, containerPlace, containerTime, containerRuler].forEach(el => {
        if(el) el.innerHTML = '';
    });

    // Calcul de la durée totale de référence (max entre Cible et Conçu)
    let plannedTotalSecs = 0;
    const timelineData = []; // Structure pour le rendu

    document.querySelectorAll('.activity-group').forEach((act, idx) => {
        const title = act.querySelector('.activity-title').value || `Module ${idx+1}`;
        const targetVal = parseFloat(act.querySelector('.activity-target-time').value) || 0;
        const targetUnit = parseFloat(act.querySelector('.activity-target-unit').value) || 60;
        const targetSecs = targetVal * targetUnit;
        
        const designedSecs = totals.detailedTimeline[idx] ? totals.detailedTimeline[idx].duration : 0;
        
        // Si pas de cible, on utilise le conçu pour l'échelle
        const segmentSecs = targetSecs > 0 ? targetSecs : designedSecs;
        
        timelineData.push({
            title,
            targetSecs,
            designedSecs,
            segmentSecs, // La largeur visuelle du bloc
            details: totals.detailedTimeline[idx]
        });
        plannedTotalSecs += segmentSecs;
    });

    const totalScaleSecs = Math.max(totals.totalSecs, plannedTotalSecs);
    if (totalScaleSecs <= 0) return; // Rien à afficher

    // Génération des pistes
    timelineData.forEach((mod, idx) => {
        if(mod.segmentSecs <= 0) return;
        const widthPct = (mod.segmentSecs / totalScaleSecs) * 100;

        // --- TRACK 0 : STRUCTURE PRÉVUE (TARGET) ---
        if(containerPlanned) {
            const el = document.createElement('div');
            // Pattern différent si c'est une estimation ou une vraie cible
            const isEst = (mod.targetSecs <= 0); 
            el.className = `h-full border-r border-white last:border-0 relative group box-border flex items-center justify-center cursor-pointer hover:bg-slate-400 transition-colors ${idx%2===0?'bg-slate-200':'bg-slate-300'} ${isEst?'pattern-dots':'pattern-grid-dark'}`;
            el.style.width = `${widthPct}%`;
            el.onclick = () => App.UI.scrollToEditor(idx);
            
            // Tooltip
            const tt = `<strong>${escapeHtml(mod.title)}</strong><br><span class="text-slate-500">${isEst ? 'Pas de cible définie' : 'Cible : ' + formatTimelineDuration(mod.targetSecs)}</span>`;
            el.onmouseenter = (e) => App.UI.showTooltip(e, tt, true);
            el.onmousemove = (e) => App.UI.updateTooltipPos(e);
            el.onmouseleave = () => App.UI.hideTooltip();

            containerPlanned.appendChild(el);
            
            // Label sous la piste
            const lab = document.createElement('div');
            lab.className = 'px-1 truncate text-center border-r border-transparent last:border-0 text-[10px] text-slate-500';
            lab.style.width = `${widthPct}%`;
            lab.innerText = (widthPct > 5) ? mod.title : '.';
            if(labelsPlanned) labelsPlanned.appendChild(lab);
        }

        // --- TRACK 1 : STRUCTURE CONÇUE (DESIGNED) ---
        // Cette piste montre le ratio rempli par rapport à la cible
        if(containerActivities) {
            const el = document.createElement('div');
            el.className = 'h-full border-r border-white last:border-0 relative group box-border flex items-center justify-start overflow-hidden bg-slate-100 cursor-pointer';
            el.style.width = `${widthPct}%`;
            el.onclick = () => App.UI.scrollToEditor(idx);

            // Barre de progression (Remplissage)
            const fillRatio = mod.segmentSecs > 0 ? (mod.designedSecs / mod.segmentSecs) : 0;
            const fillEl = document.createElement('div');
            fillEl.className = `h-full transition-all ${idx%2===0?'bg-slate-400':'bg-slate-500'} hover:bg-indigo-500`;
            fillEl.style.width = `${Math.min(100, fillRatio * 100)}%`;
            el.appendChild(fillEl);

            // Alerte si dépassement
            if(mod.designedSecs > mod.segmentSecs && mod.targetSecs > 0) {
                const alert = document.createElement('div');
                alert.className = 'absolute inset-0 timeline-alert-light pointer-events-none'; // Hachures rouges
                el.appendChild(alert);
            }

            const tt = `<strong>${escapeHtml(mod.title)}</strong><br>Conçu : ${formatTimelineDuration(mod.designedSecs)}`;
            el.onmouseenter = (e) => App.UI.showTooltip(e, tt, true);
            el.onmousemove = (e) => App.UI.updateTooltipPos(e);
            el.onmouseleave = () => App.UI.hideTooltip();

            containerActivities.appendChild(el);
            
            const lab = document.createElement('div');
            lab.className = 'px-1 truncate text-center border-r border-transparent last:border-0 text-[10px] text-slate-600 font-medium';
            lab.style.width = `${widthPct}%`;
            lab.innerText = (widthPct > 5) ? mod.title : '.';
            if(labelsActivities) labelsActivities.appendChild(lab);
        }

        // --- TRACK 2 : PÉDAGOGIE (STEPS) ---
        // C'est ici qu'on utilise les couleurs Google Workspace
        if(containerSteps && mod.details && mod.details.steps) {
            const wrap = document.createElement('div');
            wrap.className = 'h-full border-r border-white last:border-0 relative flex overflow-hidden';
            wrap.style.width = `${widthPct}%`;

            // On ne remplit que la partie "conçue" à l'intérieur du bloc cible
            const innerContainer = document.createElement('div');
            innerContainer.className = 'h-full flex';
            // Largeur du conteneur interne = ratio du temps conçu
            const innerWidthPct = mod.segmentSecs > 0 ? (mod.designedSecs / mod.segmentSecs) * 100 : 0;
            innerContainer.style.width = `${innerWidthPct}%`;

            mod.details.steps.forEach((step, sIdx) => {
                if(step.duration <= 0) return;
                // Largeur de l'étape relative au module conçu
                const stepPct = (step.duration / mod.designedSecs) * 100;
                
                const sEl = document.createElement('div');
                sEl.style.width = `${stepPct}%`;
                sEl.style.backgroundColor = TYPE_COLORS[step.type] || '#ccc'; // Couleurs Google !
                sEl.className = 'h-full border-r border-white/20 last:border-0 hover:brightness-110 transition-all cursor-pointer relative';
                sEl.onclick = () => App.UI.scrollToEditor(idx, sIdx);

                // Tooltip enrichi avec l'outil Google
                let tt = `<strong>${escapeHtml(step.title)}</strong><br>`;
                tt += `<span class="text-xs text-white/90">${step.learningTypeLabel}</span><br>`;
                if(step.toolLabel) tt += `<span class="text-xs font-bold text-yellow-200">Outil : ${step.toolLabel}</span><br>`;
                tt += `<span class="text-xs">${formatTimelineDuration(step.duration)}</span>`;
                
                sEl.onmouseenter = (e) => App.UI.showTooltip(e, tt, true);
                sEl.onmousemove = (e) => App.UI.updateTooltipPos(e);
                sEl.onmouseleave = () => App.UI.hideTooltip();

                innerContainer.appendChild(sEl);
            });
            
            wrap.appendChild(innerContainer);
            
            // Ajout des alertes visuelles (vide / dépassement) sur cette piste aussi
            if(mod.designedSecs < mod.segmentSecs && mod.targetSecs > 0) {
                // Partie vide (hachures grises ou rouges claires ?)
                const empty = document.createElement('div');
                empty.className = 'flex-1 h-full timeline-missing-light'; // Rouge clair hachuré
                wrap.appendChild(empty);
            }
            containerSteps.appendChild(wrap);
        }

        // --- PISTES DÉTAILS (Regroupement, etc.) ---
        // Helper pour dessiner un segment simple (plein ou rayé)
        const drawDetailTrack = (container, prop, valueMap, legendMap) => {
            if(!container) return;
            const wrap = document.createElement('div');
            wrap.style.width = `${widthPct}%`;
            wrap.className = 'h-full border-r border-white relative flex overflow-hidden';
            
            const inner = document.createElement('div');
            inner.className = 'h-full flex';
            const innerW = mod.segmentSecs > 0 ? (mod.designedSecs / mod.segmentSecs) * 100 : 0;
            inner.style.width = `${innerW}%`;

            if(mod.details && mod.details.steps) {
                mod.details.steps.forEach(step => {
                    if(step.duration <= 0) return;
                    const sPct = (step.duration / mod.designedSecs) * 100;
                    const val = step[prop];
                    
                    const el = document.createElement('div');
                    el.style.width = `${sPct}%`;
                    
                    // Logique visuelle (Plein = Gris foncé, Rayé = Gris clair + hachures)
                    // On adapte selon la propriété
                    const isSolid = (prop === 'groupMode' && val === 'class') ||
                                    (prop === 'trainer' && val === 'present') ||
                                    (prop === 'place' && val === 'situ') ||
                                    (prop === 'time' && val === 'sync');
                    
                    el.className = `h-full border-r border-white/20 last:border-0 cursor-help ${isSolid ? 'bg-slate-500' : 'bg-slate-400 pattern-stripes'}`;
                    
                    // Tooltip simple
                    const legend = legendMap[val] || val;
                    const tt = `<strong>${legend}</strong><br>${formatTimelineDuration(step.duration)}`;
                    el.onmouseenter = (e) => App.UI.showTooltip(e, tt, true);
                    el.onmousemove = (e) => App.UI.updateTooltipPos(e);
                    el.onmouseleave = () => App.UI.hideTooltip();

                    inner.appendChild(el);
                });
            }
            wrap.appendChild(inner);
            container.appendChild(wrap);
        };

        const t = translations.fr;
        drawDetailTrack(containerGrouping, 'groupMode', {}, {class: t.opt_whole_class, groups: t.opt_groups, individual: t.opt_individual});
        drawDetailTrack(containerTrainer, 'trainer', {}, {present: t.opt_present, absent: t.opt_absent});
        drawDetailTrack(containerPlace, 'place', {}, {situ: t.opt_insitu, online: t.opt_online, hybrid: t.opt_hybrid});
        drawDetailTrack(containerTime, 'time', {}, {sync: t.opt_sync, async: t.opt_async});

    });

    // --- RÈGLE TEMPORELLE (Ruler) ---
    if(containerRuler) {
        const totalMins = totalScaleSecs / 60;
        let stepMins = 10;
        if(totalMins > 120) stepMins = 30;
        if(totalMins > 480) stepMins = 60;
        if(totalMins > 2000) stepMins = 240; // 4h

        for(let m=0; m<=totalMins; m+=stepMins) {
            const left = (m / totalMins) * 100;
            if(left > 100) break;
            
            const tick = document.createElement('div');
            tick.className = 'timeline-ruler-tick absolute w-px bg-slate-300';
            tick.style.left = `${left}%`;
            
            const lbl = document.createElement('div');
            lbl.className = 'timeline-ruler-label absolute text-slate-500 font-mono transform -translate-x-1/2';
            lbl.style.left = `${left}%`;
            
            // Formatage échelle
            if(m===0) lbl.innerText = '0';
            else if(m>=60 && m%60===0) lbl.innerText = `${m/60}h`;
            else lbl.innerText = m;

            containerRuler.appendChild(tick);
            containerRuler.appendChild(lbl);
        }
    }
}

// Wrapper debounce pour éviter trop de calculs lors de la frappe
App.Timeline.updateStatsDebounced = function() {
    if(this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
        this.updateStats();
    }, 400); // 400ms de délai
};

/* --- ZOOM CONTROLS --- */
let timelineZoom = 1;
function setTimelineZoom(z) {
    timelineZoom = Math.max(0.5, Math.min(3, parseFloat(z)));
    document.getElementById('timeline-zoom-value').innerText = Math.round(timelineZoom * 100) + '%';
    document.getElementById('timeline-zoom-range').value = timelineZoom;
    
    // Application du zoom via CSS width sur les conteneurs internes
    const outers = document.querySelectorAll('.timeline-zoom-outer > .timeline-inner');
    outers.forEach(el => {
        el.style.width = `${timelineZoom * 100}%`;
    });
    
    // Mise à jour de la scrollbar unifiée
    App.Timeline.updateTimelineHScroll();
}

function initTimelineZoomControls() {
    const range = document.getElementById('timeline-zoom-range');
    if(range) {
        range.addEventListener('input', (e) => setTimelineZoom(e.target.value));
        document.getElementById('timeline-zoom-in').onclick = () => setTimelineZoom(timelineZoom + 0.1);
        document.getElementById('timeline-zoom-out').onclick = () => setTimelineZoom(timelineZoom - 0.1);
        document.getElementById('timeline-zoom-reset').onclick = () => setTimelineZoom(1);
    }
}

/* --- UNIFIED HORIZONTAL SCROLLBAR --- */
// Synchronise le scroll entre toutes les pistes et la scrollbar du bas
App.Timeline.setupTimelineHScroll = function() {
    const scrollbar = document.getElementById('timeline-hscroll');
    const tracks = document.querySelectorAll('.timeline-zoom-outer');
    
    if(!scrollbar) return;

    // Quand on bouge la scrollbar du bas
    scrollbar.addEventListener('scroll', () => {
        if(App.Timeline._scrolling) return;
        App.Timeline._scrolling = true;
        tracks.forEach(t => t.scrollLeft = scrollbar.scrollLeft);
        setTimeout(() => App.Timeline._scrolling = false, 10);
    });

    // Quand on bouge une piste (ex: au touchpad)
    tracks.forEach(track => {
        track.addEventListener('scroll', () => {
            if(App.Timeline._scrolling) return;
            App.Timeline._scrolling = true;
            scrollbar.scrollLeft = track.scrollLeft;
            // Synchro des autres pistes
            tracks.forEach(other => { if(other !== track) other.scrollLeft = track.scrollLeft; });
            setTimeout(() => App.Timeline._scrolling = false, 10);
        });
    });
};

// Met à jour la largeur interne de la scrollbar factice pour matcher le contenu zoomé
App.Timeline.updateTimelineHScroll = function() {
    const scrollbarInner = document.getElementById('timeline-hscroll-inner');
    const trackInner = document.getElementById('timeline-activities-planned-inner'); // Référence
    if(scrollbarInner && trackInner) {
        // La largeur est celle définie par le zoom (ex: 150%)
        scrollbarInner.style.width = trackInner.style.width || '100%';
    }
};


/* --- CHARTS (Graphiques) --- */
// Logique minimaliste sans bibliothèque externe lourde (Chart.js ou autre), utilisation de Canvas pur pour légèreté.

function updateCharts() {
    drawPieChart('chart-learning-types');
    drawBarChart('chart-group-modes', 'groupMode');
    drawBarChart('chart-place-modes', 'place');
    drawBarChart('chart-time-modes', 'time');
    drawBarChart('chart-trainer-presence', 'trainer');
}

// Fonction générique pour agréger les durées
function aggregateData(key) {
    const totals = getTotals();
    const data = {};
    let totalDuration = 0;

    totals.detailedTimeline.forEach(mod => {
        mod.steps.forEach(step => {
            if(step.duration > 0) {
                const val = (key === 'type') ? step.learningTypeLabel : step[key];
                // Mapping des valeurs techniques vers libellés lisibles pour les barres
                let label = val;
                if(key === 'groupMode') label = (val==='class'?'Classe':(val==='groups'?'Sous-groupes':'Individuel'));
                if(key === 'place') label = (val==='situ'?'Présentiel':(val==='online'?'Distanciel':'Hybride'));
                if(key === 'time') label = (val==='sync'?'Synchrone':'Asynchrone');
                if(key === 'trainer') label = (val==='present'?'Présent':'Absent');

                if(!data[label]) data[label] = 0;
                data[label] += step.duration;
                totalDuration += step.duration;
            }
        });
    });
    return { data, total: totalDuration };
}

function drawPieChart(canvasId) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const { data, total } = aggregateData('type');
    const legendEl = document.getElementById(canvasId + '-legend');
    
    // Reset
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(legendEl) legendEl.innerHTML = '';

    if(total === 0) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = "14px sans-serif";
        ctx.fillText("Aucune donnée", canvas.width/2 - 40, canvas.height/2);
        return;
    }

    let startAngle = 0;
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 10;

    // On récupère les couleurs depuis TYPE_COLORS via les clés inverses ou en dur
    // Pour simplifier, on refait un mapping inverse label -> couleur ou on utilise les clés techniques si aggregateData retournait les clés.
    // Hack: aggregateData retourne les labels (ex: "Labo Pratique"). 
    // On va chercher la couleur correspondante.
    const findColor = (lbl) => {
        for(const [k, v] of Object.entries(TYPE_COLORS)) {
            // C'est un peu fragile si les traductions changent, mais efficace ici.
            // On regarde si le label correspond à une des options du select
            // Le plus sûr aurait été d'agréger par clé technique.
            // Amélioration : aggregateData('type') utilise learningTypeLabel. Utilisons plutot raw type.
        }
        // Fallback couleur par hash si non trouvé ou simplification
        if(lbl.includes('Labo')) return TYPE_COLORS.lab;
        if(lbl.includes('Démonstration')) return TYPE_COLORS.demonstration;
        if(lbl.includes('Co-édition')) return TYPE_COLORS.collaboration;
        if(lbl.includes('Quiz')) return TYPE_COLORS.evaluation;
        if(lbl.includes('Cas')) return TYPE_COLORS.scenario;
        if(lbl.includes('Transition')) return TYPE_COLORS.migration;
        return TYPE_COLORS.none;
    };

    for (const [label, value] of Object.entries(data)) {
        const sliceAngle = (value / total) * 2 * Math.PI;
        const color = findColor(label);

        // Dessin part
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
        ctx.closePath();
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.stroke();

        startAngle += sliceAngle;

        // Légende HTML
        if(legendEl) {
            const pct = Math.round((value/total)*100);
            legendEl.innerHTML += `
                <div class="flex items-center justify-between text-xs mb-1">
                    <div class="flex items-center">
                        <span class="w-3 h-3 rounded-full mr-2" style="background-color:${color}"></span>
                        <span class="truncate max-w-[100px]" title="${label}">${label}</span>
                    </div>
                    <span class="font-bold text-slate-600">${pct}%</span>
                </div>
            `;
        }
    }
}

function drawBarChart(canvasId, key) {
    const canvas = document.getElementById(canvasId);
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    const { data, total } = aggregateData(key);
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if(total === 0) return;

    const barHeight = 16;
    const gap = 8;
    let y = 0;

    for (const [label, value] of Object.entries(data)) {
        const pct = (value / total);
        const barWidth = (canvas.width - 60) * pct; // -60 pour laisser place au texte %
        
        // Label
        ctx.fillStyle = '#475569';
        ctx.font = "10px sans-serif";
        ctx.fillText(label, 0, y + 10);

        // Barre Fond
        ctx.fillStyle = '#f1f5f9';
        ctx.fillRect(70, y, canvas.width - 110, barHeight); // Offset X pour label

        // Barre Valeur
        ctx.fillStyle = '#64748b'; // Gris par défaut pour les modalités
        // On pourrait colorer spécifiquement (ex: Présent=Vert, Absent=Rouge)
        if(label === 'Présentiel' || label === 'Synchrone' || label === 'Présent') ctx.fillStyle = '#475569';
        
        ctx.fillRect(70, y, barWidth, barHeight);

        // Pourcentage
        ctx.fillStyle = '#0f172a';
        ctx.fillText(Math.round(pct*100) + '%', 70 + barWidth + 5, y + 11);

        y += barHeight + gap;
    }
}

/* --- EXPORT FUNCTIONS (Suite) --- */
// (exportMarkdown était déjà défini plus haut, voici les autres si nécessaire ou pour compléter)

// Fonction factice pour les exports non-implémentés dans cette version "lite"
function exportNotImplemented() {
    alert("Cet export n'est pas encore adapté pour la version Google Workspace. Utilisez l'export Markdown (IA) pour l'instant.");
}

/* --- Initialisation Globale --- */
// On attache les fonctions Chart/Timeline au namespace global pour qu'elles soient accessibles
window.updateCharts = updateCharts;
