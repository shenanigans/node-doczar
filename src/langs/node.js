
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

function getRoot (context, filepath, module, root) {
    if (Object.hasOwnProperty.call (context.sources, filepath))
        return context.sources[filepath];

    var exports = tools.newNode();
    exports[ROOT] = root;
    exports[DOC] = filepath;
    exports[MODULE] = module;
    var newModuleNode = tools.newNode();
    newModuleNode[PROPS] = tools.newCollection ({ exports:exports });
    newModuleNode[ROOT] = root;
    newModuleNode[DOC] = filepath;
    newModuleNode[MODULE] = module;
    var newRoot = new filth.SafeMap (getGlobalNode (context), {
        module:     newModuleNode,
        exports:    exports
    });
    newRoot[ROOT] = root;
    newRoot[DOC] = filepath;
    newRoot[MODULE] = module;
    context.sources[filepath] = newRoot;
    return newRoot;
}

var DELIMIT = process.platform == 'win32' ? '\\' : '/';
var HAZ = Object.hasOwnProperty;
function getDependency (context, refererName, sourceName, rootPath, target) {
    var refererFrags = refererName.split (DELIMIT);
    var refererDepth = refererFrags.length;
    var workingRootPath = rootPath.concat();
    var workingRefererName = refererName;
    var modulePath, targetName;

    // is the target a local path or a node_modules path?
    if (target[0] !== '.' && target[0] !== '/') {
        var targetFrags = target.split ('/');

        // moving Trunkward only

        // this path uses node_modules from a parent dir
        // but is it a true dependency?
        // only if it appears as a dependency in somebody's package.json!
        // (or digs backward deep enough to exhaust the root path)
        var sourceFrags = path.parse (sourceName).dir.split (DELIMIT);
        // we can go above the source level slightly
        var sourceCutoff = Math.max (0, sourceFrags.length-refererDepth-workingRootPath.length);
        var isDep = false;
        for (var i=sourceFrags.length; i>=sourceCutoff; i--) {
            if (i <= refererDepth)
                workingRootPath.pop();
            var searchPath = path.join.apply (path, sourceFrags.slice (0, i));

            // look for a package.json that specifies this module as a dependency
            try {
                var pkg = JSON.parse (
                    fs.readFileSync (
                        path.join (searchPath, 'package.json')
                    ).toString()
                );
                if (
                    (pkg.dependencies && HAZ.call (pkg.dependencies, targetFrags[0]))
                 || (pkg.devDependencies && HAZ.call (pkg.devDependencies, targetFrags[0]))
                )
                    isDep = true;
            } catch (err) {
                if (err.code !== 'ENOENT' && err.name !== 'SyntaxError') {
                    context.logger.error (
                        { source:sourceName, target:target, root:workingRootPath },
                        'unable to resolve a dependency'
                    );
                    return;
                }
            }

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
                        { source:sourceName, target:target, root:workingRootPath },
                        'unable to resolve a dependency'
                    );
                    return;
                }
                continue;
            }

            if (isDep) {
                // this is a true dependency!
                modulePath = targetFrags.map (function (frag) { return [ '/', frag ]; });
                targetName = path.join (nodeModulesPath, path.join.apply (path, targetFrags));
                workingRootPath = modulePath;
                workingRefererName = targetName;
                break;
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
                { source:sourceName, target:target, root:workingRootPath },
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

    // no more Trunkward movement. Leafward only.

    // confirm filename - is this a directory containing a package.json?
    try {
        var targetPackage = JSON.parse (fs.readFileSync (path.join (targetName, 'package.json')));
        if (targetPackage.main)
            targetName = path.resolve (targetName, targetPackage.main);
        // does this path refer to a real file?
        var tryName = targetName.match (/\.js$/) ? targetName : targetName + '.js';
        try {
            fs.statSync (tryName);
            targetName = tryName;
        } catch (err) {
            // is this a directory containing an index.js?
            tryName = path.join (targetName, 'index.js');
            try {
                fs.statSync (targetName);
                targetName = tryName;
            } catch (err) {
                // nuh-uh. Can't find it. What's even up with this package?
                context.logger.error (
                    { source:sourceName, target:target, root:workingRootPath },
                    'unable to resolve a dependency'
                );
                return;
            }
        }
    } catch (err) {
        if (err.code !== 'ENOENT' && err.name !== 'SyntaxError') {
            context.logger.error (
                { source:sourceName, target:target, root:workingRootPath },
                'unable to resolve a dependency'
            );
            return;
        }
        // is there a .js file?
        var doesMatch = targetName.match (/\.js$/);
        var tryName = doesMatch ? targetName : targetName + '.js';
        try {
            fs.statSync (tryName);
            if (doesMatch)
                modulePath[modulePath.length-1][1] = modulePath[modulePath.length-1][1].slice (0, -3);
            targetName = tryName;
        } catch (err) {
            // is this a directory containing an index.js?
            tryName = path.join (targetName, 'index.js');
            try {
                fs.statSync (tryName);
                targetName = tryName;
            } catch (err) {
                // module cannot be found
                context.logger.error (
                    { source:sourceName, target:target, filename:targetName, root:workingRootPath },
                    'unable to resolve a dependency'
                );
                return;
            }
        }
    }

    return {
        path:       modulePath,
        root:       workingRootPath,
        referer:    workingRefererName || path.parse (targetName).dir,
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
    var round = 1;
    do {
        didSubmit = false;

        context.logger.setTask ('submitting (round ' + round + ') global names');

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
            context.logger.setTask ('submitting (round ' + round + ') ' + rootPath);
            var sourceRoot = context.sources[rootPath];

            // work exports
            var exports = sourceRoot.module[PROPS].exports;
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
        round++;
    } while (didSubmit);
}

function onDocument () {

}

function onStatement () {

}

function onCallable () {

}

var CORE_MODS = [
    "assert",           "buffer_ieee754",   "buffer",           "child_process",    "cluster",
    "console",          "constants",        "crypto",           "_debugger",        "dgram",
    "dns",              "domain",           "events",           "freelist",         "fs",
    "http",             "https",            "_linklist",        "module",           "net",
    "os",               "path",             "punycode",         "querystring",      "readline",
    "repl",             "stream",           "string_decoder",   "sys",              "timers",
    "tls",              "tty",              "url",              "util",             "vm",
    "zlib",             "_http_server",     "process",          "v8"
];
function onCallExpression (context, baseNode, fname, referer, expression, newNode, next, targetNode) {
    if (
        !expression.arguments.length
     || expression.callee.type !== 'Identifier'
     || expression.callee.name !== 'require'
    )
        return true;

    if (targetNode) targetNode[SILENT] = true;
    // gather the module name
    var depName;
    if (expression.arguments[0].type === 'Literal')
        depName = expression.arguments[0].value;
    else {
        // tricky source for the dependency name
        function getFragStr (level) {
            switch (level.type) {
                case 'Literal':
                    if (typeof level.value !== 'string')
                        throw new Error ('invalid literal');
                    return level.value;
                case 'BinaryExpression':
                    if (level.operator !== '+')
                        throw new Error ('invalid binary expression');
                    return getFragStr (level.left) + getFragStr (level.right);
                case 'AssignmentExpression':
                    // assignment expression?
                    if (level.operator !== '=')
                        throw new Error ('invalid assignment expression');
                    return getFragStr (level.right);
                default:
                    throw new Error ('invalid expression type');
            }
        }
        try {
            depName = getFragStr (expression.arguments[0]);
        } catch (err) {
            // could not generate dep name
            return true;
        }
    }

    if (CORE_MODS.indexOf (depName) >= 0) {
        context.logger.debug ({
            required:   expression.arguments[0].value,
            line:       expression.loc.start.line
        }, 'ignored core dependency');
        if (!targetNode)
            return false;
        var dummy = newNode();
        dummy[SILENT] = true;
        dummy[ROOT] = [ [ '/', depName ] ];
        targetNode[DEREF].push (dummy);
        return false;
    }
    var pathInfo = getDependency (
        context,
        path.resolve (process.cwd(), referer),
        fname,
        baseNode[MODULE],
        depName
    );
    if (!pathInfo) {
        if (!targetNode)
            return false;
        var dummy = newNode();
        dummy[SILENT] = true;
        dummy[ROOT] = [ [ '/', depName ] ];
        targetNode[DEREF].push (dummy);
        return false;
    }

    if (context.argv.noDeps && !tools.pathsEqual (pathInfo.root, baseNode[MODULE])) {
        if (!targetNode)
            return false;
        var dummy = newNode();
        dummy[SILENT] = true;
        dummy[ROOT] = pathInfo.path;
        dummy[MODULE] = pathInfo.root;
        targetNode[DEREF].push (dummy);
        return false;
    }
    var sourceRoot = getRoot (context, pathInfo.file, pathInfo.root, pathInfo.path);
    sourceRoot[MODULE] = pathInfo.root;
    next (pathInfo.file, pathInfo.referer || referer);
    var foreignExports = sourceRoot.module[PROPS].exports;
    if (!targetNode)
        return false;
    targetNode[ALIAS] = foreignExports;
    targetNode[DEREF].push (foreignExports);
    return false;
}

module.exports = LangPack ({
    tokenize:           tokenize,
    getGlobalNode:      getGlobalNode,
    getRoot:            getRoot,
    getDependency:      getDependency,
    cleanupGlobal:      cleanupGlobal,
    cleanupRoot:        cleanupRoot,
    onCallExpression:   onCallExpression,
    generateComponents: generateComponents
});
