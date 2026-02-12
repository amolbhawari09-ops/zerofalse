

const express = require('express');
const { exec } = require('child_process');
const mysql = require('mysql');

const app = express();
app.use(express.json());

// =====================================================
// 
// =====================================================
const dbConfig = {
    host: 'localhost',
    password: 'super_secret_password_123' // 
};

// =====================================================
// 
// =====================================================
app.get('/api/users', (req, res) => {
    const userId = req.query.id;
    // 
    const sql = "SELECT * FROM users WHERE id = " + userId;
    
    db.query(sql, (err, result) => {
        res.send(result);
    });
});

// =====================================================
// 
// =====================================================
app.post('/api/compute', (req, res) => {
    const calculation = req.body.calc;
  
    const result = eval(calculation);
    res.json({ result });
});

// =====================================================

// =====================================================
app.get('/api/ping', (req, res) => {
    const target = req.query.url;
    
    exec("ping -c 1 " + target, (err, stdout) => {
        res.send(stdout);
    });
});

// =====================================================
// 
// =====================================================
app.get('/api/health', (req, res) => {
    const status = "OK";
    res.send(`System is ${status}`);
});

app.listen(3000);
