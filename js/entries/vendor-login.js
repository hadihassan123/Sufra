// Entry point for vendor-login.html (Vite build).
import { Store } from '../store.js';

const form = document.getElementById('loginForm');
const msg = document.getElementById('formMsg');
const submitBtn = document.getElementById('submitBtn');

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;

  try{
    await Store.signInVendor({ email, password });
    window.location.href = 'vendor-dashboard.html';
  }catch(err){
    msg.textContent = err.message || 'Incorrect email or password.';
    msg.className = 'form-msg error show';
    submitBtn.disabled = false;
  }
});
