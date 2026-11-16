// A tiny notes app for trying Ultimate Tester. Notes live in memory; restart to reset.
const http = require('http');
const notes = [];
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/notes') {
    let b = '';
    req.on('data', (d) => (b += d));
    req.on('end', () => {
      notes.push(new URLSearchParams(b).get('title') ?? '');
      res.writeHead(303, { Location: '/' }); res.end();
    });
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(`<h1>Notes</h1><form method=post action=/notes><input name=title aria-label=Title><button>Save</button></form><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>`);
}).listen(Number(process.env.PORT) || 4517);
