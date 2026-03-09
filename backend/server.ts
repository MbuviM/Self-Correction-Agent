import { WebSocketServer } from 'ws';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PYTHON_BIN = process.env.PYTHON_BIN || 'python';

function runAgent(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON_BIN, ['agent.py', prompt], {
      cwd: __dirname,
      env: process.env,
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (error) => {
      reject(error);
    });

    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `agent.py exited with code ${code}`));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

const wss = new WebSocketServer({ port: 8080 });

wss.on('connection', (ws) => {
  console.log('Client connected');

  ws.on('message', async (data) => {
    const { type, prompt } = JSON.parse(data.toString());

    if (type === 'start_analysis') {
      ws.send(JSON.stringify({ type: 'status', stage: 'thinking' }));
      ws.send(JSON.stringify({ type: 'status', stage: 'verifying' }));

      ws.send(JSON.stringify({ type: 'status', stage: 'correcting' }));
      ws.send(JSON.stringify({ type: 'status', stage: 'finalizing' }));

      try {
        const content = await runAgent(String(prompt ?? ''));
        ws.send(
          JSON.stringify({
            type: 'final',
            content: content || 'Agent returned an empty response.',
          })
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown backend error.';
        ws.send(
          JSON.stringify({
            type: 'final',
            content: `Agent execution failed: ${message}`,
          })
        );
      }
    }
  });
});
