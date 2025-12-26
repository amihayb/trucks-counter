/* =========================================================
   STATE MANAGEMENT
========================================================= */

let appData = {
    counters: [],
    logs: [],
    registry: []
};

let lastActiveTab = 'tab-counters';

const LOG_TYPES = {
    APPROVED: 'approved', // Green
    EMPTY: 'empty',       // Orange
    RETURNED: 'returned'  // Red
};

// --- ICONS (SVG) ---
const ICON_LOADED = `<svg class="truck-icon" viewBox="0 0 24 24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
const ICON_EMPTY = `<svg class="truck-icon" viewBox="0 0 24 24"><path d="M20 8h-3V4h-2v7H3v3h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
const ICON_RETURNED = `<svg class="truck-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>`;

// MODAL STATE
let currentEditCounterId = null;
let currentEditType = null;

/* =========================================================
   INIT & DATA LOADING
========================================================= */

function init() {
    try {
        const stored = localStorage.getItem("trucksLogData_v2");
        if (stored) {
            appData = JSON.parse(stored);
        } else {
            const oldCounters = JSON.parse(localStorage.getItem("counters"));
            if (oldCounters && Array.isArray(oldCounters) && oldCounters.length > 0) {
                appData.counters = oldCounters.map((c, idx) => ({
                    id: "gen_" + idx + "_" + Date.now(),
                    name: c.name
                }));
            }
        }
    } catch (e) {
        console.error("Data load error", e);
        appData = { counters: [], logs: [], registry: [] };
    }

    if (!appData.counters || appData.counters.length === 0) {
        appData.counters = [
            { id: "c1", name: "WFP" },
            { id: "c2", name: "סקטור" },
            { id: "c3", name: "WCK" },
            { id: "c4", name: "מלגזנים" }
        ];
        save();
    }

    setupModalListeners();
    renderCounters();
    updateLiveTotal();

    if (document.getElementById('tab-dashboard') && document.getElementById('tab-dashboard').classList.contains('active')) {
        renderDashboard();
    }
}

function setupModalListeners() {
    const input = document.getElementById('edit-qty-input');
    if (!input) return;

    input.addEventListener("keyup", function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            saveEditFromModal();
        } else if (event.key === "Escape") {
            event.preventDefault();
            closeEditModal();
        }
    });
}

function save() {
    localStorage.setItem("trucksLogData_v2", JSON.stringify(appData));
}

/* =========================================================
   CORE LOGIC & HELPERS
========================================================= */

// HELPER: Should this log be counted based on visibility settings?
function isVisibleLog(log) {
    const c = appData.counters.find(x => x.id === log.counterId);
    if (!c) return true;

    if (log.type === LOG_TYPES.APPROVED) return true;

    if (log.type === LOG_TYPES.EMPTY) {
        return c.hideEmpty !== true;
    }

    if (log.type === LOG_TYPES.RETURNED) {
        return c.hideReturned !== true;
    }

    return true;
}

function addLog(counterId, type) {
    const now = new Date();
    appData.logs.push({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        counterId: counterId,
        timestamp: now.getTime(),
        dateStr: getISODate(now),
        type: type
    });

    // Auto-reveal: If adding to a section, make sure it's visible
    if (type !== LOG_TYPES.APPROVED) {
        const c = appData.counters.find(x => x.id === counterId);
        if (c) {
            if (type === LOG_TYPES.EMPTY) c.hideEmpty = false;
            if (type === LOG_TYPES.RETURNED) c.hideReturned = false;
        }
    }

    save();
    refreshUI();
}

function removeLastLog(counterId, type) {
    const todayStr = getISODate(new Date());
    let indexToRemove = -1;
    for (let i = appData.logs.length - 1; i >= 0; i--) {
        const l = appData.logs[i];
        if (l.counterId === counterId && l.type === type && l.dateStr === todayStr) {
            indexToRemove = i;
            break;
        }
    }
    if (indexToRemove !== -1) {
        appData.logs.splice(indexToRemove, 1);
        save();
        refreshUI();
    }
}

