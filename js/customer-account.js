// Customer accounts UI (Phase 3) - sign up / sign in, reservation
// history, and cancellation.
//
// Deliberately additive: the anonymous phone-lookup flow in
// customer.js is untouched and remains the default for everyone not
// signed in. This module only takes over the pickups panel while a
// real customer account is signed in, because that view is strictly
// better for them - same reservations, plus cancellation, without
// retyping a phone number.
//
// A "customer account" is just a Supabase Auth user that has a row in
// the customers table. Vendors and admins are Auth users too, but have
// no customers row - so getMyCustomerProfile() returning null is how
// this module knows to stay out of the way entirely for them (a
// logged-in vendor browsing the homepage should not see customer
// account UI, and their session must not hide the phone lookup).

import { Store } from './store.js';
import { Fmt } from './utils.js';
import { esc } from './escape.js';
import { toast, confirmDialog } from './ui.js';

const overlay = document.getElementById('customerAuthOverlay');
const form = document.getElementById('customerAuthForm');
const titleEl = document.getElementById('customerAuthTitle');
const subtitleEl = document.getElementById('customerAuthSubtitle');
const emailInput = document.getElementById('customerAuthEmail');
const passwordInput = document.getElementById('customerAuthPassword');
const phoneField = document.getElementById('customerAuthPhoneField');
const phoneInput = document.getElementById('customerAuthPhone');
const msgEl = document.getElementById('customerAuthMsg');
const submitBtn = document.getElementById('customerAuthSubmit');
const switchText = document.getElementById('customerAuthSwitchText');
const switchLink = document.getElementById('customerAuthSwitchLink');

const lookupPanel = document.getElementById('pickupLookupPanel');
const accountPanel = document.getElementById('pickupAccountPanel');
const accountHint = document.getElementById('pickupAccountHint');
const pickupList = document.getElementById('pickupList');

let mode = 'signin'; // or 'signup'

function setMode(next){
  mode = next;
  const signingUp = mode === 'signup';
  titleEl.textContent = signingUp ? 'Create an account' : 'Sign in';
  subtitleEl.textContent = signingUp
    ? 'Keep track of your pickups and cancel reservations you can\'t make.'
    : 'See all your pickups in one place and cancel reservations you can\'t make.';
  phoneField.style.display = signingUp ? '' : 'none';
  passwordInput.setAttribute('autocomplete', signingUp ? 'new-password' : 'current-password');
  submitBtn.textContent = signingUp ? 'Create account' : 'Sign in';
  switchText.textContent = signingUp ? 'Already have an account?' : 'New to Sufra?';
  switchLink.textContent = signingUp ? 'Sign in' : 'Create an account';
  msgEl.className = 'form-msg';
  msgEl.textContent = '';
}

function openModal(next = 'signin'){
  setMode(next);
  overlay.classList.add('show');
  emailInput.focus();
}

function closeModal(){
  overlay.classList.remove('show');
  form.reset();
  msgEl.className = 'form-msg';
  msgEl.textContent = '';
}

function showError(message){
  msgEl.textContent = message;
  msgEl.className = 'form-msg error show';
}

// ---- reservation history (account view) ----

function statusNote(status){
  if(status === 'cancelled') return 'Cancelled';
  if(status === 'collected') return 'Collected';
  if(status === 'no_show') return 'Missed';
  return null;
}

async function renderHistory(){
  pickupList.innerHTML = `<div class="empty-state"><h3>Loading your pickups…</h3></div>`;

  let reservations;
  try{
    reservations = await Store.getMyReservationHistory();
  }catch(err){
    pickupList.innerHTML = `<div class="empty-state"><h3>Couldn't load your pickups</h3><p>${esc(err.message)}</p></div>`;
    return;
  }

  if(reservations.length === 0){
    pickupList.innerHTML = `<div class="empty-state"><h3>No pickups yet</h3><p>Reserve something and it'll show up here.</p></div>`;
    return;
  }

  pickupList.innerHTML = reservations.map(r => {
    const note = statusNote(r.status);
    // Only a still-pending reservation can be cancelled - the RPC
    // enforces this server-side too, this just avoids showing a button
    // that would always fail.
    const canCancel = r.status === 'reserved';
    return `
      <div class="pickup-row">
        <div class="pickup-row-info">
          <strong>${esc(r.item_name)}${Number(r.quantity) > 1 ? ` ×${esc(r.quantity)}` : ''}</strong>
          <span>${esc(r.vendor_name)} · ${Fmt.time(r.pickup_start)}–${Fmt.time(r.pickup_end)}</span>
        </div>

        <span class="pickup-code-tag">${esc(r.pickup_code)}</span>
        <span class="status-pill status-${esc(r.status)}">${esc(note || r.status)}</span>

        ${canCancel ? `
          <button
            type="button"
            class="btn btn-ghost btn-sm pickup-show-qr"
            data-reservation-id="${esc(r.id)}"
            data-pickup-code="${esc(r.pickup_code)}"
            data-pickup-start="${esc(r.pickup_start)}"
            data-pickup-end="${esc(r.pickup_end)}">
            Show QR
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-sm pickup-cancel"
            data-reservation-id="${esc(r.id)}"
            data-item-name="${esc(r.item_name)}">
            Cancel
          </button>
        ` : ''}
      </div>
    `;
  }).join('');

  wireHistoryButtons();
}

