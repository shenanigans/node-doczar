
/*      @module
    Digs document comments out of source files, splits them into Declarations and Modifiers, then
    reports everything it finds to a [ComponentCache](doczar/src/ComponentCache) instance.
*/

/*      @submodule:Array<Array> Path
    Paths are represented as Arrays of Arrays, each child Array representing the individual portions
    of a fragement path. That is, the delimiter, the String fragment name, and in the case that the
    fragment is an es6 symbol a third child contains another `Path` representing the parsed form of
    the fragment name. Examplia gratia:
    ```javascript
    [ [ ".", "name" ], ...]
    ```
    Or with a symbol:
    ```javascript
    [ [ ".", "Symbol.iterator", [ [ ".", "Symbol" ], [ ".", "iterator" ] ] ]
    ```
*/

/*      @submodule:class Valtype
    Represents a value type.
@member:String name
    The simple String representation of the type name.
@member:/Path path
    A [Path](/Path) representing the type.
@member:Boolean isPointer
    Whether the type was followed by an asterisk to identify it as a pointer.
@member:Boolean isArray
    Whether the type was followed by an empty set of square brackets to indicate that it is a bare
    array of its own type.
@member:Array<:Generic> generics
    Any included generic types, e.g. `Array<String>`.
*/

/*      @submodule:class Generic
    Represents a type slotted into a generic/template type.
@member:String name
    The simple String representation of the type name.
@member:/Path path
    A [Path](/Path) representing the type.
*/

/*      @submodule:class Modifier
    Represents a modifier declaration.
@member:String mod
    The name of the modifier, without the `@`.
@member:/Path|undefined path
    If the modifier declaration included a path, it is provided here.
*/

/*      @submodule:class DocumentFragment
    Represents a single block of markdown text and wraps it with its context to ensure proper
    crosslinking.
    The same markdown doc is often rendered twice, once in a parent context and again on the
    Component's own page. To make generated docs compatible with local file view, either all links
    must be local paths or the entire page must be initialized to root with a `<base>`. Because
    `doczar` chooses to use local links, the `href` for a given path changes between rendering
    contexts. This necessitates multiple rendering passes and therefor the link context must be
    passed forward.
@member:String value
    The markdown text.
@member:/Path context
    The scope path which should be appended to crosslink target paths begining with a delimiter
    character.
*/

/*      @submodule:class Submission
    An intermediate structure for data hot off the `Parser` and ready to integrate into a
    [Component](doczar.Component). Encapsulates information included in a single declaration or
    inner declaration.
@member:String ctype
    The Component type of the declaration.
@member:/DocumentFragment doc
    Markdown documentation String or Array of Strings.
@member:Array</Valtype> valtype
    Value types loaded from the declaration.
@member:Array</Modifier> modifiers
    All the modifiers in the declaration.
*/

var fs       = require ('fs-extra');
var pathLib  = require ('path');
var filth    = require ('filth');
var tools    = require ('tools');
var Patterns = require ('./Patterns');

/*
    Convert a path String to a path Array. If no path is generated, `[ [ ] ]` is returned. This is
    because **all** paths have a length but the final element may be filled contextually rather than
    explicitly.
@argument:String pathstr
    A single path String, potentially containing symbols.
@returns:/Path
    Returns an Array of path fragment Arrays.
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
                symbolPath = fileScope.concat (symbolPath);
                // symbolPath = concatPaths (fileScope, symbolPath);

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

/*
    Parse a standard type String. This may include any number of pipe-delimited iterations of paths
    with optional generic types.
@returns:Array</Valtype>
    Each type in the pipe-delimited sequence (by default, length 1) represented as a [Valtype]
    (/Valtype).
*/
function parseType (typeStr, fileScope, implied) {
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
                    // outPath = fileScope && fileScope.length ? cloneArr (fileScope) : [];
                    outPath = fileScope && fileScope.length ? fileScope.concat() : [];
                else {
                    var outPath = parsePath (genericStr, fileScope);
                    if (outPath[0][0])
                        outPath = fileScope.concat (outPath);
                        // outPath = concatPaths (fileScope, outPath);
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
            // valtypefrags = fileScope && fileScope.length ? cloneArr (fileScope) : [];
            valtypefrags = fileScope && fileScope.length ? fileScope.concat() : [];
        else {
            valtypefrags = parsePath (vtstr, fileScope);
            if (valtypefrags[0][0])
                valtypefrags = fileScope.concat (valtypefrags);
                // valtypefrags = concatPaths (fileScope, valtypefrags);
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
            name:       uglyvaltypepath.slice(1),
            explicit:   !implied
        });
    }
    return valType;
}


