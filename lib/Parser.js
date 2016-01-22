
/**     @module doczar:Parser
    Digs document comments out of source files, splits them into Declarations and Modifiers, then
    reports everything it finds to a [ComponentCache](doczar:ComponentCache) instance.
*/

/**     @submodule/Array<Array> Path
    Paths are represented as Arrays of Arrays, each child Array representing the individual portions
    of a fragement path. That is, the delimiter, the String fragment name, and in the case that the
    fragment is an es6 symbol a third child contains another `Path` representing the parsed form of
    the fragment name. Examplia gratia:

    ```javascript
    [ [ ".", "name" ], ...]
    ```

    Or with a symbol:
    ```javascript
    [ [ ".", "Symbols.iterator", [ [ ".", "Symbols" ], [ ".", "iterator" ] ] ]
    ```
*/

/**     @submodule/class Valtype
    Represents a value type.
@member/String name
    The simple String representation of the type name.
@member/:Path path
    A [Path](:Path) representing the type.
@member/Boolean isPointer
    Whether the type was followed by an asterisk to identify it as a pointer.
@member/Boolean isArray
    Whether the type was followed by an empty set of square brackets to indicate that it is a bare
    array of its own type.
@member/Array<:Generic> generics
    Any included generic types, e.g. `Array<String>`.
*/

/**     @submodule/class Generic
    Represents a type slotted into a generic/template type.
@member/String name
    The simple String representation of the type name.
@member/:Path path
    A [Path](:Path) representing the type.
*/

/**     @submodule/class Modifier
    Represents a modifier declaration.
@member/String mod
    The name of the modifier, without the `@`.
@member/:Path|undefined path
    If the modifier declaration included a path, it is provided here.
*/

/**     @submodule/class DocumentFragment
    Represents a single block of markdown text and wraps it with its context to ensure proper
    crosslinking.

    The same markdown doc is often rendered twice, once in a parent context and again on the
    Component's own page. To make generated docs compatible with local file view, either all links
    must be local paths or the entire page must be initialized to root with a `<base>`. Because
    `doczar` chooses to use local links, the `href` for a given path changes between rendering
    contexts. This necessitates multiple rendering passes and therefor the link context must be
    passed forward.
@member/String value
    The markdown text.
@member/:Path context
    The scope path which should be appended to crosslink target paths begining with a delimiter
    character.
*/

/**     @submodule/class Submission
    An intermediate structure for data hot off the `Parser` and ready to integrate into a
    [Component](doczar:Component). Encapsulates information included in a single declaration or
    inner declaration.
@member/String ctype
    The Component type of the declaration.
@member/:DocumentFragment doc
    Markdown documentation String or Array of Strings.
@member/Array<:Valtype> valtype
    Value types loaded from the declaration.
@member/Array<:Modifier> modifiers
    All the modifiers in the declaration.
*/

// var fs = require ('graceful-fs');
var fs = require ('fs-extra');
var path = require ('path');
var Patterns = require ('./Patterns');

// handy helpers
var concatPaths = function(){
    var out = [];
    for (var i=0,j=arguments.length; i<j; i++)
        if (arguments[i])
            out.push.apply (out, Array.prototype.filter.call (arguments[i], function (item) {
                return Boolean (item && item.length && item[0].length);
            }));
    return out;
};
var cloneArr = function (a) {
    var b = [];
    b.push.apply (b, a);
    return b;
}