function wireHistoryButtons(){
  pickupList.querySelectorAll('.pickup-show-qr').forEach(button => {
    button.addEventListener('click', () => {
      const confirmQr = document.getElementById('confirmQr');
      const confirmCode = document.getElementById('confirmCode');
      const confirmWindow = document.getElementById('confirmWindow');
      const confirmOverlay = document.getElementById('confirmOverlay');

      confirmQr.innerHTML = '';
      new QRCode(confirmQr, { text: button.dataset.reservationId, width: 160, height: 160 });
      confirmCode.textContent = button.dataset.pickupCode;
      confirmWindow.textContent =
        `Pickup window: ${Fmt.time(button.dataset.pickupStart)}–${Fmt.time(button.dataset.pickupEnd)}`;
      confirmOverlay.classList.add('show');
    });
  });

  pickupList.querySelectorAll('.pickup-cancel').forEach(button => {
    button.addEventListener('click', async () => {
      const ok = await confirmDialog(
        `Cancel your reservation for ${button.dataset.itemName}? The item goes back on sale for someone else.`,
        { title: 'Cancel reservation', confirmText: 'Yes, cancel it', cancelText: 'Keep it', danger: true }
      );
      if(!ok) return;

      button.disabled = true;
      try{
        await Store.cancelReservation(button.dataset.reservationId);
        toast('Reservation cancelled.', { type: 'success' });
        await renderHistory();
      }catch(err){
        toast(err.message || 'Could not cancel that reservation.', { type: 'error' });
        button.disabled = false;
      }
    });
  });
}

// ---- session-driven view switching ----

async function refreshView(){
  let customer;
  try{
    customer = await Store.getMyCustomerProfile();
  }catch{
    customer = null; // treat any failure as "not a customer" rather than breaking the page
  }

  const signedIn = !!customer;
  document.body.classList.toggle('customer-signed-in', signedIn);

  if(signedIn){
    lookupPanel.style.display = 'none';
    accountPanel.style.display = '';
    accountHint.textContent = customer.phone_number
      ? `Signed in. Showing pickups for this account and for ${customer.phone_number}.`
      : 'Signed in. Showing pickups made with this account.';
    await renderHistory();
  } else {
    lookupPanel.style.display = '';
    accountPanel.style.display = 'none';
    // Deliberately does NOT clear pickupList - an anonymous visitor may
    // have just looked up pickups by phone, and wiping their results on
    // an unrelated auth event would be a confusing regression.
  }
}

// ---- wiring ----

document.getElementById('customerLoginNavLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  openModal('signin');
});

document.getElementById('pickupSignInLink')?.addEventListener('click', (e) => {
  e.preventDefault();
  openModal('signin');
});

document.getElementById('customerLogoutNavLink')?.addEventListener('click', async (e) => {
  e.preventDefault();
  await Store.signOutVendor(); // same sb.auth.signOut() underneath - not vendor-specific
  pickupList.innerHTML = '';
  toast('Signed out.', { type: 'info' });
  await refreshView();
});

switchLink.addEventListener('click', (e) => {
  e.preventDefault();
  setMode(mode === 'signup' ? 'signin' : 'signup');
});

overlay.querySelector('[data-close]')?.addEventListener('click', closeModal);
overlay.addEventListener('click', (e) => {
  if(e.target === overlay) closeModal();
});
document.addEventListener('keydown', (e) => {
  if(e.key === 'Escape' && overlay.classList.contains('show')) closeModal();
});

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.disabled = true;
  msgEl.className = 'form-msg';
  msgEl.textContent = '';

  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const phone = phoneInput.value.trim();

  try{
    if(mode === 'signup'){
      const { needsConfirmation } = await Store.signUpCustomer({ email, password, phone });
      if(needsConfirmation){
        msgEl.textContent = 'Check your email to confirm your account, then sign in.';
        msgEl.className = 'form-msg success show';
        submitBtn.disabled = true;
        return;
      }
      toast('Account created.', { type: 'success' });
    } else {
      await Store.signInCustomer({ email, password });
      toast('Signed in.', { type: 'success' });
    }
    closeModal();
    await refreshView();
    document.getElementById('pickups')?.scrollIntoView({ behavior: 'smooth' });
  }catch(err){
    showError(err.message || 'Something went wrong. Please try again.');
  }finally{
    submitBtn.disabled = false;
  }
});

// Keep the view honest if the session changes in another tab, expires,
// or a vendor logs in/out elsewhere on the page.
Store.onAuthStateChange(() => { refreshView(); });

refreshView();
