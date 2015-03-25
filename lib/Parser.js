
/**     @module doczar.Parser
    Digs document comments out of source files, splits them into Declarations and Modifiers, then
    reports everything it finds to a [ComponentCache](doczar.ComponentCache) instance.
*/

var fs = require ('fs');
var path = require ('path');
var Patterns = require ('./Patterns');

// handy helpers
var concatArrs = function(){
    var out = [];
    for (var i in arguments)
        if (arguments[i])
            out.push.apply (out, arguments[i]);
    return out;
};
var cloneArr = function (a) {
    var b = [];
    b.push.apply (b, a);
    return b;
}

/**     @property/Function parseFile
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
var parseFile = function (fname, context, callback) {
    fs.readFile (fname, function (err, buf) {
        if (err)
            return callback (err);
        var fstr = buf.toString ('utf8');

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

                continue;
            }

            // normal declaration
            var ctype = match[1];
            // valtypes
            var valtype = [];
            if (match[2]) {
                // split to individual types with generics
                var valtypeSelectorInfo = match[2].split(Patterns.typeSelectorWord);
                for (var i=0,j=valtypeSelectorInfo.length-1; i<j; i+=4) {
                    var generics = !valtypeSelectorInfo[i+3] ? [] : valtypeSelectorInfo[i+3]
                        .split(',')
                        .map(function(z){
                            var outPath = [];
                            var genericStr = z.replace (/\s/g, '');
                            var genericTypeMatch;
                            while (genericTypeMatch = Patterns.word.exec (vtstr))
                                valtypefrags.push ([ genericTypeMatch[1], genericTypeMatch[2] ]);
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
                    var valtypefrags = [];
                    var valtypeMatch;
                    while (valtypeMatch = Patterns.word.exec (vtstr))
                        valtypefrags.push ([ valtypeMatch[1], valtypeMatch[2] ]);
                    if (valtypefrags[0][0] === undefined)
                        valtypefrags[0][0] = '.';
                    else
                        valtypefrags = concatArrs (fileScope, valtypefrags);
                    uglyvaltypepath = '';
                    for (var k in valtypefrags)
                        uglyvaltypepath +=
                            (valtypefrags[k][0] || '.')
                          + valtypefrags[k][1]
                          ;
                    valtype.push ({
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
            }
            var pathstr = match[3];
            var docstr = match[4] || '';

            var pathfrags = [];
            var pathMatch;
            if (pathstr[0] == '`')
                pathfrags.push ([
                    Patterns.delimitersInverse[ctype] || '.',
                    pathstr.slice (1, pathstr.length - 1)
                ]);
            else
                while (pathMatch = Patterns.word.exec (pathstr))
                    if (pathMatch[0])
                        pathfrags.push ([ pathMatch[1], pathMatch[2] ]);
                    else {
                        if (!pathMatch.length)
                            pathMatch.push ([]);
                        break;
                    }
            if (!pathfrags[0][0])
                if (pathfrags.length == 1)
                    pathfrags[0][0] = Patterns.delimitersInverse[ctype] || '.';
                else
                    pathfrags[0][0] = '.';

            var tagScope = concatArrs (fileScope, pathfrags);
            if (ctype == 'module')
                fileScope = cloneArr (tagScope);

            // consume modifiers
            var modifiers = [];
            var modmatch;
            while (modmatch = docstr.match (Patterns.modifier)) {
                var modDoc = { mod:modmatch[1] };
                var modpath = modmatch[2];

                var pathfrags = [];
                if (modpath) {
                    var fragmatch;

                    if (modpath[0] == '`')
                        pathfrags.push ([
                            Patterns.delimitersInverse[ctype] || '.',
                            modpath.slice (1, modpath.length - 1)
                        ]);
                    else
                        while (fragmatch = Patterns.word.exec (modpath))
                            pathfrags.push ([ fragmatch[1], fragmatch[2] ]);

                    // while (fragmatch = Patterns.word.exec (modpath))
                    //     pathfrags.push ([ fragmatch[1], fragmatch[2] ]);
                    if (!pathfrags[0][0])
                        pathfrags[0][0] = '.';
                    else
                        pathfrags = concatArrs (fileScope, pathfrags);
                    modDoc.path = pathfrags;
                }

                if (modDoc.mod == 'root')
                    fileScope = cloneArr (modpath ? mparr : tagScope);
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
                    continue;
                } catch (err) {
                    console.log (('\nfatal error in source file '+fname).red);
                    console.log (match[0]);
                    throw err;
                }
            }

            var inctype = ctype;
            var invaltype = valtype;
            var inscope = [];
            var argscope = [];
            var inpathstr = innerMatch[3];
            var inpathfrags = [];
            var insigargs;
            var pathMatch;
            var linkScope = cloneArr (fileScope);
            do {
                if (
                    inctype == 'callback'
                 || inctype == 'argument'
                 || inctype == 'kwarg'
                 || inctype == 'returns'
                 || inctype == 'signature'
                ) {
                    submissionPath = concatArrs (argscope, inpathfrags);
                } else if (inctype != 'load')
                    submissionPath = concatArrs (tagScope, inpathfrags);

                // any chance this is just a @load declaration?
                if (inctype == 'load') {
                    var filename = path.resolve (
                        path.dirname (fname),
                        docstr.slice (0, innerMatch.index).replace (/^\s*/, '').replace (/\s*$/, '')
                    );
                    lastComponent = context.submit (
                        submissionPath,
                        { doc: { value:fs.readFileSync (filename).toString() } }
                    );
                } else {
                    // submit the previous match
                    try {
                        lastComponent = context.submit (
                            submissionPath,
                            {
                                ctype:      inctype,
                                valtype:    invaltype,
                                doc:        { value:docstr.slice (0, innerMatch.index), context:linkScope },
                                modifiers:  modifiers,
                                sigargs:    insigargs
                            }
                        );
                    } catch (err) {
                        console.log (('\nfatal error in source file '+fname).red);
                        throw err;
                    }
                }
                if (inctype == 'returns') {
                    if (!inpathstr)
                        argscope.pop();
                } else if (inctype != 'argument' && inctype != 'kwarg' && inctype != 'returns' && inctype != 'signature')
                    argscope = cloneArr (lastComponent ? lastComponent.path : []);

                // prepare the next submission
                linkScope = cloneArr (fileScope);
                modifiers = [];
                inctype = innerMatch[1];
                invaltype = innerMatch[2];
                inpathstr = innerMatch[3];
                docstr = innerMatch[4];
                if (inctype == 'signature') {
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
                                valtypefrags = concatArrs (fileScope, valtypefrags);
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

                inpathfrags = [];
                var pathMatch;
                if (inpathstr) {

                    if (inpathstr[0] == '`')
                        inpathfrags.push ([
                            Patterns.delimitersInverse[inctype] || '.',
                            inpathstr.slice (1, inpathstr.length - 1)
                        ]);
                    else
                        while (pathMatch = Patterns.word.exec (inpathstr))
                            inpathfrags.push ([ pathMatch[1], pathMatch[2] ]);

                    // while (pathMatch = Patterns.word.exec (inpathstr))
                    //     inpathfrags.push ([ pathMatch[1], pathMatch[2] ]);
                } else inpathfrags.push ([]);
                // direct-to-type syntax
                if (!Patterns.innerCtypes.hasOwnProperty (inctype)) {
                    invaltype = inctype;
                    if (inpathfrags[inpathfrags.length-1][0] == '#')
                        inctype = 'member';
                    else
                        inctype = 'property';
                }
                // every path, even those on global, must start with a delimiter, however
                // it is usually added automatically
                if (inpathfrags[0] && !inpathfrags[0][0])
                    inpathfrags[0][0] = Patterns.delimitersInverse[inctype] || '.';

                if (!invaltype)
                    invaltype = [];
                else {
                    var typeSelectorInfo = invaltype.split(Patterns.typeSelectorWord);
                    invaltype = [];
                    for (var i=0,j=typeSelectorInfo.length-1; i<j; i+=4) {
                        var generics = !typeSelectorInfo[i+3] ? [] : typeSelectorInfo[i+3]
                            .split(',')
                            .map(function(z){
                                var genericStr = z.replace (/\s/g, '');
                                var outPath = [];
                                var genericTypeMatch;
                                while (genericTypeMatch = Patterns.word.exec (genericStr))
                                    outPath.push ([ genericTypeMatch[1], genericTypeMatch[2] ]);
                                if (!outPath[0][0])
                                    outPath[0][0] = '.';
                                else
                                    outPath = concatArrs (fileScope, outPath);

                                var uglyPath = '';
                                for (var i in outPath)
                                    uglyPath += (outPath[i][0] || '.') + outPath[i][1];

                                return {
                                    name:       uglyPath.slice (1),
                                    path:       outPath
                                };
                            })
                            ;

                        var vtstr = typeSelectorInfo[i+1];
                        var valtypefrags = [];
                        var valtypeMatch;
                        while (valtypeMatch = Patterns.word.exec (vtstr))
                            valtypefrags.push ([ valtypeMatch[1], valtypeMatch[2] ]);
                        if (valtypefrags[0][0] === undefined)
                            valtypefrags[0][0] = '.';
                        else
                            valtypefrags = concatArrs (fileScope, valtypefrags);
                        var uglyValtype = '';
                        for (var k in valtypefrags)
                            uglyValtype += (valtypefrags[k][0] || '.') + valtypefrags[k][1];
                        invaltype.push ({
                            path:       valtypefrags,
                            isPointer:  Boolean (typeSelectorInfo[i+2]),
                            isArray:    Boolean (
                                typeSelectorInfo[i+3] !== undefined
                             && typeSelectorInfo[i+3].match (/^[ \\t]*$/)
                            ),
                            generics:   generics,
                            name:       uglyValtype.slice (1)
                        });
                    }
                }

                // consume modifiers
                var modmatch;
                while (modmatch = docstr.match (Patterns.modifier)) {
                    var modDoc = { mod:modmatch[1] };
                    var modpath = modmatch[2];

                    if (modpath) {
                        var pathfrags = [];
                        var fragmatch;

                        if (modpath[0] == '`')
                            pathfrags.push ([
                                Patterns.delimitersInverse[ctype] || '.',
                                modpath.slice (1, modpath.length - 1)
                            ]);
                        else
                            while (fragmatch = Patterns.word.exec (modpath))
                                pathfrags.push ([ fragmatch[1], fragmatch[2] ]);

                        // while (fragmatch = Patterns.word.exec (modpath))
                        //     pathfrags.push ([ fragmatch[1], fragmatch[2] ]);
                        if (!pathfrags[0][0])
                            pathfrags[0][0] = '.';
                        else
                            pathfrags = concatArrs (fileScope, pathfrags);
                        modDoc.path = pathfrags;
                    }

                    if (modDoc.mod == 'root')
                        fileScope = cloneArr (modpath ? mparr : tagScope);
                    else
                        modifiers.push (modDoc);

                    docstr = docstr.slice (modmatch[0].length);
                }

                // some tags affect the scope
                if (inctype == 'module') {
                    fileScope.push.apply (fileScope, inpathfrags);
                    tagScope.push.apply (tagScope, inpathfrags);
                }

            } while (docstr && (innerMatch = docstr.match (Patterns.innerTag)));

            // submit the final match from this tag
            var submissionPath
            if (
                inctype == 'callback'
             || inctype == 'argument'
             || inctype == 'returns'
             || inctype == 'kwarg'
             || inctype == 'signature'
            )
                submissionPath = concatArrs (argscope, inpathfrags);
            // else if (inctype == 'signature')
            //     submissionPath = argscope;
            else if (inctype != 'load')
                submissionPath = concatArrs (tagScope, inpathfrags);

            // consume modifiers
            var modmatch;
            while (modmatch = docstr.match (Patterns.modifier)) {
                var modDoc = { mod:modmatch[1] };
                var modpath = modmatch[2];

                if (modpath) {
                    var pathfrags = [];
                    var fragmatch;

                    if (modpath[0] == '`')
                        pathfrags.push ([
                            Patterns.delimitersInverse[ctype] || '.',
                            modpath.slice (1, modpath.length - 1)
                        ]);
                    else
                        while (fragmatch = Patterns.word.exec (modpath))
                            pathfrags.push ([ fragmatch[1], fragmatch[2] ]);

                    // while (fragmatch = Patterns.word.exec (modpath))
                    //     pathfrags.push ([ fragmatch[1], fragmatch[2] ]);
                    if (!pathfrags[0][0])
                        pathfrags[0][0] = '.';
                    else
                        pathfrags = concatArrs (fileScope, pathfrags);
                    modDoc.path = pathfrags;
                }
                modifiers.push (modDoc);
                docstr = docstr.slice (modmatch[0].length);
            }

            // any chance this is just a @load declaration?
            if (inctype == 'load') {
                var filename = path.resolve (
                    path.dirname (fname),
                    docstr.replace (/^\s*/, '').replace (/\s*$/, '')
                );
                lastComponent = context.submit (
                    submissionPath,
                    { doc: { value:fs.readFileSync (filename).toString() } }
                );
            } else {
                try {
                    lastComponent = context.submit (
                        submissionPath,
                        {
                            ctype:      inctype,
                            valtype:    invaltype,
                            doc:        { value:docstr, context:linkScope },
                            modifiers:  modifiers
                        }
                    );
                } catch (err) {
                    console.log (('\nfatal error in source file '+fname).red);
                    throw err;
                }
            }
        }
        return callback();
    });
};

module.exports.parseFile = parseFile;
