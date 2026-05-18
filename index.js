const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const session = require('express-session');

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
  `, (err) => { if (err) console.error('staff 테이블 오류:', err.message); else console.log('테이블 준비 완료'); });
});

app.post('/api/login', (req, res) => {
  const { id, password } = req.body;
  if (id === ADMIN_ID && password === ADMIN_PW) {
    req.session.loggedIn = true;
    res.json({ ok: true });
  } else {
    res.status(401).json({ error: '아이디 또는 비밀번호가 틀렸습니다' });
  }
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  res.json({ loggedIn: !!(req.session && req.session.loggedIn) });
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

// 직원 API
app.get('/api/staff', requireLogin, (req, res) => {
  db.query('SELECT * FROM staff ORDER BY id ASC', (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/staff', requireLogin, (req, res) => {
  const { name, role, phone, email } = req.body;
  db.query(
    'INSERT INTO staff (name, role, phone, email) VALUES (?,?,?,?)',
    [name, role, phone, email],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: result.insertId });
    }
  );
});

app.put('/api/staff/:id', requireLogin, (req, res) => {
  const { name, role, phone, email } = req.body;
  db.query(
    'UPDATE staff SET name=?, role=?, phone=?, email=? WHERE id=?',
    [name, role, phone, email, req.params.id],
    (err) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ ok: true });
    }
  );
});

app.delete('/api/staff/:id', requireLogin, (req, res) => {
  db.query('DELETE FROM staff WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.listen(process.env.PORT || 3000, () => { console.log('Server running'); });
