let globalLogs = [];

async function fetchDashboardData() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/dashboard');
        const data = await response.json();

        if(data.error) {
            console.error("Backend Error:", data.error);
            return;
        }

        // Update Metrics
        const els = document.querySelectorAll('.text-\\[34px\\]');
        if(els.length >= 4) {
            els[0].innerText = `₹${data.metrics.money_at_risk.toLocaleString()}`;
            els[1].innerText = `₹${data.metrics.money_recovered.toLocaleString()}`;
            els[2].innerText = `${data.metrics.recovery_rate}%`;
            els[3].innerText = data.metrics.active_flags;
        }

        globalLogs = data.logs || [];
        applyFilters();
        updateGuardrailsView();
        updatePipelineView();
        updateEmailsView();

    } catch (error) {
        console.error("Failed to connect to backend. Is Python running?", error);
        
        // Ensure UI reflects the failure if the main API fails
        fetchHealthStatus();
    }
}

async function fetchHealthStatus() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/health');
        const data = await response.json();
        
        const updateStatus = (id, statusStr) => {
            const el = document.getElementById(id);
            if (!el) return;
            if (statusStr === 'connected') {
                el.innerText = 'Connected';
                el.className = 'text-[#22c55e] text-sm font-medium';
            } else {
                el.innerText = 'Disconnected';
                el.className = 'text-red-500 text-sm font-medium';
            }
        };

        updateStatus('status-transactions', data.mysql);
        updateStatus('status-customers', data.mysql);
        updateStatus('status-audit_logs', data.mysql);
        updateStatus('status-gemini', data.gemini);
        updateStatus('status-smtp', data.smtp);
        
    } catch (e) {
        // If API fails entirely, mark all as disconnected
        const els = ['status-transactions', 'status-customers', 'status-audit_logs', 'status-gemini', 'status-smtp'];
        els.forEach(id => {
            const el = document.getElementById(id);
            if (el) {
                el.innerText = 'Disconnected';
                el.className = 'text-red-500 text-sm font-medium';
            }
        });
    }
}

async function fetchSettings() {
    try {
        const response = await fetch('http://127.0.0.1:5000/api/settings');
        const config = await response.json();
        
        if (config.max_retries !== undefined) document.getElementById('input-max-retries').value = config.max_retries;
        if (config.cooldown_hours !== undefined) document.getElementById('input-cooldown').value = config.cooldown_hours;
        if (config.max_reminders !== undefined) document.getElementById('input-max-reminders').value = config.max_reminders;
        if (config.high_ltv_threshold !== undefined) document.getElementById('input-high-ltv').value = config.high_ltv_threshold;
    } catch (e) {
        console.error("Failed to load settings from backend:", e);
    }
}

