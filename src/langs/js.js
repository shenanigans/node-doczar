
var path = require ('path');
var fs = require ('fs-extra');
var esprima = require ('esprima');
var tools = require ('tools');
var filth = require ('filth');
var LangPack = require ('./LangPack');

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
        if (doLoadBrowser)
            globalNode = LangPack.loadRootFiles ([ esVersion, 'browser' ]);
        else
            globalNode = LangPack.loadRootFiles ([ esVersion ]);
        globalNode[IS_COL] = true;
        globalNode[NAME] = [ '.', 'window' ];
        globalNode.window = tools.newNode();
        globalNode.window[PROPS] = globalNode;
    }
    return globalNode;
}

function getRoot (context, filepath, module, root) {
    if (Object.hasOwnProperty.call (context.sources, filepath))
        return context.sources[filepath];
    var newRoot = new filth.SafeMap (getGlobalNode (context));
    newRoot[ROOT] = root;
    newRoot[MODULE] = module;
    var exports = newRoot[EXPORTS] = tools.newNode();
    exports[ROOT] = root;
    exports[MODULE] = module;
    exports[PROPS] = tools.newCollection();
    context.sources[filepath] = newRoot;
    return newRoot;
}

var nodeGetDep = require ('./node').getDependency;
function getDependency (context, refererName, sourceName, rootPath, target) {
    var workingTarget = target.match (/\.js$/) ? target.slice (0, -3) : target;
    return nodeGetDep (context, refererName, sourceName, rootPath, workingTarget);
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
    var round = 1;
    do {
        didSubmit = false;

        context.logger.setTask ('submitting (round ' + round + ') global names');

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
            context.logger.setTask ('submitting (round ' + round + ') ' + rootPath);
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
        round++;
    } while (didSubmit);
}

function onDocument () {

}

function onStatement () {

}

function onCallable () {

}


module.exports = LangPack ({
    tokenize:           tokenize,
    getGlobalNode:      getGlobalNode,
    getRoot:            getRoot,
    getDependency:      getDependency,
    cleanupGlobal:      cleanupGlobal,
    cleanupRoot:        cleanupRoot,
    generateComponents: generateComponents
});
