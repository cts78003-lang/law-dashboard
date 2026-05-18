const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const session = require('express-session');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'lawfirm-secret-2026',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));

const ADMIN_ID = process.env.ADMIN_ID || 'admin';
const ADMIN_PW = process.env.ADMIN_PW || 'law1234';

function requireLogin(req, res, next) {
  if (req.session && req.session.loggedIn) return next();
  res.status(401).json({ error: 'unauthorized' });
}

app.use(express.static('public'));

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
});

db.connect((err) => {
  if (err) { console.error('DB 연결 실패:', err.message); return; }
  console.log('DB 연결 성공');

  db.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      case_type VARCHAR(30),
      client VARCHAR(50),
      phone VARCHAR(20),
      lawyer VARCHAR(50),
      status ENUM('진행중','완료','대기') DEFAULT '진행중',
      fee INT DEFAULT 0,
      paid ENUM('미수납','일부수납','완납') DEFAULT '미수납',
      deadline DATE,
      memo TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => { if (err) console.error('cases 테이블 오류:', err.message); });

  db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      role VARCHAR(30),
      phone VARCHAR(20),
      email VARCHAR(100),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => { if (err) console.error('staff 테이블 오류:', err.message); });

  db.query(`
    CREATE TABLE IF NOT EXISTS case_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      case_id INT NOT NULL,
      content TEXT NOT NULL,
      author VARCHAR(50),
      log_type ENUM('진행','메모','기일','완료','기타') DEFAULT '진행',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES cases(id) ON DELETE CASCADE
    )
  `, (err) => { if (err) console.error('case_logs 테이블 오류:', err.message); else console.log('테이블 준비 완료'); });
});

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_PASS }
});

async function sendDeadlineAlert() {
  return new Promise((resolve) => {
    const today = new Date();
    db.query('SELECT * FROM cases WHERE status != ? AND deadline IS NOT NULL', ['완료'], async (err, cases) => {
      if (err) { resolve(); return; }
      const urgent = cases.filter(c => {
        const diff = Math.ceil((new Date(c.deadline) - today) / 86400000);
        return diff >= 0 && diff <= 7;
      });
      if (!urgent.length) { resolve(); return; }
      const list = urgent.map(c => {
        const diff = Math.ceil((new Date(c.deadline) - today) / 86400000);
        return `• ${c.name} (${c.client||'-'}) — D-${diff} | 담당: ${c.lawyer||'-'}`;
      }).join('\n');
      const mailOptions = {
        from: `법무사무소 <${process.env.GMAIL_USER}>`,
        to: process.env.ALERT_EMAIL,
        subject: `⚠️ [법무사무소] 마감 임박 사건 ${urgent.length}건 알림`,
        text: `마감일이 7일 이내로 임박한 사건이 ${urgent.length}건 있습니다.\n\n${list}`,
        html: `<div style="font-family:sans-serif;max-width:600px;margin:0 auto"><div style="background:#1e2d45;padding:20px;border-radius:8px 8px 0 0"><h2 style="color:#f0d080;margin:0">⚖️ 법무사무소 관리시스템</h2><p style="color:#a8b8cc;margin:4px 0 0">마감 임박 사건 알림</p></div><div style="background:#fff;padding:24px;border:1px solid #e8e8e8"><p>마감일이 <strong>7일 이내</strong>로 임박한 사건이 <strong style="color:#E24B4A">${urgent.length}건</strong> 있습니다.</p><table style="width:100%;border-collapse:collapse;margin:16px 0"><thead><tr style="background:#f7f8fa"><th style="padding:10px;text-align:left;border-bottom:1px solid #eee;font-size:12px;color:#888">사건명</th><th style="padding:10px;text-align:left;border-bottom:1px solid #eee;font-size:12px;color:#888">의뢰인</th><th style="padding:10px;text-align:left;border-bottom:1px solid #eee;font-size:12px;color:#888">담당자</th><th style="padding:10px;text-align:left;border-bottom:1px solid #eee;font-size:12px;color:#888">D-day</th></tr></thead><tbody>${urgent.map(c=>{const diff=Math.ceil((new Date(c.deadline)-today)/86400000);return`<tr><td style="padding:10px;border-bottom:1px solid #f0f0f0;font-weight:bold">${c.name}</td><td style="padding:10px;border-bottom:1px solid #f0f0f0">${c.client||'-'}</td><td style="padding:10px;border-bottom:1px solid #f0f0f0">${c.lawyer||'-'}</td><td style="padding:10px;border-bottom:1px solid #f0f0f0;color:#E24B4A;font-weight:bold">D-${diff}</td></tr>`;}).join('')}</tbody></table></div></div>`
      };
      try { await transporter.sendMail(mailOptions); } catch(e) { console.error('이메일 발송 실패:', e.message); }
      resolve();
    });
  });
}

