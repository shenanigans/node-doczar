
var url          = require ('url');
// var fs           = require ('fs-extra');
var path         = require ('path');
// var async        = require ('async');
// var filth        = require ('filth');

function pathStr (type) {
    return type.map (function (step) {
        if (step.length === 2)
            return step.join ('');
        return step[0] + '[' + step[1] + ']';
    }).join ('').slice (1);
}

/*      @module:class

@argument:skeleton/skl/ComponentCache context
@argument:skeleton/skl/Parser/Path path
@member:/Finalization final
*/
var Component = module.exports = function (context, tpath, parent, position) {

};

/*
    Merge additional information into this Component.
@argument/skeleton/skl/Parser/Submission info
    Document information hot off the [Parser](skeleton/skl/Parser).
*/
Component.prototype.submit = function (info) {

};

/*      @submodule:class Finalization
    This is how a Component presents itself to the Handlebars rendering engine.
@String #elemID
    A unique identifier used as an id for this Component's outer Element when it is displayed as a
    child of another Component.
@String #name
    The last name element of this Component's path, to be used as its display name.
@String #pathstr
    A delimited String representation of this Component's path.
@Array<Array> #path
    This [Component's](.) path
@String #ctype
    Component type string, e.g. "module", "class", "property"...
@String #simpleCtype
@String #valtype
@Array</Finalization> #modules
@Array</Finalization> #statics
@Array</Finalization> #functions
@Array</Finalization> #members
@Array</Finalization> #methods
@Array</Finalization> #arguments
@Array</Finalization> #returns
@Boolean #isClasslike
    Whether to display the "Constructor" section.
@Boolean #isInherited
    Whether this Component has a `@super` modifier.
@Boolean #isInline
@Boolean #hasChildren
@Boolean #isFunction
@Boolean #isCallback
*/

/*
    Create a representative document ready for rendering and save it to [final](#final).
@spare details
    Every child Component on this Component is compiled into two Arrays
@argument/json options
    @member/String options#codeStyle
        The css document to use for syntax highlight.
    @member/Boolean options#isAPI
        Hide everything but `@api` Components and their ancestors.
    @member/Boolean options#isDev
        Reveal everything marked `@development`.
@callback
    Called without arguments when finalization is complete and this Component is ready to render.
*/
Component.prototype.finalize = function (options, callback) {
    var self = this;

    async.each (children, function (child, callback) {
        child.finalize (options, callback);
    }, function(){
        process.nextTick (function(){
            self.final.breadcrumbs = [];
        });
    });
};

/*
    Gather children from superclasses and merge them, in order, into a document representing this
    Component's inheritence. **Note:** this Component's children will *also* be merged in, producing
    a pre-compiled inheritence result and *not* just the inherited children.
@returns:skeleton/skl/Component
    The assembled inheritence document is returned. It looks like an incomplete Component instance,
    containing only child Components.
*/
Component.prototype.inherit = function (loops) {

};

/*
    Create a directory, write an index.html and recursively call for child Components.
@argument/String basedir
@argument/String baseTagPath
@argument/Object options
@callback callback
    @argument/Error err
        Filesystem errors and critical failures which hault document assembly will be returned.
*/
Component.prototype.writeFiles = function (basedir, baseTagPath, options, callback) {

};

module.exports = Component;
