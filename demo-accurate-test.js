

const express = require("express");
const { exec } = require("child_process");

const app = express();

app.use(express.json());


// =====================================================
//
// =====================================================

const ADMIN_PASSWORD = "super_secret_123";


// =====================================================
// =====================================================

app.get("/user", (req, res) => {

    const username = req.query.username;

    const query =
        "SELECT * FROM users WHERE username = '" + username + "'";

    res.send("Query: " + query);

});


// =====================================================
/
// =====================================================

app.post("/eval", (req, res) => {

    const userCode = req.body.code;

    eval(userCode);

    res.send("Executed");

});


// =====================================================
/
// =================================

app.get("/ping", (req, res) => {

    const host = req.query.host;

    exec("ping -c 1 " + host, (err, stdout) => {

        res.send(stdout);

    });

});


app.get("/safe", (req, res) => {

    const name = "John";

    res.send("Hello " + name);

});


app.listen(3000, () => {

    console.log("Server running on port 3000");

});
