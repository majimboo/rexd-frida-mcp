import fs from 'node:fs';
import readline from 'node:readline';
import process from 'node:process';

const samplePath = process.argv[2];

if (!samplePath) {
  console.error('sample path argument is required');
  process.exit(1);
}

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity
});

console.log(JSON.stringify({
  ready: true,
  pid: process.pid,
  samplePath
}));

rl.on('line', (line) => {
  const command = line.trim();

  if (command === 'read') {
    const content = fs.readFileSync(samplePath, 'utf8');
    console.log(JSON.stringify({
      command: 'read',
      bytes: Buffer.byteLength(content),
      preview: content.slice(0, 40)
    }));
    return;
  }

  if (command === 'exit') {
    console.log(JSON.stringify({ command: 'exit' }));
    process.exit(0);
  }
});
