
var url = require ('url');
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var mkdirp = require ('mkdirp');
var Patterns = require ('./Patterns');
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
function clonePath (a) {
    if (!a) return [];
    var out = [];
    for (var i in a)
        out.push ([ a[i][0]||'.', a[i][1] ]);
    return out;
}
var nextID = 1;
function getSimpleID () { return 'unnamed_'+(nextID++); }

var HIDDEN_CTYPES = {
    module:     true,
    property:   true,
    member:     true,
    named:      true,
    throws:     true,
    event:      true,
    argument:   true,
    returns:    true
};

function matchPaths (able, baker) {
    if (!able || !baker) return false;
    if (able.length != baker.length) return false;
    for (var i in able)
        if (able[i][0] != baker[i][0] || able[i][1] != baker[i][1])
            return false;
    return true;
}

function componentSorter (able, baker) {
    var aPriority = Patterns.HEIRARCHY[able.ctype];
    var bPriority = Patterns.HEIRARCHY[baker.ctype];
    if (aPriority > bPriority)
        return 1;
    if (aPriority < bPriority)
        return -1;
    if (able.ctype == 'argument' || able.ctype == 'callback') return 0;
    if (able.name > baker.name)
        return 1;
    if (able.name < baker.name)
        return -1;
    return 0;
}


/**     @module/class doczar.Component
    The quantum of doczar documentation. Every Component has its own directory and html page in the
    final output. Codifies type, expected location and useful information about a unit of data or
    functionality. The ultimate goal is to produce and render a [Finalization](.Finalization).
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
@.Finalization|undefined #final
    After [finalization](#finalize), `final` is an Object designed to be passed to the template
    engine ([Handlebars](http://handlebarsjs.com/)).
@Array #doc
    An Array of String markdown documents that have been applied to this `Component`.
@Object[String, doczar.Component] #spare
    A map of "spare document" names to `Component` instances representing these documents.
@Object[String, doczar.Component] #property
    A map of property names to `Component` instances representing these types.
@Object[String, doczar.Component] #member
    A map of property names to `Component` instances representing these types.
@Array #argument
    An Array of `Component` instances representing function arguments for this `Component`. If our
    `ctype` is not `"member"` or `"property"` these arguments are rendered as belonging to a
    constructor function. (Further document this constructor by providing `@spare constructor`)
@Object[String, doczar.Component] #argsByName
    A map of named items from `argument` to their `Component` instances.
@Array[doczar.Component] #returns
    An array of Component instances representing return values for this Component.
@Object[String, doczar.Component] #returnsByName
    A map of named items from `returns` to their `Component` instances.
@Array[doczar.Component] #throws
    An array of Component instances representing situations when code represented by this Component
    may throw an exception.
@Object[String, doczar.Component] #throwsByName
    A map of named items from `throws` to their `Component` instances.
*/
var Component = module.exports = function (context, tpath, parent) {
    this.context = context;
    this.path = tpath;
    this.parent = parent;

    this.superClasses = [];
    this.interfaces = [];

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
    this.throws = [];
    this.throwsByName = {};
    this.names = {};
    this.event = {};
    this.signature = [];
    this.signatureByName = {};

    this.errors = [];
    this.warnings = [];
};

