/* global console, process */
import { spawn } from 'child_process';
import readline from 'readline';

function runCommand(command, args) {
  const child = spawn(command, args, { stdio: 'inherit', shell: true });
  child.on('exit', (code) => {
    process.exit(code);
  });
}

// ----------------------------------------------------
// 1. AUTOMATED / NON-INTERACTIVE MODE (Git Hooks / CI)
// ----------------------------------------------------
if (!process.stdin.isTTY) {
  console.log('🤖 Non-interactive environment detected. Running full test suite...\n');
  runCommand('npm', ['run', 'test:all']);
} else {
  // ----------------------------------------------------
  // 2. INTERACTIVE TERMINAL MENU (Manual `npm test`)
  // ----------------------------------------------------
  console.clear();
  console.log('🧪 === Sufra Test Suite ===\n');
  console.log('1) 🔍 Run DOM & Script Integrity Check');
  console.log('2) 🧹 Run ESLint');
  console.log('3) 🚀 Run BOTH (Full Suite)');
  console.log('4) ❌ Exit\n');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('Select an option (1-4): ', (answer) => {
    rl.close();
    switch (answer.trim()) {
      case '1':
        runCommand('node', ['scripts/check-integrity.mjs']);
        break;
      case '2':
        runCommand('npx', ['eslint', '.']);
        break;
      case '3':
        runCommand('npm', ['run', 'test:all']);
        break;
      case '4':
        console.log('Exiting tests.');
        process.exit(0);
        break;
      default:
        console.error('❌ Invalid option!');
        process.exit(1);
    }
  });
}