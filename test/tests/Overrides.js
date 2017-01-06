
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
module.exports.classy = function (able) { };
module.exports.classy (4);

/*
    Argument implied name test.
@argument
    Should be named `foo`.
*/
module.exports.impliedName = function (foo) { };

/*
    Argument override test.
@argument:String foo
    Override the first argument's type from `Number` to `String`.
*/
module.exports.argType = function (foo) { };
module.exports.argType (4);
