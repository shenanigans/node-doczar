
var path = require ('path');
var fs = require ('fs-extra');
var esprima = require ('esprima');
var tools = require ('tools');
var filth = require ('filth');
var getNodeModulePath = require ('getNodeModulePath')

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
    if (!globalNode) {
        // load es6 and node roots
        var es6Root = JSON.parse (
            fs.readFileSync (path.join (__dirname, 'roots', 'es6.json')).toString()
        );
        for (var key in es6Root) {
            var item = es6Root[key];
            for (var subkey in item) {
                if (subkey[0] !== '.')
                    continue;
                item[tools[subkey.slice(1).toUpperCase()]] = item[subkey];
                delete item[subkey];
            }
        }
        var nodeRoot = JSON.parse (
            fs.readFileSync (path.join (__dirname, 'roots', 'node.json')).toString()
        );
        for (var key in nodeRoot) {
            var item = nodeRoot[key];
            for (var subkey in item) {
                if (subkey[0] !== '.')
                    continue;
                item[tools[subkey.slice(1).toUpperCase()]] = item[subkey];
                delete item[subkey];
            }
        }
        globalNode = new filth.SafeMap (es6Root, nodeRoot);
        globalNode[IS_COL] = true;
        globalNode.global = tools.newNode();
        globalNode.global[PROPS] = globalNode;
    }
    return globalNode;
}

function getRoot (context, filepath) {
    if (Object.hasOwnProperty.call (context.sources, filepath))
        return context.sources[filepath];
    var exports = tools.newNode();
    var newRoot = new filth.SafeMap (getGlobalNode (context), {
        module:     tools.newNode(),
        exports:    exports
    });
    newRoot.module[PROPS] = tools.newCollection ({ exports:exports });
    context.sources[filepath] = newRoot;
    return newRoot;
}

function cleanupGlobal(){
    delete globalNode.global;
    return globalNode;
}

function cleanupRoot (sources) {
    for (var rootPath in sources) {
        var sourceRoot = sources[rootPath];
        delete sourceRoot.global;
    }
}

function generateComponents (context, submitSourceLevel) {
    var didSubmit;
    do {
        didSubmit = false;

        // work globals
        for (var key in globalNode) try {
            didSubmit += submitSourceLevel (
                globalNode[key],
                [ [ '.', key ] ],
                []
            );
        } catch (err) {
            context.logger.error (
                { err:err, identifier:key, parse:context.argv.parse },
                'failed to generate Declarations for global identifier'
            );
        }

        // work each source file
        for (var rootPath in context.sources) try {
            var sourceRoot = context.sources[rootPath];

            // work exports
            var exports = sourceRoot.module[PROPS].exports;
            var chain = [ exports ];
            while (exports[DEREF].length === 1 && chain.indexOf (exports[DEREF][0]) < 0)
                exports = exports[DEREF][0];

            didSubmit += submitSourceLevel (
                exports,
                [],
                sourceRoot[ROOT]
            );

            // work locals
            for (var key in sourceRoot)
                if (key !== 'module' && key !== 'exports')
                    didSubmit += submitSourceLevel (
                        sourceRoot[key],
                        [ [ '%', key ] ],
                        sourceRoot[ROOT]
                    );
        } catch (err) {
            context.logger.error (
                { err:err, path:rootPath, parse:context.argv.parse },
                'failed to generate Declarations from source file'
            );
        }
    } while (didSubmit);
}

function onDocument () {

}

function onStatement () {

}

function onCallExpression () {

}

module.exports = {
    tokenize:           tokenize,
    getGlobalNode:      getGlobalNode,
    getRoot:            getRoot,
    cleanupGlobal:      cleanupGlobal,
    cleanupRoot:        cleanupRoot,
    generateComponents: generateComponents
};
