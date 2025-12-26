/* =========================================================
   STATE MANAGEMENT & CONFIG
========================================================= */

const APP_VERSION = "TrucksLog v3.8 (UX)";

// SHORT "CLICK" SOUND (Base64 encoded)
const CLICK_SOUND = new Audio("data:audio/wav;base64,UklGRiQtAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YTgtAACAgICAgICAgICAgICAgICAgICAgICAgICAf3hxeHCAgIB/fHd2eIB+fHh3eICAgIA=");

let appData = {
    counters: [],
    logs: [],
    registryFiles: [],
    settings: {
        maxRegistryFiles: 7,
        soundVolume: 0,       // 0-100 (Default: 0/Off)
        vibrateEnabled: false // Default: Off
    }
};

const LOG_TYPES = {
    APPROVED: 'approved',
    EMPTY: 'empty',
    RETURNED: 'returned'
};

// UI STATE
let currentSort = { col: 'name', dir: 'asc' };
let lastActiveTab = 'tab-counters';

/* =========================================================
   INIT & DATA LOADING
========================================================= */

function init() {
    const verEl = document.querySelector('.version');
    if (verEl) verEl.innerText = APP_VERSION;

    try {
        const stored = localStorage.getItem("trucksLogData_v3");
        if (stored) {
            appData = JSON.parse(stored);
        } else {
            const oldStored = localStorage.getItem("trucksLogData_v2");
            if (oldStored) {
                const oldData = JSON.parse(oldStored);
                appData.counters = oldData.counters || [];
                appData.logs = oldData.logs || [];
                if (oldData.registry && Array.isArray(oldData.registry) && oldData.registry.length > 0) {
                    migrateOldRegistry(oldData.registry);
                }
            } else {
                seedInitialData();
            }
        }
    } catch (e) {
        console.error("Data load error", e);
        seedInitialData();
    }

    // Ensure Settings Exist
    if (!appData.settings) appData.settings = { maxRegistryFiles: 7 };

    // Migration: Ensure new UX settings exist
    if (appData.settings.soundVolume === undefined) appData.settings.soundVolume = 0;
    if (appData.settings.vibrateEnabled === undefined) appData.settings.vibrateEnabled = false;

    // UI: Set Inputs based on data
    const volSlider = document.getElementById('setting-sound-vol');
    const volText = document.getElementById('vol-value');
    const vibrateToggle = document.getElementById('setting-vibrate-toggle');

    if (volSlider) {
        volSlider.value = appData.settings.soundVolume;
        if (volText) volText.innerText = appData.settings.soundVolume + '%';
    }
    if (vibrateToggle) vibrateToggle.checked = appData.settings.vibrateEnabled;

    setupEventListeners();
    renderCounters();
    updateLiveTotal();

    // Restore active tab
    if (document.getElementById('tab-dashboard') && document.getElementById('tab-dashboard').classList.contains('active')) {
        renderDashboard();
        lastActiveTab = 'tab-dashboard';
    } else if (document.getElementById('tab-registry') && document.getElementById('tab-registry').classList.contains('active')) {
        renderRegistryTab();
        lastActiveTab = 'tab-registry';
    }
}

function seedInitialData() {
    appData.counters = [
        { id: "c1", name: "סקטור" },
        { id: "c2", name: "WFP" },
        { id: "c3", name: "מלגזנים" },
        { id: "c4", name: "WCK" }
    ];
    save();
}

function migrateOldRegistry(oldList) {
    const fileObj = {
        id: "legacy_" + Date.now(),
        fileName: "ארכיון ישן (ייבוא)",
        fileDate: getISODate(new Date()).split('-').reverse().join('/'),
        uploadTimestamp: Date.now(),
        isActive: true,
        data: oldList.map(row => ({
            name: row.name,
            id: row.id,
            phone: normalizePhone(row.phone),
            org: row.org,
            truck: "", trailer: "", extra: ""
        }))
    };
    appData.registryFiles.push(fileObj);
    save();
}

