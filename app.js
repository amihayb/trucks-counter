/* =========================================================
   STATE MANAGEMENT
========================================================= */

let appData = {
    counters: [],
    logs: [],
    registry: []
};

const LOG_TYPES = {
    APPROVED: 'approved', // Green
    EMPTY: 'empty',       // Orange
    RETURNED: 'returned'  // Red
};

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

    renderCounters();
    updateLiveTotal();

    if (document.getElementById('tab-dashboard') && document.getElementById('tab-dashboard').classList.contains('active')) {
        renderDashboard();
    }
}

function save() {
    localStorage.setItem("trucksLogData_v2", JSON.stringify(appData));
}

/* =========================================================
   CORE LOGIC
========================================================= */

function addLog(counterId, type) {
    const now = new Date();
    appData.logs.push({
        // FIXED: Replaced .substr(2) with .substring(2) to fix TS6385 warning
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        counterId: counterId,
        timestamp: now.getTime(),
        dateStr: getISODate(now),
        type: type
    });
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

function editValue(counterId, type) {
    const todayStr = getISODate(new Date());
    const currentCount = appData.logs.filter(l =>
        l.counterId === counterId && l.type === type && l.dateStr === todayStr
    ).length;

    const input = prompt(`הכנס כמות חדשה עבור ${getTypeName(type)}:`, currentCount);
    if (input === null) return;

    const newCount = parseInt(input);
    if (isNaN(newCount) || newCount < 0) return;

    const diff = newCount - currentCount;
    if (diff > 0) {
        for (let i = 0; i < diff; i++) addLog(counterId, type);
    } else if (diff < 0) {
        for (let i = 0; i < Math.abs(diff); i++) removeLastLog(counterId, type);
    }
}

function resetCounterLogs(counterId) {
    if (confirm("האם אתה בטוח שברצונך לאפס את המונה הזה להיום?")) {
        const todayStr = getISODate(new Date());
        appData.logs = appData.logs.filter(l => !(l.counterId === counterId && l.dateStr === todayStr));
        save();
        refreshUI();
    }
}

function refreshUI() {
    renderCounters();
    updateLiveTotal();
    if (document.getElementById('tab-dashboard').classList.contains('active')) renderDashboard();
}

/* =========================================================
   RENDERING
========================================================= */

function renderCounters() {
    const container = document.getElementById("counters-list");
    if (!container) return;
    container.innerHTML = "";

    const todayStr = getISODate(new Date());
    const todayLogs = appData.logs.filter(l => l.dateStr === todayStr);

    appData.counters.forEach(c => {
        const cLogs = todayLogs.filter(l => l.counterId === c.id);
        const approved = cLogs.filter(l => l.type === LOG_TYPES.APPROVED).length;
        const empty = cLogs.filter(l => l.type === LOG_TYPES.EMPTY).length;
        const returned = cLogs.filter(l => l.type === LOG_TYPES.RETURNED).length;
        const totalArrivals = approved + empty;

        const div = document.createElement("div");
        div.className = "counter-card";
        div.id = `card-${c.id}`;

        div.innerHTML = `
            <div class="card-header">
                <button class="header-btn btn-reset" onclick="event.stopPropagation(); resetCounterLogs('${c.id}')">↺</button>
                <span class="header-title" onclick="renameCounter('${c.id}', '${c.name}')">${c.name}</span>
                <button class="header-btn btn-delete" onclick="event.stopPropagation(); deleteCounter('${c.id}')">✕</button>
            </div>
            
            <div class="controls-grid">
                
                <div class="control-block block-approve">
                    <div class="control-actions">
                        <button class="ctrl-btn" onclick="addLog('${c.id}', '${LOG_TYPES.APPROVED}')">+</button>
                        <div class="ctrl-display" onclick="editValue('${c.id}', '${LOG_TYPES.APPROVED}')">
                            <span class="ctrl-val">${approved}</span>
                            <div class="ctrl-label-box">
                                <span class="ctrl-icon">✅</span>
                                <span class="ctrl-label">תקין</span>
                            </div>
                        </div>
                        <button class="ctrl-btn" onclick="removeLastLog('${c.id}', '${LOG_TYPES.APPROVED}')">−</button>
                    </div>
                </div>

                <div class="control-block block-empty">
                    <div class="control-actions">
                        <button class="ctrl-btn" onclick="addLog('${c.id}', '${LOG_TYPES.EMPTY}')">+</button>
                        <div class="ctrl-display" onclick="editValue('${c.id}', '${LOG_TYPES.EMPTY}')">
                            <span class="ctrl-val">${empty}</span>
                            <div class="ctrl-label-box">
                                <span class="ctrl-icon">⚠️</span>
                                <span class="ctrl-label">ריק</span>
                            </div>
                        </div>
                        <button class="ctrl-btn" onclick="removeLastLog('${c.id}', '${LOG_TYPES.EMPTY}')">−</button>
                    </div>
                </div>

                <div class="control-block block-return">
                    <div class="control-actions">
                        <button class="ctrl-btn" onclick="addLog('${c.id}', '${LOG_TYPES.RETURNED}')">+</button>
                        <div class="ctrl-display" onclick="editValue('${c.id}', '${LOG_TYPES.RETURNED}')">
                            <span class="ctrl-val">${returned}</span>
                            <div class="ctrl-label-box">
                                <span class="ctrl-icon">⛔</span>
                                <span class="ctrl-label">הוחזר</span>
                            </div>
                        </div>
                        <button class="ctrl-btn" onclick="removeLastLog('${c.id}', '${LOG_TYPES.RETURNED}')">−</button>
                    </div>
                </div>

            </div>

            <div class="counter-total-bar">
                סה״כ משאיות: <b>${totalArrivals}</b> | הוחזרו: <b style="color:#e74c3c">${returned}</b>
            </div>
        `;
        container.appendChild(div);
    });
}

function updateLiveTotal() {
    const todayStr = getISODate(new Date());
    const count = appData.logs.filter(l =>
        l.dateStr === todayStr && l.type !== LOG_TYPES.RETURNED
    ).length;
    const el = document.getElementById("live-total");
    if (el) el.innerText = `היום: ${count}`;
}

function getTypeName(type) {
    if (type === LOG_TYPES.APPROVED) return "תקין";
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

    document.getElementById("stat-today").innerText = todayLogs.filter(l => l.type !== LOG_TYPES.RETURNED).length;
    document.getElementById("stat-returned").innerText = todayLogs.filter(l => l.type === LOG_TYPES.RETURNED).length;

    const validLogs = appData.logs.filter(l => l.type !== LOG_TYPES.RETURNED).length;
    const uniqueDays = new Set(appData.logs.map(l => l.dateStr)).size || 1;
    document.getElementById("stat-avg").innerText = Math.round(validLogs / uniqueDays);

    const chart = document.getElementById("activity-chart");
    chart.innerHTML = "";
    for (let i = 4; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = getISODate(d);
        const val = appData.logs.filter(l => l.dateStr === ds && l.type !== LOG_TYPES.RETURNED).length;

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
        const cLogs = todayLogs.filter(l => l.counterId === c.id);
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
                appData.registry.push({
                    name: cols[0].replace(/"/g, '').trim(),
                    id: cols[1]?.replace(/"/g, '').trim() || '',
                    phone: cols[2]?.replace(/"/g, '').trim() || '',
                    org: cols[3]?.replace(/"/g, '').trim() || ''
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
        const cLogs = logs.filter(l => l.counterId === c.id);
        const arr = cLogs.filter(l => l.type !== LOG_TYPES.RETURNED).length;
        const ret = cLogs.filter(l => l.type === LOG_TYPES.RETURNED).length;
        if (arr > 0 || ret > 0) {
            msg += `*${c.name}:* ${arr}`;
            if (ret > 0) msg += ` (הוחזרו: ${ret})`;
            msg += `\n`;
        }
    });
    msg += `\n*סה"כ כניסות: ${logs.filter(l => l.type !== LOG_TYPES.RETURNED).length}*`;
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
}

function getISODate(d) { return d.toISOString().split('T')[0]; }
function switchTab(id) {
    document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelector(`button[onclick="switchTab('${id}')"]`).classList.add('active');
    if (id === 'tab-dashboard') renderDashboard();
}

// Start
init();