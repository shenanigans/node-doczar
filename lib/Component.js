
var url = require ('url');
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var mkdirp = require ('mkdirp');
var Patterns = require ('./Patterns');
var log = require ('./Logger').log;
var Templates = require ('./Templates');

var INDENT_REGEX = /^(\s*)[^\s]+/;
var SPECIAL_SPARES = { summary:true, details:true, constructor:true };
var DEFAULT_NAMES = { argument:'', callback:'callback' };
function values (a) { var out = []; for (var b in a) out.push (a[b]); return out; };
function concatArrs () {
    var out = [];
    for (var i in arguments)
        if (arguments[i])
            out.push.apply (out, arguments[i]);
    return out;
}
function isArr (a) {
    return a && a.__proto__ === Array.prototype;
}
function appendToArr (a, b) {
    a.push.apply (a, b);
}
function shallowCopy (a) {
    var b = {};
    for (var key in a)
        b[key] = a[key];
    return b;
}
var nextID = 1;
function getSimpleID () { return 'unnamed_'+(nextID++); }



/**     @module/Function doczar.Component
    The quantum of doczar documentation. Every Component has its own directory and html page in the
    final output. Codifies type, expected location and useful information about a unit of data or
    functionality. The ultimate goal is to produce and render a [Component.Finalization]().
@argument/doczar.ComponentCache context
    Each new `Component` is a member of a specific `ComponentCache`.
@argument/Array tpath
    The type of the new `Component`, expressed as an Array of Arrays in the form
    `[ [ delimiter, name ], ...]`
@Array #path
    The type of this `Component` expressed as an Array of Arrays in the form
    `[ [ delimiter, name ], ...]`
@String #pathstr
    `path` joined down to a String.
@String #ctype
    The "component type" of this `Component`, better known as the word after the `@`. One of
    `property`, `member`, `spare`, `module`, `class`, `argument`, `returns`, `callback`, `default`.
@Array #valtype
    The working type(s) of the value described by this `Component`. This is simply an Array of
    String type paths.
@Array #errors
    Error messages produced by this specific `Component` during finalization, as JSON documents.
    ```javascript
    {
        ctype:      'property',
        valtype:    [ '.Array' ],
        path:       '.doczar.Component#errors',
        error:      'descriptive error message'
    }
    ```
@Array #warnings
    Warning messages produced by this specific `Component` during finalization, as JSON documents.
    ```javascript
    {
        ctype:      'property',
        valtype:    [ '.Array' ],
        path:       '.doczar.Component#warnings',
        warning:    'descriptive warning message'
    }
    ```
@.Finalization|undefined #final
    After [finalization](#finalize), `final` is an Object designed to be passed to the template
    engine ([Handlebars](http://handlebarsjs.com/)).
@Array #doc
    @development
    An Array of String markdown documents that have been applied to this `Component`.
@Object #spare
    @development
    A map of "spare document" names to `Component` instances representing these documents.
@Object #property
    @development
    A map of property names to `Component` instances representing these types.
@Object #member
    @development
    A map of property names to `Component` instances representing these types.
@Array #argument
    @development
    An Array of `Component` instances representing function arguments for this `Component`. If our
    `ctype` is not `"member"` or `"property"` these arguments are rendered as belonging to a
    constructor function. (Further document this constructor by providing `@spare constructor`)
@Object #argsByName
    @development
    A map of named items from `argument` to their `Component` instances.
*/
var Component = module.exports = function (context, tpath, parent) {
    this.context = context;
    this.path = tpath;
    this.parent = parent;

    var lastI = tpath.length - 1;
    this.name = tpath[lastI][1] || '';
    if (!this.name) tpath[lastI][1] = getSimpleID();
    this.pathname = this.name || tpath[lastI][1];
    this.pathstr = '';
    for (var i in this.path)
        this.pathstr += (this.path[i][0]||'.') + this.path[i][1];

    this.doc = [];
    this.valtype = [];
    this.modifiers = [];
    this.spare = {};
    this.property = {};
    this.member = {};
    this.argument = [];
    this.argumentByName = {};
    this.returns = [];
    this.returnsByName = {};

    this.errors = [];
    this.warnings = [];
};