async function saveSettings() {
    // Get the button element that triggered this (using global event if necessary, or just query it)
    const btn = document.querySelector('#tab-settings button');
    const oldText = btn.innerText;
    btn.innerText = "Saving...";
    
    const payload = {
        max_retries: parseInt(document.getElementById('input-max-retries').value),
        cooldown_hours: parseInt(document.getElementById('input-cooldown').value),
        max_reminders: parseInt(document.getElementById('input-max-reminders').value),
        high_ltv_threshold: parseInt(document.getElementById('input-high-ltv').value)
    };

    try {
        const response = await fetch('http://127.0.0.1:5000/api/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const res = await response.json();
        if (res.status === 'success') {
            btn.innerText = "Saved!";
            setTimeout(() => {
                btn.innerText = oldText;
            }, 2000);
        }
    } catch (e) {
        console.error("Failed to save settings:", e);
        btn.innerText = "Error!";
        setTimeout(() => btn.innerText = oldText, 2000);
    }
}

function updatePipelineView() {
    const totalEvents = globalLogs.length;
    const halts = globalLogs.filter(log => log.action_taken === 'stopped_contacting');
    const blockedCount = halts.length;
    const actionedCount = totalEvents - blockedCount;
    const loggedCount = totalEvents;

    const elTotal = document.getElementById('pipe-total');
    const elIngested = document.getElementById('pipe-ingested');
    const elDiagnosed = document.getElementById('pipe-diagnosed');
    const elBlocked = document.getElementById('pipe-blocked');
    const elActioned = document.getElementById('pipe-actioned');
    const elLogged = document.getElementById('pipe-logged');

    if(elTotal) elTotal.innerText = totalEvents;
    if(elIngested) elIngested.innerText = totalEvents;
    if(elDiagnosed) elDiagnosed.innerText = totalEvents;
    if(elBlocked) elBlocked.innerText = blockedCount;
    if(elActioned) elActioned.innerText = actionedCount;
    if(elLogged) elLogged.innerText = loggedCount;
}

function updateEmailsView() {
    const emails = globalLogs.filter(log => log.action_taken === 'sent_emi_link' || log.action_taken === 'sent_reminder');
    
    let emiCount = 0;
    let reminderCount = 0;

    emails.forEach(log => {
        if (log.action_taken === 'sent_emi_link') emiCount++;
        else if (log.action_taken === 'sent_reminder') reminderCount++;
    });

    const elTotal = document.getElementById('email-total');
    const elEmi = document.getElementById('email-emi');
    const elReminders = document.getElementById('email-reminders');
    
    if (elTotal) elTotal.innerText = emails.length;
    if (elEmi) elEmi.innerText = emiCount;
    if (elReminders) elReminders.innerText = reminderCount;

    const feedContainer = document.getElementById('email-feed');
    if (!feedContainer) return;
    feedContainer.innerHTML = '';

    if (emails.length === 0) {
        feedContainer.innerHTML = '<div class="px-6 py-8 text-center text-gray-500">No emails dispatched recently.</div>';
        return;
    }

    emails.forEach(log => {
        const date = new Date(log.created_at);
        const timeStr = isNaN(date.getTime()) ? "Just now" : date.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit'});
        
        const isEmi = log.action_taken === 'sent_emi_link';
        const typeTag = isEmi ? 'EMI Link' : 'Reminder';
        const typeColor = isEmi ? 'text-[#3b82f6] bg-[#3b82f6]/10 border-[#3b82f6]/20' : 'text-[#f59e0b] bg-[#f59e0b]/10 border-[#f59e0b]/20';
        const amountStr = `₹${parseFloat(log.amount || 0).toLocaleString()}`;
        
        const customerName = log.name || 'Unknown';
        const customerEmail = log.email || 'N/A';

        const rowHTML = `
            <div class="px-6 py-5 flex items-center justify-between hover:bg-[#1a1a1a] transition-colors">
                <div class="flex items-start gap-4 w-2/5">
                    <div class="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center text-gray-400 font-medium shrink-0">
                        ${customerName.charAt(0).toUpperCase()}
                    </div>
                    <div>
                        <div class="font-medium text-gray-200">${customerName}</div>
                        <div class="text-xs text-gray-500 mt-1">${customerEmail}</div>
                    </div>
                </div>
                
                <div class="w-1/4">
                    <div class="text-sm text-gray-300 font-mono">${log.txn_id}</div>
                    <div class="text-xs text-gray-500 mt-1">Amount: ${amountStr}</div>
                </div>

                <div class="w-1/4 flex flex-col items-start gap-2">
                    <span class="px-2.5 py-1 rounded-md text-[11px] font-medium border ${typeColor}">${typeTag}</span>
                    <span class="text-xs text-gray-500">${timeStr}</span>
                </div>
                
                <div class="w-1/12 flex justify-end">
                    <span class="flex h-2 w-2 relative">
                        <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#4ade80] opacity-75"></span>
                        <span class="relative inline-flex rounded-full h-2 w-2 bg-[#4ade80]"></span>
                    </span>
                </div>
            </div>
        `;
        feedContainer.innerHTML += rowHTML;
    });
}

function updateGuardrailsView() {
    // 1. Calculate metrics
    const halts = globalLogs.filter(log => log.action_taken === 'stopped_contacting');
    
    let fraudHalts = 0;
    let timeoutHalts = 0;
    let otherHalts = 0;

    halts.forEach(log => {
        const fr = (log.failure_reason || '').toLowerCase();
        if (fr.includes('fraud')) fraudHalts++;
        else if (fr.includes('timeout') || fr.includes('503')) timeoutHalts++;
        else otherHalts++;
    });

    // Update the DOM for summary strip
    const totalHaltsEl = document.getElementById('guardrail-total-halts');
    const fraudHaltsEl = document.getElementById('guardrail-fraud-halts');
    const timeoutHaltsEl = document.getElementById('guardrail-timeout-halts');
    const otherHaltsEl = document.getElementById('guardrail-other-halts');

    if (totalHaltsEl) totalHaltsEl.innerText = halts.length;
    if (fraudHaltsEl) fraudHaltsEl.innerText = fraudHalts;
    if (timeoutHaltsEl) timeoutHaltsEl.innerText = timeoutHalts;
    if (otherHaltsEl) otherHaltsEl.innerText = otherHalts;

    // 2. Render recent interventions feed (just the halts)
    const feedContainer = document.getElementById('guardrail-feed');
    if (!feedContainer) return;
    feedContainer.innerHTML = '';

    if (halts.length === 0) {
        feedContainer.innerHTML = '<div class="text-sm text-gray-500 py-4">No recent guardrail interventions.</div>';
        return;
    }

    // Limit to 5 most recent for the feed
    const recentHalts = halts.slice(0, 5);

    recentHalts.forEach(log => {
        const date = new Date(log.created_at);
        const timeStr = isNaN(date.getTime()) ? "Just now" : date.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: false});
        
        let diagTag = "error";
        let diagColor = "text-gray-400";
        const fr = (log.failure_reason || '').toLowerCase();
        if(fr.includes('fraud')) { diagTag = "fraud risk"; diagColor = "text-[#f87171]"; }
        else if(fr.includes('timeout') || fr.includes('503')) { diagTag = "bank timeout"; diagColor = "text-[#60a5fa]"; }
        else if(fr.includes('funds') || fr.includes('insufficient')) { diagTag = "nsf"; diagColor = "text-[#fbbf24]"; }

        const amountStr = `₹${parseFloat(log.amount || 0).toLocaleString()}`;

        const rowHTML = `
            <div class="bg-[#161616] border border-[#2a2a2a] rounded-lg p-4">
                <div class="flex justify-between items-start mb-2">
                    <div>
                        <span class="text-gray-300 font-medium text-sm mr-2">${log.txn_id}</span>
                        <span class="text-gray-500 text-xs">${timeStr}</span>
                    </div>
                    <span class="bg-[#2a1313] text-[#f87171] px-2 py-0.5 rounded text-[10px] font-bold tracking-widest uppercase">Blocked</span>
                </div>
                <div class="text-sm flex gap-6 mb-3">
                    <div><span class="text-gray-500 mr-1">Customer:</span> <span class="text-gray-400 font-mono">${log.customer_id || 'Unknown'}</span></div>
                    <div><span class="text-gray-500 mr-1">Amount:</span> <span class="text-gray-300">${amountStr}</span></div>
                    <div><span class="text-gray-500 mr-1">Trigger:</span> <span class="${diagColor} font-medium">${diagTag}</span></div>
                </div>
                <div class="bg-[#111] p-3 rounded border border-[#222] text-xs">
                    <div class="flex gap-2"><span class="text-[#a78bfa] shrink-0 font-medium">Reasoning:</span> <span class="text-gray-400">${log.ai_reasoning}</span></div>
                </div>
            </div>
        `;
        feedContainer.innerHTML += rowHTML;
    });
}

