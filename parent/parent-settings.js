// parent/parent-settings.js

async function submitPasswordChange() {
    const current = document.getElementById('cp-current').value;
    const newPass = document.getElementById('cp-new').value;
    const confirmPass = document.getElementById('cp-confirm').value;

    if(!current || !newPass || !confirmPass) return alert("All password fields are required.");
    if(newPass !== confirmPass) return alert("New passwords do not match.");
    if(newPass.length < 6) return alert("Password must be at least 6 characters.");

    const user = checkSession('parents');
    if(!user) return;

    const { data, error } = await supabase.from('parents').select('id').eq('id', user.id).eq('password', current).single();
    if(error || !data) return alert("Incorrect current password.");

    const { error: updateErr } = await supabase.from('parents').update({ password: newPass }).eq('id', user.id);
    if(updateErr) alert(updateErr.message);
    else { 
        alert("Password updated successfully!"); 
        ['cp-current', 'cp-new', 'cp-confirm'].forEach(id => document.getElementById(id).value = ''); 
    }
}