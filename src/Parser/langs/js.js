
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
    if (!globalNode) {
        // load es5/6 and optionally browser roots
        var esVersion = 'es5';
        var doLoadBrowser = false;
        if (context.argv.parse === 'strict' || context.argv.parse === 'browser-strict') {
            esVersion = 'es6';
            doLoadBrowser = true;
        }
        var esRoot = JSON.parse (
            fs.readFileSync (path.join (__dirname, 'roots', esVersion + '.json')).toString()
        );
        for (var key in esRoot) {
            var item = esRoot[key];
            for (var subkey in item) {
                if (subkey[0] !== '.')
                    continue;
                item[tools[subkey.slice(1).toUpperCase()]] = item[subkey];
                delete item[subkey];
            }
        }
        var browserRoot;
        if (!doLoadBrowser)
            browserRoot = {};
        else {
            browserRoot = JSON.parse (
                fs.readFileSync (path.join (__dirname, 'roots', 'node.json')).toString()
            );
            for (var key in browserRoot) {
                var item = browserRoot[key];
                for (var subkey in item) {
                    if (subkey[0] !== '.')
                        continue;
                    item[tools[subkey.slice(1).toUpperCase()]] = item[subkey];
                    delete item[subkey];
                }
            }
        }
        globalNode = new filth.SafeMap (esRoot, browserRoot);
        globalNode[IS_COL] = true;
        globalNode.window = tools.newNode();
        globalNode.window[PROPS] = globalNode;
    }
    return globalNode;
}

function getRoot (context, filepath, root) {
    if (Object.hasOwnProperty.call (context.sources, filepath))
        return context.sources[filepath];
    var newRoot = new filth.SafeMap (getGlobalNode (context));
    newRoot[ROOT] = root;
    var exports = newRoot[EXPORTS] = tools.newNode();
    exports[ROOT] = root;
    exports[PROPS] = tools.newCollection();
    context.sources[filepath] = newRoot;
    return newRoot;
}

function cleanupGlobal(){
    delete globalNode.window;
    return globalNode;
}

function cleanupRoot (sources) {
    for (var rootPath in sources) {
        var sourceRoot = sources[rootPath];
        delete sourceRoot.window;
    }
}

function generateComponents (context, submitSourceLevel) {
    var didSubmit;
    var failed = [];
    var globalFailed = [];
    do {
        didSubmit = false;

        // work globals
        for (var key in globalNode) try {
            didSubmit += submitSourceLevel (
                globalNode[key],
                [ [ '.', key ] ],
                undefined
            );
        } catch (err) {
            if (globalFailed.indexOf (key) < 0) {
                globalFailed.push (key);
                context.logger.error (
                    { err:err, identifier:key, parse:context.argv.parse },
                    'failed to generate Declarations for global identifier'
                );
            }
        }

        // work each source file
        for (var rootPath in context.sources) try {
            var sourceRoot = context.sources[rootPath];

            // work exports
            if (
                sourceRoot[EXPORTS]
             && sourceRoot[EXPORTS][PROPS]
             && Object.keys (sourceRoot[EXPORTS][PROPS]).length
            )
                didSubmit += submitSourceLevel (
                    sourceRoot[EXPORTS],
                    [],
                    sourceRoot[ROOT]
                );
            else if (!sourceRoot[ROOT].length)
                for (var key in sourceRoot)
                    didSubmit += submitSourceLevel (
                        sourceRoot[key],
                        [ [ '.', key ] ],
                        []
                    );

            // work locals
            for (var key in sourceRoot)
                didSubmit += submitSourceLevel (
                    sourceRoot[key],
                    [ [ '%', key ] ],
                    sourceRoot[ROOT]
                );
        } catch (err) {
            if (failed.indexOf (rootPath) < 0) {
                failed.push (rootPath);
                context.logger.error (
                    { err:err, path:rootPath, parse:context.argv.parse },
                    'failed to generate Declarations from module source file'
                );
            }
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