function scheduleAlert() {
  const now = new Date();
  const next9am = new Date();
  next9am.setHours(9, 0, 0, 0);
  if (now >= next9am) next9am.setDate(next9am.getDate() + 1);
  setTimeout(() => {
    sendDeadlineAlert();
    setInterval(sendDeadlineAlert, 24 * 60 * 60 * 1000);
  }, next9am - now);
}

app.post('/api/login', (req, res) => {
  const { id, password } = req.body;
  if (id === ADMIN_ID && password === ADMIN_PW) { req.session.loggedIn = true; res.json({ ok: true }); }
  else res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다' });
});

app.post('/api/logout', (req, res) => { req.session.destroy(); res.json({ ok: true }); });
app.get('/api/me', (req, res) => { res.json({ loggedIn: !!(req.session && req.session.loggedIn) }); });

app.post('/api/send-alert', requireLogin, async (req, res) => {
  try { await sendDeadlineAlert(); res.json({ ok: true }); }
  catch(e) { res.status(500).json({ error: e.message }); }
});

// 사건 API
app.get('/api/cases', requireLogin, (req, res) => {
  db.query('SELECT * FROM cases ORDER BY id DESC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/cases', requireLogin, (req, res) => {
  const { name, case_type, client, phone, lawyer, status, fee, paid, deadline, memo } = req.body;
  db.query(
    'INSERT INTO cases (name, case_type, client, phone, lawyer, status, fee, paid, deadline, memo) VALUES (?,?,?,?,?,?,?,?,?,?)',
    [name, case_type, client, phone, lawyer, status, fee, paid, deadline, memo],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: result.insertId });
    }
  );
});

app.put('/api/cases/:id', requireLogin, (req, res) => {
  const { name, case_type, client, phone, lawyer, status, fee, paid, deadline, memo } = req.body;
  db.query(
    'UPDATE cases SET name=?, case_type=?, client=?, phone=?, lawyer=?, status=?, fee=?, paid=?, deadline=?, memo=? WHERE id=?',
    [name, case_type, client, phone, lawyer, status, fee, paid, deadline, memo, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    }
  );
});

app.delete('/api/cases/:id', requireLogin, (req, res) => {
  db.query('DELETE FROM cases WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// 진행 내역 API
app.get('/api/cases/:id/logs', requireLogin, (req, res) => {
  db.query('SELECT * FROM case_logs WHERE case_id=? ORDER BY created_at DESC', [req.params.id], (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/cases/:id/logs', requireLogin, (req, res) => {
  const { content, author, log_type } = req.body;
  db.query(
    'INSERT INTO case_logs (case_id, content, author, log_type) VALUES (?,?,?,?)',
    [req.params.id, content, author, log_type || '진행'],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: result.insertId });
    }
  );
});

app.delete('/api/logs/:id', requireLogin, (req, res) => {
  db.query('DELETE FROM case_logs WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

// 직원 API
app.get('/api/staff', requireLogin, (req, res) => {
  db.query('SELECT * FROM staff ORDER BY id ASC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/staff', requireLogin, (req, res) => {
  const { name, role, phone, email } = req.body;
  db.query('INSERT INTO staff (name, role, phone, email) VALUES (?,?,?,?)', [name, role, phone, email], (err, result) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: result.insertId });
  });
});

app.put('/api/staff/:id', requireLogin, (req, res) => {
  const { name, role, phone, email } = req.body;
  db.query('UPDATE staff SET name=?, role=?, phone=?, email=? WHERE id=?', [name, role, phone, email, req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.delete('/api/staff/:id', requireLogin, (req, res) => {
  db.query('DELETE FROM staff WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
  scheduleAlert();
});
