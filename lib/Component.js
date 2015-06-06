
var url             = require ('url');
var fs              = require ('graceful-fs');
var path            = require ('path');
var async           = require ('async');
var mkdirp          = require ('mkdirp');
var Patterns        = require ('./Patterns');
var Templates       = require ('./Templates');
var sanitizeName    = require ('./sanitizeName');

var INDENT_REGEX = /^(\s*)[^\s]+/;
var SPECIAL_SPARES = { summary:true, details:true, constructor:true };
var DEFAULT_NAMES = { argument:'', callback:'callback', args:'arguments', kwargs:'namedArguments' };
function values (a) { var out = []; for (var b in a) out.push (a[b]); return out; };
function concatArrs () {
    var out = [];
    for (var i=0, j=arguments.length; i<j ;i++)
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
    for (var i=0, j=a.length; i<j; i++)
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
    for (var i=0, j=able.length; i<j; i++)
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
var Component = module.exports = function (context, tpath, parent, logger) {
    this.context = context;
    this.path = tpath;
    this.parent = parent;
    this.logger = logger;

    this.superClasses = [];
    this.interfaces = [];

    var lastI = tpath.length - 1;
    this.name = tpath[lastI][1] || '';
    if (!this.name) tpath[lastI][1] = getSimpleID();
    this.pathname = this.name || tpath[lastI][1];
    this.pathstr = '';
    for (var i=0, j=this.path.length; i<j; i++)
        this.pathstr += (this.path[i][0]||'.') + this.path[i][1];
    this.pathstr = this.pathstr.slice (1);

    this.doc = [];
    this.valtype = [];
    this.modifiers = [];
    this.spare = {};
    this.property = {};
    this.propertySymbols = {};
    this.member = {};
    this.memberSymbols = {};
    this.argument = [];
    this.argumentByName = {};
    this.returns = [];
    this.returnsByName = {};
    this.returnsSymbols = {};
    this.throws = [];
    this.throwsByName = {};
    this.names = {};
    this.event = {};
    this.signature = [];
    this.signatureByName = {};
    this.local = {};
};

/**     @member/Function submit
    Merge additional information into this Component.
@argument/Object info
    Document information, such as `valtype` or `modifiers`.
*/
Component.prototype.submit = function (info) {
    for (var key in info)
        if (this[key] === undefined) {
            if (key == 'ctype') {
                if (info.ctype == 'kwarg' || info.ctype == 'kwargs')
                    this.isKeywordArg = true;
                if (info.ctype == 'args' || info.ctype == 'kwargs')
                    this.isMultiArg = true;
            }
            this[key] = info[key];
        } else if (this[key] !== info[key])
            if (key == 'doc')
                if (isArr (info.doc))
                    this.doc.push.apply (this.doc, info.doc);
                else
                    this.doc.push (info.doc);
            else if (key == 'valtype')
                this.valtype.push.apply (this.valtype, info.valtype);
            else if (key == 'modifiers') {
                this.modifiers.push.apply (this.modifiers, info.modifiers);
                for (var i=0,j=info.modifiers.length; i<j; i++)
                    if (info.modifiers[i].mod == 'api') {
                        this.isApi = true;
                        var pointer = this;
                        while (pointer.parent) {
                            pointer = pointer.parent;
                            pointer.isApi = true;
                        }
                        break;
                    }
            } else
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
@String #pathstr
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
@argument/Object options
    * [String]() **codeStyle** The css document to use for syntax highlight.
    * [Boolean]() **isAPI** Hide everything but `@api` Components and their ancestors.
    * [Boolean]() **isDev** Reveal everything marked `@development`.
@callback
    Called without arguments when finalization is complete and this Component is ready to render.
*/
var COPY_CHILDREN = [
    'property',
    'member',
    'event',
    'local',
    'argument',
    'returns',
    'throws',
    'signature',
    'propertySymbols',
    'memberSymbols',
    'returnsSymbols'
];
var SORT_CHILDREN = [
    'modules',
    'names',
    'enums',
    'functions',
    'statics',
    'methods',
    'members',
    'events',
    'localFunctions',
    'localValues',
    'arguments',
    'returns',
    'throws',
    'returns',
    'signatures',
    'propertySymbols',
    'memberSymbols',
    'returnsSymbols'
];
var SPLIT_FUNCTIONS = {
    property:       [ 'functions', 'statics' ],
    member:         [ 'methods', 'members' ],
    local:          [ 'localFunctions', 'localValues' ]
};
var CONVERT_NAMES = {
    argument:   'arguments',
    event:      'events',
    local:      'locals',
    signature:  'signatures'
};
var SPECIAL_CTYPES = {
    modules:    true,
    names:      true,
    enums:      true
};
var nextElemID = 1;
function getElemID(){ return 'component_'+nextElemID++; }
var ALIAS_PROPS = [
    'doc', 'constructorDoc', 'spares', 'details', 'summaryDoc', 'modules', 'names', 'enums',
    'functions', 'statics', 'methods', 'members', 'arguments', 'returns', 'throws', 'events',
    'interfaces', 'signatures', 'path'
];

/**     @member/Function finalize
    A complex waltz prepares this Component's [finalization](.Finalization) for rendering.

    Stage 0: Accumulation
    ---------------------
    Every child Component on this Component is compiled into two Arrays: One is an Array of Arrays
    grouping children by the name they were stored under, the other is a flat Array of all children.
    The [hasChildren](.Finalization#hasChildren) output Boolean and the [isTotallyEmpty]
    (#isTotallyEmpty) local Boolean are processed. Implicit documentation (if any) is converted to
    either a `@summary` or `@details` child Component. Finally, [async.each]() calls `finalize` on
    every child Component before proceeding to Stage 2: Inheritence.

    Stage 1: Initialization
    -----------------------
    Occurs synchronously after Stage 0. This Component's [final](#final) property is partially
    filled. Simple flag properties are set. Empty containers are placed for all child types. If this
    Component is a `@spare` then markdown is rendered. Modifiers are processed into the
    [finalization](.Finalization). The local Booleans [ctype](#ctype), [isClassValtype]
    (#isClassValtype) and [isJSONValtype](#isJSONValtype) are processed into the output Booleans
    [isFunction](.Finalization#isFunction), [isCallback](.Finalization#isCallback), [isClasslike]
    (.Finalization#isClasslike) and [isInline](.Finalization#isInline).

    Stage 2: Inheritence
    --------------------


    Stage 3: Preparation
    --------------------

*/
Component.prototype.finalize = function (filters, callback) {
    var self = this;

    if (!this.ctype) {
        this.ctype = Patterns.delimiters[this.path[this.path.length-1][0]];
        this.logger.warn ({ declaration:this.ctype, type:this.pathstr }, 'guessed unknown declaration');
    }

    // this is a leaves-first operation
    var childSets = [
        values (this.spare),
        values (this.property),
        values (this.member),
        values (this.event),
        values (this.local),
        values (this.propertySymbols),
        values (this.memberSymbols),
        values (this.returnsSymbols),
        this.argument,
        this.throws,
        this.returns,
        this.signature
    ];
    var children = concatArrs.apply (this, childSets);
    this.hasChildren = Boolean (children.length);

    // deal with @details and @summary
    this.doc = this.doc.filter (function (item) { return Boolean (item.value.length); });
    if (this.ctype != 'spare' && this.doc.length) {
        // all documentation is expressed as spares.
        // Raw docs become ~details, ~summary, or both.
        var noSummary, noDetails;
        if (!this.spare.summary) { // we have to create a summary node
            noSummary = true;
            this.spare.summary = new Component (
                this.context,
                concatArrs (this.path, [[ '~', 'summary' ]]),
                this
            );
            childSets[0].push (this.spare.summary);
            children.push (this.spare.summary);
        }
        if (!this.spare.details) { // we have to create a details node
            noDetails = true;
            this.spare.details = new Component (
                this.context,
                concatArrs (this.path, [[ '~', 'details' ]]),
                this
            );
            childSets[0].push (this.spare.details);
            children.push (this.spare.details);
        }
        if (noDetails || !noSummary)
            this.spare.details.submit ({ ctype:'spare', doc:this.doc });
        else
            this.spare.details.submit ({ ctype:'spare' });
        if (noSummary)
            this.spare.summary.submit ({ ctype:'spare', doc:this.doc });
        else
            this.spare.summary.submit ({ ctype:'spare' });
    }

    this.isTotallyEmpty = !children.length;

    async.each (children, function (child, callback) {
        child.finalize (filters, callback);
    }, function(){
        process.nextTick (function(){
            // sanitize child names
            for (var i=0,j=childSets.length; i<j; i++) {
                var set = childSets[i];
                var namespace = {};
                for (var k=0,l=set.length; k<l; k++) {
                    var child = set[k];
                    child.sanitaryName = sanitizeName (
                        child.final.name || child.path[child.path.length-1][1],
                        namespace
                    );
                }
            }

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

            if (self.ctype == 'spare')
                return callback();

            if (Object.hasOwnProperty.call (self.spare, 'constructor'))
                self.final.constructorDoc = self.spare.constructor.final.doc;

            // now the spares are compiled down to a final doc
            self.final.spares = [];
            var sparenames = Object.keys (self.spare);
            sparenames.sort();
            for (var i=0, j=sparenames.length; i<j; i++) {
                var sname = sparenames[i];
                if (!SPECIAL_SPARES.hasOwnProperty (sname)) {
                    var spare = self.spare[sname];
                    if (filters.showDev || !spare.final.isDevelopment)
                        self.final.spares.push (spare.final);
                }
            }

            var sourceDoc = self.inherited = self.inherit();
            // do we need to display ourself or our children? All of them?
            var showAPI = Boolean (filters.showAPI);
            var showDev = Boolean (filters.showDev);
            var showNormal = !showAPI;
            if (!showNormal && !showDev && !showAPI)
                return callback();

            // copy children into self.final
            for (var i=0,j=COPY_CHILDREN.length; i<j; i++) {
                var propName = COPY_CHILDREN[i];
                var props = Object.hasOwnProperty.call (sourceDoc, propName) ?
                    sourceDoc[propName]
                  : self[propName]
                  ;
                if (!(props instanceof Array))
                    props = Object.keys (props).map (function (key) { return props[key]; });
                for (var k=0,l=props.length; k<l; k++) {
                    var child = props[k];
                    if (
                        (!showNormal || child.final.isDevelopment)
                     && (!showDev || !child.final.isDevelopment)
                     && (!showAPI || !child.isApi)
                    )
                        continue;
                    var finalChild = shallowCopy (child.final);
                    if (!matchPaths (finalChild.source, self.path || []))
                        finalChild.isInherited = true;
                    for (var m=0,n=self.interfaces.length; m<n; m++)
                        if (Object.hasOwnProperty.call (self.interfaces[m].property, key))
                            finalChild.satisfies.push ({
                                path:       self.interfaces[m].path,
                                pathstr:    self.interfaces[m].pathstr,
                            });

                    if (Object.hasOwnProperty.call (SPECIAL_CTYPES, child.ctype))
                        self.final[child.ctype].push (finalChild);
                    else if (Object.hasOwnProperty.call (SPLIT_FUNCTIONS, propName))
                        if (finalChild.isFunction)
                            self.final[SPLIT_FUNCTIONS[propName][0]].push (finalChild);
                        else
                            self.final[SPLIT_FUNCTIONS[propName][1]].push (finalChild);
                    else if (Object.hasOwnProperty.call (CONVERT_NAMES, propName))
                        self.final[CONVERT_NAMES[propName]].push (finalChild);
                    else
                        self.final[propName].push (finalChild);
                }
            }

            for (var i=0,j=SORT_CHILDREN.length; i<j; i++)
                self.final[SORT_CHILDREN[i]].sort (componentSorter);

            // if we are an @alias, duplicate the target into our file
            if (self.aliasTo) {
                self.final.aliasTo = self.aliasTo;
                for (var i=0, j=ALIAS_PROPS.length; i<j; i++) {
                    var key = ALIAS_PROPS[i];
                    self.final[key] = self.aliasTo.final[key];
                }
            }

            callback();
        });
    });

    // =================================================================== children have been primed
    var now = new Date();
    var minutes = now.getMinutes();
    if (minutes < 10) minutes = '0' + minutes;
    var timestring = (now.getHours()%12||12)+':'+minutes+(now.getHours()<12?'am':'pm');
    var realName;
    this.final = {
        elemID:             getElemID(),
        date:               now.toLocaleDateString(),
        time:               timestring,
        name:               realName = this.name || DEFAULT_NAMES[this.ctype],
        pathname:           this.pathname,
        pathstr:            this.pathstr,
        path:               this.path,
        flags:              [],
        source:             this.parent ? this.parent.path : [],
        sourcestr:          this.parent ? this.parent.pathstr : '',
        superClasses:       [],
        interfaces:         [],
        satisfies:          [],
        ctype:              this.ctype,
        valtype:            this.valtype,
        isKwarg:            Boolean (this.isKeywordArg),
        isMultiArg:         Boolean (this.isMultiArg),
        isFunction:
            this.ctype == 'callback'
         || this.ctype == 'iterator'
         || this.ctype == 'generator'
         ,
        isSpare:            this.ctype == 'spare',
        sigargs:            this.sigargs,
        simpleCtype:        Patterns.delimiters[Patterns.delimitersInverse[this.ctype]],
        hideCtype:          HIDDEN_CTYPES[this.ctype] || false,
        modules:            [],
        enums:              [],
        statics:            [],
        functions:          [],
        members:            [],
        methods:            [],
        localValues:        [],
        localFunctions:     [],
        arguments:          [],
        finalArgs:          [],
        finalKwargs:        [],
        returns:            [],
        throws:             [],
        names:              [],
        events:             [],
        signatures:         [],
        propertySymbols:    [],
        memberSymbols:      [],
        returnsSymbols:     [],
        hasChildren:        this.hasChildren
    };

    if (this.ctype == 'spare') { // render markdown
        var finalsubdocs = [];
        for (var i=0, j=this.doc.length; i<j; i++) {
            // remove leading indentation
            var baseStr = this.doc[i].value;
            if (!baseStr) continue;
            var frags = baseStr.split ('\n');
            var indentSeq;
            // check each line and create the longest-possible indent sequence string
            for (var k=0,l=frags.length; k<l; k++) {
                var fraginfo = INDENT_REGEX.exec (frags[k]);
                if (!fraginfo) continue;
                var whitespace = fraginfo[1];
                if (indentSeq === undefined) {
                    indentSeq = whitespace;
                    continue;
                }
                for (var m=0, n=indentSeq.length; m<n; m++) {
                    if (indentSeq[m] != whitespace[m]) {
                        indentSeq = indentSeq.slice (0, Math.max (0, m-1));
                        break;
                    }
                }
            }

            // remove the indent sequence from each line
            if (indentSeq) {
                var len = indentSeq.length;
                for (var k=0, l=frags.length; k<l; k++) {
                    var frag = frags[k];
                    if (frag.match (INDENT_REGEX))
                        frags[k] = frag.slice (len);
                }
            }

            // reassemble the document
            var finalStr = '';
            for (var k=0, l=frags.length; k<l; k++) {
                var fragstr = frags[k] = frags[k].replace (/[\s\n\r]*$/, '');
                if (k && fragstr[0] == '('  && frags[k-1][frags[k-1].length-1] == ']')
                    finalStr += fragstr
                else
                    finalStr += '\n' + fragstr;
            }

            finalsubdocs.push ({ doc:finalStr, context:this.doc[i].context });
        }

        // document ready - time for markdown
        this.final.doc = finalsubdocs;
    } else {
        if (this.spare.summary)
            this.final.summaryDoc = this.spare.summary.final.doc;
        if (this.spare.details)
            this.final.details = this.spare.details.final.doc;
    }

    // sift through our modifiers and set basic flag props where necessary
    var flagsSet = {};
    for (var i=0,j=this.modifiers.length; i<j; i++) {
        var mod = this.modifiers[i];
        if (Patterns.booleanModifiers.hasOwnProperty (mod.mod)) {
            if (mod.path)
                logger.warn ({ type:this.pathstr, modifier:mod, ignored:mod.path }, 'ignored path');
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
                logger.warn ({ modifier:'super', type:this.pathstr }, 'modifier missing path');
            continue;
        }
        if (mod.mod == 'implements') {
            if (mod.path)
                try {
                    this.interfaces.push (this.context.resolve (mod.path));
                } catch (err) {
                    logger.warn (
                        { modifier:'implements', type:this.pathstr, failed:mod.path },
                        'modifier could not resolve path'
                    );
                }
            else
                logger.warn ({ modifier:'implements', type:this.pathstr }, 'modifier missing path');
            continue;
        }
        if (mod.mod == 'alias') {
            if (mod.path)
                try {
                    this.aliasTo = this.context.resolve (mod.path);
                } catch (err) {
                    logger.warn (
                        { modifier:'alias', type:this.pathstr, failed:mod.path },
                        'modifier could not resolve path'
                    );
                }
            else
                logger.warn ({ modifier:'alias', type:this.pathstr }, 'modifier missing path');
        }
        if (mod.mod == 'remote') {
            if (mod.path)
                try {
                    this.remotePath = mod.path[mod.path.length-1][1];
                } catch (err) {
                    logger.warn (
                        { modifier:'implements', type:this.pathstr, failed:mod.path },
                        'modifier could not resolve path'
                    );
                }
            else
                logger.warn ({ modifier:'remote', type:this.pathstr }, 'modifier missing path');
            continue;
        }
    }

    // process value types and check whether this Component lists "f|Function" or "class" as a type
    for (var i=0,j=this.valtype.length; i<j; i++) {
        var thistype = this.valtype[i].path;
        if (matchPaths (thistype, [ [ '.', 'Function' ] ]) || matchPaths (thistype, [ [ '.', 'function' ] ]))
            this.final.isFunction = true;
        else if (matchPaths (thistype, [ [ '.', 'class' ] ])) {
            this.isClassValtype = true;
            continue;
        } else if (matchPaths (thistype, [ [ '.', 'json' ] ])) {
            this.isJSONValtype = true;
            thistype = 'Object';
        }
    }

    // certain special cases/flags
    if (this.ctype == 'callback')
        this.final.isCallback = true;
    if (
        this.ctype == 'class'
     || this.isClassValtype
    )
        this.final.isClasslike = true;

    if (this.isJSONValtype || this.ctype == 'enum')
        this.final.isInline = true;
};

/**     @member/Function inherit
    Gather children from superclasses and merge them, in order, into a document representing this
    Component's inheritence. **Note:** this Component's children will *also* be merged in.
@returns/doczar.Component
    The assembled inheritence document is returned. It looks like an incomplete Component instance,
    containing only child Components.
*/
Component.prototype.inherit = function (loops) {
    if (!loops)
        loops = {};
    if (!this.didProcessInheritence)
        for (var i=0, j=this.superClasses.length; i<j; i++) {
            var classname = this.superClasses[i];
            try {
                var supertype = this.context.resolve (classname);
            } catch (err) {
                this.logger.warn (
                    { type:this.pathstr, parent:classname },
                    'cannot find parent class'
                );
                continue;
            }
            var supername = supertype.pathstr;
            if (Object.hasOwnProperty.call (loops, supername))
                continue;
            loops[supername] = true;
            this.final.superClasses.push (supertype);
            this.didProcessInheritence = true;
        }

    var output = {
        property:           {},
        propertySymbols:    {},
        member:             {},
        memberSymbols:      {},
        event:              {}
    };
    for (var i=0,j=this.superClasses.length; i<j; i++) {
        var classname = this.superClasses[i];
        try {
            var supertype = this.context.resolve (classname);
        } catch (err) {
            this.logger.warn (
                { type:this.pathstr, parent:classname },
                'cannot find parent class'
            );
            continue;
        }
        var superdoc = supertype.inherit (loops);

        for (var key in superdoc.property)
            output.property[key] = superdoc.property[key];
        for (var key in superdoc.member)
            output.member[key] = superdoc.member[key];
        for (var key in superdoc.event)
            output.event[key] = superdoc.event[key];

        if (this.final.isFunction) {
            if (superdoc.argument) {
                output.argument = [];
                for (var k=0,l=superdoc.argument.length; k<l; k++)
                    output.argument.push (superdoc.argument[k]);
            }

            if (superdoc.returns) {
                output.returns = [];
                for (var k=0,l=superdoc.returns.length; k<l; k++)
                    output.returns.push (superdoc.returns[k]);
            }

            if (superdoc.throws) {
                output.throws = [];
                for (var k=0,l=superdoc.throws.length; k<l; k++)
                    output.throws.push (superdoc.throws[k]);
            }

            if (superdoc.signature) {
                output.signature = [];
                for (var k=0,l=superdoc.signature.length; k<l; k++)
                    output.signature.push (superdoc.signature[k]);
            }
        }
    }

    for (var key in this.property) {
        if (Object.hasOwnProperty.call (output.property, key)) {
            var override = output.property[key];
            this.property[key].final.override = {
                path:       override.path,
                name:       override.pathstr
            };
        }
        output.property[key] = this.property[key];
    }
    for (var key in this.member) {
        if (Object.hasOwnProperty.call (output.member, key)) {
            var override = output.member[key];
            this.member[key].final.override = {
                path:       output.member[key].path,
                name:       output.member[key].pathstr
            };
        }
        output.member[key] = this.member[key];
    }
    for (var key in this.event) {
        if (Object.hasOwnProperty.call (output.event, key)) {
            var override = output.event[key];
            this.event[key].final.override = {
                path:       output.event[key].path,
                name:       output.event[key].pathstr
            };
        }
        output.event[key] = this.event[key];
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
@callback callback
    @argument/Error err
        Filesystem errors and critical failures which hault document assembly will be returned.
*/
Component.prototype.writeFiles = function (basedir, baseTagPath, callback) {
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
            'spare', 'property', 'member', 'argument', 'returns', 'throws', 'event', 'local'
        ];
        var children = {};
        for (var i=0, j=collectionsToWrite.length; i<j; i++) {
            var colDir = collectionsToWrite[i];
            var collection = self[colDir];
            if (Object.keys (collection).length)
                children[colDir] = Object.keys (collection);
        }

        var localWarnings = [];
        var page = Templates.render (self, localWarnings);

        fs.writeFile (path.join (basedir, 'index.html'), page, function (err) {
            if (err) return callback (err);
            async.each (Object.keys (children), function (colDir, callback) {
                var uniqueNames = {};
                async.each (children[colDir], function (i, callback) {
                    var child = self[colDir][i];
                    if (child.final)
                        child.writeFiles (
                            path.join (
                                basedir,
                                colDir,
                                child.sanitaryName
                            ),
                            baseTagPath + '../../',
                            callback
                        );
                    else callback();
                }, callback);
            }, callback);
        });
    });
};

module.exports = Component;
