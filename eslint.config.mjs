import js from "@eslint/js";
import htmlPlugin from "eslint-plugin-html";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.html"],
    plugins: {
      html: htmlPlugin
    },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
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
        fetch: "readonly",         // <-- Added fetch
        alert: "readonly",
        confirm: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        self: "readonly",

        // --- Third-Party Libraries ---
        supabase: "readonly",
        sb: "readonly",
        L: "readonly",
        html5Qrcode: "readonly",
        Html5Qrcode: "readonly",
        QRCode: "readonly",
        imageCompression: "readonly",

        // --- Sufra Global Core Modules ---
        Store: "writable",
        Fmt: "writable",
        DashboardState: "writable",
        LocationPicker: "writable",

        // --- Sufra Vendor Dashboard Sub-Modules ---
        Documents: "writable",
        Logo: "writable",
        Listings: "writable",
        Nav: "writable",
        Pickup: "writable",
        Overview: "writable"
      }
    },
    rules: {
      "no-undef": "error",
      "no-unused-vars": ["warn", { "vars": "local", "args": "none" }], // Ignores top-level exports
      "no-unreachable": "error",
      "no-redeclare": "off"
    }
  }
];