/**     @local/Function parsePath
    Convert a path String to a path Array. If no path is generated, `[ [ ] ]` is returned. This is
    because **all** paths have a length but the final element may be filled contextually rather than
    explicitly.
@argument/String pathstr
@returns/:Path
    Returns Arrays of path fragment Arrays. These are of the form `[ [ ".", "name" ], ...]` or when
    Symbols are used, `[ [ ".", "Symbols.iterator", [ [ ".", "Symbols" ], [ ".", "iterator" ] ] ]`.
*/
function parsePath (pathstr, fileScope) {
    if (!pathstr)
        return [ [ ] ];
    var pathMatch;
    var path = [];
    var offset = 0;
    while (
        offset < pathstr.length
     && (pathMatch = Patterns.word.exec (pathstr.slice (offset)))
    ) {
        if (!pathMatch[0]) {
            if (!pathMatch.length)
                path.push ([]);
            break;
        }
        offset += pathMatch[0].length;

        var fragName = pathMatch[2];
        if (fragName[0] == '`') {
            path.push ([
                pathMatch[1],
                fragName
                 .slice (1, -1)
                 .replace (/([^\\](?:\\\\)*)\\`/g, function (substr, group) {
                    return group.replace ('\\\\', '\\') + '`';
                 })
            ]);
            continue;
        }
        if (fragName[0] != '[') {
            path.push ([ pathMatch[1], fragName ]);
            continue;
        }

        // Symbol
        path.push ((function parseSymbol (symbolName) {
            var symbolPath = [];
            var symbolMatch;
            var symbolRegex = new RegExp (Patterns.word);
            var symbolOffset = 0;
            while (
                symbolOffset < symbolName.length
             && (symbolMatch = symbolRegex.exec (symbolName.slice (symbolOffset)))
            ) {
                if (!symbolMatch[0])
                    break;
                symbolOffset += symbolMatch[0].length;
                var symbolFrag = symbolMatch[2];

                if (symbolFrag[0] == '[') {
                    // recurse!
                    var innerLevel = parseSymbol (symbolFrag.slice (1, -1));
                    if (innerLevel[0] === undefined)
                        innerLevel[0] = '.';
                    symbolPath.push (innerLevel);
                    continue;
                }
                if (symbolFrag[0] == '`')
                    symbolFrag = symbolFrag
                     .slice (1, -1)
                     .replace (/([^\\](?:\\\\)*)`/g, function (substr, group) {
                        return group.replace ('\\\\', '\\') + '`';
                     })
                     ;
                symbolPath.push ([ symbolMatch[1], symbolFrag ]);
            }

            if (!symbolPath.length)
                symbolPath.push ([ '.', undefined ]);
            else if (symbolPath[0][0] === undefined)
                symbolPath[0][0] = '.';
            else
                symbolPath = concatPaths (fileScope, symbolPath);

            var fullPathName = symbolPath
                .map (function (item) { return item[0] + item[1]; })
                .join ('')
                ;

            return [ pathMatch[1], '['+fullPathName.slice (1)+']', symbolPath ];
        }) (fragName.slice (1, -1)));
    }
    if (!path.length)
        path.push ([]);
    return path;
}

