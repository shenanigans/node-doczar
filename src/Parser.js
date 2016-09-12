
/*      @module doczar:Parser
    Digs document comments out of source files, splits them into Declarations and Modifiers, then
    reports everything it finds to a [ComponentCache](doczar:ComponentCache) instance.
*/

/*      @submodule/Array<Array> Path
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

/*      @submodule/class Valtype
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

/*      @submodule/class Generic
    Represents a type slotted into a generic/template type.
@member/String name
    The simple String representation of the type name.
@member/:Path path
    A [Path](:Path) representing the type.
*/

/*      @submodule/class Modifier
    Represents a modifier declaration.
@member/String mod
    The name of the modifier, without the `@`.
@member/:Path|undefined path
    If the modifier declaration included a path, it is provided here.
*/

/*      @submodule/class DocumentFragment
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

/*      @submodule/class Submission
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

var fs = require ('fs-extra');
var path = require ('path');
var resolve = require ('resolve');
var esprima = require ('esprima');
var filth = require ('filth');
var Patterns = require ('./Patterns');
var getNodeModulePath = require ('./getNodeModulePath');

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

/*      @property/Function parsePath
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
            var delimit = pathMatch[1];
            if (delimit == ':')
                delimit = '/';
            path.push ([ delimit, fragName ]);
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
                var delimit = symbolMatch[1];
                if (delimit == ':')
                    delimit = '/';
                symbolPath.push ([ delimit, symbolFrag ]);
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

            var delimit = pathMatch[1];
            if (delimit == ':')
                delimit = '/';
            return [ delimit, '['+fullPathName.slice (1)+']', symbolPath ];
        }) (fragName.slice (1, -1)));
    }
    if (!path.length)
        path.push ([]);
    return path;
}

/*      @local/Function parseType
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


/*      @property/Function parseFile
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
var parseFile = function (fname, fstr, defaultScope, context, logger, processFile) {
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

        if (!pathfrags[0][0])
            if (pathfrags.length == 1)
                pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
            else
                pathfrags[0][0] = '.';

        parseTag (
            context,
            logger,
            processFile,
            fname,
            defaultScope,
            fileScope,
            pathfrags,
            ctype,
            valtype,
            docstr
        );
    }
    logger.debug ({ filename:fname }, 'finished parsing file');
};


// =================================== parseTag
function parseTag (
    context,
    logger,
    processFile,
    fname,
    defaultScope,
    fileScope,
    pathfrags,
    ctype,
    valtype,
    docstr
) {
    var tagScope;
    if (fileScope.length)
        tagScope = concatPaths (fileScope, pathfrags);
    else if (defaultScope.length && (ctype != 'module' || !pathfrags.length))
        tagScope = concatPaths (defaultScope, pathfrags);
    else
        tagScope = concatPaths (pathfrags);

    if (ctype == 'module')
        fileScope.push.apply (fileScope, pathfrags);
    else if (ctype == 'submodule')
        ctype = 'module';
    // convert @constuctor to @spare
    else if (ctype == 'constructor') {
        ctype = 'spare';
        pathfrags.push ([ '~', 'constructor' ]);
    }

    // consume modifiers
    var modifiers = [];
    var modmatch;
    while (modmatch = docstr.match (Patterns.modifier)) {
        var modDoc = { mod:modmatch[1] };
        var modPath = modmatch[2];

        if (modmatch[1] == 'default') {
            if (modmatch[2] && modmatch[2][0] == '`')
                modDoc.value = modmatch[2].slice (1, -1);
            else
                modDoc.value = modmatch[2];
        } else if (modPath) {
            var pathfrags = parsePath (modPath, fileScope);

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
            fileScope = cloneArr (modPath ? pathfrags : tagScope);
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
            return;
        } catch (err) {
            logger.error (err, 'parsing error');
            return;
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
                context.latency.log ('parsing');
                loadedDoc = fs.readFileSync (filename).toString();
                context.latency.log ('file system');
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
                    ctype != 'returns'
                 || valtype.length
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
                return;
            }

        // prepare the next submission
        if (ctype == 'returns') {
            if (!inpathstr && argscope.length > tagScope.length)
                argscope.pop();
        } else if (ctype == 'callback')
            argscope = concatPaths (argscope, inpathfrags);
        else if (
            ctype != 'argument'
         && ctype != 'kwarg'
         && ctype != 'args'
         && ctype != 'kwargs'
         && ctype != 'returns'
         && ctype != 'signature'
        )
            argscope = concatPaths (cloneArr (tagScope), inpathfrags);

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

        if (inpathfrags[0] && !inpathfrags[0][0])
            if (inpathfrags.length == 1)
                inpathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
            else
                inpathfrags[0][0] = '.';

        // direct-to-type syntax
        if (!Patterns.innerCtypes.hasOwnProperty (ctype)) {
            valtype = ctype;
            ctype = Patterns.delimiters[inpathfrags[inpathfrags.length-1][0]];
        }

        // convert @constuctor to @spare
        if (ctype == 'constructor') {
            ctype = 'spare';
            inpathfrags[inpathfrags.length-1][0] = '~';
            inpathfrags[inpathfrags.length-1][1] = 'constructor';
        }

        valtype = parseType (valtype, fileScope);

        // consume modifiers
        var modmatch;
        while (modmatch = docstr.match (Patterns.modifier)) {
            var modDoc = { mod:modmatch[1] };
            var modPath = modmatch[2];

            if (modmatch[1] == 'default') {
                if (modmatch[2] && modmatch[2][0] == '`')
                    modDoc.value = modmatch[2].slice (1, -1);
                else
                    modDoc.value = modmatch[2];
            } else if (modPath) {
                var pathfrags = parsePath (modPath, fileScope);

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
                fileScope = cloneArr (modPath ? pathfrags : tagScope);
            else
                modifiers.push (modDoc);

            docstr = docstr.slice (modmatch[0].length);
        }

        // some tags affect the scope
        if (ctype == 'module') {
            fileScope.push.apply (fileScope, inpathfrags);
            // tagScope.push.apply (tagScope, inpathfrags);
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
        var modPath = modmatch[2];

        if (modmatch[1] == 'default') {
            if (modmatch[2] && modmatch[2][0] == '`')
                modDoc.value = modmatch[2].slice (1, -1);
            else
                modDoc.value = modmatch[2];
        } else if (modPath) {
            var pathfrags = parsePath (modPath, fileScope);

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
                context.latency.log ('parsing');
            loadedDoc = fs.readFileSync (filename).toString();
                context.latency.log ('file system');
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
        if (
            ctype != 'returns'
         || valtype.length
         || inlineDocStr
         || modifiers.length
         || insigargs
         || submissionPath[submissionPath.length-1][1]
        )
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
                return;
            }
    }
}

/*      @property/Function parseJavadocFlavorPath

*/
function parseJavadocFlavorPath (pathstr) {
    var frags = pathstr.split (Patterns.jpathSplitter);
}

