
var path = require ('path');
var fs = require ('fs-extra');
var esprima = require ('esprima');
var tools = require ('tools');
var filth = require ('filth');

function tokenize (fstr) {
    return esprima.parse (fstr, {
        loc:            true,
        comment:        true,
        attachComment:  true,
        tolerant:       true,
        sourceType:     'module'
    });
}

var globalNode;
function getGlobalNode (context) {

}

function getRoot (context, filepath, root) {

}

function cleanupGlobal(){

}

function cleanupRoot (sources) {

}

function generateComponents (context, submitSourceLevel) {

}

module.exports = {
    tokenize:           tokenize,
    getGlobalNode:      getGlobalNode,
    getRoot:            getRoot,
    cleanupGlobal:      cleanupGlobal,
    cleanupRoot:        cleanupRoot,
    generateComponents: generateComponents
};
