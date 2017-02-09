
/*  @module

*/

var pathLib  = require ('path');
var tools    = require ('tools');
var Parser   = require ('./Parser');
var Patterns = require ('./Parser/Patterns');

function mapOf (arr) {
    var map = Object.create (null);
    for (var i=0,j=arr.length; i<j; i++)
        map[arr[i]] = true;
    return map;
}
var PREPROCESS_MAP_KEYS = mapOf ([ MEMBERS, PROPS ]);
var PREPROCESS_ARR_KEYS = mapOf ([ ARGUMENTS, SUPER ]);
var PREPROCESS_OBJ_KEYS = mapOf ([ RETURNS, THROWS ]);
var PREPROCESS_MAX_DEPTH = 8;
/*
    Use the compiled information from syntax parsing to add Component definitions to a
    [ComponentCache](doczar.ComponentCache).
*/
function generateComponents (context, langPack, defaultScope) {
    context.latency.log();

    // tools for syntax parsing
    function preprocessDerefs (level, target, chain, isTransient) {
        var didFinishDeref = false;
        if (!target)
            target = level;
        if (!chain)
            chain = [ target ];
        if (target[TRANSIENT])
            isTransient = true;

        function recurse (level, target) {
            if (chain.length >= context.argv.maxRefDepth)
                return false;
            if (IS_COL in level)
                return false;
            if (chain.indexOf (level) >= 0)
                return false;
            var newChain = chain.concat();
            newChain.push (level);
            return preprocessDerefs (level, target || level, newChain, isTransient);
        }

        if (level[NAME] && level[NAME][1] && (!target[NAME] || !target[NAME][1]))
            target[NAME] = level[NAME];
        else if (level[MOUNT] && level[MOUNT].path && level[MOUNT].path.length)
            target[NAME] = level[MOUNT].path[level[MOUNT].path.length-1].concat();

        if (level[BLIND])
            target[BLIND] = true;

        if (!level[DEREF])
            return false;

        // dive for LINE definitions
        if (target === level && !target[LINE] && !isTransient) {
            var pointer = level;
            var lineChain = [ level ];
            while (
                !pointer[LINE]
             && pointer[DEREF]
             && pointer[DEREF].length === 1
             && !pointer[DEREF][0][TRANSIENT]
            ) {
                pointer = pointer[DEREF][0];
                if (pointer[LINE])
                    break;
                if (lineChain.indexOf (pointer) >= 0)
                    break;
                lineChain.push (pointer);
            }
            if (pointer[LINE])
                target[LINE] = pointer[LINE];
        }

        for (var i=0,j=level[DEREF].length; i<j; i++) {
            var ref = level[DEREF][i];
            if (chain.indexOf (ref) >= 0)
                continue;
            if (IS_COL in ref)
                continue;
            recurse (ref, target);

            // alias to mount
            if (ref[MOUNT] && !isTransient && ref[MOUNT].path) {
                target[ALIAS] = ref;
                recurse (ref);
            }

            // basic types
            var baseTypes = ref[TYPES];
            for (var k=0,l=baseTypes.length; k<l; k++)
                if (target[TYPES].indexOf (baseTypes[k]) < 0) {
                    target[TYPES].push (baseTypes[k]);
                    didFinishDeref = true;
                }
            if (ref[INSTANCE]) {
                var classes = ref[INSTANCE];
                if (!target[INSTANCE]) {
                    target[INSTANCE] = classes.concat();
                    didFinishDeref = true;
                } else for (var k=0,l=classes.length; k<l; k++)
                    if (target[INSTANCE].indexOf (classes[k]) < 0) {
                        target[INSTANCE].push (classes[k]);
                        didFinishDeref = true;
                    }
            }
            // promote documentation
            if (ref[DOCSTR]) {
                if (!target[DOCSTR]) {
                    target[DOCSTR] = ref[DOCSTR].concat();
                    didFinishDeref = true;
                } else for (var i=0,j=ref[DOCSTR].length; i<j; i++)
                    if (target[DOCSTR].indexOf (ref[DOCSTR][i]) < 0) {
                        target[DOCSTR].push (ref[DOCSTR][i]);
                        didFinishDeref = true;
                    }
            }
            // promote children
            if (ref[PROPS]) {
                if (!target[PROPS]) {
                    target[PROPS] = tools.newCollection (target[PROPS]);
                    target[PROPS][PARENT] = target;
                } else for (var name in ref[PROPS])
                    if (!Object.hasOwnProperty.call (target[PROPS], NAME))
                        target[PROPS][name] = ref[PROPS][name];
            }
            if (ref[MEMBERS]) {
                if (!target[MEMBERS]) {
                    target[MEMBERS] = tools.newCollection (target[MEMBERS]);
                    target[MEMBERS][PARENT] = target;
                } else for (var name in ref[MEMBERS])
                    if (!Object.hasOwnProperty.call (target[MEMBERS], NAME))
                        target[MEMBERS][name] = ref[MEMBERS][name];
            }
            if (ref[ARGUMENTS]) {
                if (!target[ARGUMENTS])
                    target[ARGUMENTS] = ref[ARGUMENTS].concat();
                else for (var i=0,j=ref[ARGUMENTS].length; i<j; i++) {
                    var refArg = ref[ARGUMENTS][i];
                    if (target[ARGUMENTS].indexOf (refArg) >= 0)
                        continue;
                    var found = false;
                    if (!refArg[NAME] || !refArg[NAME][1]) {
                        // merge argument information by index, if possible
                        if (i < target[ARGUMENTS].length) {
                            found = true;
                            didFinishDeref += recurse (refArg, target[ARGUMENTS][i])
                        }
                    } else for (var k=0,l=target[ARGUMENTS].length; k<l; k++)
                        // look for an argument of the same name
                        if (
                            target[ARGUMENTS][k][NAME]
                         && target[ARGUMENTS][k][NAME][1]
                         && target[ARGUMENTS][k][NAME][1] === refArg[NAME][1]
                        ) {
                            // merge in place
                            found = true;
                            didFinishDeref += recurse (refArg, target[ARGUMENTS][k]);
                            break;
                        }

                    if (!found) {
                        // add to arguments
                        if (i < target[ARGUMENTS].length)
                            didFinishDeref += recurse (refArg, target[ARGUMENTS][i]);
                        else {
                            target[ARGUMENTS].push (refArg);
                            didFinishDeref = true;
                        }
                    }
                }
            }
            if (ref[RETURNS]) {
                if (!target[RETURNS])
                    target[RETURNS] = ref[RETURNS];
            }
            if (ref[THROWS]) {
                if (!target[THROWS]) {
                    target[THROWS] = tools.newCollection (target[THROWS]);
                    target[THROWS][PARENT] = target;
                } else for (var name in ref[THROWS])
                    if (!Object.hasOwnProperty.call (target[THROWS], NAME))
                        target[THROWS][name] = ref[THROWS][name];
            }
        }

        // process arguments and returns
        if (level[ARGUMENTS]) for (var i=0,j=level[ARGUMENTS].length; i<j; i++)
            didFinishDeref += recurse (level[ARGUMENTS][i]);
        if (level[RETURNS])
            didFinishDeref += recurse (level[RETURNS]);

        // recurse
        if (typeof level !== 'object')
            throw new Error ('unexpected error');

        for (var key in level)
            didFinishDeref += recurse (level[key], undefined);

        if (target[NO_SET])
            return didFinishDeref;

        if (level[MEMBERS]) for (var key in level[MEMBERS]) {
            var nextTarget = level[MEMBERS][key];
            didFinishDeref += recurse (nextTarget, nextTarget);
        }

        if (level[PROPS]) for (var key in level[PROPS]) {
            var nextTarget = level[PROPS][key];
            didFinishDeref += recurse (nextTarget, nextTarget);
        }

        return didFinishDeref;
    }

    // recursively submit all the information built into the namespace
    function submitSourceLevel (level, scope, localDefault, chain, force) {
        if (!chain)
            chain = [ level ];
        else if (chain.indexOf (level) >= 0)
            return false;
        else {
            chain = chain.concat();
            chain.push (level);
        }

        function isLocalPath (path) {
            for (var i=0,j=path.length; i<j; i++)
                if (path[i][0] == '%')
                    return true;
            return false;
        }

        function hasComments (level, chain) {
            if (!chain)
                chain = [ level ];
            else {
                if (chain.indexOf (level) >= 0)
                    return false;
                chain.push (level);
            }
            if (level[DOCSTR])
                return true;
            for (var key in level)
                if (hasComments (level[key], chain.concat()))
                    return true;
            if (level[MEMBERS]) for (var key in level[MEMBERS])
                if (hasComments (level[MEMBERS][key], chain.concat()))
                    return true;
            if (level[PROPS]) for (var key in level[PROPS])
                if (hasComments (level[PROPS][key], chain.concat()))
                    return true;
            if (level[ARGUMENTS]) for (var key in level[ARGUMENTS])
                if (hasComments (level[ARGUMENTS][key], chain.concat()))
                    return true;
            if (level[THROWS]) for (var key in level[THROWS])
                if (hasComments (level[THROWS][key], chain.concat()))
                    return true;
            if (level[RETURNS] && hasComments (level[RETURNS], chain.concat()))
                return true;
            if (level[DEREF]) for (var i=0,j=level[DEREF].length; i<j; i++)
                if (hasComments (level[DEREF], chain.concat()))
                    return true;
            return false;
        }

        if (!localDefault)
            localDefault = defaultScope;
        if (level[OVERRIDE] && level[OVERRIDE].length)
            localDefault = level[OVERRIDE];
        var didSubmit = false;

        if (!level[PATH]) {
            didSubmit = true;
            var path, ctype, docstr, fileScope;
            var types = level[TYPES] ?
                Parser.parseType (level[TYPES].concat().join ('|'), localDefault, true)
              : []
              ;
            if (level[MOUNT]) {
                path = level[MOUNT].path || scope;
                ctype = level[MOUNT].ctype || (
                    path.length ? Patterns.delimiters[path[path.length-1][0]] : 'property'
                );
                if (level[MOUNT].parent) {
                    if (!level[MOUNT].parent[LOCALPATH])
                        return false;
                    path = level[MOUNT].parent[LOCALPATH].concat (level[MOUNT].path);
                }
                scope = path;
                types.push.apply (types, level[MOUNT].valtype);
                docstr = level[MOUNT].docstr || [ '' ];
                fileScope = level[MOUNT].docContext || [];
                if (!level[OVERRIDE] && level[MOUNT].path)
                    localDefault = [];
            } else {
                path = scope;
                if (level[MEMBERS])
                    ctype = 'class';
                else
                    ctype = path.length ? Patterns.delimiters[path[path.length-1][0]] : 'property';
                docstr = level[DOCSTR] || [ '' ];
                fileScope = [];
            }
            level[LOCALPATH] = path;
            // var fullpath = level[PATH] = concatPaths (localDefault, path);
            var fullpath = level[PATH] = localDefault.concat (path);
            if (ctype === 'class') for (var i=types.length-1; i>=0; i--) {
                var type = types[i];
                if (type.name === 'function' || type.name === 'Function')
                    types.splice (i, 1);
            }
            if (fullpath.length && (
                fullpath[fullpath.length-1][0] === '/' || fullpath[fullpath.length-1][0] === ':'
            )) {
                if (ctype === 'class') {
                    var foundClass = false;
                    for (var i=types.length-1; i>=0; i--) {
                        if (types[i].name === 'class') {
                            foundClass = true;
                            break;
                        }
                    }
                    if (!foundClass)
                        types.push (Parser.parseType ('class')[0]);
                }
                ctype = 'module';
                var i = level[TYPES].indexOf ('Object');
                if (i >= 0)
                    types.splice (i, 1);
                i = level[TYPES].indexOf ('json');
                if (i >= 0)
                    types.splice (i, 1);
            }

            level[CTYPE] = ctype;
            level[FINALTYPES] = types;

            // submit, if we should
            if (
                fullpath.length
             && fullpath[0][1]
             && typeof fullpath[0][1] === 'string'
             && !level[SILENT]
             && ( force || path.length || localDefault.length )
             && (
                    level[MOUNT]
                 || !isLocalPath (path)
                 || context.argv.locals === 'all'
                 || ( context.argv.locals === 'comments' && hasComments (level) )
             )
            ) {
                level[FORCE] = -1; // marks already written
                force = true;
                Parser.parseTag (
                    context,
                    level[DOC],
                    ctype,
                    types,
                    path.length ? path : localDefault,
                    path.length ? localDefault : [],
                    [],
                    docstr,
                    function (fname) { nextFiles.push (fname); }
                );
                if (level[LINE]) {
                    var lineDoc = {
                        sourceFile: pathLib.relative (level[REFERER], level[DOC]),
                        sourceLine: level[LINE]
                    };
                    if (level[MODULE] && !tools.pathsEqual (level[MODULE], context.argv.root))
                        lineDoc.sourceModule = level[MODULE];
                    context.submit (fullpath, lineDoc);
                }
                if (level[NAME] !== undefined && level[NAME][1])
                    context.submit (
                        fullpath,
                        { name:level[NAME][1] }
                    );
            }
        } else if (
            level[PATH].length
         && level[PATH][0][1]
         && typeof level[PATH][0][1] === 'string'
         && !level[SILENT]
         && (
                ( level[FORCE] && level[FORCE] > 0 )
             || ( force && ( !level[FORCE] || level[FORCE] > 0 ) )
            )
        ) {
            // submit due to the FORCE mechanism
            level[FORCE] = -1;
            force = true;
            Parser.parseTag (
                context,
                level[DOC],
                level[CTYPE],
                level[FINALTYPES],
                level[LOCALPATH].length ? level[LOCALPATH] : localDefault,
                level[LOCALPATH].length ? localDefault : [],
                [],
                ( level[MOUNT] ? level[MOUNT].docstr : level[DOCSTR] ) || [],
                function (fname) { nextFiles.push (fname); }
            );
            // var fullpath = concatPaths (localDefault, level[LOCALPATH]);
            var fullpath = localDefault.concat (level[LOCALPATH]);
            if (level[LINE]) {
                var lineDoc = {
                    sourceFile: pathLib.relative (level[REFERER], level[DOC]),
                    sourceLine: level[LINE]
                };
                if (level[MODULE] && !tools.pathsEqual (level[MODULE], context.argv.root))
                    lineDoc.sourceModule = level[MODULE];
                context.submit (
                    localDefault.concat (level[LOCALPATH]),
                    // concatPaths (localDefault, level[LOCALPATH]),
                    lineDoc
                );
            }
        } else {
            // alias?
            if (force && !tools.pathsEqual (scope, level[LOCALPATH])) {
                context.submit (localDefault.concat (scope), {
                // context.submit (concatPaths (localDefault, scope), {
                    modifiers:[ { mod:'alias', path:level[PATH] } ]
                });
                return true;
            }
            scope = level[PATH];
            localDefault = [];
        }

        // are we waiting to add complex paths to the types list?
        if (level[INSTANCE]) {
            var writeAndForce = Boolean (
                !isLocalPath (level[PATH])
             || context.argv.locals === 'all'
             || ( context.argv.locals === 'comments' && hasComments (level))
            );
            for (var i=level[INSTANCE].length-1; i>=0; i--) {
                var constructor = level[INSTANCE][i];
                if (!constructor[PATH])
                    continue;
                didSubmit = true;
                function isRelevantPath (path) {
                    for (var i=0,j=path.length; i<j; i++) {
                        var pathChar = path[i][0];
                        if (pathChar === '(')
                            return false;
                    }
                    return true;
                }
                if (!constructor[FORCE] && isRelevantPath (level[PATH]) && (
                    level[FORCE]
                 || !isLocalPath (level[PATH])
                 || context.argv.locals === 'all'
                 || ( context.argv.locals === 'comments' && hasComments (level))
                 ))
                    constructor[FORCE] = 1;
                level[INSTANCE].splice (i, 1);
                var typePath = constructor[PATH].map (function (frag) {
                    return frag[0] + frag[1];
                }).join ('');
                if (writeAndForce && level[TYPES].indexOf (typePath) < 0 && !level[SILENT]) {
                    level[TYPES].push (typePath);
                    Parser.parseTag (
                        context,
                        level[DOC],
                        level[CTYPE],
                        Parser.parseType (typePath, [], true),
                        scope,
                        localDefault,
                        [],
                        [],
                        function (fname) { nextFiles.push (fname); }
                    );
                    // var fullpath = concatPaths (localDefault, scope);
                    var fullpath = localDefault.concat (scope);
                    if (level[LINE]) {
                        var lineDoc = {
                            sourceFile: pathLib.relative (level[REFERER], level[DOC]),
                            sourceLine: level[LINE]
                        };
                        if (level[MODULE] && !tools.pathsEqual (level[MODULE], context.argv.root))
                            lineDoc.sourceModule = level[MODULE];
                        // context.submit (concatPaths (localDefault, scope), lineDoc);
                        context.submit (localDefault.concat (scope), lineDoc);
                    }
                }
            }
        }

        if (level[SUPER]) for (var i=level[SUPER].length-1; i>=0; i--) {
            var pointer = level[SUPER][i];
            var superChain = [];
            while (
                pointer[DEREF]
             && pointer[DEREF].length == 1
             && superChain.indexOf (pointer[DEREF][0]) < 0
            )
                superChain.push (pointer = pointer[DEREF][0]);
            if (!pointer[PATH])
                continue;

            context.submit (level[PATH], { modifiers:[ { mod:'super', path:pointer[PATH] } ] });
            didSubmit = true;
            level[SUPER].splice (i, 1);
        }

        if (level[ALIAS]) {
            if (level[PATH] && (
                    level[MOUNT]
                 || !isLocalPath (level[PATH])
                 || context.argv.locals === 'all'
                 || ( context.argv.locals === 'comments' && hasComments (level) )
             )) {
                if (!level[ALIAS][PATH] && level[ALIAS][MOUNT] && level[ALIAS][MOUNT].path) {
                    didSubmit += submitSourceLevel (
                        level[ALIAS],
                        [],
                        localDefault,
                        chain,
                        force
                    );
                }
                if (level[ALIAS][PATH]) {
                    didSubmit = true;
                    context.submit (level[PATH], { modifiers:[ {
                        mod:    'alias',
                        path:   level[ALIAS][PATH]
                    } ] });
                    delete level[ALIAS];
                }
            }
            return didSubmit;
        }

        if (level[SILENT] || level[NO_SET])
            return didSubmit;

        // recurse to various children
        if (level[MEMBERS] && !level[BLIND]) {
            delete level[MEMBERS][IS_COL];
            delete level[MEMBERS][PARENT];
            for (var key in level[MEMBERS]) {
                var pointer = level[MEMBERS][key];
                didSubmit += submitSourceLevel (
                    level[MEMBERS][key],
                    tools.pathPlus (scope, [ '#', key ]),
                    localDefault,
                    chain,
                    force
                );
            }
        }

        if (level[PROPS]) {
            delete level[PROPS][IS_COL];
            for (var key in level[PROPS]) {
                var pointer = level[PROPS][key];
                didSubmit += submitSourceLevel (
                    pointer,
                    tools.pathPlus (scope, [ '.', key ]),
                    localDefault,
                    chain,
                    force
                );
            }
        }

        if (level[ARGUMENTS])
            for (var i=0,j=level[ARGUMENTS].length; i<j; i++) {
                var arg = level[ARGUMENTS][i];
                didSubmit += submitSourceLevel (
                    arg,
                    tools.pathPlus (scope, [ '(', i ]),
                    localDefault,
                    chain,
                    force
                );
            }

        if (level[RETURNS] && level[RETURNS][TYPES].length)
            didSubmit += submitSourceLevel (
                level[RETURNS],
                tools.pathPlus (scope, [ ')', 0 ]),
                localDefault,
                chain,
                force
            );

        if (level[THROWS])
            didSubmit += submitSourceLevel (
                level[THROWS],
                tools.pathPlus (scope, [ '!', undefined ]),
                localDefault,
                chain,
                force
            );

        for (var key in level)
            didSubmit += submitSourceLevel (
                level[key],
                tools.pathPlus (scope, [ '.', key ]),
                localDefault,
                chain
            );

        if (level[SCOPE])
            for (var key in level[SCOPE])
                didSubmit += submitSourceLevel (
                    level[SCOPE][key],
                    tools.pathPlus (scope, [ '%', key ]),
                    localDefault,
                    chain
                );

        delete level[SCOPE];
        return didSubmit;
    }

    // clean up roots
    var globalNode = langPack.cleanupGlobal (context);
    for (var rootPath in context.sources) {
        var sourceRoot = context.sources[rootPath];
        for (var key in globalNode)
            if (sourceRoot[key] === globalNode[key])
                delete sourceRoot[key];
    }
    langPack.cleanupRoot (context.sources);

    // preprocess primitive types
    var finishedADeref;
    var round = 1;
    do {
        finishedADeref = false;
        for (var rootPath in context.sources) {
            context.logger.setTask (
                'preprocessing (round '
              + round
              + ') '
              + pathLib.relative (process.cwd(), rootPath)
            );
            var sourceRoot = context.sources[rootPath];
            delete sourceRoot.globals;
            for (var key in sourceRoot) try {
                var target = sourceRoot[key];
                finishedADeref += preprocessDerefs (target, target, [ target ]);
            } catch (err) {
                context.logger.error (
                    { err:err, path:rootPath, parse:context.argv.parse },
                    'failed to preprocess primitive types'
                );
            }
        }
        for (var key in globalNode) try {
            var target = globalNode[key];
            finishedADeref += preprocessDerefs (target, target, [ target ]);
        } catch (err) {
            context.logger.error (
                { err:err, path:rootPath, parse:context.argv.parse },
                'failed to process deferred types'
            );
        }
        round++;
    } while (finishedADeref);
    context.logger.info ({ parse:context.argv.parse }, 'finished preprocessing primitive types');

    // generate Components for items defined in each source file
    langPack.generateComponents (context, submitSourceLevel);
    context.latency.log ('generation');
    context.logger.info ({ parse:context.argv.parse }, 'finished generating Components');
}


module.exports = {
    generateComponents: generateComponents
};