/**     @local/Function parseType
    Parse a standard type String. This may include any number of pipe-delimited iterations of paths
    with optional generic types.
@returns Array<Valtype>
    Each type in the pipe-delimited sequence (by default, length 1) represented as a [Valtype]
    (:Valtype).
*/
function parseType (typeStr, fileScope) {
    var valType = [];
    if (!typeStr)
        return valType;
    var valtypeSelectorInfo = typeStr.split(Patterns.typeSelectorWord);
    for (var i=0,j=valtypeSelectorInfo.length-1; i<j; i+=4) {
        var generics = !valtypeSelectorInfo[i+3] ? [] : valtypeSelectorInfo[i+3]
            .split(',')
            .map(function(z){
                var genericStr = z.replace (/\s/g, '');
                var genericTypeMatch;
                var outPath;
                if (genericStr == '.')
                    outPath = fileScope && fileScope.length ? cloneArr (fileScope) : [];
                else {
                    var outPath = parsePath (genericStr, fileScope);
                    // if (outPath[0][0] === undefined)
                    //     outPath[0][0] = '.';
                    // else
                    if (outPath[0][0])
                        outPath = concatPaths (fileScope, outPath);
                }
                var uglysigvalgenerictypepath = '';
                for (var i in outPath)
                    uglysigvalgenerictypepath +=
                        (outPath[i][0] || '.')
                      + outPath[i][1]
                      ;
                return { name:uglysigvalgenerictypepath.slice(1), path:outPath };
            })
            ;

        var vtstr = valtypeSelectorInfo[i+1];
        var valtypeMatch, valtypefrags;
        if (vtstr == '.')
            valtypefrags = fileScope && fileScope.length ? cloneArr (fileScope) : [];
        else {
            valtypefrags = parsePath (vtstr, fileScope);
            // if (valtypefrags[0][0] === undefined)
            //     valtypefrags[0][0] = '.';
            // else
            if (valtypefrags[0][0])
                valtypefrags = concatPaths (fileScope, valtypefrags);
        }

        uglyvaltypepath = '';
        for (var k=0, l=valtypefrags.length; k<l; k++)
            uglyvaltypepath +=
                (valtypefrags[k][0] || '.')
              + valtypefrags[k][1]
              ;
        valType.push ({
            path:       valtypefrags,
            isPointer:  Boolean (valtypeSelectorInfo[i+2]),
            isArray:    Boolean (
                valtypeSelectorInfo[i+3] !== undefined
             && valtypeSelectorInfo[i+3].match (/^[ \\t]*$/)
            ),
            generics:   generics,
            name:       uglyvaltypepath.slice(1)
        });
    }

    return valType;
}


