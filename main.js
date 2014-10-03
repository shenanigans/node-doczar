
/**     @module/Function doczar

@argument/Object options
*/
require ('colors');
var Parser = require ('./lib/Parser');
var ComponentCache = require ('./lib/ComponentCache');

var Doczar = function (options) {
    this.options = options;
    this.fileopsOutstanding = 0;
    this.context = new ComponentCache();
    this.warnings = [];
    this.errors = [];
    this.queue = [];
};

/**     @member/Function addLibrary
    @api

@argument/String libname
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
@callback callback
    @argument/Array errors
    @argument/Array warnings
*/
Doczar.prototype.close = function (directory, callback) {

};

/**     @member/Function finalize
    @development

@callback callback
    @argument/Array errors
    @argument/Array warnings
*/
Doczar.prototype.finalize = function (callback) {

};

/**     @member/Function writeFiles
    @development

@argument/String directory
@callback callback
    @argument/Array errors
    @argument/Array warnings
*/
Doczar.prototype.writeFiles = function (directory, callback) {
    if (this.fileopsOutstanding) {
        var self = this;
        this.queue.push (function(){ self.writeFiles (directory, callback); });
        return;
    }

    if (this.errors.length) {
        var errs = this.errors;
        return process.nextTick (function(){ callback (errs); });
    }
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
