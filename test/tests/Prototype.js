
function foo (able, baker) {
    this.num = able * baker;
    this.prototype.bad = "should not appear directly on foo";
}

foo.prototype = {
    first:      9001,
    second:     function (able) {

    }
};

function makeProto (method) {
    return { first:method };
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

function wrap (able) { return able; }
function slick (able) {
    this.value = wrap (able);
}
slick.prototype.method = function (able) {
    this.methodValue = wrap (able);
};
(new slick (42)).bloop = 'blap';
new slick ([]);
var target = new slick ('42');
target.method (/42/);

module.exports = {
    foo:    foo,
    bar:    bar,
    oneAy:  oneAy,
    twoAy:  twoAy,
    onion:  onion,
    slick:  slick
};