function toggleSection(counterId, type) {
    const c = appData.counters.find(x => x.id === counterId);
    if (!c) return;

    const todayStr = getISODate(new Date());
    const count = appData.logs.filter(l =>
        l.counterId === counterId && l.type === type && l.dateStr === todayStr
    ).length;

    let isCurrentlyHidden;

    if (type === LOG_TYPES.EMPTY) {
        if (c.hideEmpty === undefined) isCurrentlyHidden = (count === 0);
        else isCurrentlyHidden = c.hideEmpty;

        c.hideEmpty = !isCurrentlyHidden;

    } else if (type === LOG_TYPES.RETURNED) {
        if (c.hideReturned === undefined) isCurrentlyHidden = (count === 0);
        else isCurrentlyHidden = c.hideReturned;

        c.hideReturned = !isCurrentlyHidden;
    }

    save();
    refreshUI();
}

// --- MODAL LOGIC ---

function openEditModal(counterId, type) {
    const todayStr = getISODate(new Date());
    const currentCount = appData.logs.filter(l =>
        l.counterId === counterId && l.type === type && l.dateStr === todayStr
    ).length;

    currentEditCounterId = counterId;
    currentEditType = type;

    const modal = document.getElementById('edit-modal');
    const input = document.getElementById('edit-qty-input');
    const title = document.getElementById('modal-title');

    title.innerText = `ערוך כמות: ${getTypeName(type)}`;
    input.value = currentCount;
    modal.classList.add('open');

    setTimeout(() => {
        input.focus();
        input.select();
    }, 100);
}

function closeEditModal() {
    document.getElementById('edit-modal').classList.remove('open');
    document.getElementById('edit-qty-input').blur();
    currentEditCounterId = null;
    currentEditType = null;
}

function saveEditFromModal() {
    if (!currentEditCounterId || !currentEditType) return;

    const input = document.getElementById('edit-qty-input');
    const val = input.value === "" ? 0 : parseInt(input.value);

    if (isNaN(val) || val < 0) {
        alert("נא להכניס מספר תקין");
        return;
    }

    const todayStr = getISODate(new Date());
    const currentCount = appData.logs.filter(l =>
        l.counterId === currentEditCounterId && l.type === currentEditType && l.dateStr === todayStr
    ).length;

    const diff = val - currentCount;
    if (diff > 0) {
        for (let i = 0; i < diff; i++) addLog(currentEditCounterId, currentEditType);
    } else if (diff < 0) {
        for (let i = 0; i < Math.abs(diff); i++) removeLastLog(currentEditCounterId, currentEditType);
    }

    closeEditModal();
}

// ------------------------------------------

function resetCounterLogs(counterId) {
    if (confirm("האם אתה בטוח שברצונך לאפס את המונה הזה להיום?")) {
        const todayStr = getISODate(new Date());
        appData.logs = appData.logs.filter(l => !(l.counterId === counterId && l.dateStr === todayStr));

        // RESET DISPLAY STATE: Close sections back to default
        const c = appData.counters.find(x => x.id === counterId);
        if (c) {
            delete c.hideEmpty;
            delete c.hideReturned;
        }

        save();
        refreshUI();
    }
}

function refreshUI() {
    renderCounters();
    updateLiveTotal();
    if (document.getElementById('tab-dashboard') && document.getElementById('tab-dashboard').classList.contains('active')) renderDashboard();
}

/* =========================================================
   RENDERING
========================================================= */

