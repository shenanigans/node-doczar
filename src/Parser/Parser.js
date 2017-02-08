
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

var fs                = require ('fs-extra');
var pathLib           = require ('path');
var filth             = require ('filth');
var tools             = require ('tools');
var Patterns          = require ('./Patterns');
var langs             = require ('./langs');

// handy helpers
var concatPaths = function(){
    var out = [];
    for (var i=0,j=arguments.length; i<j; i++)
        if (arguments[i])
            out.push.apply (out, Array.prototype.filter.call (arguments[i], function (item) {
                return Boolean (item && item.length && item[0] && item[0].length);
            }));
    return out;
};
var cloneArr = function (a) {
    var b = [];
    b.push.apply (b, a);
    return b;
}
function pathStr (type) {
    var finalStr = type.map (function (step) {
        if (step.length === 2)
            return step.join ('');
        return step[0] + '[' + step[1] + ']';
    }).join ('')
    return type[0] && type[0][0] ? finalStr.slice (1) : finalStr;
}
function replaceElements (target, source) {
    target.splice (0, target.length);
    target.push.apply (target, source);
}

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
                pathfrags = concatPaths (fileScope, pathfrags);
            modDoc.path = pathfrags;
        }

        if (modDoc.mod == 'root')
            replaceElements (fileScope, modPath ? pathfrags : tagScope);
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
                    doc:        { value:docstr, context:cloneArr(fileScope) },
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
                var sigvaltype = parseType (sigargSplit[i], fileScope.length ? fileScope : defaultScope);
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
        submissionPath = concatPaths (argscope, inpathfrags);
    else if (ctype != 'load')
        submissionPath = concatPaths (cloneArr (tagScope), inpathfrags);

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
                      + pathStr (newPath)
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
    A filter function for ignoring the BODY and THIS symbols.
