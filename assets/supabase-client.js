// Import Supabase (Ensure the CDN script is in your HTML head)
// <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>

const SUPABASE_URL = 'https://nfocaznjnyslkoejjoaa.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5mb2Nhem5qbnlzbGtvZWpqb2FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA4NTI0NzgsImV4cCI6MjA4NjQyODQ3OH0.x-jN27puW2W7HWG4uGiodPkenThqGXR_U8r_JgkajD0';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
window.supabase = supabase;