function renderCounters() {
    const container = document.getElementById("counters-list");
    if (!container) return;

    const scrollPos = document.getElementById("main-content")?.scrollTop || 0;

    container.innerHTML = "";

    const todayStr = getISODate(new Date());
    const todayLogs = appData.logs.filter(l => l.dateStr === todayStr);

    appData.counters.forEach(c => {
        const cLogs = todayLogs.filter(l => l.counterId === c.id);
        const approved = cLogs.filter(l => l.type === LOG_TYPES.APPROVED).length;
        const empty = cLogs.filter(l => l.type === LOG_TYPES.EMPTY).length;
        const returned = cLogs.filter(l => l.type === LOG_TYPES.RETURNED).length;

        // VISIBILITY LOGIC
        let isEmptyHidden = c.hideEmpty;
        if (isEmptyHidden === undefined) isEmptyHidden = (empty === 0);

        let isReturnedHidden = c.hideReturned;
        if (isReturnedHidden === undefined) isReturnedHidden = (returned === 0);

        // TOTALS CALCULATION
        const effectiveEmpty = isEmptyHidden ? 0 : empty;
        const effectiveReturned = isReturnedHidden ? 0 : returned;

        const totalArrivals = approved + effectiveEmpty;

        // CSS State
        const displayEmpty = isEmptyHidden ? 'none' : 'flex';
        const displayReturned = isReturnedHidden ? 'none' : 'flex';
        const emptyBtnActive = !isEmptyHidden ? 'active' : '';
        const returnedBtnActive = !isReturnedHidden ? 'active' : '';

        const div = document.createElement("div");
        div.className = "counter-card";
        div.id = `card-${c.id}`;

        div.innerHTML = `
            <div class="card-header">
                <button class="header-btn btn-reset" onclick="event.stopPropagation(); resetCounterLogs('${c.id}')">↺</button>
                <span class="header-title" onclick="renameCounter('${c.id}', '${c.name}')">${c.name}</span>
                <button class="header-btn btn-delete" onclick="event.stopPropagation(); deleteCounter('${c.id}')">✕</button>
            </div>
            
            <div class="controls-row">
                
                <div class="control-block block-approve">
                    <div class="control-actions">
                        <button class="ctrl-btn" onclick="addLog('${c.id}', '${LOG_TYPES.APPROVED}')">+</button>
                        <div class="ctrl-display" onclick="openEditModal('${c.id}', '${LOG_TYPES.APPROVED}')">
                            <span class="ctrl-val">${approved}</span>
                            <div class="ctrl-label-box">${ICON_LOADED}<span>הועמסו</span></div>
                        </div>
                        <button class="ctrl-btn" onclick="removeLastLog('${c.id}', '${LOG_TYPES.APPROVED}')">−</button>
                    </div>
                </div>

                <div id="block-${LOG_TYPES.EMPTY}-${c.id}" class="control-block block-empty" style="display:${displayEmpty}">
                    <div class="control-actions">
                        <button class="ctrl-btn" onclick="addLog('${c.id}', '${LOG_TYPES.EMPTY}')">+</button>
                        <div class="ctrl-display" onclick="openEditModal('${c.id}', '${LOG_TYPES.EMPTY}')">
                            <span class="ctrl-val">${empty}</span>
                            <div class="ctrl-label-box">${ICON_EMPTY}<span>ריק</span></div>
                        </div>
                        <button class="ctrl-btn" onclick="removeLastLog('${c.id}', '${LOG_TYPES.EMPTY}')">−</button>
                    </div>
                </div>

                <div id="block-${LOG_TYPES.RETURNED}-${c.id}" class="control-block block-return" style="display:${displayReturned}">
                    <div class="control-actions">
                        <button class="ctrl-btn" onclick="addLog('${c.id}', '${LOG_TYPES.RETURNED}')">+</button>
                        <div class="ctrl-display" onclick="openEditModal('${c.id}', '${LOG_TYPES.RETURNED}')">
                            <span class="ctrl-val">${returned}</span>
                            <div class="ctrl-label-box">${ICON_RETURNED}<span>הוחזר</span></div>
                        </div>
                        <button class="ctrl-btn" onclick="removeLastLog('${c.id}', '${LOG_TYPES.RETURNED}')">−</button>
                    </div>
                </div>
            
            </div>

            <div class="counter-total-bar">
                <span class="summary-text">סה״כ משאיות: <b>${totalArrivals}</b> | הוחזרו: <b style="color:#e74c3c">${effectiveReturned}</b></span>
                
                <div class="footer-toggles">
                    <button id="btn-toggle-${LOG_TYPES.EMPTY}-${c.id}" 
                            class="toggle-icon-btn btn-empty ${emptyBtnActive}" 
                            onclick="toggleSection('${c.id}', '${LOG_TYPES.EMPTY}')">
                        ${ICON_EMPTY}
                    </button>
                    <button id="btn-toggle-${LOG_TYPES.RETURNED}-${c.id}" 
                            class="toggle-icon-btn btn-returned ${returnedBtnActive}" 
                            onclick="toggleSection('${c.id}', '${LOG_TYPES.RETURNED}')">
                        ${ICON_RETURNED}
                    </button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });

    const content = document.getElementById("main-content");
    if (content) content.scrollTop = scrollPos;
}

function updateLiveTotal() {
    const todayStr = getISODate(new Date());
    const count = appData.logs.filter(l =>
        l.dateStr === todayStr &&
        l.type !== LOG_TYPES.RETURNED &&
        isVisibleLog(l)
    ).length;

    const el = document.getElementById("live-total");
    if (el) el.innerText = `היום: ${count}`;
}

function getTypeName(type) {
    if (type === LOG_TYPES.APPROVED) return "הועמסו";
    if (type === LOG_TYPES.EMPTY) return "ריק";
    if (type === LOG_TYPES.RETURNED) return "הוחזר";
    return type;
}

function addNewCounter() {
    const name = prompt("שם הארגון החדש:");
    if (name) {
        appData.counters.push({ id: "c_" + Date.now(), name: name });
        save(); renderCounters();
    }
}

function deleteCounter(id) {
    if (confirm("למחוק מונה זה?")) {
        appData.counters = appData.counters.filter(c => c.id !== id);
        save(); renderCounters();
    }
}

function renameCounter(id, oldName) {
    const newName = prompt("שנה שם:", oldName);
    if (newName) {
        const c = appData.counters.find(x => x.id === id);
        if (c) { c.name = newName; save(); renderCounters(); }
    }
}

function renderDashboard() {
    const todayStr = getISODate(new Date());
    const todayLogs = appData.logs.filter(l => l.dateStr === todayStr);

    const visibleLogs = todayLogs.filter(l => isVisibleLog(l));

    const totalCount = visibleLogs.filter(l => l.type !== LOG_TYPES.RETURNED).length;
    document.getElementById("stat-today").innerText = totalCount;

    const returnedCount = visibleLogs.filter(l => l.type === LOG_TYPES.RETURNED).length;
    document.getElementById("stat-returned").innerText = returnedCount;

    const validLogs = appData.logs.filter(l =>
        l.type !== LOG_TYPES.RETURNED && isVisibleLog(l)
    ).length;
    const uniqueDays = new Set(appData.logs.map(l => l.dateStr)).size || 1;
    document.getElementById("stat-avg").innerText = Math.round(validLogs / uniqueDays);

    const chart = document.getElementById("activity-chart");
    chart.innerHTML = "";
    for (let i = 4; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = getISODate(d);
        const val = appData.logs.filter(l =>
            l.dateStr === ds &&
            l.type !== LOG_TYPES.RETURNED &&
            isVisibleLog(l)
        ).length;

        const bar = document.createElement("div");
        bar.className = "chart-bar-wrapper";
        bar.style.cssText = "flex:1; display:flex; flex-direction:column; align-items:center; justify-content:flex-end;";
        bar.innerHTML = `
            <div style="width:70%; background:#FF8F3F; border-radius:4px 4px 0 0; height:${Math.min(val * 5 + 2, 100)}%; transition:height 0.3s"></div>
            <div style="font-size:0.7em; margin-top:5px; color:#aaa">${ds.slice(8)}</div>
            <div style="font-size:0.8em; font-weight:bold">${val}</div>
        `;
        chart.appendChild(bar);
    }

    const container = document.getElementById("org-breakdown");
    container.innerHTML = "";
    appData.counters.forEach(c => {
        const cLogs = todayLogs.filter(l => l.counterId === c.id && isVisibleLog(l));
        const arr = cLogs.filter(l => l.type !== LOG_TYPES.RETURNED).length;
        const ret = cLogs.filter(l => l.type === LOG_TYPES.RETURNED).length;
        if (arr > 0 || ret > 0) {
            container.innerHTML += `
                <div class="registry-item" style="display:flex; justify-content:space-between">
                    <span>${c.name}</span>
                    <span>✅ ${arr} <span style="color:#e74c3c; margin-right:5px">⛔ ${ret}</span></span>
                </div>`;
        }
    });
}

function importRegistryCSV(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
        const lines = e.target.result.split('\n');
        appData.registry = [];
        lines.forEach(line => {
            const cols = line.split(',');
            if (cols.length >= 1 && cols[0].trim()) {
                
                let nameVal = cols[0].replace(/"/g, '').trim();
                let idVal = cols[1]?.replace(/"/g, '').trim() || '';
                let phoneVal = cols[2]?.replace(/"/g, '').trim() || '';
                let orgVal = cols[3]?.replace(/"/g, '').trim() || '';

                // SMART VALIDATION FIX
                // If ID is suspicious (contains "UNOPS", empty, or very short), try to extract from name
                if (idVal.length < 5 || idVal.toUpperCase().includes("UNOPS")) {
                    // Try to find valid ID pattern in nameVal
                    // Patterns: "SUNJ"+digits, "UN"+digits, "AUN"+digits, or 9 digit number
                    const idPattern = /(SUNJ\d+|UN\d+|AUN\d+|\b\d{9}\b)/i;
                    const match = nameVal.match(idPattern);
                    
                    if (match) {
                        idVal = match[0].toUpperCase();
                        // Remove the found ID from the name to clean it up
                        nameVal = nameVal.replace(match[0], '').trim();
                        // Clean up any trailing/leading non-word characters that might remain
                        nameVal = nameVal.replace(/^[^a-zA-Z\u0590-\u05FF]+|[^a-zA-Z\u0590-\u05FF]+$/g, '');
                    }
                }

                appData.registry.push({
                    name: nameVal,
                    id: idVal,
                    phone: phoneVal,
                    org: orgVal
                });
            }
        });
        save();
        filterRegistry();
        alert("רשימה יובאה בהצלחה");
    };
    reader.readAsText(file);
}

function filterRegistry() {
    const q = document.getElementById("registrySearch").value.toLowerCase();
    const el = document.getElementById("registry-results");
    el.innerHTML = "";
    if (q.length < 2) { el.innerHTML = "<div style='text-align:center; padding:10px; color:#555'>הקלד לחיפוש...</div>"; return; }

    const res = appData.registry.filter(i => i.name.toLowerCase().includes(q) || i.id.includes(q)).slice(0, 20);
    res.forEach(item => {
        el.innerHTML += `
            <div class="registry-item">
                <div style="color:var(--accent); font-weight:bold">${item.name}</div>
                <div style="font-size:0.85em; color:#888">${item.id} | ${item.phone}</div>
                <div style="font-size:0.8em">${item.org}</div>
            </div>`;
    });
}

function exportData(format) {
    if (format === 'json') {
        download(JSON.stringify(appData), `backup_${getISODate(new Date())}.json`, "application/json");
    } else {
        let csv = "\uFEFFDate,Time,Org,Type,Status\n";
        appData.logs.forEach(l => {
            const cName = appData.counters.find(c => c.id === l.counterId)?.name || "Unknown";
            const time = new Date(l.timestamp).toLocaleTimeString();
            csv += `${l.dateStr},${time},${cName},${l.type},${getTypeName(l.type)}\n`;
        });
        download(csv, `report_${getISODate(new Date())}.csv`, "text/csv");
    }
}

function download(content, name, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([content], { type: type }));
    a.download = name;
    a.click();
}

function importBackupJSON(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            appData = JSON.parse(e.target.result);
            save(); alert("שוחזר בהצלחה!"); location.reload();
        } catch (e) { alert("קובץ שגוי"); }
    };
    reader.readAsText(file);
}

function resetToday() {
    if (confirm("לאפס את נתוני היום?")) {
        const today = getISODate(new Date());
        appData.logs = appData.logs.filter(l => l.dateStr !== today);
        save(); location.reload();
    }
}
function hardReset() {
    if (confirm("מחיקת הכל?")) { localStorage.clear(); location.reload(); }
}

function shareWhatsApp() {
    const today = getISODate(new Date());
    const logs = appData.logs.filter(l => l.dateStr === today);
    let msg = `*דוח משאיות - ${today}*\n\n`;

    appData.counters.forEach(c => {
        const cLogs = logs.filter(l => l.counterId === c.id && isVisibleLog(l));
        const arr = cLogs.filter(l => l.type !== LOG_TYPES.RETURNED).length;
        const ret = cLogs.filter(l => l.type === LOG_TYPES.RETURNED).length;
        if (arr > 0 || ret > 0) {
            msg += `*${c.name}:* ${arr}`;
            if (ret > 0) msg += ` (הוחזרו: ${ret})`;
            msg += `\n`;
        }
    });

    const totalFiltered = logs.filter(l => l.type !== LOG_TYPES.RETURNED && isVisibleLog(l)).length;
    msg += `\n*סה"כ כניסות: ${totalFiltered}*`;

    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
}

function getISODate(d) { return d.toISOString().split('T')[0]; }

function toggleSettingsTab() {
    const settingsTab = document.getElementById('tab-settings');
    
    // If we are currently in settings tab
    if (settingsTab.classList.contains('active')) {
        // Go back to last active tab
        switchTab(lastActiveTab);
    } else {
        // We are going to settings, but first remember where we were (only if it's not settings itself)
        // Actually switchTab logic already handles 'active' class toggling.
        // We just need to switch to settings.
        // But we want to ensure we don't overwrite lastActiveTab with 'tab-settings' inside switchTab logic prematurely if we want to be clean, 
        // but switchTab sets lastActiveTab now.
        
        // Wait, switchTab implementation below sets lastActiveTab.
        // So we just call switchTab('tab-settings').
        // However, we need to make sure switchTab logic is updated to save lastActiveTab ONLY if it's NOT switching TO settings?
        // OR we handle it here manually?
        
        // The requirement says: "Update switchTab logic... In every time the user moves to a regular tab (via switchTab), update lastActiveTab."
        
        // Let's implement switchTab correctly below.
        switchTab('tab-settings');
    }
}

function switchTab(id) {
    // Requirement: "Every time the user moves to a regular tab (via switchTab), update lastActiveTab."
    // Regular tabs are: tab-counters, tab-dashboard, tab-registry.
    // tab-settings is not a "regular" tab in this context because we want to return FROM it.
    
    if (id !== 'tab-settings') {
        lastActiveTab = id;
    }

    document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    // Note: Since we removed the settings button from the bottom nav, this selector might fail if id is tab-settings.
    // So we add optional chaining or check.
    const navBtn = document.querySelector(`button[onclick="switchTab('${id}')"]`);
    if (navBtn) {
        navBtn.classList.add('active');
    }
    
    if (id === 'tab-dashboard') renderDashboard();
}

// Start
init();