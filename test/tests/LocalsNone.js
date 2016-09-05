
var foo = 9;

// information about bar
var bar = 10;

function unneeded(){}

function neededA(){}

function neededB(){}

module.exports.cheese = new neededA();

// information about noisy
var noisy = new neededB();
