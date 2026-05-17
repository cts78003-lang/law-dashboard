const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: process.env.MYSQLUSER,
  password: process.env.MYSQLPASSWORD,
  database: process.env.MYSQLDATABASE,
});

db.connect((err) => {
  if (err) {
    console.error('DB 연결 실패:', err.message);
    return;
  }
  console.log('DB 연결 성공');

  db.query(`
    CREATE TABLE IF NOT EXISTS cases (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(100),
      client VARCHAR(50),
      lawyer VARCHAR(50),
      status ENUM('진행중','완료','대기') DEFAULT '진행중',
      fee INT DEFAULT 0,
      deadline DATE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `, (err) => {
    if (err) console.error('테이블 생성 실패:', err.message);
    else console.log('테이블 준비 완료');
  });
});

app.get('/api/cases', (req, res) => {
 db.query('SELECT * FROM cases ORDER BY id DESC' , (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.post('/api/cases', (req, res) => {
  const { name, client, lawyer, status, fee, deadline } = req.body;
  db.query(
    'INSERT INTO cases (name, client, lawyer, status, fee, deadline) VALUES (?,?,?,?,?,?)',
    [name, client, lawyer, status, fee, deadline],
    (err, result) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ id: result.insertId });
    }
  );
});

app.delete('/api/cases/:id', (req, res) => {
  db.query('DELETE FROM cases WHERE id=?', [req.params.id], (err) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ ok: true });
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});