/*      @property/Function parseJavadocFlavorTag

*/
function startsWith (str, substr) {
    return str.slice (0, substr.length) === substr;
}
// creates a simple flag modifier
var JDOC_MOD_FLAG = {
    abstract:   'abstract',
    virtual:    'abstract'
};
// creates a flag modifier with a type path
var JDOC_MOD_PATH = {
    extends:    'super',
    augments:   'super'
};
// sets mount.ctype
var JDOC_CTYPE = {
    constructor:    'class'
};
// adds the mapped string to mount.extras
var JDOC_EXTRAS = {
    inner:      '.asLocal',
    global:     '.remountGlobal',
    static:     '.remountProperty'
};
// creates a flag modifier and may alter mount.type and mount.path - @tag [type] [path]
var JDOC_MOUNT_FLAG = {
    const:      'constant',
    constant:   'constant'
};
// adds the mapped string to mount.extras and may alter mount.path - @tag [path]
var JDOC_MOUNT_EXTRA = {
    callback:   '.callback',
};
var JDOC_CHILD = {

};
var JDOC_SPECIAL = {
    access:     function (line, mount, scopeParent) {
        // push a modifier with the correct access level
        if (startsWith (line, 'public'))
            mount.modifiers.push ({ mod:'public' });
        else if (startsWith (line, 'protected'))
            mount.modifiers.push ({ mod:'protected' });
        else if (startsWith (line, 'private'))
            mount.modifiers.push ({ mod:'private' });
        else
            throw new Error ('invalid access level');
    },
    borrows:    function (line, mount, scopeParent) {
        // create a child with an @alias modifier
    },
    constructs: function (line, mount, scopeParent) {
        // @constructs [name]
        // apply documentation on this node to the class' node
    }
};
function parseJavadocFlavorTag (docstr, scopeParent, logger) {
    var lines = docstr.split (/\r?\n/g);
    var mount = { types:[], modifiers:[], extras:{} };
    var children = [];
    var currentChild;
    var tagname;
    if (!scopeParent['.docstr'])
        scopeParent['.docstr'] = '';
    for (var i=0,j=lines.length; i<j; i++) {
        var cleanLine = lines[i].match (Patterns.jdocLeadSplitter)[1] || '';
        if (cleanLine[0] !== '@') {
            ( scopeParent || currentChild )['.docstr'] += cleanLine + ' \n';
            continue;
        }

        // starting a new tag
        // wrap up the previous one
        if (currentChild) {
            if (tagname === 'example')
                scopeParent['.docstr'] += '```\n\n';

            delete tagname;
            delete currentChild;
        }
        // consume the tag
        var match = cleanLine.match (/@([a-zA-Z]+)(?:[ \t]+(.*))?/);
        tagname = match[1];
        cleanLine = match[2] || '';

        // work the tag
        if (tagname === 'example') {
            scopeParent['.docstr'] += '\n### Example\n```javascript\n';
            continue;
        }

        // // use this to consume errant doc text
        var dummy = { '.docstr':'' };

        // // simple flag modifiers
        if (Object.hasOwnProperty.call (JDOC_MOUNT_FLAG, tagname)) {
            mount.modifiers.push ({ mod:JDOC_MOUNT_FLAG[tagname] });
            continue;
        }

        // // modifiers that accept a single mandatory path
        if (Object.hasOwnProperty.call (JDOC_MOD_PATH, tagname)) {
            // consume a path
            var pathMatch = cleanLine.match (Patterns.jpathConsumer);
            if (!pathMatch || !pathMatch[1] || !pathMatch[1].length) {
                logger.debug ({ tag:tagname, raw:lines[i] }, 'invalid javadoc tag');
                continue;
            }
            var path = parseJavadocFlavorPath (pathMatch[1]);

        }

        // modify the target's ctype
        if (Object.hasOwnProperty.call (JDOC_CTYPE, tagname)) {

        }

        // add hacky flag properties to the target's `.extras` property
        if (Object.hasOwnProperty.call (JDOC_EXTRAS, tagname)) {

        }

        // creates a flag and optionally alters the target's mount.type and mount.path
        if (Object.hasOwnProperty.call (JDOC_MOUNT_FLAG, tagname)) {

        }

        // creates a hacky flag property in the target's `.extras` property AND
        // optionally alters the target's mount.type and mount.path
        if (Object.hasOwnProperty.call (JDOC_MOUNT_EXTRA, tagname)) {

        }

        // opens a new child tag and begins consuming documentation
        if (Object.hasOwnProperty.call (JDOC_CHILD, tagname)) {

        }

        // special tags
        if (Object.hasOwnProperty.call (JDOC_SPECIAL, tagname)) {
            JDOC_SPECIAL[tagname] (cleanLine, mount, scopeParent);
            continue;
        }

        logger.debug (
            { tag:tagname, line:cleanLine, raw:lines[i] },
            'unrecognized javadoc-flavor tag'
        );
        if (cleanLine.length && cleanLine.match (/[^ \t\n\r]/))
            // consume documentation until a known tag appears or the comment ends
            currentChild = dummy;
    }

    // wrap up the last subtag
    if (tagname === 'example')
        scopeParent['.docstr'] += '```\n\n';
}

