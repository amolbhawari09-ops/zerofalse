// Demo vulnerable code for ZeroFalse test

const express = require('express');
const app = express();

app.get('/run', (req, res) => {

    // ❌ CRITICAL VULNERABILITY: Remote Code Execution
    const userInput = req.query.code;

    eval(userInput);

    res.send("Executed");
});

app.listen(3000, () => {
    console.log("Server running");
});
