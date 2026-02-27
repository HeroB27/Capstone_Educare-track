// admin/admin-data-analytics.js
// Phase 1: UI Shell and Empty Charts - Crystal Ball Analytics Dashboard

let trendChart, pieChart, barChart;

document.addEventListener('DOMContentLoaded', () => {
    // Set default date range: Last 7 days to Today
    const today = new Date();
    const lastWeek = new Date(today);
    lastWeek.setDate(lastWeek.getDate() - 7);

    document.getElementById('dateEnd').value = today.toISOString().split('T')[0];
    document.getElementById('dateStart').value = lastWeek.toISOString().split('T')[0];

    // Draw empty charts to test UI Layout
    initializeEmptyCharts();
});

// We will replace this with Supabase data in Phase 2
function loadAnalyticsData() {
    const btn = event.currentTarget;
    btn.innerHTML = '<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i>';
    lucide.createIcons();
    
    // Simulate network delay to test button spinner
    setTimeout(() => {
        alert("UI Check Complete! Ready to wire up Supabase.");
        btn.innerHTML = '<i data-lucide="refresh-cw" class="w-4 h-4"></i>';
        lucide.createIcons();
    }, 1000);
}

function initializeEmptyCharts() {
    // 1. Trend Chart (Line)
    const trendCtx = document.getElementById('trendChart').getContext('2d');
    trendChart = new Chart(trendCtx, {
        type: 'line',
        data: {
            labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
            datasets: [{ label: 'UI Test', data: [10, 20, 15, 25, 20], borderColor: '#cbd5e1', borderDash: [5, 5] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });

    // 2. Pie Chart
    const pieCtx = document.getElementById('pieChart').getContext('2d');
    pieChart = new Chart(pieCtx, {
        type: 'doughnut',
        data: {
            labels: ['Present', 'Late', 'Absent'],
            datasets: [{ data: [60, 20, 20], backgroundColor: ['#f1f5f9', '#e2e8f0', '#cbd5e1'] }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '70%' }
    });

    // 3. Bar Chart
    const barCtx = document.getElementById('barChart').getContext('2d');
    barChart = new Chart(barCtx, {
        type: 'bar',
        data: {
            labels: ['Fever', 'Traffic', 'Family'],
            datasets: [{ label: 'Incidents', data: [5, 8, 3], backgroundColor: '#cbd5e1', borderRadius: 6 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}
