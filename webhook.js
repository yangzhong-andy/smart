'use strict';

const crypto = require('crypto');
const http = require('http');
const { execFile } = require('child_process');

const PORT = Number(process.env.WEBHOOK_PORT || 3002);
const SECRET = process.env.WEBHOOK_SECRET;
const DEPLOY_COMMAND = process.env.SMART_DEPLOY_COMMAND || '/usr/local/sbin/smart-deploy';
const MAX_BODY_BYTES = 1024 * 1024;

if (!SECRET) {
  throw new Error('WEBHOOK_SECRET must be set');
}

let deploying = false;

function log(message) {
  console.log(`[${new Date().toISOString()}] ${message}`);
}

function signatureIsValid(signature, body) {
  if (typeof signature !== 'string') return false;
  const expected = Buffer.from(`sha256=${crypto.createHmac('sha256', SECRET).update(body).digest('hex')}`);
  const actual = Buffer.from(signature);
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function respond(response, status, message) {
  response.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end(message);
}

const server = http.createServer((request, response) => {
  if (request.method === 'GET') return respond(response, 200, 'OK');
  if (request.method !== 'POST') return respond(response, 405, 'Method Not Allowed');
  if (deploying) return respond(response, 409, 'Deployment already running');

  const chunks = [];
  let size = 0;
  request.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) {
      request.destroy();
      return;
    }
    chunks.push(chunk);
  });
  request.on('end', () => {
    const body = Buffer.concat(chunks);
    if (!signatureIsValid(request.headers['x-hub-signature-256'], body)) {
      return respond(response, 403, 'Forbidden');
    }

    deploying = true;
    log('Verified webhook received; starting managed deployment');
    execFile(DEPLOY_COMMAND, ['deploy', 'all'], { timeout: 30 * 60 * 1000, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      deploying = false;
      if (error) {
        log(`Deployment failed: ${error.message}`);
        if (stderr) log(stderr.slice(-4000));
        return respond(response, 500, 'Deployment failed');
      }
      if (stdout) log(stdout.slice(-4000));
      log('Deployment completed');
      return respond(response, 200, 'Deployment completed');
    });
  });
  request.on('error', (error) => {
    log(`Request failed: ${error.message}`);
    if (!response.headersSent) respond(response, 400, 'Bad Request');
  });
});

server.listen(PORT, '0.0.0.0', () => log(`Webhook listening on ${PORT}`));
