
/*      @module:class
    Roots a document tree and builds all the [Components](skeleton/skl/Component) that live inside it.
    [Looks up](#resolve) and [creates](#getComponent) Components by path. Centralizes [finalization]
    (#finalize) and [filesystem output](#writeFiles).
*/

var path            = require ('path');
// var async           = require ('async');
// var fs              = require ('fs-extra');
// var filth           = require ('filth');
var Component       = require ('./Component');

var ComponentCache = function(){

};

ComponentCache.prototype.walkStep = function (scope, step, doCreate) {

};

/*
    Find or create a [Component](skeleton/skl/Component) for a given path. This is the only supported
    way to create a Component.
@argument:skeleton/skl/Parser/Path tpath
    The path to retrieve or create.
@returns:skeleton/skl/Component
    The retrieved or newly created component.
*/
ComponentCache.prototype.getComponent = function (tpath) {

};

/*
    Return an existing [Component](skeleton/skl/Component) for a [path](skeleton/skl/Parser/Path] or
    throw an [Error]() if it is not found.
@argument:skeleton/skl/Parser/Path tpath
    The path to retrieve.
@returns:skeleton/skl/Component
    The retrieved Component.
@throws:Error `not found`
    An existing Component was not found on the specified path.
@throws:Error `invalid path`
    The path specified was not a valid [Path](skeleton.Parser/Path), or was empty.
*/
ComponentCache.prototype.resolve = function (tpath) {

};

/*
    Attempt to produce a relative url to link from one [Component](skeleton/skl/Component) root page
    to another. If this cannot be done for any reason, `"javascript:return false;"` is returned to
    produce a dead link.
@argument:skeleton/skl/Parser/Path start
    The [Component](skeleton/skl/Component) whose root page is requesting this href.
@argument:skeleton/skl/Parser/Path type
    The [Component](skeleton/skl/Component) to which the root page must link.
@returns:String
    Either a relative url to the requested [Component](skeleton/skl/Component) root page, or
    `"javascript:return false;"`.
*/
ComponentCache.prototype.getRelativeURLForType = function (start, type) {

};

/*
    Retrieve an existing or new [Component](skeleton/skl/Component) from this cache by the specified
    [path](skeleton/skl/Parser/Path) and call [submit](skeleton/skl/Component#submit) on it with the
    provided `info` Object.
@argument:skeleton/skl/Parser/Path tpath
    A path to the Component that should contain the submitted information.
@argument:skeleton/skl/Parser/Submission info
    An Object containing fresly-parsed data that will be overwritten into the requested [Component]
    (skeleton/skl/Component).
*/
ComponentCache.prototype.submit = function (tpath, info) {

};

/*
    [Prepare](skeleton/skl/Component#finalize) every [Component](skeleton/skl/Component) in the cache
    for rendering and execute a callback.
@argument:Object options
@callback
    Called when ready to [output files](#writeFiles). No arguments.
*/
ComponentCache.prototype.finalize = function (options, callback) {

};

/*
    Create the requested base directory if it does not already exist. Configure and render the base
    `index.html` file for the root. Copy in global content from `./indexFiles`. Recursively work
    through the root and call [writeFiles](skeleton/skl/Component#writeFiles) on all immediate child
    Components. Hit the callback when all Components have recursively written their output files, or
    if an Error interrupts the process.
@argument:String basedir
    The full path of the root directory where Components should output their files.
@argument:skeleton/Options options
@callback
*/
ComponentCache.prototype.writeFiles = function (basedir, options, callback) {

};

module.exports = ComponentCache;
