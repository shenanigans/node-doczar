
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

function getRoot (context, filepath, root) {
    if (Object.hasOwnProperty.call (context.sources, filepath))
        return context.sources[filepath];
    var exports = tools.newNode();
    exports[ROOT] = root;
    var newRoot = new filth.SafeMap (getGlobalNode (context), {
        module:     tools.newNode(),
        exports:    exports
    });
    newRoot[ROOT] = root;
    newRoot.module[PROPS] = tools.newCollection ({ exports:exports });
    context.sources[filepath] = newRoot;
    return newRoot;
}

var DELIMIT = process.platform == 'win32' ? '\\' : '/';
var HAZ = Object.hasOwnProperty;
function getDependency (context, refererName, sourceName, rootPath, target) {
    var refererDir = path.parse (refererName).dir;
    var refererFrags = refererDir.split (DELIMIT);
    var refererDepth = refererFrags.length;
    var workingRootPath = rootPath.concat();
    var workingRefererName = refererName;
    var modulePath, targetName;

    // is the target a local path or a node_modules path?
    if (target[0] !== '.' && target[0] !== '/') {
        var targetFrags = target.split ('/');

        // this path uses node_modules from a parent dir
        // but is it a true dependency?
        // only if it appears as a dependency in somebody's package.json!
        // (or digs backward deep enough to exhaust the root path)
        var sourceFrags = path.parse (sourceName).dir.split (DELIMIT);
        for (var i=sourceFrags.length; i>=Math.max (0, sourceFrags.length-refererDepth); i--) {
            if (i < refererDepth)
                workingRootPath.pop();
            var searchPath = path.join.apply (path, sourceFrags.slice (0, i));

            // look for node_modules
            var nodeModulesPath = path.join (searchPath, 'node_modules');
            try {
                var children = fs.readdirSync (nodeModulesPath);
                // there's a node_modules directory here
                // does it contain our first step?
                if (
                    children.indexOf (targetFrags[0]) < 0
                 && ( targetFrags.length !== 1 || children.indexOf (targetFrags[0]+'.js') < 0 )
                )
                    continue;
            } catch (err) {
                if (err.code !== 'ENOENT' && err.code !== 'ENOTDIR') {
                    context.logger.error (
                        { source:sourceName, target:target },
                        'unable to resolve a dependency'
                    );
                    return;
                }
                continue;
            }

            // entering the first node_modules directory
            // is there a matching package.json?
            try {
                var pkg = JSON.parse (
                    fs.readFileSync (
                        path.join (searchPath, 'package.json')
                    ).toString()
                );
                if (
                    (pkg.dependencies && HAZ.call (pkg.dependencies, targetFrags[0]))
                 || (pkg.devDependencies && HAZ.call (pkg.devDependencies, targetFrags[0]))
                ) {
                    // this is a true dependency!
                    modulePath = targetFrags.map (function (frag) { return [ '/', frag ]; });
                    targetName = path.join (nodeModulesPath, path.join.apply (path, targetFrags));
                    workingRootPath = modulePath;
                    workingRefererName = '';
                    break;
                }
            } catch (err) {
                if (err.code !== 'ENOENT' && err.name !== 'SyntaxError') {
                    context.logger.error (
                        { source:sourceName, target:target },
                        'unable to resolve a dependency'
                    );
                    return;
                }
            }
            // this is a file found in a local node_modules
            modulePath = workingRootPath.concat (
                sourceFrags.slice (refererDepth, i).map (function (frag) { return [ '/', frag ]; })
            );
            modulePath.push ([ '/', 'node_modules' ]);
            modulePath.push.apply (
                modulePath,
                targetFrags.map (function (frag) { return [ '/', frag ]; })
            );
            targetName = path.join (searchPath, 'node_modules', path.join.apply (path, targetFrags));
            break;
        }

        // if we haven't built a modulePath by now, the module could not be found
        if (!modulePath) {
            context.logger.error (
                { source:sourceName, target:target },
                'unable to resolve a dependency'
            );
            return;
        }
    } else {
        // local path resolution
        targetName = path.resolve (path.parse (sourceName).dir, target);
        var targetFrags = targetName.split (DELIMIT);
        // same from root?
        var workingRootPath = rootPath.concat();
        for (var i=refererDepth-1; i>=0 && workingRootPath.length; i--) {
            if (targetFrags[i] === refererFrags[i])
                break;
            refererDepth--;
        }
        modulePath = workingRootPath.concat (
            targetFrags.slice (refererDepth).map (function (frag) { return [ '/', frag ]; })
        );
    }

    // confirm filename - is this a directory containing a package.json?
    try {
        var targetPackage = JSON.parse (fs.readFileSync (path.join (targetName, 'package.json')));
        if (targetPackage.main)
            targetName = path.resolve (targetName, targetPackage.main);
    } catch (err) {
        if (err.code !== 'ENOENT' && err.name !== 'SyntaxError') {
            context.logger.error (
                { source:sourceName, target:target },
                'unable to resolve a dependency'
            );
            return;
        }
        // is there a .js file?
        targetName += '.js';
        try {
            fs.statSync (targetName);
        } catch (err) {
            // module cannot be found
            context.logger.error (
                { source:sourceName, target:target },
                'unable to resolve a dependency'
            );
            return;
        }
    }

    return {
        path:       modulePath,
        root:       workingRootPath,
        referer:    workingRefererName || targetName,
        file:       targetName
    };
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
    getDependency:      getDependency,
    cleanupGlobal:      cleanupGlobal,
    cleanupRoot:        cleanupRoot,
    generateComponents: generateComponents
};