/**     @member/Function submit
    Merge additional information into this Component.
@argument/Object info
    Document information, such as `valtype` or `modifiers`.
*/
Component.prototype.submit = function (info) {
    for (var key in info)
        if (this[key] === undefined) {
            if (key == 'sigargs') {
                if (!info[key]) continue;
                var args = info[key].split (Patterns.signatureArgument);
                var sigargs = [];
                for (var i=1,j=args.length; i<j; i+=2)
                    sigargs.push (args[i]);
                this.sigargs = sigargs;
                continue;
            }
            if (key == 'ctype' && info.ctype == 'kwarg')
                this.isKeywordArg = true;
            this[key] = info[key];
        } else if (this[key] !== info[key])
            if (key == 'doc')
                if (isArr (info.doc))
                    this.doc.push.apply (this.doc, info.doc);
                else
                    this.doc.push (info.doc);
            else if (key == 'valtype')
                this.valtype.push.apply (this.valtype, info.valtype);
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
    This is how a Component presents itself to the Handlebars rendering engine.
@String #elemID
    A unique identifier used as an id for this Component's outer Element when it is displayed as a
    child of another Component.
@String #name
    The last name element of this Component's path, to be used as its display name.
@String #@@pathstr
    A delimited String representation of this Component's path.
@Array[Array] #path
    This [Component's](.) path
@String #ctype
    Component type string, e.g. "module", "class", "property"...
@String #simpleCtype
@String #valtype
@Array[.Finalization] #modules
@Array[.Finalization] #statics
@Array[.Finalization] #functions
@Array[.Finalization] #members
@Array[.Finalization] #methods
@Array[.Finalization] #arguments
@Array[.Finalization] #returns
@Boolean #isClasslike
    Whether to display the "Constructor" section.
@Boolean #isInherited
    Whether this Component has a `@super` modifier.
@Boolean #isInline
*/
/**     @member/Function finalize
    Create a representative document ready for rendering and save it to [final](#final).
@argument/Array warnings
    An empty Array to fill with warning messages as JSON documents. See
    [#warnings](doczar.ComponentCache#warnings).
@argument/Object options
    * [String]() **codeStyle** The css document to use for syntax highlight.
    * [Boolean]() **isAPI** Hide everything but `@api` Components and their ancestors.
    * [Boolean]() **isDev** Reveal everything marked `@development`.
@callback callback
    Called without arguments when finalization is complete and this Component is ready to render.
*/
var nextElemID = 1;
function getElemID(){ return 'component_'+nextElemID++; }
Component.prototype.finalize = function (warnings, options, callback) {
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
        values (this.event),
        this.argument,
        this.throws,
        this.returns,
        this.signature
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

    async.each (children, function (child, callback) {
        child.finalize (warnings, options, callback);
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

                var sourceDoc = self.inherit (warnings);
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
                        var localChild = shallowCopy (child.final);
                        if (!matchPaths (localChild.source, self.path || []))
                            localChild.isInherited = true;
                        for (var j in self.interfaces)
                            if (Object.hasOwnProperty.call (self.interfaces[j].property, key))
                                localChild.satisfies.push ({
                                    path:       self.interfaces[j].path,
                                    pathstr:    self.interfaces[j].pathstr,
                                });
                        if (child.ctype == 'module') {
                            self.final.modules.push (localChild);
                            continue;
                        }
                        if (child.ctype == 'named') {
                            self.final.names.push (localChild);
                            continue;
                        }
                        if (child.ctype == 'enum') {
                            self.final.enums.push (localChild);
                            continue;
                        }
                        var dest = localChild.isFunction ? 'functions' : 'statics';
                        self.final[dest].push (localChild);
                    }
                }
                self.final.functions.sort (componentSorter);
                self.final.statics.sort (componentSorter);

                // members
                for (var key in sourceDoc.member) {
                    var child = sourceDoc.member[key];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        var localChild = shallowCopy (child.final);
                        if (!matchPaths (localChild.source, self.path))
                            localChild.isInherited = true;
                        for (var j in self.interfaces)
                            if (Object.hasOwnProperty.call (self.interfaces[j].member, key))
                                localChild.satisfies.push ({
                                    path:       self.interfaces[j].path,
                                    pathstr:    self.interfaces[j].pathstr,
                                });
                        var dest = child.final.isFunction ? 'methods' : 'members';
                        self.final[dest].push (localChild);
                    }
                }
                self.final.methods.sort (componentSorter);
                self.final.members.sort (componentSorter);

                // arguments
                var args = sourceDoc.argument || self.argument;
                for (var i in args) {
                    var child = args[i];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        var localChild = shallowCopy (child.final);
                        if (!matchPaths (localChild.source, self.path))
                            localChild.isInherited = true;
                        self.final.arguments.push (localChild);
                    }
                }
                self.final.arguments.sort (componentSorter);

                // returns
                var returns = sourceDoc.returns || self.returns;
                for (var i in returns) {
                    var child = returns[i];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        var localChild = shallowCopy (child.final);
                        if (!matchPaths (localChild.source, self.path))
                            localChild.isInherited = true;
                        self.final.returns.push (localChild);
                    }
                }

                // throws
                var throws = sourceDoc.throws || self.throws;
                for (var i in throws) {
                    var child = throws[i];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        var localChild = shallowCopy (child.final);
                        if (!matchPaths (localChild.source, self.path))
                            localChild.isInherited = true;
                        for (var j in self.interfaces)
                            if (Object.hasOwnProperty.call (self.interfaces[j].throws, key))
                                localChild.satisfies.push ({
                                    path:       self.interfaces[j].path,
                                    pathstr:    self.interfaces[j].pathstr,
                                });
                        self.final.throws.push (localChild);
                    }
                }
                self.final.throws.sort (componentSorter);

                // events
                var events = sourceDoc.event || self.event;
                for (var key in events) {
                    var child = events[key];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        var localChild = shallowCopy (child.final);
                        if (!matchPaths (localChild.source, self.path))
                            localChild.isInherited = true;
                        self.final.events.push (localChild);
                    }
                }
                self.final.events.sort (componentSorter);

                // interfaces
                for (var i in self.interfaces)
                    self.final.interfaces.push (self.interfaces[i].final);

                // signatures
                for (var i in self.signature) {
                    var child = self.signature[i];
                    if (
                        (showNormal && !child.isDevelopment)
                     || (showDev && child.isDevelopment)
                     || (showAPI && child.isApi)
                    ) {
                        var localChild = shallowCopy (child.final);
                        if (!matchPaths (localChild.source, self.path))
                            localChild.isInherited = true;
                        for (var j in self.interfaces)
                            if (Object.hasOwnProperty.call (self.interfaces[j].signature, key))
                                localChild.satisfies.push ({
                                    path:       self.interfaces[j].path,
                                    pathstr:    self.interfaces[j].pathstr,
                                });
                        self.final.signatures.push (localChild);
                    }
                }

                // signature arguments
                if (self.sigargs) {
                    self.final.sigargs = [];
                    for (var i in self.sigargs) {
                        var sigargPath;
                        if (Object.hasOwnProperty.call (self.parent.argumentByName, self.sigargs[i]))
                            sigargPath = clonePath (self.parent.argumentByName[self.sigargs[i]].path);
                        else
                            sigargPath = [];
                        self.final.sigargs.push ({ name:self.sigargs[i], path:sigargPath });
                    }
                }
            }

            callback();
        });
    });

    // =================================================================== children have been primed
    if (this.isApi && this.parent)
        this.parent.isApi = true;

    var valtypes = [];
    this.final = {
        elemID:         getElemID(),
        name:           this.name || DEFAULT_NAMES[this.ctype],
        pathname:       this.pathname,
        pathstr:        this.pathstr,
        path:           this.path,
        flags:          [],
        source:         this.parent ? this.parent.path : [],
        sourcestr:      this.parent ? this.parent.pathstr : '',
        superClasses:   [],
        interfaces:     [],
        satisfies:      [],
        ctype:          this.ctype,
        isKwarg:        Boolean (this.isKeywordArg),
        isFunction:     this.ctype == 'callback',
        simpleCtype:    Patterns.delimiters[Patterns.delimitersInverse[this.ctype]],
        hideCtype:      HIDDEN_CTYPES[this.ctype] || false,
        valtype:        valtypes, // it's awkward? But this will fill with values in the next loop.
        modules:        [],
        enums:          [],
        statics:        [],
        functions:      [],
        members:        [],
        methods:        [],
        arguments:      [],
        returns:        [],
        throws:         [],
        names:          [],
        events:         [],
        signatures:     []
    };

    // sift through our modifiers and set basic flag props where necessary
    var flagsSet = {};
    for (var i in this.modifiers) {
        var mod = this.modifiers[i];
        if (Patterns.booleanModifiers.hasOwnProperty (mod.mod)) {
            if (mod.path)
                this.warnings.push ({
                    ctype:      this.ctype,
                    valtype:    this.valtype,
                    path:       this.path,
                    modifier:   '@'+mod,
                    modpath:    mod.path,
                    warning:    'boolean modifier ignored path'
                });
            this.final['is'+mod.mod[0].toUpperCase()+mod.mod.slice(1)] = true;
            if (Patterns.flagModifiers.hasOwnProperty (mod.mod) && !flagsSet[mod.mod]) {
                flagsSet[mod.mod] = true;
                this.final.flags.push (mod.mod);
            }
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
        if (mod.mod == 'implements') {
            if (mod.path)
                try {
                    this.interfaces.push (this.context.resolve (mod.path));
                } catch (err) {
                    this.warnings.push ({
                        ctype:      this.ctype,
                        valtype:    this.valtype,
                        path:       this.path,
                        target:     mod.path,
                        warning:    '@implements modifier could not resolve interface path'
                    });
                }
            else
                this.warnings.push ({
                    ctype:      this.ctype,
                    valtype:    this.valtype,
                    path:       this.path,
                    warning:    '@implements modifier with no interface path'
                });
            continue;
        }
    }

    // process value types and check whether this Component lists "f|Function" or "class" as a type
    for (var i in this.valtype) {
        var thistype = this.valtype[i].type;
        if (matchPaths (thistype, [ [ '.', 'Function' ] ]) || matchPaths (thistype, [ [ '.', 'function' ] ]))
            this.final.isFunction = true;
        else if (matchPaths (thistype, [ [ '.', 'class' ] ])) {
            this.isClassValtype = true;
            continue;
        } else if (matchPaths (thistype, [ [ '.', 'json' ] ])) {
            this.isJSONValtype = true;
            thistype = 'Object';
        }

        var generics = [];
        if (this.valtype[i].generics.length) {
            var theseGenerics = this.valtype[i].generics;
            for (var i in theseGenerics) {
                try {
                    var finalGPath = this.context.resolve (theseGenerics[i]).path;
                    var finalGStr = '';
                    delete finalGPath[0][0];
                    for (var i in finalGPath) finalGStr += (finalGPath[i][0] || '') + finalGPath[i][1]
                } catch (err) {
                    finalGPath = theseGenerics[i];
                    var finalGStr = '';
                    delete finalGPath[0][0];
                    for (var i in finalGPath) finalGStr += (finalGPath[i][0] || '') + finalGPath[i][1]
                }
                generics.push ({ name:finalGStr, path:finalGPath });
            }
        }

        var uglypath = '';
        for (var i in thistype)
            uglypath += thistype[i][0] + thistype[i][1];
        valtypes.push ({
            name:       uglypath.slice(1),
            path:       thistype,
            generics:   generics
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

    if (this.isJSONValtype || this.ctype == 'enum')
        this.final.isInline = true;
};

/**     @member/Function inherit
    Gather children from superclasses and merge them, in order, into a document representing this
    Component's inheritence. **Note:** this Component's children will *also* be merged in.
@argument/Array[Object] warnings
@returns/doczar.Component
    The assembled inheritence document is returned. It looks like an incomplete Component instance,
    containing only child Components.
*/
Component.prototype.inherit = function (warnings) {
    var output = {
        property:   {},
        member:     {}
    };
    for (var i in this.superClasses) {
        try {
            var supertype = this.context.resolve (this.superClasses[i]);
        } catch (err) {
            warnings.push ({
                path:       this.pathstr,
                ctype:      this.ctype,
                valtype:    this.valtype,
                warning:    'cannot find superclass',
                super:      this.superClasses[i]
            });
            continue;
        }
        this.final.superClasses.push ({ path:supertype.path, pathstr:supertype.pathstr });
        var superdoc = supertype.inherit();

        for (var key in superdoc.property)
            output.property[key] = superdoc.property[key];
        for (var key in superdoc.member)
            output.member[key] = superdoc.member[key];

        if (this.final.isFunction) {
            if (superdoc.argument) {
                output.argument = [];
                for (var i in superdoc.argument)
                    output.argument.push (superdoc.argument[i]);
            }

            if (superdoc.returns) {
                output.returns = [];
                for (var i in superdoc.returns)
                    output.returns.push (superdoc.returns[i]);
            }

            if (superdoc.throws) {
                output.throws = [];
                for (var i in superdoc.throws)
                    output.throws.push (superdoc.throws[i]);
            }

            if (superdoc.signature) {
                output.signature = [];
                for (var i in superdoc.signature)
                    output.signature.push (superdoc.signature[i]);
            }
        }
    }

    for (var key in this.property) {
        if (Object.hasOwnProperty.call (output.property, key)) {
            this.property[key].final.override = {
                path:       output.property[key].path,
                pathstr:    output.property[key].pathstr
            };
        }
        output.property[key] = this.property[key];
    }
    for (var key in this.member) {
        if (Object.hasOwnProperty.call (output.member, key)) {
            this.member[key].final.override = {
                path:       output.member[key].path,
                pathstr:    output.member[key].pathstr
            };
        }
        output.member[key] = this.member[key];
    }
    if (this.final.isFunction) {
        if (this.argument.length) {
            if (!output.argument) output.argument = [];
            output.argument.push.apply (output.argument, this.argument);
        }
        if (this.returns.length) {
            if (!output.returns) output.returns = [];
            output.returns.push.apply (output.returns, this.returns);
        }
        if (this.throws.length) {
            if (!output.throws) output.throws = [];
            output.throws.push.apply (output.throws, this.throws);
        }
        if (this.signature.length) {
            if (!output.signature) output.signature = [];
            output.signature.push.apply (output.signature, this.signature);
        }
    }
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
        var collectionsToWrite = [
            'spare', 'property', 'member', 'argument', 'returns', 'throws', 'event'
        ];
        var children = {};
        for (var i in collectionsToWrite) {
            var colDir = collectionsToWrite[i];
            var collection = self[colDir];
            if (Object.keys (collection).length)
                children[colDir] = Object.keys (collection);
        }

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
