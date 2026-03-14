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
                <td class="px-6 py-4 text-sm text-gray-600">${formatDate(log.created_at, 'datetime')}</td>
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
async function exportLogsToCSV() {
    const btn = document.querySelector('button[onclick="exportLogsToCSV()"]');
    if (btn) btn.innerHTML = 'Exporting...';

    try {
        const searchQuery = document.getElementById('log-search')?.value || '';
        const roleFilter = document.getElementById('role-filter')?.value || 'all';
        const dateStart = document.getElementById('date-start')?.value || '';
        const dateEnd = document.getElementById('date-end')?.value || '';
        
        let query = supabase.from('audit_logs').select('*').order('created_at', { ascending: false });
        
        if (searchQuery) query = query.or(`action.ilike.%${searchQuery}%,details.ilike.%${searchQuery}%`);
        if (roleFilter !== 'all') query = query.eq('user_role', roleFilter);
        if (dateStart) query = query.gte('created_at', dateStart);
        if (dateEnd) query = query.lte('created_at', dateEnd + 'T23:59:59');

        const { data, error } = await query;
        if (error) throw error;

        if (!data || data.length === 0) {
            showNotification('No data to export matching current filters.', 'error');
            if (btn) btn.innerHTML = 'Export CSV';
            return;
        }

        let csv = 'Timestamp,User,Role,Action,Details,Target\n';
        data.forEach(log => {
            const timestamp = formatDate(log.created_at, 'datetime').replace(/,/g, '');
            const username = (log.username || 'Unknown').replace(/"/g, '""');
            const role = (log.user_role || 'N/A').replace(/"/g, '""');
            const action = (log.action || 'N/A').replace(/"/g, '""');
            const details = (log.details || '-').replace(/"/g, '""');
            const target = `${log.target_table || '-'} ${log.target_id ? '#' + log.target_id : ''}`.trim();
            
            csv += `"${timestamp}","${username}","${role}","${action}","${details}","${target}"\n`;
        });

        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Educare_Audit_Logs_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showNotification('Audit logs exported successfully', 'success');
    } catch (err) {
        console.error(err);
        showNotification('Error exporting logs: ' + err.message, 'error');
    } finally {
        if (btn) btn.innerHTML = 'Export CSV';
    }
}

// Helper: Format datetime (REMOVED - now using general-core.js formatDate)
// UPDATED: Using window.formatDate from general-core.js

// Inject CSS
function injectStyles() {
    const style = document.createElement('style');
    style.textContent = `@keyframes fadeInUp { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } } .animate-fade-in-up { animation: fadeInUp 0.3s ease-out forwards; }`;
    document.head.appendChild(style);
}

// Show notification (REMOVED - now using general-core.js showNotification)
// UPDATED: Using window.showNotification from general-core.js

// ===== GLOBAL WINDOW ATTACHMENTS FOR HTML ONCLICK HANDLERS =====
window.loadAuditLogs = loadAuditLogs;
window.changePage = changePage;
window.applyFilters = applyFilters;
window.exportLogsToCSV = exportLogsToCSV;
