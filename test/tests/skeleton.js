
module.exports = {
    Component:      require ('./skl/Component'),
    ComponentCache: require ('./skl/ComponentCache'),
    Parser:         require ('./skl/Parser'),
    Meh:            require ('./skl/Meh')
};

/*  @submodule Options
    Configuration options.
*/

(function(target){
//
function doLimit(fn, limit) {
    return function (iterable, iteratee, callback) {
        return fn(iterable, limit, iteratee, callback);
    };
}

/**
    Displaced main func.
@memberOf skeleton
@name mainFunc
*/
function eachOfLimit (coll, limit, iteratee, callback) {

}

/**
    Displaced turd.
@memberOf skeleton
@name turd
*/
var junkName = doLimit (eachOfLimit, 1);

target.junkName = junkName;

})(module.exports);
