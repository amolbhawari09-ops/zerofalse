// Intentional vulnerable code for testing

const password = "123456";

function login(userInput) {
    eval(userInput); // dangerous eval
}

login("console.log('Test')");
