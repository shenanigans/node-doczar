
function foo (able, baker) {
    this.num = able * baker;
}

foo.prototype = {
    first:      9001,
    second:     function (able) {

    }
};

function makeProto (able) {
    return { first:able };
}
function bar(){}
bar.prototype = makeProto (function (able) { this.cheese = "string"; });

function oneAy(){}
function oneBee(){}
oneAy.prototype = oneBee.prototype = {
    able:   9001,
    baker:  "over nine thousand"
};

function twoAy(){}
function twoBee(){}
twoAy.prototype = twoBee.prototype = makeProto();

function onion(){}
onion.prototype = 9001;

module.exports = {
    foo:    foo,
    bar:    bar,
    oneAy:  oneAy,
    twoAy:  twoAy,
    onion:  onion
};
