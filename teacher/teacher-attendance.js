document.addEventListener('DOMContentLoaded', async () => {
    await loadAttendanceHub();
});

async function loadAttendanceHub() {
    const user = window.currentUser || checkSession('teachers');
    if (!user) return;

    // Check if the logged in teacher is assigned as a homeroom adviser
    const { data, error } = await supabase
        .from('classes')
        .select('id')
        .eq('adviser_id', user.id)
        .maybeSingle();

    const hrCard = document.getElementById('homeroom-card');
    const hrBadge = document.getElementById('hr-badge');

    if (!data) {
        hrCard.classList.add('opacity-50', 'cursor-not-allowed', 'grayscale');
        hrCard.onclick = null; // Disable the routing link
        hrBadge.classList.remove('hidden');
    }
}