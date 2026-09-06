// Sidebar identity — split from js/vendor.js on 2026-07-30.
// Runs after DashboardState.vendor has been loaded.

import { DashboardState } from '../dashboard-state.js';

DashboardState.onReady(function () {

    try {

        document.getElementById('sideVendorName').textContent =
            DashboardState.vendor.business_name;

        const statusEl = document.getElementById('sideVendorStatus');

        statusEl.textContent =
            DashboardState.vendor.verification_status === 'verified'
                ? 'Verified vendor'
                : 'Pending verification';

        if (DashboardState.vendor.verification_status !== 'verified') {

            document.getElementById('verifyBadgeNotice').innerHTML = `
                <div class="form-msg show" style="background:rgba(232,163,61,0.12); color:#C97F1E; border:1px solid rgba(232,163,61,0.3);">
                    <strong>Your account is pending verification.</strong>
                    Listings you post won't appear on the public site until an admin confirms your Commercial Registration and food license.
                </div>
            `;

        }

    } catch (err) {

        console.error('[sidebar identity] failed to render:', err);

    }

});