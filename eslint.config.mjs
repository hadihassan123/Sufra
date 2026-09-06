import js from "@eslint/js";
import htmlPlugin from "eslint-plugin-html";

// sourceType changed from "script" to "module" as part of the Vite/ES
// modules migration (Phase 2 #11) - every js/**/*.js file now uses
// real import/export, and every inline <script> block that used to
// exist directly in an HTML file has moved into js/entries/*.js.
//
// The old "Sufra Global Core Modules" / "Sufra Vendor Dashboard
// Sub-Modules" globals below (Store, Fmt, DashboardState, Nav, etc.)
// have been REMOVED, not just relabeled - this is not cosmetic.
// Declaring them as globals was necessary when every file shared one
// classic-script global scope; now that each file gets what it needs
// via an explicit `import` statement, keeping them declared as
// pre-existing globals would silently defeat the main safety benefit
// of the migration - a file that forgot to import Store would no
// longer get caught by no-undef, because ESLint would believe Store
// exists everywhere regardless of imports. Only genuine external
// globals (still loaded via classic CDN <script> tags, unchanged by
// this migration) remain below.
export default [
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.html"],
    plugins: {
      html: htmlPlugin
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // --- Standard Browser APIs ---
        window: "readonly",
        document: "readonly",
        console: "readonly",
        localStorage: "readonly",
        sessionStorage: "readonly",
        navigator: "readonly",
        crypto: "readonly",
        location: "readonly",
        fetch: "readonly",
        alert: "readonly",
        confirm: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        self: "readonly",
        Blob: "readonly",
        URL: "readonly",

        // --- Third-Party Libraries (still loaded via classic CDN
        // <script> tags with SRI - unchanged by the Vite migration,
        // deliberately not converted to npm imports in this pass, see
        // the build/vite-es-modules branch notes for why) ---
        supabase: "readonly",
        L: "readonly",
        html5Qrcode: "readonly",
        Html5Qrcode: "readonly",
        QRCode: "readonly",
        imageCompression: "readonly"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "vars": "local", "args": "none" }],
      "no-unreachable": "error",
      "no-redeclare": "off"
    }
  }
];