/**     @property/Function parseFile
    @api
    Submit every Modifier and Declaration in a single source file to a [ComponentCache]
    (doczar:ComponentCache) instance.
@argument/String fname
    An OS-localized absolute filename to read.
@argument/doczar:ComponentCache context
    Parsed information will be [reported](doczar:ComponentCache#submit) to this [ComponentCache]
    (doczar:ComponentCache) instance.
@argument/bunyan:Logger logger
@callback processFile
    Called any number of times to request that additional files be processed.
    @argument/String fname
        The OS-localized absolute filename of another file that should be processed.
    @returns
@callback
    @argument/Error|undefined err
        Any fatal filesystem Error that prevents the parser from completing.
*/
var loadedDocuments = {};
var parseFile = function (fname, context, logger, processFile, callback) {
    fs.readFile (fname, function (err, buf) {
        if (err) {
            logger.warn ({ filename:fname }, 'failed to load file');
            return callback();
        }
        var fstr = buf.toString ('utf8');
        logger.debug ({ filename:fname }, 'read file');

        var fileScope = [];
        var match, sigMatch;
        var waitingMatch = Patterns.tag.exec (fstr);
        var waitingSigMatch = Patterns.signatureTag.exec (fstr);
        var doneAllTags, doneAllSigs;
        function fillMatches(){
            // get the next match, whether the next normal declaration or signature declaration
            if (match && waitingMatch) {
                match = undefined;
                waitingMatch = Patterns.tag.exec (fstr);
            }
            if (sigMatch && waitingSigMatch) {
                sigMatch = undefined;
                waitingSigMatch = Patterns.signatureTag.exec (fstr);
            }

            if (waitingMatch && waitingSigMatch)
                if (waitingMatch.index < waitingSigMatch.index)
                    match = waitingMatch;
                else
                    sigMatch = waitingSigMatch;
            else if (waitingMatch)
                match = waitingMatch;
            else if (waitingSigMatch)
                sigMatch = waitingSigMatch;


            if (!match && !sigMatch)
                return false;
            return true;
        }
        var lastComponent;
        while (fillMatches()) {
            if (sigMatch) {
                // signature declaration!
                // not currently implemented for outer declarations

                continue;
            }

            // normal declaration
            var ctype = match[1];
            // valtypes
            var valtype;
            if (match[2])
                valtype = parseType (match[2], fileScope);
            else
                valtype = [];
            var pathstr = match[3];
            var docstr = match[4] || '';
            var pathfrags = parsePath (pathstr, fileScope);

            // convert @constuctor to @spare
            if (ctype == 'constructor') {
                ctype = 'spare';
                pathfrags.push ([ '~', 'constructor' ]);
            }

            if (!pathfrags[0][0])
                if (pathfrags.length == 1)
                    pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                else
                    pathfrags[0][0] = '.';

            var tagScope = concatPaths (fileScope, pathfrags);
            if (ctype == 'module')
                fileScope = cloneArr (tagScope);
            if (ctype == 'submodule')
                ctype = 'module';

            // consume modifiers
            var modifiers = [];
            var modmatch;
            while (modmatch = docstr.match (Patterns.modifier)) {
                var modDoc = { mod:modmatch[1] };
                var modpath = modmatch[2];

                if (modpath) {
                    var pathfrags = parsePath (modpath, fileScope);

                    if (modDoc.mod == 'requires') {
                        var newFilename = pathfrags[0][1];
                        var localDir = path.dirname (fname);
                        processFile (path.resolve (localDir, newFilename));
                        docstr = docstr.slice (modmatch[0].length);
                        continue;
                    }

                    if (!pathfrags[0][0])
                        pathfrags[0][0] = '.';
                    else
                        pathfrags = concatPaths (fileScope, pathfrags);
                    modDoc.path = pathfrags;
                }

                if (modDoc.mod == 'root')
                    fileScope = cloneArr (modpath ? pathfrags : tagScope);
                else
                    modifiers.push (modDoc);
                docstr = docstr.slice (modmatch[0].length);
            }

            // begin searching for inner tags
            var innerMatch = docstr ? docstr.match (Patterns.innerTag) : undefined;
            if (!innerMatch) {
                // the entire comment is one component
                try {
                    lastComponent = context.submit (
                        tagScope,
                        {
                            ctype:      ctype,
                            valtype:    valtype,
                            doc:        { value:docstr, context:cloneArr(fileScope) },
                            modifiers:  modifiers
                        }
                    );
                    logger.trace ({
                        type:   ctype,
                        file:   fname,
                        path:   tagScope.map (function(a){ return a[0]+a[1]; }).join('')
                    }, 'read declaration');
                    continue;
                } catch (err) {
                    logger.error (err, 'parsing error');
                    return callback (err);
                }
            }

            var argscope = cloneArr (tagScope);
            var inpathstr = innerMatch[3];
            var inpathfrags = [];
            var insigargs;
            var pathMatch;
            var linkScope = cloneArr (fileScope);
            var lastComponent;
            do {
                if (
                    ctype == 'callback'
                 || ctype == 'argument'
                 || ctype == 'kwarg'
                 || ctype == 'args'
                 || ctype == 'kwargs'
                 || ctype == 'returns'
                 || ctype == 'signature'
                )
                    submissionPath = concatPaths (argscope, inpathfrags);
                else if (ctype != 'load')
                    submissionPath = concatPaths (tagScope, inpathfrags);

                // any chance this is just a @load declaration?
                if (ctype == 'load') {
                    var lookupPath =
                        inpathfrags[0][1]
                     || docstr.slice (0, innerMatch.index).replace (/^\s*/, '').replace (/\s*$/, '')
                     ;
                    var filename = path.resolve (path.dirname (fname), lookupPath);
                    var loadedDoc;
                    if (Object.hasOwnProperty.call (loadedDocuments, filename))
                        loadedDoc = loadedDocuments[filename];
                    else try {
                        loadedDoc = fs.readFileSync (filename).toString();
                    } catch (err) {
                        logger.warn (
                            { filename:filename },
                            '@load Declaration failed'
                        );
                    }
                    if (loadedDoc)
                        context.submit (
                            submissionPath,
                            { doc: { value:loadedDoc } }
                        );
                } else
                    // submit the previous match
                    try {
                        var inlineDocStr = docstr.slice (0, innerMatch.index);
                        if (inlineDocStr.match (/^[\s\n]*$/))
                            inlineDocStr = '';
                        if (
                            valtype.length
                         || inlineDocStr
                         || modifiers.length
                         || insigargs
                         || submissionPath[submissionPath.length-1][1]
                        )
                            lastComponent = context.submit (
                                submissionPath,
                                {
                                    ctype:      ctype,
                                    valtype:    valtype,
                                    doc:        { value:inlineDocStr, context:linkScope },
                                    modifiers:  modifiers,
                                    sigargs:    insigargs
                                }
                            );
                        logger.trace ({
                            type:   ctype,
                            file:   fname,
                            path:   submissionPath.map (function(a){ return a[0]+a[1]; }).join('')
                        }, 'read declaration');
                    } catch (err) {
                        logger.error (err, 'parsing error');
                        return callback (err);
                    }

                if (ctype == 'returns') {
                    if (!inpathstr && argscope.length > tagScope.length)
                        argscope.pop();
                } else if (ctype == 'callback')
                    argscope = cloneArr (lastComponent.path);
                else if (
                    ctype != 'argument'
                 && ctype != 'kwarg'
                 && ctype != 'args'
                 && ctype != 'kwargs'
                 && ctype != 'returns'
                 && ctype != 'signature'
                )
                    argscope = concatPaths (cloneArr (tagScope), inpathfrags);

                // prepare the next submission
                linkScope = cloneArr (fileScope);
                modifiers = [];
                ctype = innerMatch[1];
                valtype = innerMatch[2];
                inpathstr = innerMatch[3];
                docstr = innerMatch[4];

                if (ctype == 'signature') {
                    insigargs = [];
                    var sigargSplit = inpathstr.slice(1).slice(0, -1).split (Patterns.signatureArgument);
                    inpathstr = '';
                    for (var i=1,j=sigargSplit.length; i<j; i+=3) {
                        var sigvaltype = parseType (sigargSplit[i], fileScope);
                        var sigvalname = parsePath (sigargSplit[i+1], fileScope);
                        if (sigvalname && !sigvalname[0][0])
                            sigvalname[0][0] = '(';
                        var sigargargpath = concatPaths (cloneArr (tagScope), sigvalname);
                        var sigvalnameStr;
                        if (sigvalname && sigvalname.length)
                            sigvalnameStr = sigvalname.slice(-1)[0][1];
                        insigargs.push ({
                            name:       sigvalnameStr,
                            valtype:    sigvaltype,
                            path:       sigargargpath
                        });
                    }
                    inpathfrags = [ [ ] ];
                } else
                    inpathfrags = parsePath (inpathstr, fileScope);

                // direct-to-type syntax
                if (!Patterns.innerCtypes.hasOwnProperty (ctype)) {
                    valtype = ctype;
                    if (inpathfrags[inpathfrags.length-1][0] == '#')
                        ctype = 'member';
                    else
                        ctype = 'property';
                }

                // convert @constuctor to @spare
                if (ctype == 'constructor') {
                    ctype = 'spare';
                    inpathfrags[inpathfrags.length-1][0] = '~';
                    inpathfrags[inpathfrags.length-1][1] = 'constructor';
                }

                if (inpathfrags[0] && !inpathfrags[0][0])
                    if (inpathfrags.length == 1)
                        inpathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                    else
                        inpathfrags[0][0] = '.';

                valtype = parseType (valtype, fileScope);

                // consume modifiers
                var modmatch;
                while (modmatch = docstr.match (Patterns.modifier)) {
                    var modDoc = { mod:modmatch[1] };
                    var modpath = modmatch[2];

                    if (modpath) {
                        var pathfrags = parsePath (modpath, fileScope);

                        if (modDoc.mod == 'requires') {
                            var newFilename = pathfrags[0][1];
                            var localDir = path.dirname (fname);
                            processFile (path.resolve (localDir, newFilename));
                            docstr = docstr.slice (modmatch[0].length);
                            continue;
                        }

                        if (!pathfrags[0][0])
                            pathfrags[0][0] = '.';
                        else
                            pathfrags = concatPaths (fileScope, pathfrags);
                        modDoc.path = pathfrags;
                    }

                    if (modDoc.mod == 'root')
                        fileScope = cloneArr (modpath ? pathfrags : tagScope);
                    else
                        modifiers.push (modDoc);

                    docstr = docstr.slice (modmatch[0].length);
                }

                // some tags affect the scope
                if (ctype == 'module') {
                    fileScope.push.apply (fileScope, inpathfrags);
                    tagScope.push.apply (tagScope, inpathfrags);
                }
                if (ctype == 'submodule')
                    ctype = 'module';

            } while (docstr && (innerMatch = docstr.match (Patterns.innerTag)));

            // submit the final match from this tag
            var submissionPath;
            if (
                ctype == 'callback'
             || ctype == 'argument'
             || ctype == 'kwarg'
             || ctype == 'args'
             || ctype == 'kwargs'
             || ctype == 'returns'
             || ctype == 'signature'
            )
                submissionPath = concatPaths (argscope, inpathfrags);
            else if (ctype != 'load')
                submissionPath = concatPaths (cloneArr (tagScope), inpathfrags);

            // consume modifiers
            var modmatch;
            while (modmatch = docstr.match (Patterns.modifier)) {
                var modDoc = { mod:modmatch[1] };
                var modpath = modmatch[2];

                if (modpath) {
                    var pathfrags = parsePath (modpath, fileScope);

                    if (modDoc.mod == 'requires') {
                        var newFilename = pathfrags[0][1];
                        var localDir = path.dirname (fname);
                        processFile (path.resolve (localDir, newFilename));
                        docstr = docstr.slice (modmatch[0].length);
                        continue;
                    }

                    if (!pathfrags[0][0])
                        pathfrags[0][0] = '.';
                    else
                        pathfrags = concatPaths (fileScope, pathfrags);
                    modDoc.path = pathfrags;
                }
                modifiers.push (modDoc);
                docstr = docstr.slice (modmatch[0].length);
            }

            // any chance this is just a @load declaration?
            if (ctype == 'load') {
                var lookupPath =
                    inpathfrags[0][1]
                 || docstr.replace (/^\s*/, '').replace (/\s*$/, '')
                 ;
                var filename = path.resolve (path.dirname (fname), lookupPath);
                var loadedDoc;
                if (Object.hasOwnProperty.call (loadedDocuments, filename))
                    loadedDoc = loadedDocuments[filename];
                else try {
                    loadedDoc = fs.readFileSync (filename).toString();
                } catch (err) {
                    logger.warn (
                        { filename:filename },
                        '@load Declaration failed'
                    );
                }
                if (loadedDoc)
                    lastComponent = context.submit (
                        submissionPath,
                        { doc: { value:loadedDoc } }
                    );
            } else {
                try {
                    lastComponent = context.submit (
                        submissionPath,
                        {
                            ctype:      ctype,
                            valtype:    valtype,
                            doc:        { value:docstr, context:linkScope },
                            modifiers:  modifiers,
                            sigargs:    insigargs
                        }
                    );
                    logger.trace ({
                        type:   ctype,
                        file:   fname,
                        path:   submissionPath.map (function(a){ return a[0]+a[1]; }).join('')
                    }, 'read declaration');
                } catch (err) {
                    logger.error (err, 'parsing error');
                    return callback (err);
                }
            }
        }
        logger.debug ({ filename:fname }, 'finished parsing file');
        return callback();
    });
};

module.exports.parseFile = parseFile;

/**     @property/Function parsePath
    @alias %parsePath
*/
module.exports.parsePath = parsePath;
