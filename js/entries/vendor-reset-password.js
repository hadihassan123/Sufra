// Entry point for vendor-reset-password.html (Vite build).
import { Store } from '../store.js';

const form = document.getElementById('resetForm');
const msg = document.getElementById('formMsg');
const submitBtn = document.getElementById('submitBtn');
const pageSub = document.getElementById('pageSub');

// The reset link's token is parsed automatically from the URL by the
// Supabase client on load (detectSessionInUrl is on by default). Once
// that resolves, a PASSWORD_RECOVERY event fires here confirming the
// link was valid — that's our cue to reveal the actual reset form.
// Routes through Store.onAuthStateChange rather than the raw sb client
// directly, matching the "pages never touch sb.auth directly" pattern.
let recoveryReady = false;

Store.onAuthStateChange((event) => {
  if(event === 'PASSWORD_RECOVERY'){
    recoveryReady = true;
    pageSub.textContent = 'Enter a new password for your account.';
    form.style.display = 'block';
  }
});

// If the link is missing, expired, or already used, no PASSWORD_RECOVERY
// event will ever fire — let the person know after a few seconds rather
// than leaving them staring at "Verifying…" forever.
setTimeout(() => {
  if(!recoveryReady){
    pageSub.textContent = '';
    msg.textContent = 'This reset link is invalid or has expired. Request a new one from the login page.';
    msg.className = 'form-msg error show';
  }
}, 4000);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const password = document.getElementById('password').value;
  const confirmPassword = document.getElementById('confirmPassword').value;

  if(password !== confirmPassword){
    msg.textContent = 'Passwords don\'t match.';
    msg.className = 'form-msg error show';
    return;
  }

  submitBtn.disabled = true;
  try{
    await Store.updatePassword(password);
    msg.textContent = 'Password updated. Redirecting to your dashboard…';
    msg.className = 'form-msg success show';
    form.style.display = 'none';
    setTimeout(() => { window.location.href = 'vendor-dashboard.html'; }, 1200);
  }catch(err){
    msg.textContent = err.message || 'Something went wrong. Please try again.';
    msg.className = 'form-msg error show';
    submitBtn.disabled = false;
  }
});
