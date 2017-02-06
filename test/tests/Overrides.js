
/*      @module:class
    Set the module description.
*/

require ('./NodeParseModules/Overrides');

/*      @class
    Override this Function as a class.
@argument cheddar
    Takes over the name `able`. Should be type `Number`.
@argument:String able
    Does not refer to a real argument. Should be type `String`.
*/
module.exports.classy = function (able) {
    /*  @:String bar
        Override name from `foo` to `bar` and type from `Number` to `String`.
    */
    this.foo = 9001;
};
module.exports.classy (4);

/*
    Do a thing.
@returns:String
    Should be named `bar` and typed `String`. It's not called `foo` because that name has been
    remounted.
*/
module.exports.classy.prototype.doThing = function(){ return this.foo; };

/*
    Argument implied name test.
@argument
    Should be named `foo`.
@argument:RegExp
    Should be named `bar` and typed `RegExp`.
*/
module.exports.impliedName = function (foo, bar) { };

/*
    Argument override test.
@argument:String foo
    Override the first argument's type from `Number` to `String`.
*/
module.exports.argType = function (foo) { };
module.exports.argType (4);

module.exports.fancyArgs = function (
    /*  @:RegExp */
    able,
    /* @:String monkey
        Override this argument name from `baker` to `monkey` and set type to `String`.
    */
    baker,
    /*  @argument (rover
        Override this argument name from `charlie` to `rover`.
    */
    charlie
) { };
