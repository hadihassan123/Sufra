// The Supabase UMD script tag (CDN, with SRI) loads before this module
// and attaches `window.supabase` — referenced here as the bare global
// `supabase`, which still works correctly from inside an ES module,
// same as any other script-tag-attached global.
// The anon key below is safe to expose in client code by design —
// real access control lives in the Row Level Security policies and
// SECURITY DEFINER functions defined in /supabase/*.sql.
const SUPABASE_URL = 'https://yplswfpbcssfmgeejcpy.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlwbHN3ZnBiY3NzZm1nZWVqY3B5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwOTcwNzIsImV4cCI6MjA5OTY3MzA3Mn0.-Yt4MfU7Jpr5Pb_hdqS-uMfOen08koQA5Qc1Zyt-_LQ';

export const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

