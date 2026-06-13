const http = require('http');
const { exec } = require('child_process');
const crypto = require('crypto');

const PORT = 3002;
const SECRET = 'smart-baxi-webhook-secret-2024';

const handler = (req, res) => {
  if (req.method !== 'POST') {
    res.writeHead(200);
    res.end('OK');
    return;
  }

  let body = '';
  req.on('data', chunk => {
    body += chunk.toString();
  });

  req.on('end', () => {
    // Verify signature
    const signature = req.headers['x-hub-signature-256'];
    if (signature) {
      const hmac = crypto.createHmac('sha256', SECRET);
      const digest = 'sha256=' + hmac.update(body).digest('hex');
      if (signature !== digest) {
        console.log('Invalid signature');
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
    }

    console.log('Webhook received, updating...');

    exec('cd /root/smart && git pull origin main && npm install && npm run build && pm2 restart smart-baxi && pm2 restart smart-sdfy', 
      (error, stdout, stderr) => {
        if (error) {
          console.error('Update failed:', error);
          res.writeHead(500);
          res.end('Update failed: ' + error.message);
        } else {
          console.log('Update success:', stdout);
          res.writeHead(200);
          res.end('Updated successfully!');
        }
      });
  });
};

http.createServer(handler).listen(PORT, '0.0.0.0', () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