function applyFilters() {
    const searchEl = document.getElementById('search-filter');
    const statusEl = document.getElementById('status-filter');
    const diagnosisEl = document.getElementById('diagnosis-filter');
    
    const searchTerm = searchEl ? searchEl.value.toLowerCase() : '';
    const statusTerm = statusEl ? statusEl.value.toLowerCase() : '';
    const diagnosisTerm = diagnosisEl ? diagnosisEl.value.toLowerCase() : '';

    const filteredLogs = globalLogs.filter(log => {
        // 1. Search Filter (TXN ID or Customer ID)
        const txnId = (log.txn_id || '').toLowerCase();
        const customerId = (log.customer_id || 'cust_***482').toLowerCase();
        const matchesSearch = txnId.includes(searchTerm) || customerId.includes(searchTerm);

        // 2. Status Filter
        let logStatus = (log.status || 'unknown').toLowerCase();
        if (log.action_taken === 'stopped_contacting' || logStatus === 'blocked') {
            logStatus = 'blocked';
        } else if (logStatus === 'failed') {
            logStatus = 'abandoned';
        }
        const matchesStatus = statusTerm === '' || logStatus === statusTerm;

        // 3. Diagnosis Filter
        const fr = (log.failure_reason || '').toLowerCase();
        let logDiag = 'error';
        if(fr.includes('fraud')) logDiag = 'fraud';
        else if (fr.includes('funds') || fr.includes('insufficient')) logDiag = 'nsf';
        else if (fr.includes('timeout') || fr.includes('503')) logDiag = 'timeout';

        const matchesDiagnosis = diagnosisTerm === '' || logDiag === diagnosisTerm;

        return matchesSearch && matchesStatus && matchesDiagnosis;
    });

    renderTable(filteredLogs);
}

