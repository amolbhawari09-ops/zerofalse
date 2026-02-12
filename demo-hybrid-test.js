

const mysql = require('mysql');
const { exec } = require('child_process');

// 
const API_KEY = "sk_live_2026_test_key_99999"; 

//
function getUser(id) {
    const query = "SELECT * FROM users WHERE id = " + id;
    db.query(query);
}

// 
app.get('/run', (req, res) => {
    const cmd = req.query.cmd;
    exec(cmd); // 
});

// S
console.log("System initialized");
