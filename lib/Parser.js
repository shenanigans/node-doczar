
/**     @module doczar.Parser
    Digs document comments out of source files, splits them into Declarations and Modifiers, then
    reports everything it finds to a [ComponentCache](doczar.ComponentCache) instance.
*/

var fs = require ('fs');
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
    Submit every Modifier and Declaration in a single source file to a [ComponentCache]()
    instance.
@argument/String fname
@argument/ComponentCache context
@argument/Object options
@callback callback
    @argument/Error err
*/
var parseFile = function (fname, context, options, callback) {
    if (options.verbose)
        console.log (('reading file ').green+fname.white);
    fs.readFile (fname, function (err, buf) {
        if (err)
            return callback (err);
        var fstr = buf.toString ('utf8');

        var fileScope = [];
        var match;
        var lastComponent;
        while (match = Patterns.tag.exec (fstr)) {
            var ctype = match[1];
            var valtype = [];
            if (match[2]) {
                valtype = [];
                var typeSelectorInfo = match[2].split(Patterns.typeSelectorWord);
                for (var i=0,j=typeSelectorInfo.length-1; i<j; i+=3) {
                    var generics = !typeSelectorInfo[i+2] ? [] : typeSelectorInfo[i+2]
                        .split(',')
                        .map(function(z){
                            var frags = z.replace (/\s/g, '').split (Patterns.word);
                            var outPath = [];
                            for (var i=0,j=frags.length-1; i<j; i+=3)
                                outPath.push ([ frags[i+1] || '.', frags[i+2] ]);
                            return outPath;
                        })
                        ;
                    valtype.push ({ type:typeSelectorInfo[i+1], generics:generics });
                }
            }
            var pathstr = match[3];
            var docstr = match[4];

            var pathfrags = [];
            var pathMatch;
            while (pathMatch = Patterns.word.exec (pathstr))
                pathfrags.push ([ pathMatch[1], pathMatch[2] ]);
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

                if (options.verbose)
                    console.log (('    * Modifier @' + modmatch[1] + ' ' + (modmatch[2]||'')).white);

                if (modpath) {
                    var mparr = [];
                    var fragmatch;
                    while (fragmatch = Patterns.word.exec (modpath))
                        mparr.push ([ fragmatch[1] || '.', fragmatch[2] ]);
                    modDoc.path = mparr;
                }
                modifiers.push (modDoc);
                docstr = docstr.slice (modmatch[0].length);
            }

            // begin searching for inner tags
            var innerMatch = docstr ? docstr.match (Patterns.innerTag) : undefined;
            if (!innerMatch) {
                if (options.verbose) {
                    var uglypath = '';
                    for (var i in tagScope)
                        uglypath += (tagScope[i][0]||'.') + tagScope[i][1];
                    console.log (
                        ('  + ').white
                      + (
                            '@'
                          + ctype
                          + ( valtype ? '/'+valtype : '')
                          + ' '
                        ).green
                      + uglypath.white
                    );
                }
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
            var pathMatch;
            var linkScope = cloneArr (fileScope);
            do {
                if (
                    inctype == 'callback'
                 || inctype == 'argument'
                 || inctype == 'kwarg'
                 || inctype == 'returns'
                )
                    submissionPath = concatArrs (argscope, inpathfrags);
                else
                    submissionPath = concatArrs (tagScope, inpathfrags);

                if (options.verbose) {
                    var uglypath = ''
                    for (var i in submissionPath)
                        uglypath += (submissionPath[i][0]||'.')+submissionPath[i][1];
                    console.log (
                        ('    + ').white
                      + (
                            '@'
                          + ctype
                          + ( valtype ? '/'+valtype : '')
                          + ' '
                        ).green
                      + uglypath.white
                    );
                }

                // submit the previous match
                try {
                    lastComponent = context.submit (
                        submissionPath,
                        {
                            ctype:      inctype,
                            valtype:    invaltype,
                            doc:        { value:docstr.slice (0, innerMatch.index), context:linkScope },
                            modifiers:  modifiers
                        }
                    );
                } catch (err) {
                    console.log (('\nfatal error in source file '+fname).red);
                    throw err;
                }
                if (inctype == 'returns') {
                    if (!inpathstr)
                        argscope.pop();
                } else if (inctype != 'argument' && inctype != 'kwarg') // && != 'returns'
                    argscope = cloneArr (lastComponent ? lastComponent.path : []);

                // prepare the next submission
                linkScope = cloneArr (fileScope);
                modifiers = [];
                inctype = innerMatch[1];
                invaltype = innerMatch[2];
                inpathstr = innerMatch[3];
                docstr = innerMatch[4];

                inpathfrags = [];
                var pathMatch;
                if (inpathstr) {
                    while (pathMatch = Patterns.word.exec (inpathstr))
                        inpathfrags.push ([ pathMatch[1], pathMatch[2] ]);
                } else inpathfrags.push ([]);
                // direct-to-type syntax
                if (!Patterns.innerCtypes.hasOwnProperty (inctype)) {
                    invaltype = inctype;
                    if (inpathfrags[inpathfrags.length-1][0] == '#')
                        inctype = 'member';
                    else
                        inctype = 'property';
                }

                if (!invaltype)
                    invaltype = [];
                else {
                    var typeSelectorInfo = invaltype.split(Patterns.typeSelectorWord);
                    invaltype = [];
                    for (var i=0,j=typeSelectorInfo.length-1; i<j; i+=3) {
                        var generics = !typeSelectorInfo[i+2] ? [] : typeSelectorInfo[i+2]
                            .split(',')
                            .map(function(z){
                                var frags = z.replace (/\s/g, '').split (Patterns.word);
                                var outPath = [];
                                for (var i=0,j=frags.length-1; i<j; i+=3)
                                    outPath.push ([ frags[i+1] || '.', frags[i+2] ]);
                                return outPath;
                            })
                            ;
                        invaltype.push ({ type:typeSelectorInfo[i+1], generics:generics });
                    }
                }

                // consume modifiers
                var modmatch;
                while (modmatch = docstr.match (Patterns.modifier)) {
                    var modDoc = { mod:modmatch[1] };
                    var modpath = modmatch[2];

                    if (options.verbose)
                        console.log (
                            ('      * ').white
                          + ('Modifier @').green
                          + (
                                modmatch[1]
                              + ' '
                              + (modmatch[2]||'')
                            ).green
                        );

                    if (modpath) {
                        var mparr = [];
                        var fragmatch;
                        while (fragmatch = Patterns.word.exec (modpath))
                            mparr.push ([ fragmatch[1] || '.', fragmatch[2] ]);
                        modDoc.path = mparr;
                    }
                    modifiers.push (modDoc);
                    docstr = docstr.slice (modmatch[0].length);
                }

                // every path, even those on global, must start with a delimiter, however
                // it is usually added automatically
                if (!inpathfrags[0][0])
                    inpathfrags[0][0] = Patterns.delimitersInverse[inctype] || '.';

                // some tags affect the scope
                if (inctype == 'module') {
                    fileScope.push.apply (fileScope, inpathfrags);
                    tagScope.push.apply (tagScope, inpathfrags);
                } else if (inctype == 'class')
                    tagScope.push.apply (tagScope, inpathfrags);

                // if (inctype != 'argument' && inctype != 'callback' && inctype != 'returns')
                //     argscope = cloneArr (inpathfrags);

            } while (docstr && (innerMatch = docstr.match (Patterns.innerTag)));

            // submit the final match from this tag
            var submissionPath
            if (
                inctype == 'callback'
             || inctype == 'argument'
             || inctype == 'returns'
             || inctype == 'kwarg'
            )
                submissionPath = concatArrs (argscope, inpathfrags);
            else
                submissionPath = concatArrs (tagScope, inpathfrags);

            // consume modifiers
            var modmatch;
            while (modmatch = docstr.match (Patterns.modifier)) {
                var modDoc = { mod:modmatch[1] };
                var modpath = modmatch[2];

                if (options.verbose)
                    console.log (('      * Modifier @' + modmatch[1] + ' ' + (modmatch[2]||'')).white);

                if (modpath) {
                    var mparr = [];
                    var fragmatch;
                    while (fragmatch = Patterns.word.exec (modpath))
                        mparr.push ([ fragmatch[1] || '.', fragmatch[2] ]);
                    modDoc.path = mparr;
                }
                modifiers.push (modDoc);
                docstr = docstr.slice (modmatch[0].length);
            }
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
        return callback();
    });
};

module.exports.parseFile = parseFile;