function parseJSTypes (fname, fstr, defaultScope, baseNode, context, logger, processFile, sources) {
    var fileScope = [];
    if (!baseNode['.root'])
        baseNode['.root'] = fileScope;
    var tree = esprima.parse (fstr, {
        loc:            true,
        comment:        true,
        attachComment:  true,
        sourceType:     'module'
    });
    var dirname = path.parse (fname).dir;

    function newNode (filepath) {
        return new filth.SafeMap ({
            '.types':   [],
            '.deref':   [],
            '.fname':   filepath || fname,
            '.root':    baseNode['.root']
        });
    }

    function walkLevel (level, scope, thisNode, deadLine, scopeParent, globalScope, fnChain) {
        // apply an argument signature to a CallExpression
        function processCallExpression (expression, target) {
            // is this a require statement?
            if (
                sources
             && expression.arguments.length
             && expression.callee.type == 'Identifier'
             && expression.callee.name == 'require'
             && !Object.hasOwnProperty.call (scope, 'require')
            ) {
                // yes it is!
                if (target) target['.silent'] = true;
                try {
                    var modPathStr = resolve.sync (
                        expression.arguments[0].value,
                        { basedir:path.parse (fname).dir }
                    );
                } catch (err) {
                    logger.warn ({
                        from:   path.parse (fname).dir,
                        to:     expression.arguments[0].value
                    }, 'failed to resolve dependency');
                    return;
                }
                if (!modPathStr.match (/\.js$/)) {
                    logger.debug (
                        { required:expression.arguments[0].value, path:modPathStr },
                        'ignored core dependency'
                    );
                    return;
                }
                var exports;
                if (Object.hasOwnProperty.call (sources, modPathStr))
                    exports = sources[modPathStr].module['.props'].exports;
                else {
                    // resolve a module path for this file path
                    exports = new filth.SafeMap ({ '.types':[], '.deref':[] });
                    var referer = processFile (modPathStr, fname);
                    sources[modPathStr] = new filth.SafeMap (baseNode, {
                        '.root':    getNodeModulePath (logger, context.argv.root, referer, modPathStr),
                        exports:    exports,
                        module:     new filth.SafeMap ({
                            '.types':   [],
                            '.deref':   [],
                            '.props':   {
                                exports:    exports
                            }
                        })
                    });
                }
                return exports;
            }

            var callNode = getNode (scope, expression.callee);
            if (!callNode)
                return;

            var setFunctionPointer = callNode;
            var setFunctionChain = [];
            do {
                setFunctionChain.push (setFunctionPointer);
                if (setFunctionPointer['.types'].indexOf ('Function') < 0)
                    setFunctionPointer['.types'].push ('Function');
            } while (
                setFunctionPointer['.deref']
             && setFunctionPointer['.deref'].length == 1
             && ( setFunctionPointer = setFunctionPointer['.deref'][0] )
             && setFunctionChain.indexOf (setFunctionPointer) < 0
            )

            var args;
            if (callNode['.arguments'])
                args = callNode['.arguments'];
            else
                args = callNode['.arguments'] = [];
            for (var i=0,j=expression.arguments.length; i<j; i++) {
                var arg;
                if (i < args.length)
                    arg = args[i];
                else {
                    arg = args[i] = newNode();
                    arg['.noSet'] = true;
                }
                divineTypes (arg, expression.arguments[i]);
            }

            if (!callNode['.body']) {
                // defer call test for later
                var callPack = [];
                for (var i=0,j=expression.arguments.length; i<j; i++) {
                    var argNode = getNode (scope, expression.arguments[i]);
                    if (argNode) {
                        var dummy = newNode();
                        dummy['.deref'].push (argNode);
                        dummy['.noSet'] = true;
                        // callPack.push (argNode);
                        callPack.push (dummy);
                    }
                }
                if (callNode['.waitingCalls'])
                    callNode['.waitingCalls'].push (callPack);
                else
                    callNode['.waitingCalls'] = [ callPack ];
            } else if (fnChain.indexOf (callNode) < 0) {
                var localChain = fnChain.concat();
                localChain.push (callNode);
                // run call test
                var innerScope = new filth.SafeMap (scope, callNode['.scope']);
                // for (var key in callNode['.scope'])
                //     innerScope[key] = callNode['.scope'][key];
                for (var i=0,j=Math.min (args.length, expression.arguments.length); i<j; i++) {
                    var argNode = getNode (scope, expression.arguments[i]);
                    if (argNode) {
                        var dummy = newNode();
                        dummy['.deref'].push (argNode);
                        dummy['.noSet'] = true;
                        // innerScope[args[i].name] = argNode;
                        innerScope[args[i].name] = dummy;
                    }
                }

                for (var i=0,j=callNode['.body'].length; i<j; i++) {
                    walkLevel (
                        callNode['.body'][i],
                        innerScope,
                        callNode['.this'],
                        localDeadLine,
                        callNode,
                        globalScope,
                        localChain
                    );
                    localDeadLine = callNode['.body'][i].loc.end.line;
                }
                // reduce innerScope to new keys only
                for (var key in scope)
                    if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                        delete innerScope[key];
            }

            return callNode;
        }

        // divine the type of an assignment
        function divineTypes (node, value, localThisNode) {
            switch (value.type) {
                case 'Identifier':
                    if (Object.hasOwnProperty.call (scope, value.name))
                        node['.deref'].push (scope[value.name]);
                    return [];
                case 'MemberExpression':
                    var memberNode = getNode (scope, value);
                    if (memberNode)
                        node['.deref'].push (memberNode);
                    return [];
                case 'Literal':
                    var tstr = filth.getTypeStr (value.value);
                    if (tstr != 'null')
                        tstr = tstr[0].toUpperCase() + tstr.slice (1);
                    if (node['.types'].indexOf (tstr) < 0)
                        node['.types'].push (tstr);
                    return [ tstr ];
                case 'ArrayExpression':
                    if (node['.types'].indexOf ('Array') < 0)
                        node['.types'].push ('Array');
                    return [ 'Array' ];
                case 'ObjectExpression':
                    if (node['.types'].indexOf ('json') < 0)
                        node['.types'].push ('json');
                    if (!node['.props'])
                        node['.props'] = new filth.SafeMap ({ '.isCol':true });
                    var props = node['.props'];
                    var lastPropDef;
                    for (var i=0,j=value.properties.length; i<j; i++) {
                        var propDef = value.properties[i];
                        // did we hoover up a trailing comment?
                        if (
                            lastPropDef
                         && propDef.leadingComments
                         && propDef.leadingComments[0].loc.start.line == lastPropDef.loc.end.line
                        ) {
                            var lastPropNode = props[lastPropDef.key.name];
                            processComments (propNode, {
                                loc:                lastPropDef.loc,
                                trailingComments:   [ propDef.leadingComments[0] ]
                            }, 0);
                        }
                        var propNode;
                        if (Object.hasOwnProperty.call (props, propDef.key.name))
                            propNode = props[propDef.key.name];
                        else
                            propNode = props[propDef.key.name] = newNode();
                        propNode['.propName'] = propDef.key.name;
                        divineTypes (propNode, propDef.value);
                        processComments (
                            propNode,
                            propDef,
                            lastPropDef ? lastPropDef.loc.end.line : deadLine
                        );
                        lastPropDef = propDef;
                    }
                    return [ 'Object' ];
                case 'BinaryExpression':
                    var tstr;
                    if (value.operator == '+') {
                        // either Number or String
                        // recurse into both arguments;
                    } else { // all binary ops other than + imply a Number return
                        tsrt = 'Number';
                        if (node['.types'].indexOf ('Number') < 0)
                            node['.types'].push ('Number');
                        return [ 'Number' ];
                    }
                    break;
                case 'AssignmentExpression':
                    var tsrt;
                    if (value.operator == '=') {
                        // single-equals side-effect syntax
                        var targetNode = getNode (scope, value.left, true);
                        if (!targetNode)
                            return [];
                        if (targetNode['.noSet'])
                            return [];
                        var gotTypes = divineTypes (targetNode, value.right);
                        for (var i=0,j=gotTypes.length; i<j; i++) {
                            var tstr = gotTypes[i];
                            if (node['.types'].indexOf (tstr) < 0)
                                node['.types'].push (tstr);
                        }
                        return gotTypes;
                    } else if (value.operator == '+=') {
                        // either Number or String or Boolean
                    } else { // must be Number
                        if (node['.types'].indexOf ('Number') < 0)
                            node['.types'].push ('Number');
                        return [ 'Number' ];
                    }
                    break;
                case 'CallExpression':
                    // is this a require statement?
                    if (
                        sources
                     && value.arguments.length
                     && value.callee.type == 'Identifier'
                     && value.callee.name == 'require'
                     && !Object.hasOwnProperty.call (scope, 'require')
                    ) {
                        node['.deref'].push (processCallExpression (value, node));
                        return [];
                    }
                    var callNode = processCallExpression (value, node);
                    if (!callNode)
                        return [];
                    // mark for later dereference of the function's return value
                    if (!callNode['.returns'])
                        callNode['.returns'] = newNode();
                    node['.deref'].push (callNode['.returns']);
                    return [];
                case 'ClassExpression':
                    if (node['.types'].indexOf ('Function') < 0)
                        node['.types'].push ('Function');

                    var innerScope = {};
                    for (var key in scope)
                        innerScope[key] = scope[key];

                    if (value.superClass) {
                        var superNode = getNode (scope, value.superClass);
                        if (superNode) {
                            innerScope['super'] = superNode;
                            if (node['.super'])
                                node['.super'].push (superNode);
                            else
                                node['.super'] = [ superNode ];
                        }
                    }
                    if (!node['.members'])
                        node['.members'] = new filth.SafeMap ({ '.isCol':true });
                    var members = node['.members'];
                    for (var i=0,j=value.body.body.length; i<j; i++) {
                        var declaration = value.body.body[i];
                        walkLevel (
                            declaration,
                            innerScope,
                            node,
                            declaration.loc.end.line,
                            scope,
                            globalScope,
                            fnChain
                        );
                    }

                    // clear unchanged inherited keys from the inner scope
                    for (var key in innerScope)
                        if (innerScope[key] === scope[key])
                            delete innerScope[key];

                    return [ 'Function' ];
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    if (node['.types'].indexOf ('Function') < 0)
                        node['.types'].push ('Function');
                    // manage arguments
                    var args;
                    if (node['.arguments']) {
                        args = node['.arguments'];
                        for (var i=0,j=value.params.length; i<j; i++)
                            if (i < args.length)
                                args[i]['.name'] = value.params[i].name;
                            else
                                args[i] = new filth.SafeMap ({
                                    '.name':    value.params[i].name,
                                    '.types':   [],
                                    '.deref':   [],
                                    '.noSet':   true
                                });
                    } else
                        args = node['.arguments'] = value.params.map (function (param) {
                            return new filth.SafeMap ({
                                '.name':    param.name,
                                '.types':   [],
                                '.deref':   [],
                                '.noSet':   true
                            });
                        });
                    // recurse to walkLevel from divineTypes
                    var innerScope = {};
                    for (var key in scope)
                        innerScope[key] = scope[key];
                    for (var i=0,j=node['.arguments'].length; i<j; i++) {
                        var arg = node['.arguments'][i];
                        innerScope[arg['.name']] = arg;
                    }
                    node['.scope'] = innerScope;
                    var localDeadLine = deadLine;
                    node['.body'] = value.body.body;
                    for (var i=0,j=value.body.body.length; i<j; i++) {
                        walkLevel (
                            value.body.body[i],
                            innerScope,
                            value.type == 'FunctionExpression' ?
                                node
                              : (localThisNode || thisNode || node)
                              ,
                            localDeadLine,
                            node,
                            globalScope,
                            fnChain
                        );
                        localDeadLine = value.body.body[i].loc.end.line;
                    }
                    // run any waiting call tests
                    if (node['.waitingCalls']) {
                        if (fnChain.indexOf (node) < 0) {
                            localChain = fnChain.concat();
                            localChain.push (node);
                            for (var i=0,j=node['.waitingCalls'].length; i<j; i++) {
                                var callPack = node['.waitingCalls'][i];
                                var waitingInnerScope = new filth.SafeMap (scope);
                                for (var i=0,j=Math.min (args.length, callPack.length); i<j; i++)
                                    waitingInnerScope[args[i]['.name']] = callPack[i];
                                var localDeadLine = deadLine;
                                for (var i=0,j=node['.body'].length; i<j; i++) {
                                    walkLevel (
                                        node['.body'][i],
                                        waitingInnerScope,
                                        node || thisNode,
                                        localDeadLine,
                                        node,
                                        globalScope,
                                        localChain
                                    );
                                    localDeadLine = node['.body'][i].loc.end.line;
                                }
                            }
                        }
                        delete node['.waitingCalls'];
                    }
                    // reduce innerScope to new keys only
                    for (var key in scope)
                        if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                            delete innerScope[key];
                    return [ 'Function' ];
                case 'NewExpression':
                    // get the type of the item instantiated
                    var typeNode = getNode (globalScope, value.callee);
                    if (!typeNode)
                        return;
                    while (typeNode['.deref'].length == 1)
                        typeNode = typeNode['.deref'][0];
                    if (value.callee.type === 'Identifier' && value.callee.name === 'Thingy')
                        typeNode['.TARGET'] = true;
                    if (node['.instance'])
                        node['.instance'].push (typeNode);
                    else
                        node['.instance'] = [ typeNode ];
                    return [];
                case 'UnaryExpression':

                case 'UpdateExpression':

                case 'LogicalExpression':

                case 'ConditionalExpression':

            }

            return [];
        }

        // get a descriptor node for the path
        function getNode (initialPointer, level, shallow) {
            var pointer = initialPointer;
            if (level.computed)
                return;
            switch (level.type) {
                case 'MemberExpression':
                    pointer = getNode (pointer, level.object, shallow);
                    if (!pointer)
                        return;
                    if (level.object.type == 'Super' || level.object.type == 'ThisExpression')
                        pointer =
                            pointer['.members']
                         || ( pointer['.members'] = new filth.SafeMap ({ '.isCol':true }) )
                         ;
                    break;
                case 'ThisExpression':
                    return thisNode;
                case 'Super':
                    if (Object.hasOwnProperty.call (initialPointer, 'super'))
                        pointer = initialPointer.super;
                    else
                        return;
                    break;
                case 'Identifier':
                    if (Object.hasOwnProperty.call (pointer, level.name))
                        pointer = pointer[level.name];
                    else
                        pointer = pointer[level.name] = newNode();
                    break;
                case 'ArrowFunctionExpression':
                case 'FunctionExpression':
                    var anon = newNode();
                    var args = anon['.arguments'] = [];
                    for (var i=0,j=level.params.length; i<j; i++) {
                        var arg = newNode();
                        arg['.name'] = level.params[i].name;
                        arg['.noSet'] = true;
                        args.push (arg);
                    }
                    anon['.return'] = newNode();
                    anon['.body'] = level.body.body;
                    anon['.this'] = level.type == 'FunctionExpression' ? anon : (thisNode || anon);
                    // take our first pass through the body
                    var innerScope = anon['.scope'] = new filth.SafeMap (scope);
                    for (var i=0,j=args.length; i<j; i++)
                        innerScope[args[i].name] = args[i];
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            innerScope,
                            anon['.this'],
                            localDeadLine,
                            anon,
                            globalScope,
                            fnChain
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                    // reduce innerScope to new keys only
                    for (var key in scope)
                        if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                            delete innerScope[key];
                    return anon;
                default:
                    return;
            }

            if (!shallow) {
                var cycle = [];
                while (
                    pointer['.deref']
                 && pointer['.deref'].length == 1
                 // && !pointer['.types'].length
                 && cycle.indexOf (pointer['.deref'][0]) < 0
                )
                    cycle.push (pointer = pointer['.deref'][0]);
            }

            if (level.property) {
                if (
                    level.property.name == 'prototype'
                 && pointer['.types'].indexOf ('Function') >= 0
                ) {
                    thisNode = pointer;
                    if (pointer['.members'])
                        pointer = pointer['.members'];
                    else
                        pointer = pointer['.members'] = new filth.SafeMap ({ '.isCol':true });
                    return pointer;
                }
                var lastStep = level.property.type == 'Identifier' ?
                    level.property.name
                  : level.property.value
                  ;
                if (pointer['.instance'] && pointer['.instance'].length) {
                    while (pointer['.instance'] && pointer['.instance'].length) {
                        if (pointer['.instance'].length > 1) {
                            logger.debug ({}, 'ambiguous type');
                            return;
                        }
                        pointer = pointer['.instance'][0];
                    }
                    if (pointer['.members'])
                        pointer = pointer['.members'];
                    else
                        pointer = pointer['.members'] = new filth.SafeMap ({ '.isCol':true });
                }
                if (!pointer['.isCol'])
                    if (pointer['.props'])
                        pointer = pointer['.props'];
                    else
                        pointer = pointer['.props'] = {};
                if (Object.hasOwnProperty.call (pointer, lastStep))
                    pointer = pointer[lastStep];
                else
                    pointer = pointer[lastStep] = newNode();

                // gotta deref again
                if (!shallow) {
                    var cycle = [];
                    while (
                        pointer['.deref']
                     && pointer['.deref'].length == 1
                     && !pointer['.types'].length
                     && cycle.indexOf (pointer['.deref'][0]) < 0
                    )
                        cycle.push (pointer = pointer['.deref'][0]);
                }
            }


            return pointer;
        }


        function processComments (node, level, deadLine) {
            // any documentation?
            // leading comments?
            var foundComment = false;
            if (level.leadingComments) {
                for (
                    var i=0,j=node?level.leadingComments.length-1:level.leadingComments.length;
                    i<j;
                    i++
                ) {
                    var comment = level.leadingComments[i];
                    if (deadLine && comment.loc.start.line <= deadLine)
                        continue;

                    var match;
                    Patterns.tag.lastIndex = 0;
                    if (
                        comment.type == 'Line'
                     || !(match = Patterns.tag.exec ('/*'+comment.value+'*/'))
                    )
                        continue;

                    // process tag comment
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

                    if (!pathfrags[0][0])
                        if (pathfrags.length == 1)
                            pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                        else
                            pathfrags[0][0] = '.';

                    parseTag (
                        context,
                        logger,
                        processFile,
                        fname,
                        defaultScope,
                        fileScope,
                        pathfrags,
                        ctype,
                        valtype,
                        docstr
                    );
                }

                // process final leading comment
                if (node) {
                    var comment = level.leadingComments[level.leadingComments.length-1];
                    Patterns.tag.lastIndex = 0;
                    if (deadLine === undefined || comment.loc.start.line > deadLine) {
                        foundComment = true;
                        // javadoc comment?
                        if (comment.value.match (/^\*[^*]/))
                            parseJavadocFlavorTag (comment.value, node, logger);
                        else {
                            // normal or doczar comment
                            if (!(match = Patterns.tag.exec ('/*'+comment.value+'*/')))
                                node['.docstr'] = comment.value;
                            else {
                                if (!node['.mount']) {
                                    // expression marked with a tag comment
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
                                    if (defaultScope && !fileScope.length) {
                                        pathfrags[0][0] = Patterns.delimitersInverse[ctype];
                                        pathfrags = concatPaths (defaultScope, pathfrags);
                                    }

                                    if (!pathfrags[0][0])
                                        if (pathfrags.length == 1)
                                            pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                                        else
                                            pathfrags[0][0] = '.';

                                    node['.mount'] = {
                                        ctype:      ctype,
                                        path:       pathfrags,
                                        valType:    valtype,
                                        docstr:     docstr,
                                        fname:      fname
                                    };
                                }
                            }
                        }
                    }
                }
            }
            if (
                !foundComment
             && node
             && level.trailingComments
             && level.trailingComments[0].loc.start.line == level.loc.end.line
            ) {
                // use a trailing comment that starts on the same line as this statement ends on
                var trailer = level.trailingComments[0];
                if (trailer.type == 'Line')
                    node['.docstr'] = trailer.value;
                else {
                    // try to parse it
                    Patterns.tag.lastIndex = 0;
                    if (match = Patterns.tag.exec ('/*'+trailer.value+'*/')) {
                        // expression marked with a tag comment
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
                        if (!pathfrags[0][0])
                            if (pathfrags.length == 1)
                                pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                            else
                                pathfrags[0][0] = '.';
                        if (defaultScope && !fileScope.length)
                            pathfrags = concatPaths (defaultScope, pathfrags);

                        node['.mount'] = {
                            ctype:      ctype,
                            path:       pathfrags,
                            valType:    valtype,
                            docstr:     docstr,
                            fname:      fname
                        };
                    } else
                        node['.docstr'] = trailer.value;
                }
            }
        }

        // ---------------------------------------------------------------- real processing begins
        // walk this level
        var node;
        switch (level.type) {
            case 'TryStatement':
                var moreBlocks = level.block.body;
                var localDeadLine = deadLine;
                for (var i=0,j=moreBlocks.length; i<j; i++) {
                    walkLevel (
                        moreBlocks[i],
                        scope,
                        thisNode,
                        localDeadLine,
                        scopeParent,
                        globalScope,
                        fnChain
                    );
                    localDeadLine = moreBlocks[i].loc.end.line;
                }
                break;
            case 'ReturnStatement':
                // add return type to node
                if (!scopeParent)
                    break;
                if (scopeParent['.returns'])
                    node = scopeParent['.returns'];
                else
                    node = scopeParent['.returns'] = newNode();
                if (level.argument)
                    divineTypes (node, level.argument);
                break;
            case 'VariableDeclaration':
                // work each declaration
                for (var i=0,j=level.declarations.length; i<j; i++) {
                    var declaration = level.declarations[i];

                    // simple declaration?
                    if (!declaration.init)
                        break; // document it when it's found being used

                    // self pointer?
                    if (declaration.init.type == 'ThisExpression') {
                        node = scope[declaration.id.name] = thisNode;
                        continue;
                    }

                    if (Object.hasOwnProperty.call (scope, declaration.id.name))
                        node = scope[declaration.id.name];
                    else
                        node = scope[declaration.id.name] = newNode();

                    // divine the type being set
                    divineTypes (node, declaration.init);

                    // what kind of declaration was this?
                    if (level.kind == "let")
                        level['.silent'] = true;
                    else if (level.kind == "const")
                        if (level['.mods']) {
                            if (level['.mods'].indexOf ('constant') < 0)
                                level['.mods'].push ('constant');
                        } else
                            level['.mods'] = [ 'constant' ];
                }
                break;
            case 'ExpressionStatement':
                switch (level.expression.type) {
                    case 'AssignmentExpression':
                        if (level.expression.right.type == 'ThisExpression') {
                            // either a self pointer, or set this-type to a prop/member
                            if (level.expression.left.type == 'Identifier') {
                                // simple self pointer
                                node = scope[level.expression.left.name] = thisNode;
                            } else {
                                // set `this` into a prop somewhere
                            }
                            break;
                        }
                        node = getNode (scope, level.expression.left, true);
                        if (!node)
                            break;
                        if (node['.noSet'])
                            break;
                        // divine the type being set
                        divineTypes (node, level.expression.right);
                        break;
                    case 'CallExpression':
                        processCallExpression (level.expression);
                        break;
                    case 'UnaryExpression':
                        // nothing to do here
                        break;
                    case 'UpdateExpression':
                        // target must be a Number, at least sometimes
                        node = getNode (scope, level.expression.argument);
                        if (!node)
                            break;
                        if (node['.types'].indexOf ('Number') < 0)
                            node['.types'].push ('Number');
                        break;
                    case 'LogicalExpression':
                        // step into both terms
                        walkLevel (
                            level.expression.left,
                            scope,
                            thisNode,
                            deadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        var localDeadLine = deadLine;
                        if (level.expression.left.loc.end.line != level.expression.right.loc.start.line)
                            localDeadLine = level.expression.left.loc.end.line;
                        walkLevel (
                            level.expression.right,
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        break;
                    case 'ConditionalExpression':
                        // step into all three terms
                        walkLevel (
                            level.expression.test,
                            scope,
                            thisNode,
                            deadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        var localDeadLine = deadLine;
                        if (level.expression.test.loc.end.line != level.expression.consequent.loc.start.line)
                            localDeadLine = level.expression.test.loc.end.line;
                        walkLevel (
                            level.expression.consequent,
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        if (level.expression.consequent.loc.end.line != level.expression.alternate.loc.start.line)
                            localDeadLine = level.expression.consequent.loc.end.line;
                        walkLevel (
                            level.expression.alternate,
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        break;
                    default:
                        logger.debug (
                            { type:level.expression.type, line:level.loc.start.line },
                            'unknown expression type'
                        );
                        break;
                }
                break;
            case 'ConditionalExpression':
                // step into all three terms
                walkLevel (
                    level.test,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );
                var localDeadLine = deadLine;
                if (level.test.loc.end.line != level.consequent.loc.start.line)
                    localDeadLine = level.test.loc.end.line;
                walkLevel (
                    level.consequent,
                    scope,
                    thisNode,
                    localDeadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );
                if (level.consequent.loc.end.line != level.alternate.loc.start.line)
                    localDeadLine = level.consequent.loc.end.line;
                walkLevel (
                    level.alternate,
                    scope,
                    thisNode,
                    localDeadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );
                break;
            case 'FunctionDeclaration':
                if (!level.id)
                    break;
                node = getNode (scope, level.id);
                if (!node)
                    break;
                if (node['.types'].indexOf ('Function') < 0)
                    node['.types'].push ('Function');
                var args;
                if (node['.arguments'])
                    args = node['.arguments'];
                else
                    args = node['.arguments'] = [];

                // work argument types for the function
                var lastI = args.length-1;
                for (var i=0,j=level.params.length; i<j; i++) {
                    var param = level.params[i];
                    if (i < args.length)
                        args[i]['.name'] = param.name;
                    else
                        args[i] = new filth.SafeMap ({
                            '.name':    param.name,
                            '.types':   [],
                            '.deref':   [],
                            '.noSet':   true
                        });
                    divineTypes (param, args[i]);
                }

                // mark missing arguments as optional on the node
                for (var i=level.params.length, j=args.length; i<j; i++)
                    args[i]['.optional'] = true;

                // recurse into function body
                var target = node || newNode();
                if (target['.types'].indexOf ('Function') < 0)
                    target['.types'].push ('Function');
                var innerScope = {};
                for (var key in scope)
                    innerScope[key] = scope[key];
                if (node)
                    node['.scope'] = innerScope;
                var localDeadLine = deadLine;
                node['.body'] = level.body.body; // comment to stop recursion crashes
                for (var i=0,j=level.body.body.length; i<j; i++) {
                    walkLevel (
                        level.body.body[i],
                        innerScope,
                        node || thisNode,
                        localDeadLine,
                        target,
                        globalScope,
                        fnChain
                    );
                    localDeadLine = level.body.body[i].loc.end.line;
                }
                // run any waiting call tests
                if (node['.waitingCalls']) {
                    if (fnChain.indexOf (node) < 0) {
                        var localChain = fnChain.concat();
                        localChain.push (node);
                        for (var i=0,j=node['.waitingCalls'].length; i<j; i++) {
                            var callPack = node['.waitingCalls'][i];
                            var waitingInnerScope = new filth.SafeMap (scope);
                            for (var i=0,j=Math.min (args.length, callPack.length); i<j; i++)
                                waitingInnerScope[args[i]['.name']] = callPack[i];
                            // for (var key in callPack)
                            //     waitingInnerScope[key] = callPack[key];
                            var localDeadLine = deadLine;
                            for (var i=0,j=level.body.body.length; i<j; i++) {
                                walkLevel (
                                    level.body.body[i],
                                    waitingInnerScope,
                                    node || thisNode,
                                    localDeadLine,
                                    node,
                                    globalScope,
                                    localChain
                                );
                                localDeadLine = level.body.body[i].loc.end.line;
                            }
                        }
                    }
                    delete node['.waitingCalls'];
                }
                // reduce scope to new keys only
                for (var key in scope)
                    if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                        delete innerScope[key];
                break;
            case 'IfStatement':
                // perform a dummy type check on the test
                // recurses to walk any assignment statements
                divineTypes (newNode(), level.test);

                // walk the consequent
                if (level.consequent.type != 'BlockStatement')
                    walkLevel (
                        level.consequent,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        globalScope,
                        fnChain
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.consequent.body.length; i<j; i++) {
                        walkLevel (
                            level.consequent.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        localDeadLine = level.consequent.body[i].loc.end.line;
                    }
                }

                // walk the alternate
                if (level.alternate)
                    if (level.alternate.type != 'BlockStatement')
                        walkLevel (
                            level.alternate,
                            scope,
                            thisNode,
                            deadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                    else {
                        var localDeadLine = deadLine;
                        for (var i=0,j=level.alternate.body.length; i<j; i++) {
                            walkLevel (
                                level.alternate.body[i],
                                scope,
                                thisNode,
                                localDeadLine,
                                scopeParent,
                                globalScope,
                                fnChain
                            );
                            localDeadLine = level.alternate.body[i].loc.end.line;
                        }
                    }
                break;
            case 'ForStatement':
                // register anything relevant in the init, test and update
                if (level.init)
                    walkLevel (
                        level.init,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        globalScope,
                        fnChain
                    );
                walkLevel (
                    level.test,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );
                if (level.update)
                    walkLevel (
                        level.update,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        globalScope,
                        fnChain
                    );

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        globalScope,
                        fnChain
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'ForOfStatement':
            case 'ForInStatement':
                // register the iterated term into the scope
                try {
                    var iteratedNode = getNode (level.left.declarations[0]);
                } catch (err) {
                    logger.debug (
                        { type:level.type, iterator:level.left, iterating:level.right },
                        'malformed for loop'
                    );
                    break;
                }

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        globalScope,
                        fnChain
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'WhileStatement':
            case 'DoWhileStatement':
                // perform a dummy type check on the test
                // recurses to walk any assignment statements
                divineTypes (newNode(), level.test);

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        globalScope,
                        fnChain
                    );
                else {
                    var localDeadLine = deadLine;
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            globalScope,
                            fnChain
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'ExportDefaultDeclaration':
                var targetNode = baseNode[path.parse (fname).name];

                if (!level.declaration)
                    break;

                node = walkLevel (
                    level.declaration,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );

                break;
            case 'ExportNamedDeclaration':
                // step into declaration
                if (!scope['.exports'])
                    scope['.exports'] = {};
                if (!level.declaration)
                    break;

                node = walkLevel (
                    level.declaration,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );

                break;
            case 'ImportDeclaration':
                // already hoisted
                break;
            case 'ClassDeclaration':
                var className = level.id.name;
                if (Object.hasOwnProperty.call (scope, className))
                    node = scope[className];
                else
                    node = scope[className] = newNode();
                if (node['.types'] && node['.types'].indexOf ('Function') < 0)
                    node['.types'].push ('Function');

                var innerScope = {};
                for (var key in scope)
                    innerScope[key] = scope[key];

                if (level.superClass) {
                    var superNode = getNode (scope, level.superClass);
                    if (superNode) {
                        innerScope['super'] = superNode;
                        if (node['.super'])
                            node['.super'].push (superNode);
                        else
                            node['.super'] = [ superNode ];
                    }
                }
                if (!node['.members'])
                    node['.members'] = new filth.SafeMap ({ '.isCol':true });
                var members = node['.members'];
                for (var i=0,j=level.body.body.length; i<j; i++) {
                    var declaration = level.body.body[i];
                    walkLevel (
                        declaration,
                        innerScope,
                        node,
                        declaration.loc.end.line,
                        scope,
                        globalScope,
                        fnChain
                    );
                }

                // clear unchanged inherited keys from the inner scope
                for (var key in innerScope)
                    if (innerScope[key] === scope[key])
                        delete innerScope[key];

                break;
            case 'MethodDefinition':
                if (level.key.name == 'constructor')
                    node = thisNode;
                else if (Object.hasOwnProperty.call (thisNode['.members'], level.key.name))
                    node = thisNode['.members'][level.key.name];
                else
                    node = thisNode['.members'][level.key.name] = newNode();
                divineTypes (node, level.value);
                break;
            case 'EmptyStatement':
                break;
            case 'Identifier':
                break;
            case 'SwitchStatement':
                break;
            case 'ThrowStatement':
                if (!scopeParent)
                    break;
                if (scopeParent['.throws'])
                    node = scopeParent['.throws'];
                else
                    node = scopeParent['.throws'] = newNode();
                divineTypes (node, level.argument);
                break;
            case 'BreakStatement':
                // nothing to do here
                break;
            case 'LogicalExpression':
                // step into both terms
                walkLevel (
                    level.left,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );
                var localDeadLine = deadLine;
                if (level.left.loc.end.line != level.right.loc.start.line)
                    localDeadLine = level.left.loc.end.line;
                walkLevel (
                    level.right,
                    scope,
                    thisNode,
                    localDeadLine,
                    scopeParent,
                    globalScope,
                    fnChain
                );
                break;
            case 'CallExpression':
                processCallExpression (level);
                break;
            default:
                // unknown statement type
                logger.debug (
                    { type:level.type, line:level.loc.start.line },
                    'unknown statement type'
                );
                break;
        }

        // comments time!
        if (node)
            processComments (node, level, deadLine);
    }

    // hoist ES6 import and export-as statements
    for (var i=0,j=tree.body.length; i<j; i++) {
        var level = tree.body[i];
        switch (level.type) {
            case 'ImportDeclaration':
                var moduleNode;

                var importName = level.source.value[0] == '/' ?
                    Path.resolve (context.argv.fileRoot, importName.slice (1))
                  : level.source.value.slice (0, 2) == './' ?
                        level.source.value
                      : './' + level.source.value
                      ;
                try {
                    var modPathStr = resolve.sync (
                        importName,
                        { basedir:path.parse (fname).dir }
                    );
                } catch (err) {
                    logger.warn ({
                        from:   path.parse (fname).dir,
                        to:     path.resolve (process.cwd(), importName)
                    }, 'failed to resolve dependency');
                    break;
                }
                var exports;
                if (Object.hasOwnProperty.call (sources, modPathStr))
                    moduleNode = sources[modPathStr];
                else {
                    moduleNode = sources[modPathStr] = new filth.SafeMap (baseNode, {
                        '.fname':   modPathStr,
                        window:     baseNode,
                        '.exports': filth.clone ({
                            '.types':   [],
                            '.deref':   [],
                            '.props':   { '.isCol':true }
                        })
                    });
                    processFile (modPathStr, path.parse (fname).dir);
                }

                if (!moduleNode['.exports']) {
                    moduleNode['.exports'] = newNode();
                    moduleNode['.exports']['.props'] = new filth.SafeMap ({ '.isCol':true });
                }

                // first check if it's `import * as ModName from "foo.js"`
                if (level.specifiers[0].type == "ImportNamespaceSpecifier") {
                    var localNode = baseNode[level.specifiers[0].local.name] = newNode();
                    localNode['.deref'].push (moduleNode['.exports']);
                    localNode['.alias'] = moduleNode['.exports'];
                } else // iterate import specifiers
                    for (var i=0,j=level.specifiers.length; i<j; i++) {
                        var spec = level.specifiers[i];
                        var foreign;
                        var source = spec.imported || spec.local;
                        if (Object.hasOwnProperty.call (
                            moduleNode['.exports']['.props'],
                            source.name
                        ))
                            foreign = moduleNode['.exports']['.props'][source.name];
                        else
                            foreign
                             = moduleNode['.exports']['.props'][source.name]
                             = newNode (modPathStr)
                             ;
                        var localNode = baseNode[spec.local.name] = newNode();
                        localNode['.deref'].push (foreign);
                        localNode['.alias'] = foreign;
                    }
                break;
            case 'ExportDefaultDeclaration':
                if (!baseNode['.exports']) {
                    baseNode['.exports'] = newNode();
                    baseNode['.exports']['.props'] = new filth.SafeMap ({ '.isCol':true });
                }
                var defaultName = path.parse (fname).name;
                var exportedNode;
                if (Object.hasOwnProperty.call (baseNode['.exports']['.props'], defaultName))
                    exportedNode = baseNode['.exports']['.props'][defaultName];
                else
                    exportedNode = baseNode['.exports']['.props'][defaultName] = newNode();
                if (level.declaration.id) // place in the local scope
                    baseNode[level.declaration.id.name] = exportedNode;
                break;
            case 'ExportNamedDeclaration':
                if (!level.specifiers)
                    break;
                if (!baseNode['.exports']) {
                    baseNode['.exports'] = newNode();
                    baseNode['.exports']['.props'] = new filth.SafeMap ({ '.isCol':true });
                }
                for (var k=0,l=level.specifiers.length; k<l; k++) {
                    var spec = level.specifiers[k];
                    if (Object.hasOwnProperty.call (
                        baseNode['.exports']['.props'],
                        spec.exported.name
                    ))
                        baseNode[spec.local.name]
                         = baseNode['.exports']['.props'][spec.exported.name]
                         ;
                    else
                        baseNode[spec.local.name]
                         = baseNode['.exports']['.props'][spec.exported.name]
                         = newNode()
                         ;
                }
                break;
        }
    }

    // push any pre-configured ES6 exports into the scope to be picked up later
    if (baseNode['.exports']) for (var name in baseNode['.exports']['.props']) {
        if (name[0] == '.')
            continue;
        var specimen = baseNode['.exports']['.props'][name];
        if (specimen['.localName'])
            continue;
        specimen['.localName'] = name;
        baseNode[name] = specimen;
    }

    // normal body processing
    for (var i=0,j=tree.body.length; i<j; i++)
        walkLevel (
            tree.body[i],
            baseNode,
            undefined,
            i ? tree.body[i-1].loc.end.line : undefined,
            undefined,
            baseNode,
            [ tree.body[i] ]
        );

    // handle tag comments after the last expression
    if (tree.body.length) {
        var lastWord = tree.body[tree.body.length-1];
        if (!lastWord.trailingComments)
            return;
        var bottomLine = lastWord.loc.end.line;
        for (var i=0,j=lastWord.trailingComments.length; i<j; i++) {
            var comment = lastWord.trailingComments[i];
            if (comment.loc.start.line <= bottomLine)
                continue;
            var match;
            Patterns.tag.lastIndex = 0;
            if (
                comment.type == 'Line'
             || !(match = Patterns.tag.exec ('/*'+comment.value+'*/'))
            )
                continue;

            // process tag comment
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

            if (!pathfrags[0][0])
                if (pathfrags.length == 1)
                    pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                else
                    pathfrags[0][0] = '.';

            parseTag (
                context,
                logger,
                processFile,
                fname,
                defaultScope,
                fileScope,
                pathfrags,
                ctype,
                valtype,
                docstr
            );
        }
        return;
    }

    // handle files with comments only
    if (!tree.leadingComments)
        return;
    for (var i=0,j=tree.leadingComments.length; i<j; i++) {
        var comment = tree.leadingComments[i];
        if (comment.type != 'Block')
            continue;

        Patterns.tag.lastIndex = 0;
        if (!(match = Patterns.tag.exec ('/*' + comment.value + '*/')))
            continue;

        // process documentation tag comment
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

        if (!pathfrags[0][0])
            if (pathfrags.length == 1)
                pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
            else
                pathfrags[0][0] = '.';
        parseTag (
            context,
            logger,
            processFile,
            fname,
            defaultScope,
            fileScope,
            pathfrags,
            ctype,
            valtype,
            docstr
        );
    }
}

module.exports = {
    parseJSTypes:           parseJSTypes,
    parseFile:              parseFile,
    parsePath:              parsePath,
    parseType:              parseType,
    parseTag:               parseTag,
    parseJavadocFlavorTag:  parseJavadocFlavorTag
};
