
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
};

Doczar.prototype.addLibrary = function (libname) {

};

Doczar.prototype.addFile = function (fname) {

};

Doczar.prototype.addJSModule = function (fname) {

};

Doczar.prototype.writeFiles = function (directory, callback) {

};

var DEFAULT_DOCZAR = new Doczar ({});
Doczar.addLibrary = DEFAULT_DOCZAR.addLibrary.bind (DEFAULT_DOCZAR);
Doczar.addFile = DEFAULT_DOCZAR.addFile.bind (DEFAULT_DOCZAR);
Doczar.addJSModule = DEFAULT_DOCZAR.addJSModule.bind (DEFAULT_DOCZAR);
Doczar.writeFiles = DEFAULT_DOCZAR.writeFiles.bind (DEFAULT_DOCZAR);

module.exports = Doczar;
