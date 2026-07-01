const http = require('http');
const { exec } = require('child_process');
const crypto = require('crypto');

const PORT = 3002;
const SECRET = process.env.WEBHOOK_SECRET || 'smart-baxi-webhook-secret-2024';
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || '';

const PROJECTS = [
  {
    name: 'smart-baxi', dir: '/root/smart', pm2Name: 'smart-baxi', appName: 'baxi',
    databaseUrl: 'postgres://smart:l5Gd0SEBwtk0x6VOM0SVx2v1@127.0.0.1:5432/smart',
    nextauthUrl: 'http://82.158.91.76:3001'
  },
  {
    name: 'smart-sdfy', dir: '/root/smart-sdfy', pm2Name: 'smart-sdfy', appName: 'sdfy',
    databaseUrl: 'postgres://smartsdfy:pdUb7jO9TJKIqrg3AlEtRG12@127.0.0.1:5432/smartsdfy',
    nextauthUrl: 'http://82.158.91.76:3003'
  }
];

function log(msg) { console.log('[' + new Date().toISOString() + '] ' + msg); }

function deployProject(project) {
  return new Promise(function(resolve) {
    var d = project.dir;
    var name = project.name;
    var cmds = [
      'cd ' + d,
      'git pull origin main',
      'npm install',
      'rm -rf .next',
      'DATABASE_URL="' + project.databaseUrl + '" NEXTAUTH_SECRET="' + NEXTAUTH_SECRET + '" NEXTAUTH_URL="' + project.nextauthUrl + '" APP_NAME="' + project.appName + '" npx prisma generate',
      'DATABASE_URL="' + project.databaseUrl + '" NEXTAUTH_SECRET="' + NEXTAUTH_SECRET + '" NEXTAUTH_URL="' + project.nextauthUrl + '" APP_NAME="' + project.appName + '" npm run build',
      'cp ' + d + '/node_modules/.prisma/client/libquery_engine-*.so.node ' + d + '/.next/server/ 2>/dev/null || true',
      'ln -sf ' + d + '/node_modules/.prisma/client/libquery_engine-debian-openssl-3.0.x.so.node ' + d + '/.next/server/libquery_engine-rhel-openssl-3.0.x.so.node 2>/dev/null || true',
      'pm2 restart ' + project.pm2Name + ' --update-env'
    ];
    log('Deploying ' + name + '...');
    exec(cmds.join(' && '), { maxBuffer: 10 * 1024 * 1024 }, function(err, stdout, stderr) {
      if (err) { log(name + ' FAIL: ' + err.message); resolve({ name: name, success: false }); }
      else { log(name + ' OK'); resolve({ name: name, success: true }); }
    });
  });
}

var handler = function(req, res) {
  if (req.method !== 'POST') { res.writeHead(200); res.end('OK'); return; }
  var body = '';
  req.on('data', function(c) { body += c.toString(); });
  req.on('end', function() {
    var sig = req.headers['x-hub-signature-256'];
    if (sig) {
      var d = 'sha256=' + crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      if (sig !== d) { log('Bad signature'); res.writeHead(403); res.end('Forbidden'); return; }
    }
    log('Webhook triggered');
    (async function() {
      var results = [];
      for (var i = 0; i < PROJECTS.length; i++) {
        results.push(await deployProject(PROJECTS[i]));
      }
      var allOk = results.every(function(r) { return r.success; });
      var msg = results.map(function(r) { return r.name + ':' + (r.success ? 'OK' : 'FAIL'); }).join(', ');
      log('Done: ' + msg);
      res.writeHead(allOk ? 200 : 500);
      res.end(msg);
    })();
  });
};

http.createServer(handler).listen(PORT, '0.0.0.0', function() { log('Webhook on ' + PORT); });