/* =========================================================
   EVENT LISTENERS & UX FEEDBACK
========================================================= */

function setupEventListeners() {
    // 1. Modal Input
    const input = document.getElementById('edit-qty-input');
    if (input) {
        input.addEventListener("keyup", (e) => {
            if (e.key === "Enter") { e.preventDefault(); saveEditFromModal(); }
            else if (e.key === "Escape") { e.preventDefault(); closeEditModal(); }
        });
    }

    // 2. Registry Headers
    const ths = document.querySelectorAll('.registry-table th');
    if (ths.length >= 2) {
        ths[0].onclick = () => sortRegistry('name');
        ths[1].onclick = () => sortRegistry('id');
        ths[0].style.cursor = 'pointer';
        ths[1].style.cursor = 'pointer';
    }

    // 3. GLOBAL FEEDBACK LISTENER
    document.body.addEventListener('click', (e) => {
        // Detect click on interactive elements
        // Also include input[type="range"] so user gets feedback when dropping the slider handle
        const target = e.target.closest('button, .nav-item, .fab-add, .fab-whatsapp, .header-title, input[type="checkbox"], input[type="range"]');

        // Note: For the range slider, 'change'/'input' events handle the specific volume preview, 
        // but this ensures generic clicks also feel responsive if needed.
        // We filter out the slider itself here to avoid double-beeping when dragging, 
        // leaving the specific handler to do the work.
        if (target && target.type !== 'range') {
            triggerFeedback();
        }
    });
}

// THE FEEDBACK FUNCTION
function triggerFeedback() {
    // 1. Vibrate
    if (appData.settings.vibrateEnabled && navigator.vibrate) {
        navigator.vibrate(40);
    }

    // 2. Sound (Volume Control)
    const vol = parseInt(appData.settings.soundVolume); // 0-100
    if (!isNaN(vol) && vol > 0) {
        const soundClone = CLICK_SOUND.cloneNode();
        soundClone.volume = vol / 100; // Convert 0-100 to 0.0-1.0
        soundClone.play().catch(e => { /* Ignore auto-play errors */ });
    }
}

// SETTINGS HANDLERS
function updateSoundVolume(val) {
    appData.settings.soundVolume = parseInt(val);
    save();
    // Play sound immediately to demonstrate volume
    triggerFeedback();
}

function toggleVibrateSetting(isChecked) {
    appData.settings.vibrateEnabled = isChecked;
    save();
    if (isChecked) triggerFeedback();
}

function save() {
    localStorage.setItem("trucksLogData_v3", JSON.stringify(appData));
}

/* =========================================================
   REGISTRY: FILE MANAGEMENT
========================================================= */

