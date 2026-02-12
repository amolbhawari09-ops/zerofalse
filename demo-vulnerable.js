// demo-vulnerable.js

const express = require("express");
const app = express();

app.use(express.json());


const ADMIN_PASSWORD = "supersecret123";


app.post("/run", (req, res) => {
  const userCode = req.body.code;
  const result = eval(userCode);
  res.send(result);
});



const { exec } = require("child_process");

app.get("/ping", (req, res) => {
  const ip = req.query.ip;
  exec("ping -c 1 " + ip, (err, stdout) => {
    res.send(stdout);
  });
});



const mysql = require("mysql");

const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "test"
});

app.get("/user", (req, res) => {
  const id = req.query.id;
  const query = "SELECT * FROM users WHERE id = " + id;
  db.query(query, (err, result) => {
    res.send(result);
  });
});



app.get("/safe", (req, res) => {
  res.send("This is safe");
});


app.listen(3000, () => {
  console.log("Server running");
});
