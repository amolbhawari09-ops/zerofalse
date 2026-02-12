
const password = "admin123";   



const express = require("express");
const app = express();

app.get("/user", (req, res) => {

    const username = req.query.username;

    const query =
        "SELECT * FROM users WHERE name = '" + username + "'";  

  console.log(query);

    res.send("User query executed");

});



function runCode(userInput) {

    eval(userInput);   /

}


const { exec } = require("child_process");

function runCommand(cmd) {

    exec(cmd);   

}




function safeFunction() {

    console.log("This is safe code");

}

app.listen(3000, () => {
    console.log("Server running");
});
