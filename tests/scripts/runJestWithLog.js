const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '..', 'logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const timestampedLog = path.join(logDir, `test-run-${timestamp}.log`);
const latestLog = path.join(logDir, 'latest.log');

if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const jestArgs = [
  '--runInBand',
  '--forceExit',
  '--verbose',
  ...process.argv.slice(2),
];

if (!jestArgs.some((arg) => arg.endsWith('.test.js') || arg.includes('tests/'))) {
  jestArgs.push('tests');
}

const logStream = fs.createWriteStream(timestampedLog, { flags: 'w' });
const latestStream = fs.createWriteStream(latestLog, { flags: 'w' });

function writeBoth(chunk) {
  process.stdout.write(chunk);
  logStream.write(chunk);
  latestStream.write(chunk);
}

const child = spawn('npx', ['jest', ...jestArgs], {
  cwd: path.join(__dirname, '..', '..'),
  env: process.env,
  shell: true,
});

child.stdout.on('data', writeBoth);
child.stderr.on('data', writeBoth);

child.on('close', (code) => {
  const footer = `\n--- Log written to ${timestampedLog} and ${latestLog} ---\n`;
  writeBoth(footer);
  logStream.end();
  latestStream.end();
  process.exit(code ?? 1);
});

child.on('error', (err) => {
  writeBoth(`\nFailed to start Jest: ${err.message}\n`);
  logStream.end();
  latestStream.end();
  process.exit(1);
});
