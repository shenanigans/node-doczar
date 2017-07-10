
/*  @module
    Inspects a [static model](doczar.Analyzer) and adds appropriate [Components](doczar.Component)
    to a [ComponentCache](doczar.ComponentCache).
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
    Use the compiled information from [syntax analysis](doczar.Analyzer) to add [Component]
    (doczar.Component) definitions to a [ComponentCache](doczar.ComponentCache).
@argument:doczar.ComponentCache context
    The ComponentCache in which new [Component](doczar.Component) instances are stored.
@argument:doczar/src/langs/LangPack langPack
    Language-specific procedures for Component generation.
@argument:doczar.Parser/Path defaultScope
    The Component path of the syntax file being processed. This may be overwritten with an explicit
    documentation comment.
*/
function generateComponents (context, langPack, defaultScope) {
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
                if (path[i][0] === '%')
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
        // catch Components implied by an importing context
        if (
            localDefault
         && localDefault.length
         && level[MODULE]
         && level[MODULE].length
         && level[MODULE][0][1] != localDefault[0][1]
        )
            return false;

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
            var fullpath = level[PATH] = localDefault.concat (path);
            if (ctype === 'class') {
                delete level[INSTANCE];
                for (var i=types.length-1; i>=0; i--) {
                    var type = types[i];
                    if (type.name === 'function' || type.name === 'Function')
                        types.splice (i, 1);
                }
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
                    lineDoc
                );
            }
        } else {
            // alias?
            if (force && !tools.pathsEqual (scope, level[LOCALPATH])) {
                // submit an alias modifier to the context
                context.submit (localDefault.concat (scope), {
                    modifiers:[ { mod:'alias', path:level[PATH] } ]
                });
                // force the alias target
                if (( level[FORCE] && level[FORCE] > 0 ) || !level[FORCE])
                    level[FORCE] = 1;
                return true;
            }

            scope = level[PATH];
            localDefault = [];
        }

        var replacementObject = context.replacementMap.get (level);
        if (replacementObject && replacementObject[PATH])
            context.addFallback (
                tools.pathStr (level[PATH]),
                tools.pathStr (replacementObject[PATH])
            );

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
                    var fullpath = localDefault.concat (scope);
                    if (level[LINE]) {
                        var lineDoc = {
                            sourceFile: pathLib.relative (level[REFERER], level[DOC]),
                            sourceLine: level[LINE]
                        };
                        if (level[MODULE] && !tools.pathsEqual (level[MODULE], context.argv.root))
                            lineDoc.sourceModule = level[MODULE];
                        context.submit (localDefault.concat (scope), lineDoc);
                    }
                }
            }
        }

        if (level[SUPER] && level[FORCE] !== undefined)
            for (var i=level[SUPER].length-1; i>=0; i--) {
                var superObj = level[SUPER][i];
                var altSuper = context.replacementMap.get (superObj);
                var superPath = altSuper ?
                    altSuper[PATH] ?
                        altSuper[PATH]
                      : superObj[PATH]
                  : superObj[PATH]
                  ;
                if (!superPath)
                    continue;
                context.submit (level[PATH], { modifiers:[ { mod:'super', path:superPath } ] });
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
                if (level[SCOPE][key][PARENT] === level[SCOPE])
                    didSubmit += submitSourceLevel (
                        level[SCOPE][key],
                        tools.pathPlus (scope, [ '%', key ]),
                        localDefault,
                        chain
                    );

        delete level[SCOPE];
        return didSubmit;
    }


    // generate Components for items defined in each source file
    langPack.generateComponents (context, submitSourceLevel);
}


module.exports = {
    generateComponents: generateComponents
};