*/
function cloneShallowFilter (key) {
    return key === BODY || key === THIS;
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

/*
    Parse an entire document of mixed code and documentation tags.
*/
// var SIGNATURE_COOLDOWN = 4;
function parseSyntaxFile (context, fname, referer, fstr, mode, defaultScope, next) {
    if (!Object.hasOwnProperty.call (langs, mode)) {
        context.logger.fatal ({ parse:mode }, 'unknown parse mode');
        return process.exit (1);
    }
    var langPack = langs[mode];
    var baseNode = langPack.getRoot (context, fname, defaultScope, defaultScope);
    defaultScope = baseNode[ROOT];
    if (!baseNode[MODULE])
        baseNode[MODULE] = defaultScope;

    var dirname = pathLib.parse (fname).dir;

    context.latency.log ('parsing');
    var tree = langPack.tokenize (fstr);
    context.latency.log ('tokenization');

    var logger = context.logger.child ({ file:fname });

    function newNode (parent) {
        var node = tools.newNode.apply (tools, arguments);
        node[DOC] = fname;
        node[REFERER] = referer;
        if (parent) {
            node[ROOT] = parent[ROOT];
            node[MODULE] = parent[MODULE] || baseNode[MODULE];
        } else
            node[MODULE] = baseNode[MODULE];
        return node;
    }

    // hoist var statements and function declarations
    function hoistNames (target, body) {
        for (var i=0,j=body.length; i<j; i++) {
            var loc = body[i];
            switch (loc.type) {
                case 'VariableDeclaration':
                    for (var k=0,l=loc.declarations.length; k<l; k++) {
                        var name = loc.declarations[k].id.name;
                        var nameNode = target[name] = newNode (baseNode);
                        nameNode[LINE] = loc.loc.start.line;
                    }
                    break;
                case 'FunctionDeclaration':
                    if (!loc.id)
                        break;
                    var name = loc.id.name;
                    if (!Object.hasOwnProperty.call (target, name)) {
                        var funcNode = target[name] = newNode (baseNode);
                        funcNode[LINE] = loc.loc.start.line;
                    }
                    break;
                case 'TryStatement':
                    // recurse into block and handler
                    hoistNames (target, loc.block.body);
                    if (loc.handler)
                        hoistNames (target, loc.handler.body);
                    if (loc.finalizer)
                        hoistNames (target, loc.finalizer.body);
                    break;
                case 'IfStatement':
                    if (loc.consequent && loc.consequent.type === 'BlockStatement')
                        hoistNames (target, loc.consequent.body);
                    if (loc.alternate && loc.alternate.type === 'BlockStatement')
                        hoistNames (target, loc.alternate.body);
                    break;
                case 'ForStatement':
                case 'ForOfStatement':
                case 'ForInStatement':
                case 'WhileStatement':
                case 'DoWhileStatement':
                    hoistNames (target, loc.body);
                    break;
                default:
            }
        }
    }

    var HACK_line = 0;
    function walkLevel (level, scope, thisNode, deadLine, scopeParent, fnChain, fileScope) {
        function processRequireStatement (expression, target) {
            if (target) target[SILENT] = true;
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
                    return;
                }
            }

            if (CORE_MODS.indexOf (depName) >= 0) {
                logger.debug ({
                    required:   expression.arguments[0].value,
                    line:       expression.loc.start.line
                }, 'ignored core dependency');
                var dummy = newNode();
                dummy[SILENT] = true;
                dummy[ROOT] = [ [ '/', depName ] ];
                return dummy;
            }
            var pathInfo = langPack.getDependency (
                context,
                pathLib.resolve (process.cwd(), referer),
                fname,
                baseNode[MODULE],
                depName
            );
            if (!pathInfo)
                return newNode();

            var sourceRoot;
            if (context.argv.noDeps && !pathsEqual (pathInfo.root, baseNode[MODULE])) {
                var dummy = newNode();
                dummy[SILENT] = true;
                dummy[ROOT] = pathInfo.path;
                dummy[MODULE] = pathInfo.root;
                return dummy; // dummy
            }
            sourceRoot = langPack.getRoot (context, pathInfo.file, pathInfo.root, pathInfo.path);
            sourceRoot[MODULE] = pathInfo.root;
            next (pathInfo.file, pathInfo.referer || referer);
            var foreignExports = sourceRoot.module[PROPS].exports;
            if (target)
                target[ALIAS] = foreignExports;
            return foreignExports;
        }

        /*
            Apply an argument signature to a CallExpression. `generateReturn` enables reprocessing
            the return value for individual expression arguments.
        */
        function processCallExpression (expression, target, generateReturn) {
            // get the Function's node and dig to the bottom of any unambiguous DEREF chain
            var callNode = getNode (scope, expression.callee);
            if (!callNode)
                return;
            var setFunctionPointer = callNode;
            var setFunctionChain = [];
            do {
                setFunctionChain.push (setFunctionPointer);
                if (setFunctionPointer[TYPES].indexOf ('Function') < 0)
                    setFunctionPointer[TYPES].push ('Function');
            } while (
                setFunctionPointer[DEREF]
             && setFunctionPointer[DEREF].length == 1
             && ( setFunctionPointer = setFunctionPointer[DEREF][0] )
             && setFunctionChain.indexOf (setFunctionPointer) < 0
            )

            // apply argument types to the Function's Node
            var args;
            if (callNode[ARGUMENTS])
                args = callNode[ARGUMENTS];
            else
                args = callNode[ARGUMENTS] = [];
            for (var i=0,j=expression.arguments.length; i<j; i++) {
                var arg;
                if (i < args.length)
                    arg = args[i];
                else {
                    arg = args[i] = newNode (callNode);
                    arg[NO_SET] = true;
                    arg[NAME] = [ '(', '' ];
                    arg[TRANSIENT] = true;
                }
                divineTypes (arg, expression.arguments[i]);
                if (callNode[SILENT])
                    arg[SILENT] = true;
            }

            // execute or defer a call test to produce a unique RETURNS for this call expression
            // if and only if there's no matching signature on the function already
            var argSig = expression.arguments.map (function (argExp) {
                return getNode (scope, argExp);
            });
            var targetRow;
            if (!callNode[SIGNATURES]) {
                targetRow = { args:argSig };
                callNode[SIGNATURES] = [ targetRow ];
            } else {
                // if there is a matching signature, return the stored RETURNS node
                // if (callNode[SIGNATURES].length > SIGNATURE_COOLDOWN)
                    for (var i=0,j=callNode[SIGNATURES].length; i<j; i++)
                        if (filth.compare (callNode[SIGNATURES][i].args, argSig)) {
                            if (callNode[SIGNATURES][i].returns)
                                return callNode[SIGNATURES][i].returns;
                            if (!generateReturn)
                                return callNode;
                            targetRow = callNode[SIGNATURES][i];
                            break;
                        }
                if (!targetRow) {
                    targetRow = { args:argSig };
                    callNode[SIGNATURES].push (targetRow);
                }
            }

            // begin processing a new signature
            var callPack;
            if (!(BODY in callNode)) {
                // defer call test for later
                callPack = [ callNode ];
                for (var i=0,j=expression.arguments.length; i<j; i++) {
                    var argNode = getNode (scope, expression.arguments[i]);
                    if (argNode) {
                        if (argNode[IS_COL]) {
                            var dummyArg = newNode (argNode[PARENT]);
                            if (callNode[SILENT])
                                dummyArg[SILENT] = true;
                            dummyArg[INSTANCE] = [ argNode ];
                            argNode = dummyArg;
                        }
                        var dummy = newNode (argNode);
                        dummy[DEREF].push (argNode);
                        dummy[NO_SET] = true;
                        dummy[TRANSIENT] = true;
                        callPack.push (dummy);
                    }
                }
                if (callNode[WAITING_CALLS])
                    callNode[WAITING_CALLS].push (callPack);
                else
                    callNode[WAITING_CALLS] = [ callPack ];
            } else if (fnChain.length < context.argv.maxDepth && fnChain.indexOf (callNode) < 0) {
                var localChain = fnChain.concat();
                localChain.push (callNode);
                // run call test
                var innerScope = new filth.SafeMap (scope, callNode[SCOPE]);
                for (var i=0,j=Math.min (args.length, expression.arguments.length); i<j; i++) {
                    var argNode = getNode (scope, expression.arguments[i]);
                    if (argNode) {
                        var dummy = newNode (argNode);
                        if (callNode[SILENT])
                            dummy[SILENT] = true;
                        dummy[DEREF].push (argNode);
                        dummy[NO_SET] = true;
                        dummy[TRANSIENT] = true;
                        innerScope[args[i][NAME][1]] = dummy;
                    }
                }

                var localDeadLine = deadLine;
                for (var i=0,j=callNode[BODY].length; i<j; i++) {
                    walkLevel (
                        callNode[BODY][i],
                        innerScope,
                        callNode[THIS],
                        localDeadLine,
                        callNode,
                        localChain,
                        fileScope.concat()
                    );
                    localDeadLine = callNode[BODY][i].loc.end.line;
                }
                // reduce innerScope to new keys only
                for (var key in scope)
                    if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                        delete innerScope[key];
            }

            if (!generateReturn)
                return callNode;

            var dummy = newNode();
            dummy[RETURNS] = newNode();
            dummy[RETURNS][TRANSIENT] = true;
            targetRow.returns = dummy[RETURNS];

            if (fnChain.length >= context.argv.maxDepth || fnChain.indexOf (callNode) >= 0)
                return dummy[RETURNS];

            if (!(BODY in callNode)) {
                var secondPack = [ dummy ];
                for (var i=0,j=expression.arguments.length; i<j; i++) {
                    var argNode = getNode (scope, expression.arguments[i]);
                    if (argNode) {
                        var dummyArg = newNode (argNode);
                        dummyArg[DEREF].push (argNode);
                        dummyArg[NO_SET] = true;
                        dummyArg[TRANSIENT] = true;
                        if (callNode[SILENT])
                            dummyArg[SILENT] = true;
                        secondPack.push (dummyArg);
                    }
                }
                callNode[WAITING_CALLS].push (secondPack);
            } else {
                // generate a return value individualized to this CallExpression
                var innerScope = new filth.SafeMap (scope);
                for (var i=0,j=Math.min (args.length, expression.arguments.length); i<j; i++) {
                    var argNode = getNode (scope, expression.arguments[i]);
                    if (argNode) {
                        var dummyArg = newNode (argNode);
                        if (callNode[SILENT])
                            dummyArg[SILENT] = true;
                        dummyArg[DEREF].push (argNode);
                        dummyArg[NO_SET] = true;
                        dummyArg[TRANSIENT] = true;
                        innerScope[args[i][NAME][1]] = dummyArg;
                    }
                }
                var localChain = fnChain.concat();
                localChain.push (callNode);
                var localDeadLine = deadLine;
                for (var i=0,j=callNode[BODY].length; i<j; i++) {
                    walkLevel (
                        callNode[BODY][i],
                        innerScope,
                        callNode[THIS],
                        localDeadLine,
                        dummy,
                        localChain,
                        fileScope.concat()
                    );
                    localDeadLine = callNode[BODY][i].loc.end.line;
                }

                // reduce innerScope to new keys only
                for (var key in scope)
                    if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                        delete innerScope[key];
            }

            return dummy[RETURNS];
        }

        // divine the type of an assignment
        function divineTypes (node, value, localThisNode) {
            switch (value.type) {
                case 'Identifier':
                    if (!Object.hasOwnProperty.call (scope, value.name)) {
                        scope[value.name] = newNode (scope);
                        scope[value.name][NAME] = value.name;
                    }
                    if (node[DEREF].indexOf (scope[value.name]) < 0)
                        node[DEREF].push (scope[value.name]);
                    if (scope[value.name][SILENT])
                        node[SILENT] = true;
                    return [];
                case 'MemberExpression':
                    var memberNode = getNode (scope, value);
                    if (memberNode) {
                        if (node[DEREF].indexOf (memberNode) < 0)
                            node[DEREF].push (memberNode);
                        if (memberNode[SILENT])
                            node[SILENT] = true;
                    }
                    return [];
                case 'Literal':
                    var tstr = filth.getTypeStr (value.value);
                    if (tstr != 'null')
                        if (tstr === 'regexp')
                            tstr = 'RegExp';
                        else
                            tstr = tstr[0].toUpperCase() + tstr.slice (1);
                    if (node[TYPES].indexOf (tstr) < 0)
                        node[TYPES].push (tstr);
                    return [ tstr ];
                case 'ArrayExpression':
                    if (node[TYPES].indexOf ('Array') < 0)
                        node[TYPES].push ('Array');
                    return [ 'Array' ];
                case 'ObjectExpression':
                    if (node[TYPES].indexOf ('json') < 0)
                        node[TYPES].push ('json');
                    if (!node[PROPS])
                        node[PROPS] = tools.newCollection();
                    var props = node[PROPS];
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
                            }, 0, node);
                        }
                        var propNode;
                        if (Object.hasOwnProperty.call (props, propDef.key.name))
                            propNode = props[propDef.key.name];
                        else {
                            propNode = props[propDef.key.name] = newNode (node);
                            propNode[LINE] = propDef.key.loc.start.line;
                            propNode[NAME] = [ '.', propDef.key.name ];
                        }
                        divineTypes (propNode, propDef.value, node);
                        processComments (
                            propNode,
                            propDef,
                            lastPropDef ? lastPropDef.loc.end.line : deadLine,
                            node
                        );
                        lastPropDef = propDef;
                    }
                    return [ 'Object' ];
                case 'BinaryExpression':
                    var tstr;
                    if (value.operator === '+') {
                        // either Number or String
                        // recurse into both arguments;
                    } else { // all binary ops other than + imply a Number return
                        tstr = 'Number';
                        if (node[TYPES].indexOf ('Number') < 0)
                            node[TYPES].push ('Number');
                        return [ 'Number' ];
                    }
                    break;
                case 'AssignmentExpression':
                    if (value.operator === '=') {
                        // single-equals side-effect syntax
                        var targetNode = getNode (scope, value.left, true);
                        if (!targetNode)
                            return [];
                        if (targetNode[NO_SET])
                            return [];
                        var dummy;
                        if (targetNode[IS_COL]) {
                            // something like Foo.prototype = {
                            // this node is the [MEMBERS] collection of Foo
                            dummy = newNode (targetNode[PARENT]);
                            divineTypes (dummy, value.right, targetNode[PARENT]);

                            // rebases functions as methods
                            function rebase (item, chain) {
                                chain = chain || fnChain;

                                // recurse to rebase methods housed on DEREF
                                if (item[DEREF] && chain.length < context.argv.maxDepth) {
                                    for (var i=0,j=item[DEREF].length; i<j; i++) {
                                        var subItem = item[DEREF][i];
                                        if (chain.indexOf (subItem) >= 0)
                                            continue;
                                        var localChain = chain.concat();
                                        localChain.push (subItem);
                                        rebase (subItem, localChain);
                                    }
                                }

                                if (!item[BODY])
                                    return item;

                                // re-parse the body of this method using the new `this`
                                var args = ARGUMENTS in item ?
                                    item[ARGUMENTS]
                                  : item[ARGUMENTS] = []
                                  ;
                                var localChain = chain.concat();
                                localChain.push (item);
                                // run call test
                                var innerScope = new filth.SafeMap (scope, item[SCOPE]);
                                for (var i=0,j=args.length; i<j; i++) {
                                    var argNode = args[i];
                                    var dummy = newNode (argNode);
                                    if (item[SILENT])
                                        dummy[SILENT] = true;
                                    dummy[DEREF].push (argNode);
                                    dummy[NO_SET] = true;
                                    dummy[TRANSIENT] = true;
                                    innerScope[argNode[NAME][1]] = dummy;
                                }
                                if (
                                    localChain.length < context.argv.maxDepth
                                 && localChain.indexOf (item) < 0
                                )
                                    for (var i=0,j=item[BODY].length; i<j; i++) {
                                        walkLevel (
                                            item[BODY][i],
                                            innerScope,
                                            targetNode[PARENT],
                                            localDeadLine,
                                            item,
                                            localChain,
                                            fileScope.concat()
                                        );
                                        localDeadLine = item[BODY][i].loc.end.line;
                                    }
                                // reduce innerScope to new keys only
                                for (var key in scope)
                                    if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                                        delete innerScope[key];
                                return item;
                            }
                            // copy the dummy's props into the members collection
                            // and rebase any methods onto the new class
                            context.latency.log ('parsing');
                            if (node[IS_COL]) {
                                if (dummy[PROPS])
                                    for (var key in dummy[PROPS]) {
                                        node[key] =
                                         targetNode[key] =
                                         rebase (dummy[PROPS][key])
                                         ;
                                        node[key][NAME][0] = '#';
                                    }
                                if (dummy[MEMBERS])
                                    for (var key in dummy[MEMBERS])
                                        node[key] =
                                         targetNode[key] =
                                         rebase (dummy[MEMBERS][key])
                                         ;
                                if (dummy[DEREF].length) {
                                    if (dummy[DEREF][0][PROPS])
                                        for (var key in dummy[DEREF][0][PROPS]) {
                                            node[key] =
                                             targetNode[key] =
                                             rebase (dummy[DEREF][0][PROPS][key])
                                             ;
                                            node[key][NAME][0] = '#';
                                        }
                                    if (dummy[DEREF][0][MEMBERS])
                                        for (var key in dummy[DEREF][0][MEMBERS])
                                            node[key] =
                                             targetNode[key] =
                                             rebase (dummy[DEREF][0][MEMBERS][key])
                                             ;
                                }
                            } else {
                                dummy = newNode (targetNode);
                                divineTypes (dummy, value.right, targetNode);
                                if (!node[MEMBERS]) {
                                    node[MEMBERS] = tools.newCollection();
                                    node[MEMBERS][PARENT] = node;
                                }
                                if (dummy[PROPS])
                                    for (var key in dummy[PROPS]) {
                                        node[MEMBERS][key] =
                                         targetNode[key] =
                                         rebase (dummy[PROPS][key])
                                         ;
                                        node[MEMBERS][key][NAME][0] = '#';
                                    }
                                if (dummy[MEMBERS])
                                    for (var key in dummy[MEMBERS])
                                        node[MEMBERS][key] =
                                         targetNode[key] =
                                         rebase (dummy[MEMBERS][key])
                                         ;
                                if (dummy[DEREF].length) {
                                    if (dummy[DEREF][0][PROPS])
                                        for (var key in dummy[DEREF][0][PROPS]) {
                                            node[MEMBERS][key] =
                                             targetNode[key] =
                                             rebase (dummy[DEREF][0][PROPS][key])
                                             ;
                                            node[MEMBERS][key][NAME][0] = '#';
                                        }
                                    if (dummy[DEREF][0][MEMBERS])
                                        for (var key in dummy[DEREF][0][MEMBERS])
                                            node[MEMBERS][key] =
                                             targetNode[key] =
                                             rebase (dummy[DEREF][0][MEMBERS][key])
                                             ;
                                }
                            }
                            context.latency.log ('cloning');
                            return [];
                        }
                        var gotTypes = divineTypes (targetNode, value.right);
                        for (var i=0,j=gotTypes.length; i<j; i++) {
                            var tstr = gotTypes[i];
                            if (node[TYPES].indexOf (tstr) < 0)
                                node[TYPES].push (tstr);
                        }
                        if (node[DEREF].indexOf (targetNode) < 0)
                            node[DEREF].push (targetNode);
                        return gotTypes;
                    } else if (value.operator == '+=') {
                        // either Number or String or Boolean
                    } else { // must be Number
                        if (node[TYPES].indexOf ('Number') < 0)
                            node[TYPES].push ('Number');
                        return [ 'Number' ];
                    }
                    break;
                case 'CallExpression':
                    // is this a require statement?
                    if (
                        value.arguments.length
                     && value.callee.type == 'Identifier'
                     && value.callee.name == 'require'
                    ) {
                        var returned = processRequireStatement (value, node);
                        if (returned && node[DEREF].indexOf (returned) < 0)
                            node[DEREF].push (returned);
                        return [];
                    }
                    var returnNode = processCallExpression (value, node, true);
                    if (!returnNode)
                        return [];
                    if (node[DEREF].indexOf (returnNode) < 0)
                        node[DEREF].push (returnNode);
                    // propagate silence
                    if (returnNode[SILENT])
                        node[SILENT] = true;
                    return [];
                case 'ClassExpression':
                    if (node[TYPES].indexOf ('Function') < 0)
                        node[TYPES].push ('Function');

                    var innerScope = filth.SafeMap (scope);

                    if (value.superClass) {
                        var superNode = getNode (scope, value.superClass);
                        if (superNode) {
                            innerScope['super'] = superNode;
                            if (node[SUPER])
                                node[SUPER].push (superNode);
                            else
                                node[SUPER] = [ superNode ];
                        }
                    }
                    if (!node[MEMBERS]) {
                        node[MEMBERS] = tools.newCollection();
                        node[MEMBERS][PARENT] = node;
                    }
                    var members = node[MEMBERS];
                    hoistNames (scope, value.body.body);
                    for (var i=0,j=value.body.body.length; i<j; i++) {
                        var declaration = value.body.body[i];
                        walkLevel (
                            declaration,
                            innerScope,
                            node,
                            declaration.loc.end.line,
                            scope,
                            fnChain,
                            fileScope.concat()
                        );
                    }

                    // clear unchanged inherited keys from the inner scope
                    for (var key in innerScope)
                        if (innerScope[key] === scope[key])
                            delete innerScope[key];

                    return [ 'Function' ];
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    if (node[TYPES].indexOf ('Function') < 0)
                        node[TYPES].push ('Function');
                    if (value.id) {
                        if (!Object.hasOwnProperty.call (scope, value.id.name)) {
                            scope[value.id.name] = newNode();
                            scope[value.id.name][NAME] = [ '.', value.id.name ];
                        }
                        scope[value.id.name][DEREF].push (node);
                    }
                    // manage arguments
                    var args;
                    var localDeadLine = deadLine;
                    var lastArg;
                    if (node[ARGUMENTS]) {
                        args = node[ARGUMENTS];
                        for (var i=0,j=value.params.length; i<j; i++) {
                            if (i < args.length) {
                                args[i][NAME] = [ '(', value.params[i].name ];
                                if (node[SILENT])
                                    args[i][SILENT] = true;
                            } else {
                                var arg = args[i] = newNode (node);
                                arg[NAME] = [ '(', value.params[i].name ];
                                arg[TYPES] = [];
                                arg[DEREF] = [];
                                arg[NO_SET] = true;
                                arg[TRANSIENT] = true;
                                arg[SILENT] = Boolean (node[SILENT]);
                            }
                            processComments (args[i], value.params[i], localDeadLine, node);
                            if (
                                lastArg
                             && value.params[i].loc.start.line !== localDeadLine
                             && value.params[i].leadingComments
                             && value.params[i].leadingComments[0].loc.start.line === localDeadLine
                            )
                                processComments (lastArg, {
                                    loc:                value.params[i-1].loc,
                                    trailingComments:   [ value.params[i].leadingComments[0] ]
                                });
                            localDeadLine = value.params[i].loc.end.line;
                            lastArg = args[i];
                        }
                    } else {
                        var lastParam;
                        args = node[ARGUMENTS] = value.params.map (function (param) {
                            var arg = newNode (node);
                            arg[NAME] = [ '(', param.name ];
                            arg[TYPES] = [];
                            arg[DEREF] = [];
                            arg[NO_SET] = true;
                            arg[TRANSIENT] = true;
                            arg[SILENT] = Boolean (node[SILENT]);
                            processComments (arg, param, localDeadLine, node);
                            if (
                                lastArg
                             && param.loc.start.line !== localDeadLine
                             && param.leadingComments
                             && param.leadingComments[0].loc.start.line === localDeadLine
                            )
                                processComments (lastArg, {
                                    loc:                lastParam.loc,
                                    trailingComments:   [ param.leadingComments[0] ]
                                });
                            localDeadLine = param.loc.end.line;
                            lastArg = arg;
                            lastParam = param;
                            return arg;
                        });
                    }
                    var innerScope = new filth.SafeMap (scope);
                    for (var i=0,j=node[ARGUMENTS].length; i<j; i++) {
                        var arg = node[ARGUMENTS][i];
                        innerScope[arg[NAME][1]] = arg;
                    }
                    node[SCOPE] = innerScope;
                    var localDeadLine = deadLine;
                    node[BODY] = value.body.body;
                    if (!node[THIS])
                        node[THIS] = value.type === 'FunctionExpression' ?
                            node
                          : localThisNode || thisNode || node
                          ;
                    hoistNames (innerScope, value.body.body);
                    if (fnChain.length < context.argv.maxDepth && fnChain.indexOf (node) < 0) {
                        var localChain = fnChain.concat();
                        localChain.push (node);
                        for (var i=0,j=value.body.body.length; i<j; i++) {
                            walkLevel (
                                value.body.body[i],
                                innerScope,
                                node[THIS],
                                localDeadLine,
                                node,
                                localChain,
                                fileScope.concat()
                            );
                            localDeadLine = value.body.body[i].loc.end.line;
                        }
                        // run any waiting call tests
                        if (node[WAITING_CALLS]) {
                            var waitingCalls = node[WAITING_CALLS];
                            delete node[WAITING_CALLS];
                            for (var i=0,j=waitingCalls.length; i<j; i++) {
                                var callPack = waitingCalls[i];
                                var waitingInnerScope = new filth.SafeMap (scope);
                                for (var k=1,l=Math.min (args.length+1, callPack.length); k<l; k++)
                                    waitingInnerScope[args[k-1][NAME][1]] = callPack[k];
                                var localDeadLine = deadLine;
                                for (var k=0,l=node[BODY].length; k<l; k++) {
                                    walkLevel (
                                        node[BODY][k],
                                        waitingInnerScope,
                                        node[THIS],
                                        localDeadLine,
                                        callPack[0],
                                        localChain,
                                        fileScope.concat()
                                    );
                                    localDeadLine = node[BODY][k].loc.end.line;
                                }
                            }
                        }
                    }
                    // reduce innerScope to new keys only
                    for (var key in scope)
                        if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                            delete innerScope[key];
                    return [ 'Function' ];
                case 'NewExpression':
                    // get the type of the item instantiated
                    var typeNode = getNode (scope, value.callee);
                    if (!typeNode)
                        return;
                    var chain = [ typeNode ];
                    while (
                        typeNode[DEREF].length == 1
                     && chain.indexOf (typeNode[DEREF][0]) < 0
                    )
                        chain.push (typeNode = typeNode[DEREF][0]);
                    if (node[INSTANCE])
                        node[INSTANCE].push (typeNode);
                    else
                        node[INSTANCE] = [ typeNode ];
                    if (typeNode[SILENT])
                        node[SILENT] = true;
                    // apply argument info to constructor
                    var args;
                    if (typeNode[ARGUMENTS])
                        args = typeNode[ARGUMENTS];
                    else
                        args = typeNode[ARGUMENTS] = [];
                    for (var i=0,j=value.arguments.length; i<j; i++) {
                        var arg;
                        if (i < args.length)
                            arg = args[i];
                        else {
                            arg = args[i] = newNode();
                            arg[NO_SET] = true;
                            arg[NAME] = [ '(', '' ];
                        }
                        divineTypes (arg, value.arguments[i]);
                        if (typeNode[SILENT])
                            arg[SILENT] = true;
                    }
                    return [];
                case 'UnaryExpression':

                case 'UpdateExpression':

                case 'LogicalExpression':

                case 'ConditionalExpression':

                default:

            }

            return [];
        }

        // get a descriptor node for the path
        function getNode (initialPointer, level, shallow) {
            if (level.computed)
                return;
            var pointer = initialPointer;
            // var silent = Boolean (initialPointer[SILENT]);
            var silent = false;

            switch (level.type) {
                case 'ObjectExpression':
                case 'Literal':
                    var dummy = newNode();
                    divineTypes (dummy, level);
                    return dummy;
                case 'ArrayExpression':
                    var dummy = newNode();
                    dummy[TYPES].push ('Array');
                    return dummy;
                case 'MemberExpression':
                    pointer = getNode (pointer, level.object, shallow);
                    if (!pointer)
                        return;
                    if (pointer[SILENT])
                        silent = true;
                    if (
                        level.object.type === 'Super'
                     || level.object.type === 'ThisExpression'
                    ) {
                        if (!pointer[MEMBERS]) {
                            pointer[MEMBERS] = tools.newCollection();
                            pointer[MEMBERS][PARENT] = pointer;
                        }
                        pointer = pointer[MEMBERS];
                    } else if (pointer[INSTANCE] && pointer[INSTANCE].length === 1) {
                        pointer = pointer[INSTANCE][0];
                        if (!pointer[MEMBERS]) {
                            pointer[MEMBERS] = tools.newCollection();
                            pointer[MEMBERS][PARENT] = pointer;
                        }
                        pointer = pointer[MEMBERS];
                    }
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
                    else {
                        pointer = pointer[level.name] = newNode (pointer);
                        pointer[NAME] = [ '.', level.name ];
                        pointer[LINE] = level.loc.start.line;
                    }
                    break;
                case 'FunctionExpression':
                case 'ArrowFunctionExpression':
                    var anon = newNode (initialPointer);
                    anon[TYPES].push ('Function');
                    anon[LINE] = level.loc.start.line;
                    var args = anon[ARGUMENTS] = [];
                    var lastArg;
                    for (var i=0,j=level.params.length; i<j; i++) {
                        var arg = newNode (initialPointer);
                        arg[NO_SET] = true;
                        arg[NAME] = [ '(', level.params[i].name ];
                        arg[TRANSIENT] = true;
                        args.push (arg);
                        processComments (arg, level.params[i], localDeadLine, node);
                        if (
                            lastArg
                         && level.params[i].loc.start.line !== localDeadLine
                         && level.params[i].leadingComments
                         && level.params[i].leadingComments[0].loc.start.line === localDeadLine
                        )
                            processComments (lastArg, {
                                loc:                level.params[i-1].loc,
                                trailingComments:   [ level.params[i].leadingComments[0] ]
                            });
                        lastArg = arg;
                        localDeadLine = level.params[i].loc.end.line;
                    }
                    anon[RETURNS] = newNode (initialPointer);
                    anon[RETURNS][TRANSIENT] = true;
                    anon[BODY] = level.body.body;
                    anon[THIS] = level.type == 'FunctionExpression' ? anon : (thisNode || anon);
                    // take our first pass through the body
                    var innerScope = anon[SCOPE] = new filth.SafeMap (scope);
                    for (var i=0,j=args.length; i<j; i++)
                        innerScope[args[i][NAME][1]] = args[i];
                    var localDeadLine = deadLine;
                    hoistNames (innerScope, level.body.body);
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            innerScope,
                            anon[THIS],
                            localDeadLine,
                            anon,
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                    // reduce innerScope to new keys only
                    for (var key in scope)
                        if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                            delete innerScope[key];
                    return anon;
                case 'NewExpression':
                    // get the type of the item instantiated
                    var typeNode = getNode (scope, level.callee);
                    if (!typeNode)
                        return;
                    var chain = [ typeNode ];
                    while (
                        typeNode[DEREF].length == 1
                     && chain.indexOf (typeNode[DEREF][0]) < 0
                    )
                        chain.push (typeNode = typeNode[DEREF][0]);
                    var dummy = newNode (initialPointer);
                    if (dummy[INSTANCE])
                        dummy[INSTANCE].push (typeNode);
                    else
                        dummy[INSTANCE] = [ typeNode ];
                    if (typeNode[SILENT])
                        dummy[SILENT] = true;
                    // apply argument info to constructor
                    var args;
                    if (typeNode[ARGUMENTS])
                        args = typeNode[ARGUMENTS];
                    else
                        args = typeNode[ARGUMENTS] = [];
                    for (var i=0,j=level.arguments.length; i<j; i++) {
                        var arg;
                        if (i < args.length)
                            arg = args[i];
                        else {
                            arg = args[i] = newNode (typeNode);
                            arg[NO_SET] = true;
                            arg[NAME] = [ '(', '' ];
                        }
                        divineTypes (arg, level.arguments[i]);
                        if (typeNode[SILENT])
                            arg[SILENT] = true;
                    }
                    return dummy;
                case 'BinaryExpression':
                    var dummy = newNode();
                    divineTypes (dummy, level, thisNode);
                    return dummy;
                default:
                    return;
            }

            var cycle = [];
            if (!shallow) {
                while (
                    pointer[DEREF]
                 && pointer[DEREF].length == 1
                 // && !pointer[TYPES].length
                 && cycle.indexOf (pointer[DEREF][0]) < 0
                )
                    cycle.push (pointer = pointer[DEREF][0]);
            }

            var stowThis;
            if (level.property) {
                if (
                    pointer[IS_COL]
                 && pointer[PARENT][INSTANCE]
                 && pointer[PARENT][INSTANCE].length === 1
                )
                    pointer = pointer[PARENT];

                if (pointer[INSTANCE] && pointer[INSTANCE].length === 1) {
                    pointer = pointer[INSTANCE][0];
                    if (!pointer[MEMBERS]) {
                        pointer[MEMBERS] = tools.newCollection();
                        pointer[MEMBERS][PARENT] = pointer;
                        pointer[MEMBERS][THIS] = pointer;
                    }
                    pointer = pointer[MEMBERS];
                    if (level.property.name === '__proto__')
                        return pointer;
                }

                if (level.property.name === 'prototype' && !pointer[IS_COL]) {
                    if (!pointer[MEMBERS]) {
                        pointer[MEMBERS] = tools.newCollection();
                        pointer[MEMBERS][PARENT] = pointer;
                        pointer[MEMBERS][THIS] = pointer;
                    }
                    return pointer[MEMBERS];
                } else if (level.property.name === '__proto__') {
                    if (pointer[IS_COL])
                        return pointer;
                    if (!pointer[MEMBERS]) {
                        pointer[MEMBERS] = tools.newCollection();
                        pointer[MEMBERS][PARENT] = pointer;
                        pointer[MEMBERS][THIS] = pointer;
                    }
                    return pointer[MEMBERS];
                }

                var lastStep = level.property.type === 'Identifier' ?
                    level.property.name
                  : level.property.value
                  ;

                stowThis = IS_COL in pointer ? pointer[PARENT][THIS] : pointer[THIS];

                var nameDelimit;
                if (pointer[IS_COL])
                    nameDelimit = '#';
                else {
                    nameDelimit = '.';
                    if (pointer[PROPS])
                        pointer = pointer[PROPS];
                    else {
                        pointer[PROPS] = tools.newCollection();
                        pointer[PROPS][PARENT] = pointer;
                        pointer = pointer[PROPS];
                    }
                }

                if (Object.hasOwnProperty.call (pointer, lastStep))
                    pointer = pointer[lastStep];
                else {
                    pointer = pointer[lastStep] = newNode (pointer[PARENT]);
                    pointer[LINE] = level.property.loc.start.line;
                    pointer[NAME] = [ nameDelimit, lastStep ];
                }

                // propagate silence
                if (silent)
                    pointer[SILENT] = true;
            }

            // gotta deref
            if (!shallow) {
                var cycle = [];
                while (
                    pointer[DEREF]
                 && pointer[DEREF].length == 1
                 && !pointer[TYPES].length
                 && cycle.indexOf (pointer[DEREF][0]) < 0
                )
                    cycle.push (pointer = pointer[DEREF][0]);
            }

            if (stowThis)
                pointer[THIS] = stowThis;

            return pointer;
        }

        function processComments (node, level, deadLine, pathParent) {
            // line in document
            if (node) {
                node[DOC] = fname;
                node[REFERER] = referer;
            }

            pathParent = pathParent && ( pathParent[THIS] || pathParent );

            // any documentation?
            // leading comments?
            var foundComment = false;
            if (level.leadingComments) {
                for (
                    var i=0,j=node ? level.leadingComments.length-1 : level.leadingComments.length;
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
                    var pathfrags;
                    if (!pathstr)
                        pathfrags = baseNode[ROOT].concat();
                    else {
                        pathfrags = parsePath (pathstr, fileScope);
                        if (!pathfrags[0][0])
                            if (pathfrags.length === 1)
                                pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                            else
                                pathfrags[0][0] = '.';
                    }

                    if (ctype === 'module') {
                        replaceElements (fileScope, pathfrags);
                        pathfrags = [];
                    }

                    parseTag (
                        context,
                        fname,
                        ctype,
                        valtype,
                        pathfrags,
                        fileScope,
                        defaultScope,
                        docstr,
                        next
                    );
                }

                // process final leading comment
                var comment = level.leadingComments[level.leadingComments.length-1];
                Patterns.tag.lastIndex = 0;
                if (comment.type !== 'Line' && (
                    deadLine === undefined
                 || comment.loc.start.line > deadLine
                 || (level.loc.start.line === deadLine && comment.loc.start.line === deadLine)
                )) {
                    foundComment = true;
                    // javadoc comment?
                    if (comment.value.match (/^\*[^*]/)) {
                        if (node)
                            parseJavadocFlavorTag (
                                comment.value,
                                node,
                                baseNode[MODULE],
                                context.argv,
                                logger
                            );
                    } else {
                        // normal or doczar comment
                        if (!(match = Patterns.tag.exec ('/*'+comment.value+'*/'))) {
                            if (node) {
                                var modPortionMatch = comment.value.match (/^[ \t]*(@[^]*)/m);
                                if (modPortionMatch && modPortionMatch[1]) {
                                    var mods = [];
                                    consumeModifiers (
                                        fname,
                                        fileScope,
                                        [],
                                        function(){},
                                        modPortionMatch[1],
                                        mods
                                    );
                                    for (var i=0,j=mods.length; i<j; i++) {
                                        if (mods[i].mod === 'blind') {
                                            node[BLIND] = true;
                                            break;
                                        }
                                    }
                                }
                                node[DOCSTR] = [ comment.value ];
                                if (fileScope.length)
                                    node[OVERRIDE] = fileScope.concat();
                            }
                        } else {
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
                            var pathfrags;
                            var workingParent;
                            if (!pathstr) {
                                if (
                                    node
                                 && ctype !== 'spare'
                                 && ctype !== 'module'
                                 && NAME in node
                                ) {
                                    pathfrags = [];
                                    pathfrags.push (node[NAME].concat());
                                    workingParent = pathParent;
                                } else
                                    pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
                            } else {
                                pathfrags = parsePath (pathstr, []);
                                if (pathfrags[0][0])
                                    workingParent = pathParent;
                                else {
                                    if (pathfrags.length === 1)
                                        if (node && node[NAME]) {
                                            pathfrags[0][0] = node[NAME][0];
                                            workingParent = pathParent;
                                        } else
                                            pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                                    else
                                        pathfrags[0][0] = '.';
                                }
                            }

                            if (!ctype)
                                ctype = Patterns.delimiters[pathfrags[0][0]];

                            if (ctype === 'module') {
                                replaceElements (fileScope, pathfrags);
                                pathfrags = [];
                            }

                            if (
                                !node
                              || ctype === 'spare'
                              || ctype === 'module'
                              || ctype === 'submodule'
                            ) {
                                // no related expression
                                parseTag (
                                    context,
                                    fname,
                                    ctype,
                                    valtype,
                                    pathfrags,
                                    fileScope,
                                    defaultScope,
                                    docstr,
                                    next
                                );
                            } else {
                                node[MOUNT] = {
                                    ctype:      ctype,
                                    path:       pathfrags,
                                    valtype:    valtype,
                                    docstr:     [ docstr ],
                                    docContext: fileScope.length ? fileScope.concat() : defaultScope.concat(),
                                    fname:      fname
                                };
                                if (workingParent)
                                    node[MOUNT].parent = workingParent;
                                node[OVERRIDE] = fileScope.length ?  fileScope.concat() : defaultScope.concat();
                                var mods = [];
                                consumeModifiers (
                                    fname,
                                    fileScope,
                                    [],
                                    function(){},
                                    docstr,
                                    mods
                                );
                                for (var i=0,j=mods.length; i<j; i++) {
                                    if (mods[i].mod === 'blind') {
                                        node[BLIND] = true;
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            if (
                node
             && level.trailingComments
             && level.trailingComments[0].loc.start.line == level.loc.end.line
            ) {
                // use a trailing comment that starts on the same line as this statement ends on
                var trailer = level.trailingComments[0];
                // only use a line comment if no other DOCSTR has been found yet.
                if (trailer.type == 'Line') {
                    if (!node[DOCSTR])
                        node[DOCSTR] = [ trailer.value ];
                } else {
                    // try to parse it
                    Patterns.tag.lastIndex = 0;
                    if (!(match = Patterns.tag.exec ('/*'+trailer.value+'*/'))) {
                        var modPortionMatch = trailer.value.match (/^[ \t]*(@[^]*)/m);
                        if (modPortionMatch && modPortionMatch[1]) {
                            var mods = [];
                            consumeModifiers (
                                fname,
                                fileScope,
                                [],
                                function(){},
                                modPortionMatch[1],
                                mods
                            );
                            for (var i=0,j=mods.length; i<j; i++) {
                                if (mods[i].mod === 'blind') {
                                    node[BLIND] = true;
                                    break;
                                }
                            }
                        }
                        if (node[DOCSTR])
                            node[DOCSTR].push (trailer.value);
                        else
                            node[DOCSTR] = [ trailer.value ];
                        if (fileScope.length)
                            node[OVERRIDE] = fileScope.concat();
                    } else {
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
                        if (!pathstr) {
                            pathfrags = [];
                            if (
                                ctype !== 'spare'
                             && ctype !== 'module'
                             && NAME in node
                            ) {
                                pathfrags = [];
                                pathfrags.push (node[NAME].concat());
                                workingParent = pathParent;
                            } else
                                pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
                        } else {
                            pathfrags = parsePath (pathstr, []);
                            if (!pathfrags[0][0])
                                if (pathfrags.length === 1)
                                    pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                                else
                                    pathfrags[0][0] = '.';
                        }

                        if (ctype === 'module') {
                            replaceElements (fileScope, pathfrags);
                            pathfrags = [];
                        }
                        if (ctype === 'spare' || ctype === 'module' || ctype === 'module') {
                            // no related expression
                            parseTag (
                                context,
                                fname,
                                ctype,
                                valtype,
                                pathfrags,
                                fileScope,
                                defaultScope,
                                docstr,
                                next
                            );
                        } else {
                            node[MOUNT] = {
                                ctype:      ctype,
                                path:       pathfrags,
                                valtype:    valtype,
                                docstr:     [ docstr ],
                                docContext: fileScope.length ? fileScope.concat() : defaultScope.concat(),
                                fname:      fname
                            };
                            node[OVERRIDE] = fileScope.length ?  fileScope.concat() : defaultScope.concat();
                            var mods = [];
                            consumeModifiers (
                                fname,
                                fileScope,
                                [],
                                function(){},
                                docstr,
                                mods
                            );
                            for (var i=0,j=mods.length; i<j; i++) {
                                if (mods[i].mod === 'blind') {
                                    node[BLIND] = true;
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            if (node && fileScope.length && !node[OVERRIDE])
                node[OVERRIDE] = fileScope;
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
                        fnChain,
                        fileScope.concat()
                    );
                    localDeadLine = moreBlocks[i].loc.end.line;
                }
                break;
            case 'ReturnStatement':
                // add return type to node
                if (!scopeParent)
                    break;
                if (scopeParent[RETURNS])
                    node = scopeParent[RETURNS];
                else {
                    node = scopeParent[RETURNS] = newNode (scopeParent);
                    node[TRANSIENT] = true;
                }
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
                    if (declaration.init.type === 'ThisExpression') {
                        var selfPointer = thisNode || newNode (scope);
                        if (!selfPointer[MEMBERS]) {
                            selfPointer[MEMBERS] = tools.newCollection();
                            selfPointer[MEMBERS][PARENT] = selfPointer;
                        }
                        node = scope[declaration.id.name] = newNode (scope);
                        node[NAME] = [ '.', declaration.id.name ];
                        node[DEREF].push (selfPointer[MEMBERS]);
                        continue;
                    }

                    if (Object.hasOwnProperty.call (scope, declaration.id.name))
                        node = scope[declaration.id.name];
                    else {
                        node = scope[declaration.id.name] = newNode (scope);
                        node[NAME] = [ '.', declaration.id.name ];
                        node[LINE] = declaration.loc.start.line;
                    }

                    // divine the type being set
                    divineTypes (node, declaration.init);
                }
                break;
            case 'ExpressionStatement':
                switch (level.expression.type) {
                    case 'AssignmentExpression':
                        if (level.expression.right.type === 'ThisExpression') {
                            // either a self pointer, or set this-type to a prop/member
                            if (level.expression.left.type === 'Identifier') {
                                // simple self pointer
                                var selfPointer = thisNode || newNode (scope);
                                if (!selfPointer[MEMBERS]) {
                                    selfPointer[MEMBERS] = tools.newCollection();
                                    selfPointer[MEMBERS][PARENT] = selfPointer;
                                }
                                node = scope[level.expression.left.name] = newNode (scope);
                                node[NAME] = [ '.', level.expression.left.name ];
                                node[DEREF].push (selfPointer[MEMBERS]);
                                node = selfPointer;
                            } else {
                                // set `this` into a prop somewhere
                            }
                            break;
                        }

                        node = getNode (scope, level.expression.left);
                        if (!node)
                            break;
                        if (node[NO_SET])
                            break;
                        if (!node[IS_COL]) {
                            // divine the type being set
                            divineTypes (node, level.expression.right);
                            break;
                        }
                        // something like Foo.prototype = {
                        // this node is the [MEMBERS] collection of Foo
                        var dummy = newNode (node[PARENT]);
                        divineTypes (dummy, level.expression.right, node[PARENT]);

                        function mergeNodes (target, source) {
                            if (source[MEMBERS])
                                if (!target[MEMBERS]) {
                                    target[MEMBERS] = tools.newCollection (source[MEMBERS])
                                    target[MEMBERS][PARENT] = target;
                                } else for (var name in source[MEMBERS]) {
                                    if (Object.hasOwnProperty.call (target[MEMBERS], name))
                                        mergeNodes (
                                            target[MEMBERS][name],
                                            source[MEMBERS][name]
                                        );
                                    else
                                        target[MEMBERS][name] = source[MEMBERS][name];
                                }
                            if (source[PROPS])
                                if (!target[PROPS]) {
                                    target[PROPS] = tools.newCollection (source[PROPS])
                                    target[PROPS][PARENT] = target;
                                } else for (var name in source[PROPS]) {
                                    if (Object.hasOwnProperty.call (target[PROPS], name))
                                        mergeNodes (
                                            target[PROPS][name],
                                            source[PROPS][name]
                                        );
                                    else
                                        target[PROPS][name] = source[PROPS][name];
                                }
                            if (source[THROWS])
                                if (!target[THROWS]) {
                                    target[THROWS] = tools.newCollection (source[THROWS])
                                    target[THROWS][PARENT] = target;
                                } else for (var name in source[THROWS]) {
                                    if (Object.hasOwnProperty.call (target[THROWS], name))
                                        mergeNodes (
                                            target[THROWS][name],
                                            source[THROWS][name]
                                        );
                                    else
                                        target[THROWS][name] = source[THROWS][name];
                                }
                            if (source[ARGUMENTS]) {
                                if (!target[ARGUMENTS])
                                    target[ARGUMENTS] = source[ARGUMENTS].concat();
                                else {
                                    var targetArgs = target[ARGUMENTS].length;
                                    for (var i=0,j=source[ARGUMENTS].length; i<j; i++)
                                        if (i < targetArgs)
                                            mergeNodes (
                                                target[ARGUMENTS][i],
                                                source[ARGUMENTS][i]
                                            );
                                        else
                                            target[ARGUMENTS][i] = source[ARGUMENTS][i];
                                }
                            }
                            if (source[RETURNS])
                                if (target[RETURNS])
                                    mergeNodes (target[RETURNS], source[RETURNS]);
                                else
                                    target[RETURNS] = source[RETURNS];
                        }

                        // rebases functions as methods
                        function rebase (item, gotChain) {
                            var chain = gotChain || fnChain;

                            // recurse to rebase methods housed on DEREF
                            if (item[DEREF] && chain.length < context.argv.maxDepth) {
                                for (var i=0,j=item[DEREF].length; i<j; i++) {
                                    var subItem = item[DEREF][i];
                                    if (chain.indexOf (subItem) >= 0)
                                        continue;
                                    var localChain = chain.concat();
                                    localChain.push (subItem);
                                    rebase (subItem, localChain);
                                }
                            }

                            if (!item[BODY])
                                return gotChain ?
                                    item
                                  : filth.circularClone (item, undefined, cloneShallowFilter)
                                  ;

                            // re-parse the body of this method using the new `this`
                            var args = ARGUMENTS in item ?
                                item[ARGUMENTS]
                              : item[ARGUMENTS] = []
                              ;
                            // run call test
                            var innerScope = new filth.SafeMap (scope, item[SCOPE]);
                            for (var i=0,j=args.length; i<j; i++) {
                                var argNode = args[i];
                                var dummy = newNode (argNode);
                                if (item[SILENT])
                                    dummy[SILENT] = true;
                                dummy[DEREF].push (argNode);
                                dummy[NO_SET] = true;
                                innerScope[argNode[NAME][1]] = dummy;
                            }
                            if (
                                fnChain.length < context.argv.maxDepth
                             && fnChain.indexOf (item) < 0
                            ) {
                                var localChain = chain.concat();
                                localChain.push (item);
                                for (var i=0,j=item[BODY].length; i<j; i++) {
                                    walkLevel (
                                        item[BODY][i],
                                        innerScope,
                                        node[PARENT],
                                        localDeadLine,
                                        item,
                                        localChain,
                                        fileScope.concat()
                                    );
                                    localDeadLine = item[BODY][i].loc.end.line;
                                }
                            }
                            // reduce innerScope to new keys only
                            for (var key in scope)
                                if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                                    delete innerScope[key];

                            if (item[MEMBERS]) {
                                for (var name in item[MEMBERS])
                                    if (Object.hasOwnProperty.call (node, name))
                                        mergeNodes (node[name], item[MEMBERS][name]);
                                    else
                                        node[name] = item[MEMBERS][name];
                                delete item[MEMBERS];
                            }
                            return item;
                        }

                        // copy the dummy's props into the members collection
                        context.latency.log ('parsing');

                        function cloneChildren (source) {
                            if (source[PROPS])
                                for (var key in source[PROPS])
                                    node[key] =
                                     rebase (source[PROPS][key])
                                     ;
                            if (source[MEMBERS])
                                for (var key in source[MEMBERS])
                                    node[key] =
                                     rebase (source[MEMBERS][key])
                                     ;
                            if (source[DEREF])
                                for (var i=0,j=source[DEREF].length; i<j; i++)
                                    cloneChildren (source[DEREF][i]);
                        }
                        cloneChildren (dummy);
                        context.latency.log ('cloning');
                        node = node[PARENT];
                        break;
                    case 'CallExpression':
                        if (
                            level.expression.arguments.length
                         && level.expression.callee.type == 'Identifier'
                         && level.expression.callee.name == 'require'
                        )
                            processRequireStatement (level.expression);
                        else
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
                        if (node[TYPES].indexOf ('Number') < 0)
                            node[TYPES].push ('Number');
                        break;
                    case 'LogicalExpression':
                        // step into both terms
                        walkLevel (
                            level.expression.left,
                            scope,
                            thisNode,
                            deadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
                        );
                        if (level.expression.consequent.loc.end.line != level.expression.alternate.loc.start.line)
                            localDeadLine = level.expression.consequent.loc.end.line;
                        walkLevel (
                            level.expression.alternate,
                            scope,
                            thisNode,
                            localDeadLine,
                            scopeParent,
                            fnChain,
                            fileScope.concat()
                        );
                        break;
                    case 'NewExpression':
                        // get the type of the item instantiated
                        var typeNode = getNode (scope, level.expression.callee);
                        if (!typeNode)
                            return;
                        var chain = [ typeNode ];
                        while (
                            typeNode[DEREF].length == 1
                         && chain.indexOf (typeNode[DEREF][0]) < 0
                        )
                            chain.push (typeNode = typeNode[DEREF][0]);
                        // apply argument info to constructor
                        var args;
                        if (typeNode[ARGUMENTS])
                            args = typeNode[ARGUMENTS];
                        else
                            args = typeNode[ARGUMENTS] = [];
                        for (var i=0,j=level.expression.arguments.length; i<j; i++) {
                            var arg;
                            if (i < args.length)
                                arg = args[i];
                            else {
                                arg = args[i] = newNode (typeNode);
                                arg[NO_SET] = true;
                                arg[NAME] = [ '(', '' ];
                            }
                            divineTypes (arg, level.expression.arguments[i]);
                            if (typeNode[SILENT])
                                arg[SILENT] = true;
                        }
                    default:
                        logger.trace (
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
                    fnChain,
                    fileScope.concat()
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
                    fnChain,
                    fileScope.concat()
                );
                if (level.consequent.loc.end.line != level.alternate.loc.start.line)
                    localDeadLine = level.consequent.loc.end.line;
                walkLevel (
                    level.alternate,
                    scope,
                    thisNode,
                    localDeadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );
                break;
            case 'FunctionDeclaration':
                if (!level.id)
                    break;
                node = getNode (scope, level.id);
                if (!node)
                    break;
                if (node[TYPES].indexOf ('Function') < 0)
                    node[TYPES].push ('Function');
                var args;
                if (node[ARGUMENTS])
                    args = node[ARGUMENTS];
                else
                    args = node[ARGUMENTS] = [];

                // work argument types for the function
                var lastI = args.length-1;
                var localDeadLine = deadLine;
                var lastArg;
                for (var i=0,j=level.params.length; i<j; i++) {
                    var param = level.params[i];
                    if (i < args.length)
                        args[i][NAME] = [ '(', param.name ];
                    else {
                        var arg = args[i] = newNode (node);
                        arg[NAME] = [ '(', param.name ];
                        arg[TYPES] = [];
                        arg[DEREF] = [];
                        arg[NO_SET] = true;
                    }
                    divineTypes (param, args[i]);
                    processComments (args[i], param, localDeadLine, node);
                    if (
                        lastArg
                     && level.params[i].loc.start.line !== localDeadLine
                     && level.params[i].leadingComments
                     && level.params[i].leadingComments[0].loc.start.line === localDeadLine
                    )
                        processComments (lastArg, {
                            loc:                level.params[i-1].loc,
                            trailingComments:   [ level.params[i].leadingComments[0] ]
                        });
                    lastArg = args[i];
                    localDeadLine = param.loc.end.line;
                }

                // recurse into function body
                var target = node;
                if (target[TYPES].indexOf ('Function') < 0)
                    target[TYPES].push ('Function');
                var innerScope = new filth.SafeMap (scope);
                for (var i=0,j=args.length; i<j; i++) {
                    var arg = args[i];
                    innerScope[arg[NAME][1]] = arg;
                }
                node[SCOPE] = innerScope;
                var localDeadLine = deadLine;
                node[BODY] = level.body.body; // comment to stop recursion crashes
                node[THIS] = node;
                hoistNames (innerScope, level.body.body);
                if (fnChain.length < context.argv.maxDepth && fnChain.indexOf (node) < 0) {
                    var localChain = fnChain.concat();
                    localChain.push (node);
                    for (var i=0,j=level.body.body.length; i<j; i++) {
                        walkLevel (
                            level.body.body[i],
                            innerScope,
                            node,
                            localDeadLine,
                            target,
                            localChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                    // run any waiting call tests
                    if (node[WAITING_CALLS]) {
                        var waitingCalls = node[WAITING_CALLS];
                        delete node[WAITING_CALLS];
                        for (var i=0,j=waitingCalls.length; i<j; i++) {
                            var callPack = waitingCalls[i];
                            var waitingInnerScope = new filth.SafeMap (scope);
                            for (var k=1,l=Math.min (args.length+1, callPack.length); k<l; k++)
                                waitingInnerScope[args[k-1][NAME][1]] = callPack[k];
                            var localDeadLine = deadLine;
                            for (var k=0,l=level.body.body.length; k<l; k++) {
                                walkLevel (
                                    level.body.body[k],
                                    waitingInnerScope,
                                    node || thisNode,
                                    localDeadLine,
                                    callPack[0],
                                    localChain,
                                    fileScope.concat()
                                );
                                localDeadLine = level.body.body[k].loc.end.line;
                            }
                        }
                    }
                }
                // reduce scope to new keys only
                for (var key in scope)
                    if (scope[key] === innerScope[key] || innerScope[key] === undefined)
                        delete innerScope[key];
                break;
            case 'IfStatement':
                // perform a dummy type check on the test
                // recurses to walk any assignment statements
                divineTypes (newNode (baseNode), level.test);

                // walk the consequent
                if (level.consequent.type != 'BlockStatement')
                    walkLevel (
                        level.consequent,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
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
                                fnChain,
                                fileScope.concat()
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
                        fnChain,
                        fileScope.concat()
                    );
                if (level.test)
                    walkLevel (
                        level.test,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );
                if (level.update)
                    walkLevel (
                        level.update,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
                    );

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
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
                    logger.trace ({
                        type:       level.type,
                        line:       level.loc.start.line,
                        iterator:   level.left,
                        iterating:  level.right
                    }, 'malformed for loop');
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
                        fnChain,
                        fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'WhileStatement':
            case 'DoWhileStatement':
                // perform a dummy type check on the test
                // recurses to walk any assignment statements
                divineTypes (newNode (baseNode), level.test);

                // walk the body
                if (level.body.type != 'BlockStatement')
                    walkLevel (
                        level.body,
                        scope,
                        thisNode,
                        deadLine,
                        scopeParent,
                        fnChain,
                        fileScope.concat()
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
                            fnChain,
                            fileScope.concat()
                        );
                        localDeadLine = level.body.body[i].loc.end.line;
                    }
                }
                break;
            case 'ExportDefaultDeclaration':
                var targetNode = baseNode[pathLib.parse (fname).name];

                if (!level.declaration)
                    break;

                node = walkLevel (
                    level.declaration,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );

                break;
            case 'ExportNamedDeclaration':
                // step into declaration
                if (!scope[EXPORTS])
                    scope[EXPORTS] = newNode (scope);
                if (!level.declaration)
                    break;

                node = walkLevel (
                    level.declaration,
                    scope,
                    thisNode,
                    deadLine,
                    scopeParent,
                    fnChain,
                    fileScope.concat()
                );

                break;
            case 'ImportDeclaration':
                // already hoisted
                break;
            case 'ClassDeclaration':
                var className = level.id.name;
                if (Object.hasOwnProperty.call (scope, className))
                    node = scope[className];
                else {
                    node = scope[className] = newNode (scope);
                    node[LINE] = level.loc.start.line;
                }
                if (node[TYPES] && node[TYPES].indexOf ('Function') < 0)
                    node[TYPES].push ('Function');

                var innerScope = filth.SafeMap (scope);

                if (level.superClass) {
                    var superNode = getNode (scope, level.superClass);
                    if (superNode) {
                        innerScope['super'] = superNode;
                        if (node[SUPER])
                            node[SUPER].push (superNode);
                        else
                            node[SUPER] = [ superNode ];
                    }
                }
                if (!node[MEMBERS]) {
                    node[MEMBERS] = tools.newCollection();
                    node[MEMBERS][PARENT] = node;
                }
                var members = node[MEMBERS];
                for (var i=0,j=level.body.body.length; i<j; i++) {
                    var declaration = level.body.body[i];
                    walkLevel (
                        declaration,
                        innerScope,
                        node,
                        declaration.loc.end.line,
                        scope,
                        fnChain,
                        fileScope.concat()
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
                else if (Object.hasOwnProperty.call (thisNode[MEMBERS], level.key.name))
                    node = thisNode[MEMBERS][level.key.name];
                else {
                    node = thisNode[MEMBERS][level.key.name] = newNode (thisNode);
                    node[LINE] = level.loc.start.line;
                }
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
                if (scopeParent[THROWS])
                    node = scopeParent[THROWS];
                else
                    node = scopeParent[THROWS] = newNode (scopeParent);
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
                    fnChain,
                    fileScope.concat()
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
                    fnChain,
                    fileScope.concat()
                );
                break;
            case 'CallExpression':
                processCallExpression (level);
                break;
            default:
                // unknown statement type
                logger.trace (
                    { type:level.type, line:level.loc.start.line },
                    'unknown statement type'
                );
                break;
        }

        // comments time!
        processComments (node, level, deadLine, scopeParent);
        return node;
    }

    // hoist ES6 import and export-as statements
    for (var i=0,j=tree.body.length; i<j; i++) {
        var level = tree.body[i];
        switch (level.type) {
            case 'ImportDeclaration':
                var importName = level.source.value[0] == '/' ?
                    pathLib.resolve (context.argv.fileRoot, importName.slice (1))
                  : level.source.value.slice (0, 2) == './' ?
                        level.source.value
                      : './' + level.source.value
                      ;
                var pathInfo = langPack.getDependency (
                    context,
                    pathLib.resolve (process.cwd(), referer),
                    fname,
                    baseNode[MODULE],
                    importName
                );
                // if there's no path info, an error occured and was logged
                if (!pathInfo)
                    break;
                var moduleNode = langPack.getRoot (context, pathInfo.file, pathInfo.root, pathInfo.path);
                next (pathInfo.file, pathInfo.referer || referer);

                // first check if it's `import * as ModName from "foo.js"`
                if (level.specifiers[0].type == "ImportNamespaceSpecifier") {
                    var localNode;
                    if (Object.hasOwnProperty.call (baseNode, level.specifiers[0].local.name))
                        localNode = baseNode[level.specifiers[0].local.name];
                    else
                        localNode = baseNode[level.specifiers[0].local.name] = newNode (baseNode);
                    localNode[DEREF].push (moduleNode[EXPORTS]);
                    localNode[ALIAS] = moduleNode[EXPORTS];
                } else // iterate import specifiers
                    for (var k=0,l=level.specifiers.length; k<l; k++) {
                        var spec = level.specifiers[k];
                        var foreign;
                        var source = spec.imported || spec.local;
                        if (Object.hasOwnProperty.call (
                            moduleNode[EXPORTS][PROPS],
                            source.name
                        ))
                            foreign = moduleNode[EXPORTS][PROPS][source.name];
                        else
                            foreign
                             = moduleNode[EXPORTS][PROPS][source.name]
                             = newNode (moduleNode)
                             ;
                        var localNode;
                        if (Object.hasOwnProperty.call (baseNode, spec.local.name))
                            localNode = baseNode[spec.local.name];
                        else
                            localNode = baseNode[spec.local.name] = newNode (baseNode);
                        localNode[DEREF].push (foreign);
                        localNode[ALIAS] = foreign;
                    }
                break;
            case 'ExportDefaultDeclaration':
                if (!baseNode[EXPORTS][PROPS])
                    baseNode[EXPORTS][PROPS] = tools.newCollection();
                var defaultName = pathLib.parse (fname).name;
                if (Object.hasOwnProperty.call (baseNode[EXPORTS][PROPS], defaultName))
                    node = baseNode[EXPORTS][PROPS][defaultName];
                else
                    node = baseNode[EXPORTS][PROPS][defaultName] = newNode (baseNode);
                if (level.declaration.id) // place in the local scope
                    baseNode[level.declaration.id.name] = node;
                break;
            case 'ExportNamedDeclaration':
                if (!level.specifiers)
                    break;
                for (var k=0,l=level.specifiers.length; k<l; k++) {
                    var spec = level.specifiers[k];
                    if (Object.hasOwnProperty.call (
                        baseNode[EXPORTS][PROPS],
                        spec.exported.name
                    ))
                        node
                         = baseNode[spec.local.name]
                         = baseNode[EXPORTS][PROPS][spec.exported.name]
                         ;
                    else
                        node
                         = baseNode[spec.local.name]
                         = baseNode[EXPORTS][PROPS][spec.exported.name]
                         = newNode (baseNode)
                         ;
                }
                if (level.specifiers.length !== 1)
                    node = undefined;
                break;
        }
    }

    // push any pre-configured ES6 exports into the scope to be picked up later
    if (baseNode[EXPORTS]) for (var name in baseNode[EXPORTS][PROPS]) {
        var specimen = baseNode[EXPORTS][PROPS][name];
        if (specimen[LOCAL_NAME])
            continue;
        specimen[LOCAL_NAME] = name;
        baseNode[name] = specimen;
    }

    // hoist the body's names
    hoistNames (baseNode, tree.body);

    // normal body processing
    var fileScope = [];
    for (var i=0,j=tree.body.length; i<j; i++) {
        walkLevel (
            tree.body[i],
            baseNode,
            undefined,
            i ? tree.body[i-1].loc.end.line : 0,
            undefined,
            [ tree.body[i] ],
            fileScope
        );
    }

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
            var pathfrags;
            if (!pathstr)
                pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
            else {
                pathfrags = parsePath (pathstr, []);
                if (!pathfrags[0][0])
                    if (pathfrags.length === 1)
                        pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                    else
                        pathfrags[0][0] = '.';
            }

            if (ctype === 'module') {
                fileScope = pathfrags.concat();
                pathfrags = [];
            }

            parseTag (
                context,
                fname,
                ctype,
                valtype,
                pathfrags,
                fileScope,
                defaultScope,
                docstr,
                next
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
        var pathfrags;
        if (!pathstr)
            pathfrags = fileScope.length ? [] : baseNode[ROOT].concat();
        else {
            pathfrags = parsePath (pathstr, []);
            if (!pathfrags[0][0])
                if (pathfrags.length === 1)
                    pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                else
                    pathfrags[0][0] = '.';
        }

        if (ctype === 'module') {
            fileScope = pathfrags.concat();
            pathfrags = [];
        }

        parseTag (
            context,
            fname,
            ctype,
            valtype,
            pathfrags,
            fileScope,
            defaultScope,
            docstr,
            next
        );
    }
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
function generateComponents (context, mode, defaultScope) {
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
                parseType (level[TYPES].concat().join ('|'), localDefault, true)
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
            var fullpath = level[PATH] = concatPaths (localDefault, path);
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
                        types.push (parseType ('class')[0]);
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
                parseTag (
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
                    if (level[MODULE] && !pathsEqual (level[MODULE], context.argv.root))
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
            parseTag (
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
            var fullpath = concatPaths (localDefault, level[LOCALPATH]);
            if (level[LINE]) {
                var lineDoc = {
                    sourceFile: pathLib.relative (level[REFERER], level[DOC]),
                    sourceLine: level[LINE]
                };
                if (level[MODULE] && !pathsEqual (level[MODULE], context.argv.root))
                    lineDoc.sourceModule = level[MODULE];
                context.submit (
                    concatPaths (localDefault, level[LOCALPATH]),
                    lineDoc
                );
            }
        } else {
            // alias?
            if (force && !pathsEqual (scope, level[LOCALPATH])) {
                context.submit (concatPaths (localDefault, scope), {
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
                    parseTag (
                        context,
                        level[DOC],
                        level[CTYPE],
                        parseType (typePath, [], true),
                        scope,
                        localDefault,
                        [],
                        [],
                        function (fname) { nextFiles.push (fname); }
                    );
                    var fullpath = concatPaths (localDefault, scope);
                    if (level[LINE]) {
                        var lineDoc = {
                            sourceFile: pathLib.relative (level[REFERER], level[DOC]),
                            sourceLine: level[LINE]
                        };
                        if (level[MODULE] && !pathsEqual (level[MODULE], context.argv.root))
                            lineDoc.sourceModule = level[MODULE];
                        context.submit (concatPaths (localDefault, scope), lineDoc);
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
                    concatPaths (scope, [ [ '#', key ] ]),
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
                    concatPaths (scope, [ [ '.', key ] ]),
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
                    concatPaths (scope, [ [ '(', i ] ]),
                    localDefault,
                    chain,
                    force
                );
            }

        if (level[RETURNS] && level[RETURNS][TYPES].length)
            didSubmit += submitSourceLevel (
                level[RETURNS],
                concatPaths (scope, [ [ ')', 0 ] ]),
                localDefault,
                chain,
                force
            );

        if (level[THROWS])
            didSubmit += submitSourceLevel (
                level[THROWS],
                concatPaths (scope, [ [ '!', undefined ] ]),
                localDefault,
                chain,
                force
            );

        for (var key in level)
            didSubmit += submitSourceLevel (
                level[key],
                concatPaths (scope, [ [ '.', key ] ]),
                localDefault,
                chain
            );

        if (level[SCOPE])
            for (var key in level[SCOPE])
                didSubmit += submitSourceLevel (
                    level[SCOPE][key],
                    concatPaths (scope, [ [ '%', key ] ]),
                    localDefault,
                    chain
                );

        delete level[SCOPE];
        return didSubmit;
    }

    // fish up the appropriate language pack
    var langPack = langs[mode];

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
    parseFile:              parseFile,
    parsePath:              parsePath,
    parseType:              parseType,
    parseTag:               parseTag,
    parseJavadocFlavorTag:  parseJavadocFlavorTag,
    parseSyntaxFile:        parseSyntaxFile,
    generateComponents:     generateComponents
};
