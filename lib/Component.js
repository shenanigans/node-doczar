
var url = require ('url');
var fs = require ('fs');
var path = require ('path');
var async = require ('async');
var mkdirp = require ('mkdirp');
var marked = require ('marked');
var Handlebars = require ('handlebars');
var highlight = require ('highlight.js');
var Patterns = require ('./Patterns');

var INDENT_REGEX = /^(\s*)[^\s]+/;
var SPECIAL_SPARES = { summary:true, details:true, constructor:true };
var nextID = 1;
function getSimpleID () { return 'unnamed_'+(nextID++); }
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

var markedRenderer = new marked.Renderer();
var currentComponentContext; // this hack passes the Component calling marked into the link processor
var currentLinkContext; // this hack passes the link's scope into the link processor
markedRenderer.link = function (href, title, text) {
    var target = url.parse (href);
    if (target.protocol == 'http:' || target.protocol == 'https:')
        return '<a href="'+href+'">' + ( text || href ) + '</a>'

    if (!target.protocol) {
        // typelink
        var type = [];
        var typeMatch;
        while (typeMatch = Patterns.word.exec (href))
            type.push ([ typeMatch[1], typeMatch[2] ]);
        if (type[0][0])
            type = concatArrs (currentLinkContext, type)
        else type[0][0] = '.';

        return '<a href="'
         + currentComponentContext.context.getRelativeURLForType (
            currentComponentContext.path,
            type
         )
         + '">'
         + ( text || href )
         + '</a>'
         ;
    }

    return href;
};
marked.setOptions ({
    gfm:        true,
    renderer:   markedRenderer,
    highlight:  function (code, lang) {
        if (lang)
            return highlight.highlightAuto (code, [ lang ]).value;
        return highlight.highlightAuto (code).value;
    }
});

// we must load templates and partials
var templatesPath = path.resolve (path.dirname (module.filename), '../templates');
var partialsPath = path.join (templatesPath, 'partials');

var partials = {};
var pnames = fs.readdirSync (partialsPath);
for (var i in pnames) {
    var currentTemplateName = pnames[i];
    if (currentTemplateName[0] == '.' || currentTemplateName.slice (-5) != '.bars')
        continue;
    Handlebars.registerPartial (
        currentTemplateName.slice (0, -5),
        fs.readFileSync (path.join (partialsPath, currentTemplateName)).toString ('utf8')
    );
}

Handlebars.registerHelper ('markdown', function (doc) {
    var out = '';
    for (var i in doc) {
        var frag = doc[i];
        currentLinkContext = frag.context;
        out += marked (frag.doc);
    }
    return out;
});

Handlebars.registerHelper ('link', function (tpath) {
    return currentComponentContext.context.getRelativeURLForType (
        currentComponentContext.path, tpath
    );
});

var templates = {};
var tfnames = fs.readdirSync (templatesPath);
for (var i in tfnames) {
    var currentTemplateName = tfnames[i];
    if (currentTemplateName[0] == '.' || currentTemplateName.slice (-5) != '.bars')
        continue;
    templates[currentTemplateName.slice (0, -5)] =
        Handlebars.compile (
            fs.readFileSync (path.join (templatesPath, currentTemplateName)).toString ('utf8'),
            { disableLambda:true }
        )
        ;
}


