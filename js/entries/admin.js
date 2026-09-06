// Entry point for admin.html (Vite build).
import { Store } from '../store.js';
import { esc } from '../escape.js';
import '../doha-clock.js';

const gateShell = document.getElementById('gateShell' );
const adminMain = document.getElementById('adminMain');
const logoutBtn = document.getElementById('logoutBtn');
// const passcodeForm = document.getElementById('passcodeForm');
const notAdminNotice = document.getElementById('notAdminNotice');
const gateSub = document.getElementById('gateSub');
const gateMsg = document.getElementById('gateMsg');

function getPasscode(){ return sessionStorage.getItem('sufra_admin_passcode'); }

async function showAdmin(){
  gateShell.style.display = 'none';
  adminMain.style.display = 'block';
  logoutBtn.style.display = 'inline-flex';
  await renderTables();
}

// Admins are a separate table from vendors now — an admin account
// doesn't need a vendors row at all. You're expected to already be
// signed in (e.g. via the vendor dashboard, if you're also a vendor,
// or via a direct login if you're admin-only) by the time you get
// here. This page never asks for email/password itself; it only
// checks the existing session and, if it belongs to an admin, asks
// for the passcode.
(async () => {
  const session = await Store.getSession();

  if(!session){
    gateSub.textContent = "You'll need to log in first.";
    notAdminNotice.style.display = 'block';
    return;
  }

  const admin = await Store.isAdmin(session.user.id);
  if(!admin){
    gateSub.textContent = "This account doesn't have admin access.";
    notAdminNotice.style.display = 'block';
    return;
  }

  // if(getPasscode()){
  //   showAdmin();
  //   return;
  // }

  // gateSub.textContent = `Signed in as ${session.user.email}. Enter your admin passcode to continue.`;
  // passcodeForm.style.display = 'block';
  showAdmin();
})();

// passcodeForm.addEventListener('submit', async (e) => {
//   e.preventDefault();
//   const passcode = document.getElementById('passcode').value;
//   gateMsg.classList.remove('show');
//   try{
//     const ok = await Store.verifyAdminPasscode(passcode);
//     if(!ok){
//       gateMsg.textContent = 'Incorrect passcode.';
//       gateMsg.classList.add('show');
//       return;
//     }
//     sessionStorage.setItem('sufra_admin_passcode', passcode);
//     showAdmin();
//   }catch(err){
//     gateMsg.textContent = err.message;
//     gateMsg.classList.add('show');
//   }
// });

logoutBtn.addEventListener('click', async () => {
  await Store.signOutVendor();
  // sessionStorage.removeItem('sufra_admin_passcode');
  window.location.reload();
});

const DOC_TYPES = [
  { key: 'cr', label: 'CR', column: 'cr_document_path' },
  { key: 'moph', label: 'MOPH', column: 'moph_document_path' },
  { key: 'municipality', label: 'Municipality', column: 'municipality_document_path' }
];

function documentsCell(v){
  return DOC_TYPES.map(doc => {
    const path = v[doc.column];
    if(!path) return `<span style="opacity:0.4; font-size:0.78rem;">${doc.label} —</span>`;
    return `<button class="icon-btn" style="color:var(--teal-deep);" data-view-doc="${esc(path)}">${doc.label} ↗</button>`;
  }).join('&nbsp;&nbsp;');
}

function vendorRow(v, actionHtml, showDocs){
  return `<tr>
    <td data-label="Business"><strong>${esc(v.business_name)}</strong></td>
    <td data-label="Category">${esc(v.category)}</td>
    <td data-label="Area">${esc(v.area)}</td>
    ${showDocs ? `<td data-label="Documents">${documentsCell(v)}</td>` : ''}
    <td data-label="">${actionHtml}</td>
  </tr>`;
}

async function renderTables(){
  let vendors;
  try{
    vendors = await Store.getAllVendors();
  }catch(err){
    adminMain.innerHTML = `<div class="form-msg error show">Could not load vendors: ${esc(err.message)}</div>`;
    return;
  }
  const pending = vendors.filter(v => v.verification_status === 'pending');
  const verified = vendors.filter(v => v.verification_status === 'verified');

  document.getElementById('pendingBody').innerHTML = pending.length
    ? pending.map(v => vendorRow(v, `<button class="btn btn-teal btn-sm" data-approve="${esc(v.id)}">Approve</button>`, true)).join('')
    : `<tr><td colspan="5">No pending vendors.</td></tr>`;

  document.getElementById('verifiedBody').innerHTML = verified.length
    ? verified.map(v => vendorRow(v, `<button class="icon-btn" data-revoke="${esc(v.id)}">Revoke</button>`, false)).join('')
    : `<tr><td colspan="4">No verified vendors yet.</td></tr>`;
}

adminMain.addEventListener('click', async (e) => {
  const viewDoc = e.target.closest('[data-view-doc]');
  if(viewDoc){
    viewDoc.disabled = true;
    const originalText = viewDoc.innerHTML;
    viewDoc.innerHTML = '...';
    try{
      const url = await Store.getVendorDocumentUrl(viewDoc.dataset.viewDoc);
      window.open(url, '_blank');
    }catch(err){
      alert('Could not open document: ' + err.message);
    }
    viewDoc.innerHTML = originalText;
    viewDoc.disabled = false;
    return;
  }

  const approve = e.target.closest('[data-approve]');
  const revoke = e.target.closest('[data-revoke]');
  if(!approve && !revoke) return;

  // const passcode = getPasscode();
  try{
    if(approve){ await Store.approveVendor(approve.dataset.approve); }
    else { await Store.revokeVendor(revoke.dataset.revoke); }
    renderTables();
  }catch(err){ alert('Action failed: ' + err.message); }
});