Component.prototype.submit = function (info) {
    for (var key in info)
        if (this[key] === undefined)
            this[key] = info[key];
        else if (this[key] !== info[key])
            if (key == 'doc')
                if (isArr (info.doc))
                    this.doc.push.apply (this.doc, info.doc);
                else
                    this.doc.push (info.doc)
            else if (key == 'valtype')
                if (isArr (info.valtype))
                    this.valtype.push.apply (this.valtype, info.valtype);
                else
                    this.valtype.push (info.valtype);
            else if (key == 'modifiers')
                this.modifiers.push.apply (this.modifiers, info.modifiers);
            else
                throw new Error (
                    'attempted to redefine '
                  + key
                  + ' of Component '
                  + this.pathstr
                  + ' from '
                  + this[key]
                  + ' to '
                  + info[key]
                );
};


/**     @class Finalization
@String #name
@String #pathname
@String #pathstr
@String #path
@String #ctype
@String #simpleCtype
@String #valtype
@Array #modules
@Array #statics
@Array #functions
@Array #members
@Array #methods
@Array #arguments
@Array #returns
@Boolean #isClasslike
@Boolean #isInline
*/
/**     @member/Function finalize
    Create a representative document ready for rendering and save it to [final](#final).
@argument/Array errors
    An empty Array to fill with error messages as JSON documents. See [#errors](#errors).
@argument/Array warnings
    An empty Array to fill with warning messages as JSON documents. See [#warnings](#warnings).
@argument/Object options
@callback callback
*/
Component.prototype.finalize = function (errors, warnings, options, callback) {
    var self = this;
    currentComponentCache = this.context;

    if (!this.ctype) {
        this.ctype = Patterns.delimiters[this.path[this.path.length-1][0]];
        warnings.push ({
            path:       this.pathstr,
            ctype:      this.ctype,
            valtype:    this.valtype,
            warning:    'guessed unknown ctype'
        });
    }

    // this is a leaves-first operation
    var children = concatArrs (
        values (this.spare),
        values (this.property),
        values (this.member),
        this.argument
    );
    if (this.ctype != 'spare') {
        // all documentation is expressed as spares.
        // Raw docs become ~details, ~summary, or both.
        if (this.spare.details)
            appendToArr (this.spare.details.doc, this.doc);
        else {
            // we have to create a details node
            this.spare.details = new Component (
                this.context,
                concatArrs (this.path, [[ '~', 'details' ]]),
                this
            );
            this.spare.details.submit ({ ctype:'spare', doc:this.doc });
            children.push (this.spare.details)
        }
        if (!this.spare.summary) {
            // we have to create a summary node
            this.spare.summary = new Component (
                this.context,
                concatArrs (this.path, [[ '~', 'summary' ]]),
                this
            );
            this.spare.summary.submit ({ ctype:'spare', doc:this.doc });
            children.push (this.spare.summary)
        }
    }
    if (this.returns)
        children.push.apply (children, this.returns);

    async.each (children, function (child, callback) {
        child.finalize (errors, warnings, options, callback);
    }, function(){
        process.nextTick (function(){
            // create a renderable breadcrumb path
            self.final.breadcrumbs = [];
            var backpath = 'index.html';
            var pointer = self;
            while (pointer) {
                self.final.breadcrumbs.unshift ({
                    path:       pointer.path,
                    ctype:      pointer.ctype,
                    name:       pointer.final.name,
                    delimiter:  Patterns.delimitersInverse[pointer.ctype]
                });
                backpath = '../../' + backpath;
                pointer = pointer.parent;
            }

            if (self.ctype == 'spare') { // render markdown
                var finalsubdocs = [];
                for (var i in self.doc) {
                    // remove leading indentation
                    var baseStr = self.doc[i].value;
                    if (!baseStr) continue;
                    var frags = baseStr.split ('\n');
                    var indentSeq;
                    // check each line and create the longest-possible indent sequence string
                    for (var j in frags) {
                        var fraginfo = INDENT_REGEX.exec (frags[j]);
                        if (!fraginfo) continue;
                        var whitespace = fraginfo[1];
                        if (indentSeq === undefined) {
                            indentSeq = whitespace;
                            continue;
                        }
                        for (var k=0, l=indentSeq.length; k<l; k++) {
                            if (indentSeq[k] != whitespace[k]) {
                                indentSeq = indentSeq.slice (0, Math.max (0, k-1));
                                break;
                            }
                        }
                    }

                    // remove the indent sequence from each line
                    if (indentSeq) {
                        var len = indentSeq.length;
                        for (var j in frags) {
                            var frag = frags[j];
                            if (frag.match (INDENT_REGEX))
                                frags[j] = frag.slice (len);
                        }
                    }

                    finalsubdocs.push ({ doc:frags.join ('\n'), context:self.doc[i].context });
                }

                // document ready - time for markdown
                self.final.doc = finalsubdocs;
            } else {
                // not a spare
                if (self.spare.constructor)
                    self.final.constructorDoc = { doc:self.spare.constructor.final };

                // now the spares are compiled down to a final doc
                self.final.spares = [];
                var sparenames = Object.keys (self.spare);
                sparenames.sort();
                for (var i in sparenames) {
                    var sname = sparenames[i];
                    if (!SPECIAL_SPARES.hasOwnProperty (sname)) {
                        var spare = self.spare[sname];
                        if (options.showDev || !spare.isDevelopment)
                            self.final.spares.push ({
                                name:   spare.name,
                                doc:    spare.final.doc
                            });
                    }
                }

                // details, summary, what have we got?
                if (self.spare.details) {
                    self.final.details = self.spare.details.final.doc;
                    if (self.spare.summary)
                        self.final.summaryDoc = self.spare.summary.final.doc;
                    else
                        self.final.summaryDoc = self.final.details;
                } else if (self.spare.summary)
                    self.final.details = self.final.summaryDoc = self.spare.summary.final.doc;

                var sourceDoc = self.inherit();
                // do we need to display ourself or our children? All of them?
                var showAPI = Boolean (options.showAPI);
                var showDev = Boolean (options.showDev);
                var showNormal = !showAPI;

                if (!showNormal && !showDev && !showAPI)
                    return;

                // properties
                for (var key in sourceDoc.property) {
                    var child = sourceDoc.property[key];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        if (child.ctype == 'module') {
                            self.final.modules.push (child.final);
                            continue;
                        }
                        var dest = 'statics';
                        var vt = child.valtype;
                        for (var i in vt)
                            if (vt[i] == 'function' || vt[i] == 'Function') {
                                dest = 'functions';
                                break;
                            }

                        self.final[dest].push (child.final);
                    }
                }

                // members
                for (var key in sourceDoc.member) {
                    var child = sourceDoc.member[key];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        var dest = 'members';
                        var vt = child.valtype;
                        for (var i in vt)
                            if (vt[i] == 'function' || vt[i] == 'Function') {
                                dest = 'methods';
                                break;
                            }

                        self.final[dest].push (child.final);
                    }
                }

                // arguments
                for (var i in self.argument) {
                    var child = self.argument[i];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    )
                        self.final.arguments.push (child.final);
                }

                // returns
                for (var i in self.returns) {
                    var child = self.returns[i];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    )
                        self.final.returns.push (child.final);
                }
            }

            callback();
        });
    });

    // =================================================================== children have been primed
    if (this.isApi && this.parent)
        this.parent.isApi = true;

    // sift through our modifiers and set basic flag props where necessary
    this.superClasses = [];
    this.interfaces = [];
    for (var i in this.modifiers) {
        var mod = this.modifiers[i];
        if (Patterns.booleanModifiers.hasOwnProperty (mod.mod)) {
            if (mod.path)
                this.warnings.push ({
                    ctype:      this.ctype,
                    valtype:    this.valtype,
                    path:       this.path,
                    modifier:   '@'+mod,
                    warning:    'modifier ignored a type path'
                });
            this['is'+mod.mod[0].toUpperCase()+mod.mod.slice(1)] = true;
            continue;
        }
        if (mod.mod == 'super') {
            if (mod.path)
                this.superClasses.push (mod.path);
            else
                this.warnings.push ({
                    ctype:      this.ctype,
                    valtype:    this.valtype,
                    path:       this.path,
                    warning:    '@super modifier with no superclass path'
                });
            continue;
        }
        if (mod.mod == 'interface') {
            if (mod.path)
                this.interfaces.push (mod.path);
            else
                this.warnings.push ({
                    ctype:      this.ctype,
                    valtype:    this.valtype,
                    path:       this.path,
                    warning:    '@super modifier with no superclass path'
                });
            continue;
        }
    }

    var valtypes = [];
    this.final = {
        name:           this.name || DEFAULT_NAMES[this.ctype],
        pathname:       this.pathname,
        pathstr:        this.pathstr,
        path:           this.path,
        ctype:          this.ctype,
        simpleCtype:    Patterns.delimiters[Patterns.delimitersInverse[this.ctype]],
        valtype:        valtypes, // it's awkward? But this will fill with values in the next loop.
        modules:        [],
        statics:        [],
        functions:      [],
        members:        [],
        methods:        [],
        arguments:      [],
        returns:        []
    };

    // process value types and check whether this Component lists "f|Function" or "class" as a type
    for (var i in this.valtype) {
        var thistype = this.valtype[i];
        if (thistype == 'function' || thistype == 'Function')
            this.final.isFunction = true;
        else if (thistype == 'class') {
            this.isClassValtype = true;
            continue;
        } else if (thistype == 'json') {
            this.isJSONValtype = true;
            continue;
        }

        var valtypefrags = [];
        var valtypeMatch;
        while (valtypeMatch = Patterns.word.exec (thistype))
            valtypefrags.push ([ valtypeMatch[1], valtypeMatch[2] ]);
        if (valtypefrags[0][0] === undefined)
            valtypefrags[0][0] = '.';

        try {
            var finalPath = this.context.resolve (valtypefrags).path;
            var finalStr = '';
            delete finalPath[0][0];
            for (var i in finalPath) finalStr += (finalPath[i][0] || '') + finalPath[i][1]
        } catch (err) {
            finalPath = valtypefrags;
            finalStr = thistype;
        }
        valtypes.push ({
            name:   finalStr,
            path:   finalPath
        });
    }

    // certain special cases/flags
    if (this.ctype == 'callback')
        this.final.isCallback = true;
    if (
        this.ctype == 'class'
     || this.isClassValtype
     || Object.keys (this.member).length
     || this.superClasses.length
    )
        this.final.isClasslike = true;

    if (this.isJSONValtype)
        this.final.isInline = true;
};