function renderTable(logs) {
    const container = document.getElementById('transactions-container');
    if (!container) return;
    
    container.innerHTML = ''; // Clear existing data

    if (logs.length === 0) {
        container.innerHTML = '<div class="text-center text-gray-500 py-12">No transactions match your filters.</div>';
        return;
    }

    logs.forEach(log => {
        // Format time
        const date = new Date(log.created_at);
        const timeStr = isNaN(date.getTime()) ? "Oct 24, 14:32:01" : date.toLocaleString('en-US', {month: 'short', day: 'numeric', hour: '2-digit', minute:'2-digit', second:'2-digit', hour12: false});
        
        const amountStr = `₹${parseFloat(log.amount || 0).toLocaleString()}`;
        const customerId = log.customer_id || 'cust_***482'; // Fallback
        
        // Status logic
        let statusText = (log.status || 'unknown').charAt(0).toUpperCase() + (log.status || 'unknown').slice(1);
        let statusColor = "text-[#22c55e]"; // Default green (recovered)
        if(log.status === 'abandoned' || log.status === 'failed') {
            statusText = "Abandoned";
            statusColor = "text-[#fbbf24]"; // Yellow
        }
        if(log.status === 'blocked' || log.action_taken === 'stopped_contacting') {
            statusText = "Blocked";
            statusColor = "text-[#f87171]"; // Red
        }

        // Diagnosis Logic
        let diagBg = "bg-[#0b213f]";
        let diagText = "text-[#60a5fa]";
        let diagTag = "bank timeout";
        
        const fr = (log.failure_reason || '').toUpperCase();
        if(fr.includes('FRAUD')) {
            diagBg = "bg-[#450a0a]"; diagText = "text-[#f87171]"; diagTag = "fraud risk";
        } else if (fr.includes('FUNDS') || fr.includes('INSUFFICIENT')) {
            diagBg = "bg-[#422006]"; diagText = "text-[#fbbf24]"; diagTag = "insufficient funds";
        } else if (fr.includes('TIMEOUT') || fr.includes('503')) {
            diagBg = "bg-[#0b213f]"; diagText = "text-[#60a5fa]"; diagTag = "bank timeout";
        } else {
            diagBg = "bg-[#252525]"; diagText = "text-gray-300"; diagTag = "error";
        }

        // Action formatted
        let formattedAction = (log.action_taken || '').replace(/_/g, ' ');
        formattedAction = formattedAction.charAt(0).toUpperCase() + formattedAction.slice(1);

        const rowHTML = `
            <details class="group rounded-xl border border-transparent open:bg-[#121212] open:border-[#2a2a2a] hover:bg-[#1a1a1a] open:hover:bg-[#121212] transition-colors">
                <summary class="grid grid-cols-12 gap-4 items-center cursor-pointer p-4 list-none [&::-webkit-details-marker]:hidden focus:outline-none">
                    <div class="col-span-2">
                        <div class="text-gray-300 font-medium text-[14px] group-open:text-white group-open:font-semibold transition-colors">${log.txn_id}</div>
                        <div class="text-gray-500 text-[12px] mt-0.5">${timeStr}</div>
                    </div>
                    <div class="col-span-2 text-gray-400 text-[13px] font-mono truncate pr-2">
                        ${customerId}
                    </div>
                    <div class="col-span-2 text-gray-300 font-medium text-[14px]">
                        ${amountStr}
                    </div>
                    <div class="col-span-3">
                        <span class="${diagBg} ${diagText} px-3 py-1 rounded-full text-[12px] font-medium tracking-wide whitespace-nowrap">${diagTag}</span>
                    </div>
                    <div class="col-span-3 flex items-center justify-end gap-3 ${statusColor} font-semibold text-[14px]">
                        ${statusText} 
                        <svg class="w-5 h-5 opacity-70 group-open:rotate-90 transition-transform duration-200 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
                    </div>
                </summary>
                
                <div class="px-4 pb-4 pt-1">
                    <div class="bg-[#1a1a1a] rounded-lg p-5 border border-[#222]">
                        <div class="grid grid-cols-2 gap-8">
                            <div class="space-y-3">
                                <div><span class="text-gray-500 font-medium text-[12px] tracking-wider uppercase block mb-2">Logic Trace</span></div>
                                <div class="text-[14px] flex"><span class="text-gray-500 w-16 shrink-0">Log:</span> <span class="text-gray-300">${log.failure_reason}</span></div>
                                <div class="text-[14px] flex items-start"><span class="text-[#a78bfa] w-16 shrink-0">Gemini:</span> 
                                    <div>
                                        <span class="text-gray-300">${log.ai_reasoning}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="space-y-3">
                                <div><span class="text-gray-500 font-medium text-[12px] tracking-wider uppercase block mb-2">Execution Layer</span></div>
                                <div class="text-[14px] flex"><span class="text-[#fbbf24] w-20 shrink-0">Decision:</span> <span class="text-gray-300">Policy evaluation</span></div>
                                <div class="text-[14px] flex"><span class="${statusColor} w-20 shrink-0">Action:</span> <span class="text-gray-300">${formattedAction}</span></div>
                            </div>
                        </div>
                    </div>
                </div>
            </details>
        `;
        container.innerHTML += rowHTML;
    });
}

// Bind events on load
document.addEventListener('DOMContentLoaded', () => {
    const searchEl = document.getElementById('search-filter');
    const statusEl = document.getElementById('status-filter');
    const diagnosisEl = document.getElementById('diagnosis-filter');
    const dateEl = document.getElementById('date-filter');

    if (searchEl) searchEl.addEventListener('input', applyFilters);
    if (statusEl) statusEl.addEventListener('change', applyFilters);
    if (diagnosisEl) diagnosisEl.addEventListener('change', applyFilters);
    if (dateEl) dateEl.addEventListener('change', applyFilters);

    fetchSettings();
    fetchHealthStatus();
    fetchDashboardData();
});