/*
    @api
    Submit every Modifier and Declaration in a single source file to a [ComponentCache]
    (doczar/src/ComponentCache) instance.
@argument:String fname
    An OS-localized absolute filename to read.
@argument:doczar/src/ComponentCache context
    Parsed information will be [reported](doczar/ComponentCache#submit) to this [ComponentCache]
    (doczar/src/ComponentCache) instance.
@argument:bunyan.Logger logger
@callback next
    Called any number of times to request that additional files be processed.
    @argument:String fname
        The OS-localized absolute filename of another file that should be processed.
    @returns
@callback
    @argument:Error|undefined err
        Any fatal filesystem Error that prevents the parser from completing.
*/
var loadedDocuments = {};
var parseFile = function (fname, fstr, defaultScope, context, next) {
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
            valtype = parseType (match[2], fileScope.length ? fileScope : defaultScope);
        else
            valtype = [];
        var pathstr = match[3];
        var docstr = match[4] || '';
        var pathfrags = parsePath (pathstr, fileScope.length ? fileScope : defaultScope);

        if (!pathfrags[0][0])
            if (pathfrags.length == 1)
                pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
            else
                pathfrags[0][0] = '.';

        parseTag (
            context,
            fname,
            ctype,
            valtype,
            pathfrags,
            fileScope,
            defaultScope,
            [ docstr ],
            next
        );
    }
    context.logger.debug ({ filename:fname }, 'finished parsing file');
};

function consumeModifiers (fname, fileScope, tagScope, next, docstr, modifiers) {
    var modmatch;
    while (modmatch = docstr.match (Patterns.modifier)) {
        if (!modmatch[0].length)
            break;
        if (!modmatch[1]) {
            docstr = docstr.slice (modmatch[0].length);
            continue;
        }
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
                var localDir = pathLib.dirname (fname);
                next (pathLib.resolve (localDir, newFilename));
                docstr = docstr.slice (modmatch[0].length);
                continue;
            }

            if (!pathfrags[0][0])
                pathfrags[0][0] = '.';
            else
                pathfrags = fileScope.concat (pathfrags);
                // pathfrags = concatPaths (fileScope, pathfrags);
            modDoc.path = pathfrags;
        }

        if (modDoc.mod == 'root')
            tools.replaceElements (fileScope, modPath ? pathfrags : tagScope);
        else
            modifiers.push (modDoc);
        docstr = docstr.slice (modmatch[0].length);
    }
    return docstr;
}

