
/*!
    * FooClass should not have childMethod
    * parentMethod's argument should be type String
    * FooClass#overrideMethod should have only one argument
    * FooClass#overrideMethod's argument should be type String
    * FooClass#cheese should be type String|Number
    * FooClass#prop should be a String

    * BarClass should have both parentMethod and childMethod
    * childMethod's argument should be type Number
    * BarClass#parentMethod should be documented as inherited
    * BarClass#overrideMethod should be documented as an override
    * BarClass#overrideMethod should have two arguments
    * BarClass#overrideMethod's arguments should both be type Number
    * BarClass#cheese should be type Number|String

    * BargeClass should have one method, parentMethod
    * BargeClass#parentMethod's argument is called able
    * BilgeClass is a child class of BargeClass
    * BilgeClass should have two method, parentMethod and childMethod
    * BilgeClass#childMethod's argument is called baker

    * simpleFun should have no members or properties
    * TODO simpleFun should have two String arguments
*/

function FooClass (able, baker) {
    if (arguments.length != 2)
        return this.apply (this, defaultArgs);
    this.prop = 'prop';
}
FooClass.prototype.parentMethod = function (cheese) { this.cheese = cheese; };
FooClass.prototype.overrideMethod = function (able) {  };

function BarClass (able, baker) {
    FooClass.apply (this, arguments);
}
function dummy(){}
dummy.prototype = FooClass.prototype;
BarClass.prototype = new dummy();
BarClass.prototype.childMethod = function (cheese) { this.cheese = cheese; };
BarClass.prototype.overrideMethod = function (able, baker) {
    FooClass.prototype.overrideMethod ("four");
};

var bar = new BarClass();
bar.parentMethod ("four");
bar.childMethod (4);
bar.overrideMethod (4, 4);

function simpleFun(){
    return this.apply (this, [ 'foo', 'bar' ]);
}

function BargeClass(){}
BargeClass.prototype.parentMethod = function (able) {};
function BilgeClass(){}
BilgeClass.prototype = Object.create (BargeClass.prototype);
BilgeClass.prototype.childMethod = function (baker) {};

module.exports = {
    FooClass:   FooClass,
    BarClass:   BarClass,
    BargeClass: BargeClass,
    BilgeClass: BilgeClass,
    simpleFun:  simpleFun
};
