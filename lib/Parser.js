
/**     @module doczar.Parser
    Digs document comments out of source files, splits them into Declarations and Modifiers, then
    reports everything it finds to a [ComponentCache](doczar.ComponentCache) instance.
*/

var fs = require ('graceful-fs');
var path = require ('path');
var Patterns = require ('./Patterns');

// handy helpers
var concatPaths = function(){
    var out = [];
    for (var i=0,j=arguments.length; i<j; i++)
        if (arguments[i])
            out.push.apply (out, Array.prototype.filter.call (arguments[i], function (item) {
                return Boolean (item.length && item[0].length);
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
@returns/Array[Array]
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
            path.push ([ pathMatch[1], fragName.slice (1, -1) ]);
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
                    symbolFrag = symbolFrag.slice (1, -1);
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
                    if (outPath[0][0] === undefined)
                        outPath[0][0] = '.';
                    else
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
            if (valtypefrags[0][0] === undefined)
                valtypefrags[0][0] = '.';
            else
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
    (doczar.ComponentCache) instance.
@argument/String fname
    An OS-localized absolute filename to read.
@argument/doczar.ComponentCache context
    Parsed information will be [reported](doczar.ComponentCache#submit) to this [ComponentCache]
    (doczar.ComponentCache) instance.
@callback callback
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
                    return callback (err);
                }
            }

            var argscope = cloneArr (tagScope);
            var inpathstr = innerMatch[3];
            var inpathfrags = [];
            var insigargs;
            var pathMatch;
            var linkScope = cloneArr (fileScope);
            do {
                if (
                    ctype == 'callback'
                 || ctype == 'argument'
                 || ctype == 'kwarg'
                 || ctype == 'args'
                 || ctype == 'kwargs'
                 || ctype == 'returns'
                 || ctype == 'signature'
                ) {
                    submissionPath = concatPaths (argscope, inpathfrags);
                } else if (ctype != 'load')
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
                        lastComponent = context.submit (
                            submissionPath,
                            { doc: { value:loadedDoc } }
                        );
                } else {
                    // submit the previous match
                    try {
                        lastComponent = context.submit (
                            submissionPath,
                            {
                                ctype:      ctype,
                                valtype:    valtype,
                                doc:        { value:docstr.slice (0, innerMatch.index), context:linkScope },
                                modifiers:  modifiers,
                                sigargs:    insigargs
                            }
                        );
                        logger.trace ('read declaration', {
                            type:   ctype,
                            file:   fname,
                            path:   submissionPath.map (function(a){ return a[0]+a[1]; }).join('')
                        });
                    } catch (err) {
                        return callback (err);
                    }
                }
                if (ctype == 'returns') {
                    if (!inpathstr)
                        argscope.pop();
                } else if (
                    ctype != 'argument'
                 && ctype != 'kwarg'
                 && ctype == 'args'
                 && ctype == 'kwargs'
                 && ctype != 'returns'
                 && ctype != 'signature'
                ) {
                    // argscope = cloneArr (lastComponent ? lastComponent.path : []);
                    argscope = cloneArr (tagScope);
                }

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
                        var sigvaltype = sigargSplit[i];
                        var sigvalname = sigargSplit[i+1];
                        var sigargargpath = cloneArr (submissionPath);
                        sigargargpath.pop();
                        sigargargpath.push ([ '(', sigvalname ]);

                        if (!sigvaltype) {
                            insigargs.push ({ name:sigvalname, path:sigargargpath });
                            continue;
                        }


                        // sigvaltype must now be treated as a complex valtype
                        var sigvaltypeSelectorInfo = sigvaltype.split(Patterns.typeSelectorWord);
                        sigvaltype = [];
                        for (var k=0,l=sigvaltypeSelectorInfo.length-1; k<l; k+=4) {
                            var generics = !sigvaltypeSelectorInfo[k+3] ? [] : sigvaltypeSelectorInfo[k+3]
                                .split(',')
                                .map(function(z){
                                    var sigvalStr = z.replace (/\s/g, '');
                                    var outPath = [];
                                    var valtypeMatch;
                                    while (valtypeMatch = Patterns.word.exec (sigvalStr))
                                        outPath.push ([ valtypeMatch[1], valtypeMatch[2] ]);
                                    var uglysigvalgenerictypepath = '';
                                    for (var i in outPath)
                                        uglysigvalgenerictypepath +=
                                            (outPath[i][0] || '.')
                                          + outPath[i][1]
                                          ;
                                    return {
                                        name:       uglysigvalgenerictypepath.slice(1),
                                        path:       outPath
                                    };
                                })
                                ;

                            var vtstr = sigvaltypeSelectorInfo[k+1];
                            var valtypefrags = [];
                            var valtypeMatch;
                            while (valtypeMatch = Patterns.word.exec (vtstr))
                                valtypefrags.push ([ valtypeMatch[1], valtypeMatch[2] ]);
                            if (valtypefrags[0][0] === undefined)
                                valtypefrags[0][0] = '.';
                            else
                                valtypefrags = concatPaths (fileScope, valtypefrags);
                            uglysigvaltypepath = '';
                            for (var k in valtypefrags)
                                uglysigvaltypepath +=
                                    (valtypefrags[k][0] || '.')
                                  + valtypefrags[k][1]
                                  ;
                            sigvaltype.push ({
                                path:       valtypefrags,
                                isPointer:  Boolean (sigvaltypeSelectorInfo[i+2]),
                                isArray:    Boolean (
                                    sigvaltypeSelectorInfo[i+3] !== undefined
                                 && sigvaltypeSelectorInfo[i+3].match (/^[ \\t]*$/)
                                ),
                                generics:   generics,
                                name:       uglysigvaltypepath.slice(1)
                            });
                        }

                        insigargs.push ({
                            name:       sigvalname,
                            valtype:    sigvaltype,
                            path:       sigargargpath
                        });
                    }
                }

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
                submissionPath = concatPaths (tagScope, inpathfrags);

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
                            modifiers:  modifiers
                        }
                    );
                    logger.trace ({
                        type:   ctype,
                        file:   fname,
                        path:   submissionPath.map (function(a){ return a[0]+a[1]; }).join('')
                    }, 'read declaration');
                } catch (err) {
                    return callback (err);
                }
            }
        }
        return callback();
    });
};

module.exports.parseFile = parseFile;