/**     @module/Function doczar.Component
    Some summary information about `Component`.
    * some
    * markdown
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
@Object|undefined #final
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

    this.name = tpath[tpath.length-1][1] || '';
    this.pathstr = '';
    for (var i in this.path)
        this.pathstr += this.path[i][0] + this.path[i][1];

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

/**     @member/Function finalize
    Create a representative document ready for rendering and save it to [final](#final).
@argument/Array errors
    An empty Array to fill with error messages as JSON documents. See [#errors](#errors).
@argument/Array warnings
    An empty Array to fill with warning messages as JSON documents. See [#warnings](#warnings).
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
        callback();
    });

    // =================================================================== now it's our turn
    if (this.hasAPI)
        this.parent.hasAPI = true;

    // sift through our modifiers and set basic flag props where necessary
    for (var i in this.modifiers) {
        var mod = this.modifiers[i];
        if (mod.mod == 'development') {
            this.isDev = true;
            continue;
        }
        if (mod.mod == 'api') {
            this.isAPI = true;
            this.parent.hasAPI = true;
            continue;
        }
    }

    var valtypes = [];
    for (var i in this.valtype) {
        var thistype = this.valtype[i];
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

    this.final = {
        name:           this.path[this.path.length-1][1],
        pathname:       this.name || getSimpleID(),
        path:           this.path,
        ctype:          this.ctype,
        simpleCtype:    Patterns.delimiters[Patterns.delimitersInverse[this.ctype]],
        valtype:        valtypes
    };

    if (this.ctype == 'spare') {
        // render markdown
        var finalsubdocs = [];
        for (var i in this.doc) {
            // remove leading indentation
            var baseStr = this.doc[i].value;
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

            finalsubdocs.push ({ doc:frags.join ('\n'), context:this.doc[i].context });
        }

        // document ready - time for markdown
        this.final.doc = finalsubdocs;
    } else {
        // not a spare
        if (this.spare.constructor)
            this.final.constructorDoc = { doc:this.spare.constructor.final };

        // now the spares are compiled down to a final doc
        this.final.spares = [];
        var sparenames = Object.keys (this.spare);
        sparenames.sort();
        for (var i in sparenames) {
            var sname = sparenames[i];
            if (!SPECIAL_SPARES.hasOwnProperty (sname)) {
                var spare = this.spare[sname];
                if (options.showDev || !spare.isDev)
                    this.final.spares.push ({
                        name:   spare.name,
                        doc:    spare.final.doc
                    });
            }
        }

        // details, summary, what have we got?
        if (this.spare.details) {
            this.final.details = this.spare.details.final.doc;
            if (this.spare.summary)
                this.final.summaryDoc = this.spare.summary.final.doc;
            else
                this.final.summaryDoc = this.final.details;
        } else if (this.spare.summary)
            this.final.details = this.final.summaryDoc = this.spare.summary.final.doc;

        // properties
        this.final.statics = [];
        this.final.functions = [];
        for (var key in this.property)
            if (
                (
                    options.showAPI
                 && ( this.isAPI || this.hasAPI )
                 && (this.property[key].isAPI || this.property[key].hasAPI)
                )
             || ( !options.showAPI && ( options.showDev || !this.property[key].isDev ) )
            ) {
                var dest = 'statics';
                var vt = this.property[key].valtype;
                for (var i in vt)
                    if (vt[i] == 'function' || vt[i] == 'Function') {
                        dest = 'functions';
                        break;
                    }

                this.final[dest].push (this.property[key].final);
            }

        // members
        this.final.members = [];
        this.final.methods = [];
        for (var key in this.member)
            if (
                (
                    options.showAPI
                 && ( this.isAPI || this.hasAPI )
                 && (this.member[key].isAPI || this.member[key].hasAPI)
                )
             || ( !options.showAPI && ( options.showDev || !this.member[key].isDev ) )
            ) {
                var dest = 'members';
                var vt = this.member[key].valtype;
                for (var i in vt)
                    if (vt[i] == 'function' || vt[i] == 'Function') {
                        dest = 'methods';
                        break;
                    }

                this.final[dest].push (this.member[key].final);
            }

        // arguments
        this.final.arguments = [];
        for (var i in this.argument)
            if (
                (
                    options.showAPI
                 && ( this.isAPI || this.hasAPI )
                 && (this.argument[i].isAPI || this.argument[i].hasAPI)
                )
             || ( !options.showAPI && ( options.showDev || !this.argument[i].isDev ) )
            )
                this.final.arguments.push (this.argument[i].final);

        // returns
        this.final.returns = [];
        for (var i in this.returns)
            if (
                (
                    options.showAPI
                 && ( this.isAPI || this.hasAPI )
                 && (this.returns[i].isAPI || this.returns[i].hasAPI)
                )
             || ( !options.showAPI && ( options.showDev || !this.returns[i].isDev ) )
            )
                this.final.returns.push (this.returns[i].final);

        // modifiers
        for (var modifier in this.mods) {
            var info = this.mods[modifier];
        }
    }

    // create a renderable breadcrumb path
    this.final.breadcrumbs = [];
    var backpath = 'index.html';
    for (var i = this.path.length-1; i>=0; i--) {
        this.final.breadcrumbs.unshift ({
            path:       backpath,
            ctype:      Patterns.delimiters[this.path[i][0]],
            name:       this.path[i][1],
            delimiter:  this.path[i][0]
        });
        backpath = '../../' + backpath;
    }

    // create an ugly string path
    var uglypath = '';
    for (var i in this.path)
        uglypath += this.path[i][0] + this.path[i][1];
    this.final.pathstr = uglypath;

    // constructor functions
    if (
        (this.argument.length || this.returns.length)
     && (this.ctype == 'class' || this.ctype == 'module')
    )
        this.final.constructorFunction = {};
};

/**     @member/Function writeFiles
    Test [link](doczar.ComponentCache) to ComponentCache.
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
        var collectionsToWrite = [ 'spare', 'property', 'member', 'argument', 'returns' ];
        var children = {};
        for (var i in collectionsToWrite) {
            var colDir = collectionsToWrite[i];
            var collection = self[colDir];
            if (Object.keys (collection).length)
                children[colDir] = Object.keys (collection);
        }
        currentComponentContext = self;
        var page = templates[self.ctype](self.final);
        fs.writeFile (path.join (basedir, 'index.html'), page, function (err) {
            if (err) return callback (err);
            async.each (Object.keys (children), function (colDir, callback) {
                async.each (children[colDir], function (i, callback) {
                    var child = self[colDir][i];
                    if (child.final)
                        child.writeFiles (
                            path.join (basedir, colDir, child.final.pathname),
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