function handleFilesUpload(input) {
    const files = Array.from(input.files);
    if (!files.length) return;

    const currentCount = appData.registryFiles.length;
    const max = appData.settings.maxRegistryFiles || 7;

    if (currentCount + files.length > max) {
        alert(`שגיאה: ניתן לשמור עד ${max} קבצים.`);
        input.value = "";
        return;
    }

    let processed = 0;
    files.forEach(file => {
        if (!file.name.toLowerCase().endsWith('.csv')) {
            alert(`הקובץ ${file.name} אינו CSV.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const content = e.target.result;
            const parsedData = smartParseCSV(content, file.name);

            const dateMatch = file.name.match(/(\d{1,2})[.-](\d{1,2})[.-](\d{2,4})/);
            let fileDateStr = getISODate(new Date()).split('-').reverse().join('/');
            if (dateMatch) {
                fileDateStr = `${dateMatch[1]}/${dateMatch[2]}/${dateMatch[3]}`;
            }

            const newFileObj = {
                id: "file_" + Date.now() + Math.random().toString(36).substring(2, 7),
                fileName: file.name,
                fileDate: fileDateStr,
                uploadTimestamp: Date.now(),
                isActive: true,
                data: parsedData
            };

            appData.registryFiles.push(newFileObj);
            processed++;

            if (processed === files.length) {
                save();
                renderRegistryTab();
                document.getElementById('files-drawer').classList.add('open');
                input.value = "";
            }
        };
        reader.readAsText(file);
    });
}

function smartParseCSV(csvText, filename) {
    const lines = csvText.split(/\r\n|\n/);
    if (lines.length < 2) return [];

    const headerLine = lines[0] + (lines[1] || "");
    const isMessy = !headerLine.match(/(שם|Name|ת"ז|ID|טלפון|Phone|משאית|Plate|ארגון|Org|ספק)/i);

    if (isMessy) {
        return parseMessyFile(lines);
    } else {
        return parseStandardFile(lines);
    }
}

function parseStandardFile(lines) {
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, '').toLowerCase());

    let idxName = -1, idxId = -1, idxPhone = -1, idxOrg = -1, idxPlate = -1;

    headers.forEach((h, i) => {
        if (h.match(/(שם|name)/)) idxName = i;
        else if (h.match(/(ת"ז|ת.ז|זהות|id|passport|דרכון)/)) idxId = i;
        else if (h.match(/(טלפון|phone|נייד|mobile|cell)/)) idxPhone = i;
        else if (h.match(/(ארגון|org|ספק|provider|transporter)/)) idxOrg = i;
        else if (h.match(/(משאית|plate|ל"ז|רישוי)/)) idxPlate = i;
    });

    const results = [];

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const cols = line.split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(c => c.trim().replace(/"/g, ''));

        let name = idxName > -1 ? cols[idxName] : "";
        let idVal = idxId > -1 ? cols[idxId] : "";
        let phone = idxPhone > -1 ? cols[idxPhone] : "";
        let org = idxOrg > -1 ? cols[idxOrg] : "";
        let truck = idxPlate > -1 ? cols[idxPlate] : "";
        let trailer = "";
        let extra = [];

        if (isLikelyPlate(phone) && isLikelyPhone(truck)) {
            let temp = phone; phone = truck; truck = temp;
        }

        if (!idVal || !phone || !truck) {
            cols.forEach((col, idx) => {
                if (idx === idxName) return;
                if (!idVal && isLikelyID(col)) idVal = col;
                else if (!phone && isLikelyPhone(col)) phone = col;
                else if (!truck && isLikelyPlate(col)) truck = col;
                else if (isLikelyPlate(col) && truck && truck !== col) trailer = col;
                else if (col.length > 2 && idx !== idxOrg && idx !== idxName) extra.push(col);
            });
        }

        if (extra.length === 0) {
            cols.forEach((col, idx) => {
                if ([idxName, idxId, idxPhone, idxOrg, idxPlate].includes(idx)) return;
                if (col && col.length > 1) extra.push(col);
            });
        }

        if (name && name.length > 1) {
            results.push({
                name: name,
                id: idVal,
                phone: normalizePhone(phone),
                org: org,
                truck: truck ? formatPlate(truck) : "",
                trailer: trailer ? formatPlate(trailer) : "",
                extra: extra.join(', ')
            });
        }
    }
    return results;
}

function parseMessyFile(lines) {
    const results = [];
    const startLine = 4;

    for (let i = startLine; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(',').map(c => c.trim().replace(/"/g, ''));

        let name = cols[1] || "";
        let idVal = cols[2] || "";

        const isBadId = !idVal || idVal.toUpperCase().includes("UNOPS") || idVal.length < 5;

        if (isBadId) {
            const match = name.match(/(SUNJ\d+|UN\d+|AUN\d+|\d{9})/i);
            if (match) {
                idVal = match[0];
                name = name.replace(match[0], '').replace(/#|:/g, '').trim();
            }
        }

        if (!name) continue;

        let org = "פרטי";
        const lineStr = line.toUpperCase();
        if (lineStr.includes("WFP")) org = "WFP";
        else if (lineStr.includes("UNICEF")) org = "UNICEF";
        else if (lineStr.includes("UNOPS")) org = "UNOPS";
        else if (lineStr.includes("UK MED")) org = "UK MED";

        results.push({
            name: name,
            id: idVal,
            phone: "",
            org: org,
            truck: "", trailer: "", extra: "קובץ או\"ם"
        });
    }
    return results;
}

// ... HELPER VALIDATORS ...

function isLikelyPhone(str) {
    if (!str) return false;
    const s = str.replace(/\D/g, '');
    return (s.startsWith('05') || s.startsWith('972') || s.startsWith('59') || s.startsWith('56')) && s.length >= 9;
}

function isLikelyID(str) {
    if (!str) return false;
    if (/^\d{9}$/.test(str)) return true;
    if (/^[A-Z]+\d+/.test(str)) return true;
    return false;
}

function isLikelyPlate(str) {
    if (!str) return false;
    const s = str.replace(/\D/g, '');
    if ((s.length === 7 || s.length === 8) && !s.startsWith('05')) return true;
    if (str.includes('-') && str.length < 12 && s.length > 5) return true;
    return false;
}

function normalizePhone(raw) {
    if (!raw) return "";
    let s = raw.replace(/\D/g, '');
    if (s.startsWith('972')) s = '0' + s.substring(3);
    if (s.length === 9 && s.startsWith('5')) s = '0' + s;
    if (s.length >= 10) {
        return `${s.substring(0, 3)}-${s.substring(3, 6)}-${s.substring(6)}`;
    }
    return raw;
}

function formatPlate(raw) {
    if (!raw) return "";
    let s = raw.replace(/\D/g, '');
    if (s.length === 8) return `${s.substring(0, 3)}-${s.substring(3, 5)}-${s.substring(5)}`;
    if (s.length === 7) return `${s.substring(0, 2)}-${s.substring(2, 5)}-${s.substring(5)}`;
    return raw;
}

/* =========================================================
   REGISTRY UI
========================================================= */

function renderRegistryTab() {
    renderRegistryFilesList();
    filterRegistry();
}

function renderRegistryFilesList() {
    const container = document.getElementById('file-list-container');
    const summary = document.getElementById('files-summary-text');
    if (!container) return;

    container.innerHTML = "";
    appData.registryFiles.sort((a, b) => b.uploadTimestamp - a.uploadTimestamp);
    const count = appData.registryFiles.length;
    summary.innerText = `📂 ${count} קבצים טעונים`;

    appData.registryFiles.forEach((file) => {
        const div = document.createElement('div');
        div.className = 'file-item';
        div.innerHTML = `
            <input type="checkbox" ${file.isActive ? 'checked' : ''} 
                   onchange="toggleFileActive('${file.id}')" style="margin-left:10px; transform:scale(1.2);">
            <div class="file-info" onclick="filterBySingleFile('${file.id}')">
                <div>
                    <div class="file-name">${file.fileName}</div>
                    <div class="file-date">תאריך: ${file.fileDate}</div>
                </div>
            </div>
            <button class="file-delete-btn text-red" onclick="deleteRegistryFile('${file.id}')">🗑️</button>
        `;
        container.appendChild(div);
    });

    const setInp = document.getElementById('setting-max-files');
    if (setInp) setInp.min = count;
}

function toggleFilesDrawer() {
    document.getElementById('files-drawer').classList.toggle('open');
}

function toggleFileActive(fileId) {
    const f = appData.registryFiles.find(x => x.id === fileId);
    if (f) { f.isActive = !f.isActive; save(); filterRegistry(); }
}

function toggleAllFiles(status) {
    appData.registryFiles.forEach(f => f.isActive = status);
    save(); renderRegistryFilesList(); filterRegistry();
}

function deleteRegistryFile(fileId) {
    if (confirm("למחוק קובץ זה מהרשימה?")) {
        appData.registryFiles = appData.registryFiles.filter(f => f.id !== fileId);
        save(); renderRegistryTab();
    }
}

function deleteAllFiles() {
    if (confirm("האם אתה בטוח?")) {
        appData.registryFiles = [];
        save(); renderRegistryTab();
    }
}

function filterRegistry() {
    const q = document.getElementById("registrySearch").value.toLowerCase();
    const tbody = document.getElementById('registry-table-body');
    const emptyState = document.getElementById('registry-empty-state');

    tbody.innerHTML = "";
    let allRows = [];

    appData.registryFiles.filter(f => f.isActive).forEach(file => {
        const tsDate = new Date(file.uploadTimestamp);
        const timeStr = tsDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

        file.data.forEach(row => {
            const txt = `${row.name} ${row.id} ${row.truck} ${row.org} ${row.extra} ${file.fileName} ${file.fileDate} ${timeStr}`.toLowerCase();
            if (q === "" || txt.includes(q)) {
                row._metaDate = file.fileDate;
                row._metaFile = file.fileName;
                row._uploadTs = file.uploadTimestamp;
                allRows.push(row);
            }
        });
    });

    if (allRows.length === 0) {
        emptyState.style.display = "block";
        return;
    }
    emptyState.style.display = "none";

    allRows.sort((a, b) => {
        let valA = (a[currentSort.col] || "").toString();
        let valB = (b[currentSort.col] || "").toString();
        if (currentSort.dir === 'asc') return valA.localeCompare(valB);
        else return valB.localeCompare(valA);
    });

    const limit = q === "" ? 100 : 500;

    allRows.slice(0, limit).forEach(row => {
        const rowId = "r_" + Math.random().toString(36).substring(2, 11);
        const tsDate = new Date(row._uploadTs);
        const timeStr = tsDate.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' });

        const tr = document.createElement('tr');
        tr.className = 'row-main';
        tr.onclick = () => toggleRowDetails(rowId);
        tr.innerHTML = `
            <td><strong>${row.name}</strong></td>
            <td>${row.id}</td>
            <td>${row.org}</td>
            <td dir="ltr" style="text-align:right">${row.phone}</td>
        `;
        tbody.appendChild(tr);

        const trExp = document.createElement('tr');
        trExp.className = 'row-expanded';
        trExp.id = rowId;
        trExp.innerHTML = `
            <td colspan="4">
                <div class="expanded-details">
                    <div class="detail-box">
                        <span class="detail-label">משאית</span>
                        <div dir="ltr">${row.truck || '-'}</div>
                    </div>
                    <div class="detail-box">
                        <span class="detail-label">נגרר</span>
                        <div dir="ltr">${row.trailer || '-'}</div>
                    </div>
                    <div class="detail-box">
                        <span class="detail-label">מקור</span>
                        <div>${row._metaDate} (${row._metaFile})</div>
                    </div>
                     <div class="detail-box">
                        <span class="detail-label">נקלט ב:</span>
                        <div>${timeStr}</div>
                    </div>
                    <div class="detail-box" style="grid-column: span 2;">
                        <span class="detail-label">מידע נוסף</span>
                        <div>${row.extra || '-'}</div>
                    </div>
                </div>
            </td>
        `;
        tbody.appendChild(trExp);
    });
}

function toggleRowDetails(id) {
    const el = document.getElementById(id);
    if (el.classList.contains('open')) el.classList.remove('open');
    else el.classList.add('open');
}

function sortRegistry(colName) {
    if (currentSort.col === colName) {
        currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
        currentSort.col = colName;
        currentSort.dir = 'asc';
    }
    filterRegistry();
}

function startVoiceSearch() {
    if (!('webkitSpeechRecognition' in window)) {
        alert("הדפדפן שלך לא תומך בחיפוש קולי");
        return;
    }
    const recognition = new webkitSpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.start();

    const btn = document.getElementById('voice-search-btn');
    btn.style.color = 'red';

    recognition.onresult = (event) => {
        const txt = event.results[0][0].transcript;
        document.getElementById('registrySearch').value = txt;
        filterRegistry();
        btn.style.color = '';
    };
    recognition.onerror = () => btn.style.color = '';
    recognition.onend = () => btn.style.color = '';
}

function filterBySingleFile(fileId) {
    appData.registryFiles.forEach(f => f.isActive = (f.id === fileId));
    save();
    renderRegistryFilesList();
    filterRegistry();
    toggleFilesDrawer();
}

/* =========================================================
   SETTINGS & TABS
========================================================= */

function updateMaxFilesSetting(val) {
    appData.settings.maxRegistryFiles = parseInt(val);
    save();
}

function toggleSettingsTab() {
    const settingsTab = document.getElementById('tab-settings');
    if (settingsTab.classList.contains('active')) {
        switchTab(lastActiveTab || 'tab-counters');
    } else {
        const current = document.querySelector('.tab-content.active');
        if (current && current.id !== 'tab-settings') lastActiveTab = current.id;
        document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
        settingsTab.classList.add('active');
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    }
}

function switchTab(id) {
    if (id !== 'tab-settings') lastActiveTab = id;
    document.querySelectorAll('.tab-content').forEach(d => d.classList.remove('active'));
    document.getElementById(id).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`button[onclick="switchTab('${id}')"]`);
    if (btn) btn.classList.add('active');
    if (id === 'tab-registry') renderRegistryTab();
    if (id === 'tab-dashboard') renderDashboard();
}

// ... COUNTER LOGIC ...

function addLog(counterId, type) {
    const now = new Date();
    appData.logs.push({
        id: Date.now().toString(36) + Math.random().toString(36).substring(2),
        counterId: counterId, timestamp: now.getTime(), dateStr: getISODate(now), type: type
    });
    if (type !== LOG_TYPES.APPROVED) {
        const c = appData.counters.find(x => x.id === counterId);
        if (c) {
            if (type === LOG_TYPES.EMPTY) c.hideEmpty = false;
            if (type === LOG_TYPES.RETURNED) c.hideReturned = false;
        }
    }
    save(); refreshUI();
}

function removeLastLog(counterId, type) {
    const todayStr = getISODate(new Date());
    let indexToRemove = -1;
    for (let i = appData.logs.length - 1; i >= 0; i--) {
        const l = appData.logs[i];
        if (l.counterId === counterId && l.type === type && l.dateStr === todayStr) {
            indexToRemove = i; break;
        }
    }
    if (indexToRemove !== -1) {
        appData.logs.splice(indexToRemove, 1);
        save(); refreshUI();
    }
}

function toggleSection(counterId, type) {
    const c = appData.counters.find(x => x.id === counterId);
    if (!c) return;
    const todayStr = getISODate(new Date());
    const count = appData.logs.filter(l => l.counterId === counterId && l.type === type && l.dateStr === todayStr).length;

    let isHidden;
    if (type === LOG_TYPES.EMPTY) {
        isHidden = (c.hideEmpty === undefined) ? (count === 0) : c.hideEmpty;
        c.hideEmpty = !isHidden;
    } else {
        isHidden = (c.hideReturned === undefined) ? (count === 0) : c.hideReturned;
        c.hideReturned = !isHidden;
    }
    save(); refreshUI();
}

function resetCounterLogs(counterId) {
    if (confirm("לאפס מונה זה להיום?")) {
        const todayStr = getISODate(new Date());
        appData.logs = appData.logs.filter(l => !(l.counterId === counterId && l.dateStr === todayStr));
        const c = appData.counters.find(x => x.id === counterId);
        if (c) { delete c.hideEmpty; delete c.hideReturned; }
        save(); refreshUI();
    }
}

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

        let hideEmpty = (c.hideEmpty === undefined) ? (empty === 0) : c.hideEmpty;
        let hideReturned = (c.hideReturned === undefined) ? (returned === 0) : c.hideReturned;

        const effectiveEmpty = hideEmpty ? 0 : empty;
        const totalArrivals = approved + effectiveEmpty;

        const ICON_LOADED = `<svg class="truck-icon" viewBox="0 0 24 24"><path d="M20 8h-3V4H3c-1.1 0-2 .9-2 2v11h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
        const ICON_EMPTY = `<svg class="truck-icon" viewBox="0 0 24 24"><path d="M20 8h-3V4h-2v7H3v3h2c0 1.66 1.34 3 3 3s3-1.34 3-3h6c0 1.66 1.34 3 3 3s3-1.34 3-3h2v-5l-3-4zM6 18.5c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm13.5-9l1.96 2.5H17V9.5h2.5zm-1.5 9c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/></svg>`;
        const ICON_RETURNED = `<svg class="truck-icon" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm5 11H7v-2h10v2z"/></svg>`;

        const div = document.createElement("div");
        div.className = "counter-card";
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
                <div class="control-block block-empty" style="display:${hideEmpty ? 'none' : 'flex'}">
                    <div class="control-actions">
                        <button class="ctrl-btn" onclick="addLog('${c.id}', '${LOG_TYPES.EMPTY}')">+</button>
                        <div class="ctrl-display" onclick="openEditModal('${c.id}', '${LOG_TYPES.EMPTY}')">
                            <span class="ctrl-val">${empty}</span>
                            <div class="ctrl-label-box">${ICON_EMPTY}<span>ריק</span></div>
                        </div>
                        <button class="ctrl-btn" onclick="removeLastLog('${c.id}', '${LOG_TYPES.EMPTY}')">−</button>
                    </div>
                </div>
                <div class="control-block block-return" style="display:${hideReturned ? 'none' : 'flex'}">
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
                <span class="summary-text">סה״כ: <b>${totalArrivals}</b> | הוחזרו: <b style="color:#e74c3c">${hideReturned ? 0 : returned}</b></span>
                <div class="footer-toggles">
                    <button class="toggle-icon-btn btn-empty ${!hideEmpty ? 'active' : ''}" onclick="toggleSection('${c.id}', '${LOG_TYPES.EMPTY}')">${ICON_EMPTY}</button>
                    <button class="toggle-icon-btn btn-returned ${!hideReturned ? 'active' : ''}" onclick="toggleSection('${c.id}', '${LOG_TYPES.RETURNED}')">${ICON_RETURNED}</button>
                </div>
            </div>
        `;
        container.appendChild(div);
    });
    if (document.getElementById("main-content")) document.getElementById("main-content").scrollTop = scrollPos;
}

function updateLiveTotal() {
    const today = getISODate(new Date());
    let count = 0;
    appData.logs.forEach(l => {
        if (l.dateStr === today && l.type !== LOG_TYPES.RETURNED) {
            const c = appData.counters.find(x => x.id === l.counterId);
            if (c) {
                if (l.type === LOG_TYPES.EMPTY && c.hideEmpty) return;
                count++;
            }
        }
    });
    const el = document.getElementById("live-total");
    if (el) el.innerText = `היום: ${count}`;
}

// ... CRUD, MODAL, EXPORT ...

function addNewCounter() { const n = prompt("שם הארגון:"); if (n) { appData.counters.push({ id: "c_" + Date.now(), name: n }); save(); renderCounters(); } }
function deleteCounter(id) { if (confirm("למחוק?")) { appData.counters = appData.counters.filter(c => c.id !== id); save(); renderCounters(); } }
function renameCounter(id, old) { const n = prompt("שם חדש:", old); if (n) { const c = appData.counters.find(x => x.id === id); if (c) { c.name = n; save(); renderCounters(); } } }

let curEdit = null;
function openEditModal(cid, type) {
    curEdit = { cid, type };
    const today = getISODate(new Date());
    const count = appData.logs.filter(l => l.counterId === cid && l.type === type && l.dateStr === today).length;
    document.getElementById('edit-qty-input').value = count;
    document.getElementById('edit-modal').classList.add('open');
    setTimeout(() => document.getElementById('edit-qty-input').focus(), 100);
}
function closeEditModal() { document.getElementById('edit-modal').classList.remove('open'); curEdit = null; }
function saveEditFromModal() {
    if (!curEdit) return;
    const val = parseInt(document.getElementById('edit-qty-input').value);
    if (isNaN(val) || val < 0) return;
    const today = getISODate(new Date());
    const current = appData.logs.filter(l => l.counterId === curEdit.cid && l.type === curEdit.type && l.dateStr === today).length;
    const diff = val - current;
    if (diff > 0) { for (let i = 0; i < diff; i++) addLog(curEdit.cid, curEdit.type); }
    else if (diff < 0) { for (let i = 0; i < Math.abs(diff); i++) removeLastLog(curEdit.cid, curEdit.type); }
    closeEditModal();
}

function renderDashboard() {
    const today = getISODate(new Date());
    const validLogs = appData.logs.filter(l => l.dateStr === today && l.type !== LOG_TYPES.RETURNED);
    document.getElementById("stat-today").innerText = validLogs.length;
    document.getElementById("stat-returned").innerText = appData.logs.filter(l => l.dateStr === today && l.type === LOG_TYPES.RETURNED).length;

    const uniqueDays = new Set(appData.logs.map(l => l.dateStr)).size || 1;
    const allValid = appData.logs.filter(l => l.type !== LOG_TYPES.RETURNED).length;
    document.getElementById("stat-avg").innerText = Math.round(allValid / uniqueDays);

    const chart = document.getElementById("activity-chart");
    chart.innerHTML = "";
    for (let i = 4; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i);
        const ds = getISODate(d);
        const v = appData.logs.filter(l => l.dateStr === ds && l.type !== LOG_TYPES.RETURNED).length;
        const bar = document.createElement("div");
        bar.style.cssText = `width:18%; background:${v > 0 ? '#FF8F3F' : '#444'}; height:${Math.min(v * 5 + 5, 100)}%;`;
        bar.title = `${ds}: ${v}`;
        chart.appendChild(bar);
    }
}

function shareWhatsApp() {
    const today = getISODate(new Date());
    let msg = `*דוח משאיות - ${today}*\n`;
    appData.counters.forEach(c => {
        const arr = appData.logs.filter(l => l.counterId === c.id && l.dateStr === today && l.type !== LOG_TYPES.RETURNED).length;
        if (arr > 0) msg += `\n${c.name}: ${arr}`;
    });
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`);
}

function refreshUI() {
    renderCounters();
    updateLiveTotal();
    if (document.getElementById('tab-dashboard').classList.contains('active')) renderDashboard();
}

function getISODate(d) { return d.toISOString().split('T')[0]; }

function exportData(fmt) {
    if (fmt === 'json') {
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob([JSON.stringify(appData)], { type: "application/json" }));
        a.download = `backup_${getISODate(new Date())}.json`;
        a.click();
    } else {
        alert("ייצוא לאקסל יגיע בגרסה הבאה (v3.8)");
    }
}
function importBackupJSON(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try { appData = JSON.parse(e.target.result); save(); location.reload(); }
        catch (e) { alert("קובץ לא תקין"); }
    }
    reader.readAsText(file);
}
function resetToday() { if (confirm("לאפס היום?")) { const t = getISODate(new Date()); appData.logs = appData.logs.filter(l => l.dateStr !== t); save(); location.reload(); } }
function hardReset() { if (confirm("למחוק הכל?")) { localStorage.clear(); location.reload(); } }

init();