
/**     @module/Function doczar

@argument/Options options
*/
/**     @class Options
    @api
@Boolean #verbose
@Boolean #showDev
@Boolean #showAPI
@String #codeStyle
@Array|String #library
*/
require ('colors');
var fs = require ('fs-extra');
var Parser = require ('./lib/Parser');
var ComponentCache = require ('./lib/ComponentCache');

var Doczar = function (options) {
    this.options = options;
    this.fileopsOutstanding = 0;
    this.context = new ComponentCache();
    this.warnings = [];
    this.errors = [];
    this.queue = [];
    this.finalDirs = {};
};

/**     @member/Function addLibrary
    @api

@argument/String|Array libname
*/
Doczar.prototype.addLibrary = function (libname) {

};

/**     @member/Function addFile
    @api

@argument/String fname
*/
Doczar.prototype.addFile = function (fname) {

};

/**     @member/Function addJSModule
    @api

@argument/String fname
*/
Doczar.prototype.addJSModule = function (fname) {

};

/**     @member/Function close
    @api
    Finalizes the documentation tree and writes the configured output to disc, unless a critical
    finalization error has occured. A final error and warning report will be given to the callback
    when all filesystem changes have finished.
@argument/String directory
@callback
    @argument/Array errors
    @argument/Array warnings
*/
Doczar.prototype.close = function (directory, callback) {

};

/**     @member/Function getJSON
    @api
    Gets the generated documentation as a JSON string.
@callback
    @argument/Error err
*/
Doczar.prototype.getJSON = function (callback) {

};

/**     @member/Function finalize
    @development

@callback
    @argument/Array errors
    @argument/Array warnings
*/
var PUSH = Array.prototype.push;
Doczar.prototype.finalize = function (callback) {
    var self = this;
    this.context.finalize (this.options, function (errors, warnings) {
        PUSH.apply (self.errors, errors);
        PUSH.apply (self.warnings, warnings);
        callback (self.errors, self.warnings);
    });
};

/**     @member/Function writeFiles
    @development

@argument/String directory
@callback
    @argument/Array errors
    @argument/Array warnings

*/
Doczar.prototype.writeFiles = function (directory, callback) {
    var self = this;

    if (this.fileopsOutstanding)
        return this.queue.push (function(){ self.writeFiles (directory, callback); });

    if (this.errors.length)
        throw new Error ('critical error prevents filesystem output');

    if (Object.hasOwnProperty.call (this.finalDirs, directory))
        return process.nextTick (callback);

    var basedir = Object.keys (this.finalDirs)[0];
    if (basedir === undefined)
        return this.context.writeFiles (directory, this.options, function (err) {
            if (err) return callback (err);
            self.finalDirs[directory] = true;
            callback();
        });

    fs.copy (basedir, directory, function (err) {
        if (err)
            return callback (err);
        self.finalDirs[directory] = true;
    });
};

/**     @member/Function clearQueue
    @development
*/
Doczar.prototype.clearQueue = function(){
    for (var i in this.queue)
        this.queue[i]();
    delete this.queue;
};

var DEFAULT_DOCZAR = new Doczar ({});
Doczar.addLibrary = DEFAULT_DOCZAR.addLibrary.bind (DEFAULT_DOCZAR);
Doczar.addFile = DEFAULT_DOCZAR.addFile.bind (DEFAULT_DOCZAR);
Doczar.addJSModule = DEFAULT_DOCZAR.addJSModule.bind (DEFAULT_DOCZAR);
Doczar.writeFiles = DEFAULT_DOCZAR.writeFiles.bind (DEFAULT_DOCZAR);

module.exports = Doczar;
