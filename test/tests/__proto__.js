
function foo (able, baker) {
    this.__proto__.num = able * baker;
}

function bar (able, baker) {
    this.__proto__ = { num: able * baker };
}

function makeProto (able) {
    return { first:able };
}

function baz (able, baker) {
    this.__proto__ = makeProto (able * baker);
}

function bilge(){}
var bunk = new bilge();
bunk.__proto__.num = 9001;

function bridge(){}
var crud = new bridge();
crud.__proto__ = { num:9001 };

function barge(){}
var trash = new barge();
trash.__proto__ = makeProto (9001);

function onion(){}
onion.__proto__ = 9001;

module.exports = {
    foo:    foo,
    bar:    bar,
    baz:    baz,
    bilge:  bilge,
    bridge: bridge,
    barge:  barge
};