/*
    Parse the contents of a documentation tag with its header already broken out.
*/
function parseTag (context, fname, ctype, valtype, pathfrags, fileScope, defaultScope, docstr, next) {
    if (docstr instanceof Array) {
        for (var i=0,j=Math.max (1, docstr.length); i<j; i++) {
            var workingDocstr = docstr[i] || '';
            workingDocstr = workingDocstr.match (/^[\r\n]*([^]*)[\r\n]*$/)[1];
            parseTag (
                context,
                fname,
                ctype,
                valtype,
                pathfrags,
                fileScope,
                defaultScope,
                workingDocstr,
                next
            );
        }
        return;
    }
    var tagScope;
    if (fileScope.length)
        tagScope = fileScope.concat (pathfrags);
        // tagScope = concatPaths (fileScope, pathfrags);
    else if (defaultScope.length && (ctype != 'module' || !pathfrags.length))
        tagScope = defaultScope.concat (pathfrags);
        // tagScope = concatPaths (defaultScope, pathfrags);
    else
        tagScope = pathfrags.concat();
        // tagScope = concatPaths (pathfrags);

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
    docstr = consumeModifiers (fname, fileScope, tagScope, next, docstr, modifiers);

    // begin searching for inner tags
    var innerMatch = docstr ? docstr.match (Patterns.innerTag) : undefined;
    if (!innerMatch) {
        // the entire comment is one component
        try {
            lastComponent = context.submit (
                tagScope.length ? tagScope : fileScope,
                {
                    ctype:      ctype,
                    valtype:    valtype,
                    // doc:        { value:docstr, context:cloneArr(fileScope) },
                    doc:        { value:docstr, context:fileScope.concat() },
                    modifiers:  modifiers
                }
            );
            context.logger.trace ({
                type:   ctype,
                file:   fname,
                path:   tagScope.map (function(a){ return a[0]+a[1]; }).join('')
            }, 'read declaration');
            return;
        } catch (err) {
            context.logger.error (err, 'parsing error');
            return;
        }
    }

    var argscope = tagScope.concat();
    var inpathstr = innerMatch[3];
    var inpathfrags = [];
    var insigargs;
    var pathMatch;
    var linkScope = fileScope.concat();
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
            submissionPath = argscope.concat (inpathfrags);
            // submissionPath = concatPaths (argscope, inpathfrags);
        else if (ctype != 'load')
            submissionPath = tagScope.concat (inpathfrags);
            // submissionPath = concatPaths (tagScope, inpathfrags);

        // any chance this is just a @load declaration?
        if (ctype == 'load') {
            var lookupPath =
                inpathfrags[0][1]
             || docstr.slice (0, innerMatch.index).replace (/^\s*/, '').replace (/\s*$/, '')
             ;
            var filename = pathLib.resolve (pathLib.dirname (fname), lookupPath);
            var loadedDoc;
            if (Object.hasOwnProperty.call (loadedDocuments, filename))
                loadedDoc = loadedDocuments[filename];
            else try {
                context.latency.log ('parsing');
                loadedDoc = fs.readFileSync (filename).toString();
                context.latency.log ('file system');
            } catch (err) {
                context.logger.warn (
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
                context.logger.trace ({
                    type:   ctype,
                    file:   fname,
                    path:   submissionPath.map (function(a){ return a[0]+a[1]; }).join('')
                }, 'read declaration');
            } catch (err) {
                context.logger.error (err, 'parsing error');
                return;
            }

        // prepare the next submission
        if (ctype == 'returns') {
            if (!inpathstr && argscope.length > tagScope.length)
                argscope.pop();
        } else if (ctype == 'callback')
            argscope = argscope.concat (inpathfrags);
            // argscope = concatPaths (argscope, inpathfrags);
        else if (
            ctype != 'argument'
         && ctype != 'kwarg'
         && ctype != 'args'
         && ctype != 'kwargs'
         && ctype != 'returns'
         && ctype != 'signature'
        )
            argscope = tagScope.concat (inpathfrags);
            // argscope = concatPaths (cloneArr (tagScope), inpathfrags);

        linkScope = fileScope.concat();
        // linkScope = cloneArr (fileScope);
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
                var sigvaltype = parseType (sigargSplit[i], fileScope.length ? fileScope : defaultScope);
                var sigvalname = parsePath (sigargSplit[i+1], fileScope);
                if (sigvalname && !sigvalname[0][0])
                    sigvalname[0][0] = '(';
                var sigargargpath = tagScope.concat (sigvalname);
                // var sigargargpath = concatPaths (cloneArr (tagScope), sigvalname);
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

        valtype = parseType (valtype, fileScope.length ? fileScope : defaultScope);

        // consume modifiers
        docstr = consumeModifiers (fname, fileScope, tagScope, next, docstr, modifiers);

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
        submissionPath = argscope.concat (inpathfrags);
        // submissionPath = concatPaths (argscope, inpathfrags);
    else if (ctype != 'load')
        submissionPath = tagScope.concat (inpathfrags);
        // submissionPath = concatPaths (cloneArr (tagScope), inpathfrags);

    // consume modifiers
    docstr = consumeModifiers (fname, fileScope, tagScope, next, docstr, modifiers);

    // any chance this is just a @load declaration?
    if (ctype == 'load') {
        var lookupPath =
            inpathfrags[0][1]
         || docstr.replace (/^\s*/, '').replace (/\s*$/, '')
         ;
        var filename = pathLib.resolve (pathLib.dirname (fname), lookupPath);
        var loadedDoc;
        if (Object.hasOwnProperty.call (loadedDocuments, filename))
            loadedDoc = loadedDocuments[filename];
        else try {
                context.latency.log ('parsing');
            loadedDoc = fs.readFileSync (filename).toString();
                context.latency.log ('file system');
        } catch (err) {
            context.logger.warn (
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
                context.logger.trace ({
                    type:   ctype,
                    file:   fname,
                    path:   submissionPath.map (function(a){ return a[0]+a[1]; }).join('')
                }, 'read declaration');
            } catch (err) {
                context.logger.error (err, 'parsing error');
                return;
            }
    }
}

/*
    Parse a javadoc-format path.
*/
function parseJavadocFlavorPath (pathstr) {
    var frags = pathstr.split (Patterns.jpathWord);
    var newPath = [ ];
    if (!frags.length)
        return newPath;
    for (var i=1,j=frags.length; i<j; i+=4)
        if (frags[i+1]) {
            // module, event or external
            var stepType = frags[i+1];
            if (stepType === 'module') {
                // split slashes
                var subfrags = frags[i+2].split ('/');
                for (var k=0,l=subfrags.length; k<l; k++)
                    newPath.push ([ '/', subfrags[k] ]);
            } else
                newPath.push ([
                    stepType === 'event' ? '+' : '.',
                    frags[i+2]
                ])
        } else
            newPath.push ([ frags[i], frags[i+2] ]);
    return newPath;
}

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
    inner:      'asLocal',
    global:     'remountGlobal',
    static:     'remountProperty'
};
// creates a flag modifier and may alter mount.type and mount.path - @tag [type] [path]
var JDOC_MOUNT_FLAG = {
    const:      'constant',
    constant:   'constant'
};
// adds the mapped string to mount.extras and may alter mount.path - @tag [path]
var JDOC_MOUNT_EXTRA = {
    callback:   'callback'
};
var JDOC_CHILD = {

};
var JDOC_SPECIAL = {
    access:     function (line, mount, scopeParent, rootPath, argv) {
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
    borrows:    function (line, mount, scopeParent, rootPath, argv) {
        // create a child with an @alias modifier
    },
    constructs: function (line, mount, scopeParent, rootPath, argv) {
        // @constructs [name]
        // apply documentation on this node to the class' node
    },
    name:       function (line, mount, scopeParent, rootPath, argv) {
        var mountPath = parseJavadocFlavorPath (line.replace (/^\s*/, '').replace (/\s*$/, ''));
        if (mountPath.length > 1)
            return;
        if (scopeParent[NAME])
            scopeParent[NAME][1] = mountPath[0][1];
        else
            scopeParent[NAME] = [ mountPath[0][0] || '.', mountPath[0][1] ];
        if (mount.path)
            mount.path[mount.path.length-1] = scopeParent[NAME].concat();
    },
    memberOf:   function (line, mount, scopeParent, rootPath, argv) {
        if (!scopeParent[NAME])
            return;
        var mountPath = parseJavadocFlavorPath (line.replace (/^\s*/, '').replace (/\s*$/, ''));
        if (!mountPath[0][0])
            mountPath[0][0] = '.';
        mountPath.push ([ '.', scopeParent[NAME][1] ]);
        if (argv.jTrap) {
            var ok, clip;
            for (var i=rootPath.length-1; i>=0; i--) {
                clip = i;
                if (rootPath[i][0] === mountPath[0][0] && rootPath[i][1] === mountPath[0][1]) {
                    ok = true;
                    for (var k=1,l=Math.min (rootPath.length - i, mountPath.length); k<l; k++)
                        if (rootPath[i+k] !== mountPath[k]) {
                            ok = false;
                            break;
                        }
                    if (ok)
                        break;
                }
                if (ok)
                    mountPath = rootPath.slice (0, clip).concat (mountPath);
                else
                    mountPath = rootPath.concat (mountPath);
            }
        }
        if (!mountPath.length)
            return;
        mount.path = mountPath;
    }
};

/*
    Parse a documentation tag written in javadoc-flavored syntax.
*/
function parseJavadocFlavorTag (docstr, scopeParent, rootPath, argv, logger) {
    var lines = docstr.split (/\r?\n/g);
    var mount;
    if (scopeParent[MOUNT]) {
        mount = scopeParent[MOUNT];
        if (!mount.modifiers) {
            mount.modifiers = [];
            mount.extras = [];
        }
    } else {
        mount = scopeParent[MOUNT] = Object.create (null);
        mount.valtype = [];
        mount.modifiers = [];
        mount.extras = [];
    }

    var children = [];
    var currentChild;
    var tagname;
    var outputDocstr = '';
    for (var i=0,j=lines.length; i<j; i++) {
        var cleanLine = lines[i].match (Patterns.jdocLeadSplitter)[1] || '';
        if (cleanLine[0] !== '@') {
            if (currentChild)
                currentChild[DOCSTR][currentChild[DOCSTR].length-1] += cleanLine + ' \n';
            else {
                cleanLine = cleanLine.replace (Patterns.jLink, function (match, $1, $2) {
                    var newPath = parseJavadocFlavorPath ($2);
                    if (argv.jTrap) {
                        var ok, clip;
                        for (var i=rootPath.length-1; i>=0; i--) {
                            clip = i;
                            if (rootPath[i][0] === newPath[0][0] && rootPath[i][1] === newPath[0][1]) {
                                ok = true;
                                for (var k=1,l=Math.min (rootPath.length - i, newPath.length); k<l; k++)
                                    if (rootPath[i+k] !== newPath[k]) {
                                        ok = false;
                                        break;
                                    }
                                if (ok)
                                    break;
                            }
                            if (ok)
                                newPath = rootPath.slice (0, clip).concat (newPath);
                            else
                                newPath = rootPath.concat (newPath);
                        }
                    }
                    return (
                        $1
                      + '('
                      // + (parseJavadocFlavorPath ($2).map (function(a){return a.join('');}).join(''))
                      + tools.pathStr (newPath)
                      + ')'
                    );
                });
                outputDocstr += cleanLine + ' \n';
            }
            continue;
        }

        // starting a new tag
        // wrap up the previous one
        if (currentChild) {
            if (tagname === 'example')
                outputDocstr += currentChild[DOCSTR][currentChild[DOCSTR].length-1] + '```\n\n';

            delete tagname;
            delete currentChild;
        }
        // consume the tag
        var match = cleanLine.match (/@([a-zA-Z]+)(?:[ \t]+(.*))?/);
        tagname = match[1];
        cleanLine = match[2] || '';

        // work the tag
        if (tagname === 'example') {
            outputDocstr += '\n### Example\n```javascript\n';
            continue;
        }

        // // use this to consume errant doc text
        var dummy = {};
        dummy[DOCSTR] = [ '' ];
        currentChild = dummy;

        // // simple flag modifiers
        if (Object.hasOwnProperty.call (JDOC_MOD_FLAG, tagname)) {
            mount.modifiers.push ({ mod:JDOC_MOD_FLAG[tagname] });
            continue;
        }

        // // modifiers that accept a single mandatory path
        if (Object.hasOwnProperty.call (JDOC_MOD_PATH, tagname)) {
            // consume a path
            var pathMatch = cleanLine.match (Patterns.jpathConsumer);
            if (!pathMatch || !pathMatch[1] || !pathMatch[1].length) {
                logger.trace ({ tag:tagname, raw:lines[i] }, 'invalid javadoc tag');
                continue;
            }
            var path = parseJavadocFlavorPath (pathMatch[1]);
            mount.modifiers.push ({ mod:JDOC_MOD_PATH[tagname], path:path });
            continue;
        }

        // modify the target's ctype
        if (Object.hasOwnProperty.call (JDOC_CTYPE, tagname)) {
            mount.ctype = JDOC_CTYPE[tagname];
            continue;
        }

        // add hacky flag properties to the target's EXTRAS property
        if (Object.hasOwnProperty.call (JDOC_EXTRAS, tagname)) {
            if (!mount.extras)
                mount.extras = [ JDOC_EXTRAS[targetNode] ];
            else if (mount.extras.indexOf(JDOC_EXTRAS[tagname]) < 0)
                mount.extras.push (JDOC_EXTRAS[tagname]);
            continue;
        }

        // creates a flag and optionally alters the target's mount.type and mount.path
        if (Object.hasOwnProperty.call (JDOC_MOUNT_FLAG, tagname)) {
            // try to consume either a path or type(s) and a path
            var match = cleanLine.match (Patterns.jtagPaths);
            if (!match) {
                logger.trace ({ tag:tagname, raw:lines[i] }, 'invalid javadoc tag');
                continue;
            }
            mount.modifiers.push ({ mod:JDOC_MOUNT_FLAG[tagname] });
            var types = match[1];
            if (types)
                mount.valtype.push.apply (
                    mount.valtype,
                    types.split ('|').map (function (typeStr) {
                        return { path:parseJavadocFlavorPath (typeStr) };
                    })
                );
            var mountPath = match[2];
            if (mountPath) {
                var renamePath = parseJavadocFlavorPath (mountPath);
                if (renamePath.length === 1)
                    if (scopeParent[NAME])
                        scopeParent[NAME][1] = renamePath[0][1];
                    else
                        scopeParent[NAME] = [ '.', renamePath[0][1] ];
            }
            continue;
        }

        // creates a hacky flag property in the target's EXTRAS property
        // and optionally alters the target's mount.type and mount.path
        if (Object.hasOwnProperty.call (JDOC_MOUNT_EXTRA, tagname)) {
            // try to consume either a path or type(s) and a path
            var match = cleanLine.match (Patterns.jtagPaths);
            if (!match) {
                logger.trace ({ tag:tagname, raw:lines[i] }, 'invalid javadoc tag');
                continue;
            }
            if (mount.extras.indexOf (JDOC_MOUNT_EXTRA[tagname]) < 0)
                mount.extras.push (JDOC_MOUNT_EXTRA[tagname]);
            var types = match[1];
            if (types)
                mount.valtype.push.apply (
                    mount.valtype,
                    types.split ('|').map (function (typeStr) {
                        return { path:parseJavadocFlavorPath (typeStr) };
                    })
                );
            var mountPath = match[2];
            if (mountPath)
                mount.path = parseJavadocFlavorPath (mountPath);
            continue;
        }

        // opens a new child tag and begins consuming documentation
        if (Object.hasOwnProperty.call (JDOC_CHILD, tagname)) {

        }

        // special tags
        if (Object.hasOwnProperty.call (JDOC_SPECIAL, tagname)) {
            JDOC_SPECIAL[tagname] (cleanLine, mount, scopeParent, rootPath, argv);
            continue;
        }

        logger.trace (
            { tag:tagname, line:cleanLine, raw:lines[i] },
            'unrecognized javadoc-flavor tag'
        );
    }

    // wrap up the last subtag
    if (tagname === 'example')
        outputDocstr += currentChild[DOCSTR][currentChild[DOCSTR].length-1] + '```\n\n';

    if (mount.docstr)
        mount.docstr.push (outputDocstr);
    else
        mount.docstr = [ outputDocstr ];
}

/*
    Determine whether two paths are identical.
*/
function pathsEqual (able, baker) {
    if (able.length !== baker.length)
        return false;
    for (var i=0,j=able.length; i<j; i++) {
        var aStep = able[i];
        var bStep = baker[i];
        if (aStep.length !== bStep.length)
            return false;
        for (var k=0,l=aStep.length; k<l; k++)
            if (aStep[k] !== bStep[k])
                return false;
    }
    return true;
}


module.exports = {
    parseFile:              parseFile,
    parsePath:              parsePath,
    parseType:              parseType,
    parseTag:               parseTag,
    parseJavadocFlavorTag:  parseJavadocFlavorTag,
    consumeModifiers:       consumeModifiers
};
