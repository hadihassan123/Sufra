// Entry point for vendor-forgot-password.html (Vite build).
import { Store } from '../store.js';

const form = document.getElementById('resetForm');
const msg = document.getElementById('formMsg');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  const email = document.getElementById('email').value.trim();

  try{
    await Store.requestPasswordReset(email);
    // Deliberately the same message whether or not the email exists —
    // confirming/denying an account's existence here is an information leak.
    msg.textContent = 'If an account exists for that email, a reset link is on its way. Check your inbox (and spam folder).';
    msg.className = 'form-msg success show';
    submitBtn.textContent = 'Link sent';
  }catch(err){
    msg.textContent = err.message || 'Something went wrong. Please try again.';
    msg.className = 'form-msg error show';
    submitBtn.disabled = false;
  }
});
