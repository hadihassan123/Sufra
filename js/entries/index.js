// Entry point for index.html (Vite build). Replaces the old chain of
// individual <script src="js/..."> tags - real import order below
// replaces what used to be enforced purely by <script> tag order.
import { Store } from '../store.js';
import '../customer.js';

// Was an inline <script> block directly in index.html - moved here
// unchanged so it can use a real import (Store) instead of relying
// on classic-script global scope. Routes through Store.onAuthStateChange/
// Store.getSession rather than the raw sb client directly, matching the
// "pages never touch sb.auth directly" pattern store.js now provides.
function updateNav(isLoggedIn){
  document.body.classList.toggle('logged-in', isLoggedIn);
  const heroLink = document.getElementById('heroVendorLink');
  if(isLoggedIn){
    heroLink.textContent = 'Go to dashboard';
    heroLink.href = 'vendor-dashboard.html';
  } else {
    heroLink.textContent = 'I run a food business';
    heroLink.href = 'vendor-signup.html';
  }
}

async function updateAdminNav(){
  const link = document.getElementById('adminNavLink');
  let admin = false;
  try{
    const session = await Store.getSession();
    if(session) admin = await Store.isAdmin(session.user.id);
  }catch{
    admin = false; // never reveal the admin entry point on an error
  }
  link.style.display = admin ? 'inline-block' : 'none';
}

document.getElementById('vendorLogoutNavLink').addEventListener('click', async (e) => {
  e.preventDefault();
  await Store.signOutVendor();
  updateNav(false);
});

// Note: there is no separate "admin session" to log out of — is_admin()
// checks the same auth.uid() as everything else, so signing out via
// vendorLogoutNavLink above already covers admins too. adminNavLink
// (the "Log out (admin)" link, shown/hidden by updateAdminNav below)
// is a plain <a href="admin.html"> and needs no click handler of its
// own. This used to also clear a sessionStorage admin passcode, from
// before admin.html moved to session-based auth (see admin.html) —
// that passcode system no longer exists, so there was nothing left
// for this handler to correctly do, and the element it targeted
// (#adminLogoutNavLink) doesn't even exist in this page's HTML. That
// mismatch threw on every page load, which silently killed everything
// below it in this script block — including the auth-state listener,
// which is why the nav never updated to show "Dashboard"/"Log out"
// for a logged-in vendor.

// Listen for auth state changes and update the nav
Store.onAuthStateChange((event, session) => {
  updateNav(!!session);
});

// Also check on page load
Store.getSession().then((session) => {
  updateNav(!!session);
  document.getElementById('mainNav').classList.remove('nav-loading');
});
updateAdminNav();
