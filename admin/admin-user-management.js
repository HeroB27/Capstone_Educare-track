// ============================================================================
// admin-user-management.js
// HUB PAGE: Only session check and logout
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
    if (window.lucide) lucide.createIcons();
    // Optional: check if admin is logged in
    // const session = await supabase.auth.getSession();
    // if (!session.data.session) window.location.href = '../index.html';
});

function logout() {
    if (confirm('Are you sure you want to logout?')) {
        window.location.href = '../index.html';
    }
}

window.logout = logout;