import { defineConfig } from 'vite';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// import.meta.url instead of __dirname - __dirname doesn't exist in
// real ESM (only in CommonJS). Vite's config loader happens to
// transform this file in a way that makes bare __dirname work anyway,
// but relying on that undocumented behavior is exactly the kind of
// thing that quietly breaks on a Vite upgrade - this works in plain,
// portable ESM without needing that transform at all.
const __dirname = dirname(fileURLToPath(import.meta.url));

// Multi-page static site — every top-level HTML page is its own
// build input, matching what used to just be "every .html file in the
// repo root, served as-is." Vite/Rollup follows each page's real
// <script type="module"> import graph from here rather than the old
// hand-maintained <script> tag order.
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        index: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin.html'),
        vendorDashboard: resolve(__dirname, 'vendor-dashboard.html'),
        vendorSignup: resolve(__dirname, 'vendor-signup.html'),
        vendorLogin: resolve(__dirname, 'vendor-login.html'),
        vendorForgotPassword: resolve(__dirname, 'vendor-forgot-password.html'),
        vendorResetPassword: resolve(__dirname, 'vendor-reset-password.html'),
        privacy: resolve(__dirname, 'privacy.html'),
      },
    },
  },
});