Component.prototype.inherit = function(){
    var output = {
        property:   {},
        member:     {}
    };
    for (var i in this.superClasses) {
        var supertype = this.context.resolve (this.superClasses[i]);
        var superdoc = supertype.inherit();

        for (var key in superdoc.property) {
            var child = shallowCopy (superdoc.property[key]);
            if (!child.final.source) {
                child.final.source = supertype.path;
                child.final.sourcestr = supertype.pathstr;
            }
            output.property[key] = child;
        }
        for (var key in superdoc.member) {
            var child = shallowCopy (superdoc.member[key]);
            if (!child.final.source) {
                child.final.source = supertype.path;
                child.final.sourcestr = supertype.pathstr;
            }
            output.member[key] = child;
        }
    }

    for (var key in this.property)
        output.property[key] = this.property[key];
    for (var key in this.member)
        output.member[key] = this.member[key];
    return output;
};

/**     @member/Function writeFiles
    Create a directory with mkdirp, write an index.html and recursively call for child Components.
@argument/String basedir
@argument/String baseTagPath
@argument/Options options
@argument/Array warnings
    Any warning messages generated by Moustache rendering will be pushed onto this [Array]() in the
    order they occured.
@callback callback
    @argument/Error err
        Filesystem errors and critical failures which hault document assembly will be returned.
*/
Component.prototype.writeFiles = function (basedir, baseTagPath, options, warnings, callback) {
    if (!this.final) {
        var badPath = this.pathstr;
        return process.nextTick (function(){
            callback (new Error ('component '+badPath+' was not finalized'));
        });
    }

    this.final.baseTagPath = baseTagPath;
    var self = this;
    mkdirp (basedir, function (err) {
        if (err) return callback (err);
        var collectionsToWrite = [ 'spare', 'property', 'member', 'argument', 'returns' ];
        var children = {};
        for (var i in collectionsToWrite) {
            var colDir = collectionsToWrite[i];
            var collection = self[colDir];
            if (Object.keys (collection).length)
                children[colDir] = Object.keys (collection);
        }

        if (options.verbose)
            console.log ('writing Component '.green + self.pathstr.white);

        var localWarnings = [];
        var page = Templates.render (self, options, localWarnings);
        self.warnings.push.apply (self.warnings, localWarnings);
        self.warnings.push.apply (warnings, localWarnings);

        fs.writeFile (path.join (basedir, 'index.html'), page, function (err) {
            if (err) return callback (err);
            async.each (Object.keys (children), function (colDir, callback) {
                async.each (children[colDir], function (i, callback) {
                    var child = self[colDir][i];
                    if (child.final)
                        child.writeFiles (
                            path.join (basedir, colDir, child.final.pathname),
                            baseTagPath + '../../',
                            options,
                            warnings,
                            callback
                        );
                    else callback();
                }, callback);
            }, callback);
        });
    });
};

module.exports = Component;
