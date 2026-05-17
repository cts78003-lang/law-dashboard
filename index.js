
const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const db = mysql.createConnection({
  host: process.env.MYSQLHOST,
  port: process.env.MYSQLPORT,
  user: 'lawuser',
  password: 'law1234',
  database: 'railway'
});

app.get('/api/cases', (req, res) => {
  const sql = `
    SELECT lc.id, lc.title, lc.status, lc.description,
           c.name AS client_name, u.name AS staff_name, u.role AS staff_role
    FROM legal_cases lc
    JOIN clients c ON lc.client_id = c.id
    JOIN users u ON lc.user_id = u.id
  `;
  db.query(sql, (err, results) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(results);
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('Server running');
});
