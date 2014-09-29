
/**     @module doczar.Parser
*/

var fs = require ('fs');
var Patterns = require ('./Patterns');

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

var parseFile = function (fname, context, callback) {
    fs.readFile (fname, function (err, buf) {
        if (err)
            return callback (err);
        var fstr = buf.toString ('utf8');

        var fileScope = [];
        var match;
        var tagCount = 0;
        while (match = Patterns.tag.exec (fstr)) {
            tagCount++;
            var ctype = match[1];
            var valtype = match[2];
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
                fileScope = tagScope;

            // direct-to-type syntax
            if (!Patterns.ctypes.hasOwnProperty (ctype)) {
                valtype = ctype;
                if (pathfrags[pathfrags.length-1][0] == '#')
                    ctype = 'member';
                else
                    ctype = 'property';
            }

            // consume modifiers
            var modifiers = [];
            var modmatch;
            while (modmatch = docstr.match (Patterns.modifier)) {
                var modDoc = { mod:modmatch[1] };
                var modpath = modmatch[2];
                if (modpath) {
                    var mparr = [];
                    var fragmatch;
                    while (fragmatch = Patterns.word.exec (modpath))
                        fragmatch.push ([ fragmatch[1] || '.', fragmatch[2] ]);
                    modDoc.path = mparr;
                }
                modifiers.push (modDoc);
                docstr = docstr.slice (modmatch[0].length);
            }

            // begin searching for inner tags
            var innerMatch = docstr ? docstr.match (Patterns.innerTag) : undefined;
            if (!innerMatch) {
                // the entire comment is one component
                context.submit (
                    tagScope,
                    {
                        ctype:      ctype,
                        valtype:    valtype ? valtype.split ('|') : [],
                        doc:        { value:docstr, context:cloneArr(fileScope) },
                        modifiers:  modifiers
                    }
                );
                continue;
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
                var submissionPath = concatArrs (tagScope, inscope);
                if (inctype == 'argument' || inctype == 'callback')
                    submissionPath = concatArrs (submissionPath, argscope, inpathfrags);
                else {
                    // either use the argscope or clear it
                    argscope = [];
                    submissionPath = concatArrs (submissionPath, inpathfrags);
                }

                var modmatch;
                docstr = docstr.slice (0, innerMatch.index);
                while (modmatch = docstr.match (Patterns.modifier)) {
                    var modDoc = { mod:modmatch[1] };
                    var modpath = modmatch[2];
                    if (modpath) {
                        var mparr = [];
                        var fragmatch;
                        while (fragmatch = Patterns.word.exec (modpath))
                            fragmatch.push ([ fragmatch[1] || '.', fragmatch[2] ]);
                        modDoc.path = mparr;
                    }
                    modifiers.push (modDoc);
                    docstr = docstr.slice (modmatch[0].length);
                }

                // submit the previous match
                context.submit (
                    submissionPath,
                    {
                        ctype:      inctype,
                        valtype:    invaltype ? invaltype.split ('|') : [],
                        doc:        { value:docstr, context:linkScope },
                        modifiers:  modifiers
                    }
                );
                linkScope = cloneArr (fileScope);

                // prepare the next submission
                modifiers = [];
                inctype = innerMatch[1];
                invaltype = innerMatch[2];
                inpathstr = innerMatch[3];
                docstr = innerMatch[4];

                inpathfrags = [];
                var pathMatch;
                if (inpathstr)
                    while (pathMatch = Patterns.word.exec (inpathstr))
                        inpathfrags.push ([ pathMatch[1], pathMatch[2] ]);
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
                if (!inpathfrags[0][0])
                    inpathfrags[0][0] = Patterns.delimitersInverse[inctype] || '.';

                // some tags affect the scope
                if (inctype == 'module')
                    tagScope.push.apply (tagScope, inpathfrags);
                else if (inctype == 'class')
                    inscope.push.apply (inscope, inpathfrags);
                else if (inctype == 'function' || inctype == 'callback')
                    argscope = inpathfrags;
            } while (docstr && (innerMatch = docstr.match (Patterns.innerTag)));

            // submit the final match from this tag
            var submissionPath = concatArrs (tagScope, inscope);
            if (inctype == 'argument' || inctype == 'callback')
                submissionPath = concatArrs (submissionPath, argscope, inpathfrags);
            else
                submissionPath = concatArrs (submissionPath, inpathfrags);

            // consume modifiers
            var modmatch;
            while (modmatch = docstr.match (Patterns.modifier)) {
                var modDoc = { mod:modmatch[1] };
                var modpath = modmatch[2];
                if (modpath) {
                    var mparr = [];
                    var fragmatch;
                    while (fragmatch = Patterns.word.exec (modpath))
                        fragmatch.push ([ fragmatch[1] || '.', fragmatch[2] ]);
                    modDoc.path = mparr;
                }
                modifiers.push (modDoc);
                docstr = docstr.slice (modmatch[0].length);
            }

            context.submit (
                submissionPath,
                {
                    ctype:      inctype,
                    valtype:    invaltype,
                    doc:        { value:docstr, context:linkScope },
                    modifiers:  modifiers
                }
            );
        }
        return callback();
    });
};

module.exports.parseFile = parseFile;
