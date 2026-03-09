// admin/admin-audit-logs.js
// System Audit Logs Management

let currentPage = 1;
const PAGE_SIZE = 20;

document.addEventListener('DOMContentLoaded', async () => {
    if (typeof checkSession === 'function') {
        if (!checkSession('admins')) return;
    }
    
    await loadAuditLogs();
    injectStyles();
});

// Load audit logs with pagination and filters
async function loadAuditLogs() {
    const tbody = document.getElementById('audit-logs-body');
    if (!tbody) return;
    
    tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">Loading logs...</td></tr>`;
    
    try {
        const searchQuery = document.getElementById('log-search')?.value || '';
        const roleFilter = document.getElementById('role-filter')?.value || 'all';
        const dateStart = document.getElementById('date-start')?.value || '';
        const dateEnd = document.getElementById('date-end')?.value || '';
        
        let query = supabase.from('audit_logs').select('*', { count: 'exact' });
        
        // Apply filters
        if (searchQuery) {
            query = query.or(`action.ilike.%${searchQuery}%,details.ilike.%${searchQuery}%`);
        }
        
        if (roleFilter !== 'all') {
            query = query.eq('user_role', roleFilter);
        }
        
        if (dateStart) {
            query = query.gte('created_at', dateStart);
        }
        
        if (dateEnd) {
            query = query.lte('created_at', dateEnd + 'T23:59:59');
        }
        
        // Get total count
        const { count, error: countError } = await query;
        
        if (countError) throw countError;
        
        // Calculate pagination
        const offset = (currentPage - 1) * PAGE_SIZE;
        const { data, error } = await query
            .order('created_at', { ascending: false })
            .range(offset, offset + PAGE_SIZE - 1);
        
        if (error) throw error;
        
        // Update page info
        const pageInfo = document.getElementById('page-info');
        if (pageInfo) {
            const start = count > 0 ? offset + 1 : 0;
            const end = Math.min(offset + PAGE_SIZE, count);
            pageInfo.textContent = `Showing ${start}-${end} of ${count}`;
        }
        
        // Update pagination buttons
        document.getElementById('prev-btn').disabled = currentPage === 1;
        document.getElementById('next-btn').disabled = offset + PAGE_SIZE >= count;
        
        if (!data || data.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-gray-400 italic">No audit logs found.</td></tr>`;
            return;
        }
        
        tbody.innerHTML = data.map(log => `
            <tr class="hover:bg-gray50 transition-colors">
                <td class="px-6 py-4 text-sm text-gray-600">${formatDateTime(log.created_at)}</td>
                <td class="px-6 py-4">
                    <span class="px-2 py-1 bg-violet-100 text-violet-700 rounded text-xs font-bold uppercase">${log.user_role || 'N/A'}</span>
                    <span class="text-sm text-gray-700 ml-2">${log.username || 'Unknown'}</span>
                </td>
                <td class="px-6 py-4 text-sm font-medium text-gray-800">${log.action || 'N/A'}</td>
                <td class="px-6 py-4 text-sm text-gray-500 max-w-xs truncate">${log.details || '-'}</td>
                <td class="px-6 py-4 text-sm text-gray-500">${log.target_table || '-'} ${log.target_id ? '#' + log.target_id : ''}</td>
            </tr>
        `).join('');
        
    } catch (err) {
        console.error("Error loading audit logs:", err);
        tbody.innerHTML = `<tr><td colspan="5" class="px-6 py-12 text-center text-red-500">Error loading logs.</td></tr>`;
    }
}

// Change page
function changePage(delta) {
    currentPage += delta;
    if (currentPage < 1) currentPage = 1;
    loadAuditLogs();
}

// Apply filters
function applyFilters() {
    currentPage = 1;
    loadAuditLogs();
}

// Export to CSV
function exportLogsToCSV() {
    // Get current filtered data and export
    const tbody = document.getElementById('audit-logs-body');
    const rows = tbody.querySelectorAll('tr');
    
    if (rows.length === 0 || rows[0].querySelector('td')?.textContent.includes('No audit logs')) {
        showNotification('No data to export', 'error');
        return;
    }
    
    // Build CSV content
    let csv = 'Timestamp,User,Role,Action,Details,Target\n';
    
    rows.forEach(row => {
        const cols = row.querySelectorAll('td');
        if (cols.length >= 5) {
            const timestamp = cols[0].textContent.trim();
            const roleSpan = cols[1].querySelector('span');
            const role = roleSpan ? roleSpan.textContent.trim() : '';
            const username = cols[1].textContent.replace(role, '').trim();
            const action = cols[2].textContent.trim();
            const details = cols[3].textContent.trim().replace(/"/g, '""');
            const target = cols[4].textContent.trim();
            
            csv += `"${timestamp}","${username}","${role}","${action}","${details}","${target}"\n`;
        }
    });
    
    // Download file
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    showNotification('Audit logs exported successfully', 'success');
}

// Helper: Format datetime
function formatDateTime(dateStr) {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    return date.toLocaleString('en-PH', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Inject CSS
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }`;
    document.head.appendChild(style);
}

// Show notification
function showNotification(msg, type='info') {
    const existing = document.getElementById('notification-modal');
    if(existing) existing.remove();
    
    const modal = document.createElement('div');
    modal.id = 'notification-modal';
    modal.className = 'fixed inset-0 bg-black/50 z-[60] flex items-center justify-center animate-fade-in';
    
    const iconColor = type === 'success' ? 'text-emerald-500' : type === 'error' ? 'text-red-500' : 'text-violet-600';
    const bgColor = type === 'success' ? 'bg-emerald-50' : type === 'error' ? 'bg-red-50' : 'bg-violet-50';
    const iconName = type === 'success' ? 'check-circle' : type === 'error' ? 'alert-circle' : 'info';
    const title = type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Information';
    
    modal.innerHTML = `
        <div class="bg-white rounded-2xl shadow-2xl max-w-sm w-full mx-4 p-6 transform transition-all animate-fade-in-up">
            <div class="flex flex-col items-center text-center">
                <div class="w-16 h-16 ${bgColor} ${iconColor} rounded-full flex items-center justify-center mb-4">
                    <i data-lucide="${iconName}" class="w-8 h-8"></i>
                </div>
                <h3 class="text-xl font-black text-gray-800 mb-2">${title}</h3>
                <p class="text-sm text-gray-500 font-medium mb-6">${msg}</p>
                <button id="notif-btn" class="w-full py-3 bg-gray-900 text-white rounded-xl font-bold text-sm uppercase tracking-widest hover:bg-gray-800 transition-all">Okay, Got it</button>
            </div>
        </div>`;
    
    document.body.appendChild(modal);
    document.getElementById('notif-btn').onclick = () => modal.remove();
    if(window.lucide) lucide.createIcons();
}

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
window.loadAuditLogs = loadAuditLogs;
window.changePage = changePage;
window.applyFilters = applyFilters;
window.exportLogsToCSV = exportLogsToCSV;
