
/**     @module/class doczar.ComponentCache
    Roots a document tree and builds all the [Components](doczar.Component) that live inside it.
    [Looks up](#resolve) and [creates](#getComponent) [Components](doczar.Component) by path.
    Centralizes [finalization](#finalize) and [filesystem output](#writeFiles).
@argument/bunyan.Logger logger
    Any interesting events produced by any [Component](doczar.Component) generated on this cache
    will be logged on this [Logger](bunyan.Logger).
@Object #root
    Stores the global namespace in the property `property`, so `this.root = { property:{ } };`.
*/

var path            = require ('path');
var async           = require ('async');
var mkdirp          = require ('mkdirp');
var fs              = require ('fs-extra');
var Component       = require ('./Component');
var Patterns        = require ('./Patterns');
var Templates       = require ('./Templates');
var sanitizeName    = require ('./sanitizeName');

var concatArrs = function(){
    var out = [];
    for (var i=0,j=arguments.length; i<j; i++)
        out.push.apply (out, arguments[i]);
    return out;
};
var isArr = function (a) {
    if (!a) return false;
    return a.__proto__ === Array.prototype;
};

var ComponentCache = function (logger) {
    this.logger = logger;
    this.root = { module:{}, property:{}, hasChildren:true };
};

/**     @member/Function getComponent
    Find or create a [Component](doczar.Component) for a given path. This is the only official way
    to create a Component.
@argument/Array[Array] tpath
    An Array path for the desired Component, as `[ [ ".", "Foo" ], [ "#", "Bar" ], ...]`.
@returns/doczar.Component
*/
ComponentCache.prototype.getComponent = function (tpath) {
    var pointer = this.root;
    for (var i=0,j=tpath.length; i<j; i++) {
        var step = tpath[i];
        var fragCType = Patterns.delimiters[step[0]];
        var location = pointer[fragCType];
        var fragName = step[1] || '';
        try {
            if (isArr (location))
                if (step[1] && Object.hasOwnProperty.call (pointer[fragCType+'ByName'], step[1]))
                    pointer = pointer[fragCType+'ByName'][step[1]];
                else {
                    var newComponent = new Component (
                        this,
                        tpath.slice (0, i+1),
                        pointer !== this.root ? pointer : undefined,
                        fragCType,
                        this.logger
                    );
                    location.push (newComponent);
                    if (fragName)
                        pointer[fragCType+'ByName'][fragName] = newComponent;
                    else {
                        var unname = newComponent.path[newComponent.path.length-1][1];
                        pointer[fragCType+'ByName'][unname] = newComponent;
                    }
                    pointer = newComponent;
                }
            else {
                var locationName = step[2] ? fragCType+'Symbols' : fragCType;
                location = pointer[locationName];
                if (Object.hasOwnProperty.call (location, fragName))
                    pointer = location[fragName];
                else {
                    pointer = location[fragName] = new Component (
                        this,
                        tpath.slice (0, i+1),
                        pointer !== this.root ? pointer : undefined,
                        locationName,
                        this.logger
                    );
                }
            }
        } catch (err) {
            throw err;
            var uglypath = '';
            for (var i=0,j=tpath.length; i<j; i++)
                uglypath += (tpath[i][0]||'.') + tpath[i][1];
            throw new Error ('invalid path '+uglypath);
        }
    }

    return pointer;
};

/**     @member/Function resolve
    Return an existing Component for a path or throw an [Error]() if it is not found.
@argument/Array[Array] tpath
    An Array path for the desired Component, as `[ [ ".", "Foo" ], ...]`.
@returns/doczar.Component
@throws/Error `not found`
    An existing Component was not found on the specified path.
@throws/Error `invalid path`
    The path specified was not a valid Array, or was empty.
*/
ComponentCache.prototype.resolve = function (tpath) {
    if (!tpath || !tpath.length)
        throw new Error ('invalid path');

    var rootName = tpath[0][1];
    var rootLocation = tpath[0][0] == ':' ? 'module' : 'property';
    var pointer;
    if (Object.hasOwnProperty.call (this.root.property, rootName))
        pointer = this.root.property[rootName];
    else if (Object.hasOwnProperty.call (this.root.module, rootName))
        pointer = this.root.module[rootName];
    else
        throw new Error ('not found');

    for (var i=1,j=tpath.length; i<j; i++) {
        var step = tpath[i];
        if (step[1][0] == '`')
            step = [ step[0], step[1].slice (1, -1), step[2] ];
        var stepCType = Patterns.delimiters[step[0]||'.'];
        var location;
        if (pointer.inherited && Object.hasOwnProperty.call (pointer.inherited, stepCType))
            location = pointer.inherited[stepCType];
        else
            location = pointer[stepCType];
        var fragName = step[1] || '';
        if (isArr (location))
            if (step[1] && Object.hasOwnProperty.call (pointer[stepCType+'ByName'], step[1]))
                pointer = pointer[stepCType+'ByName'][step[1]];
            else
                throw new Error ('not found');
        else {
            if (step[2])
                location = pointer[stepCType+'Symbols'];
            if (Object.hasOwnProperty.call (location, fragName))
                pointer = location[fragName];
            else
                throw new Error ('not found');
        }
    }
    return pointer;
};


/**     @member/Function submit
    Retrieve an existing or new [Component](doczar.Component) from this cache by the specified path
    and call [submit](doczar.Component#submit) on it with the provided `info` Object.
@argument/Array[Array] tpath
    A type path, as `[ [ '.', 'Foo' ], ...]`.
@argument/Object info
    An Object containing fresly-parsed data that will be overwritten into the requested [Component]
    (doczar.Component).
*/
ComponentCache.prototype.submit = function (tpath, info) {
    var pointer = this.getComponent (tpath);
    pointer.submit (info);
    return pointer;
};


/**     @member/Function finalize
    [Prepare](doczar.Component#finalize) every [Component](doczar.Component) in the cache for
    rendering and execute a callback.
@argument/Object options
@callback
    Called when ready to [output files](#writeFiles). No arguments.
*/
ComponentCache.prototype.finalize = function (options, callback) {
    var self = this;
    var namespace = {};
    async.parallel ([
        function (callback) {
            var keys = Object.keys (self.root.property);
            async.each (keys, function (propname, callback) {
                self.root.property[propname].finalize (options, callback);
            }, callback);
        },
        function (callback) {
            var keys = Object.keys (self.root.module);
            async.each (keys, function (propname, callback) {
                self.root.module[propname].finalize (options, callback);
            }, callback);
        }
    ], function(){
        var keys = Object.keys (self.root.module);
        for (var i=0,j=keys.length; i<j; i++) {
            var child = self.root.module[keys[i]];
            child.sanitaryName = sanitizeName (child.final.name, namespace);
        }
        var keys = Object.keys (self.root.property);
        for (var i=0,j=keys.length; i<j; i++) {
            var child = self.root.property[keys[i]];
            child.sanitaryName = sanitizeName (child.final.name, namespace);
        }
        callback();
    });
};


/**     @member/Function getRelativeURLForType
    Attempt to produce a relative url to link from one Component's root output page to another. If
    this cannot be done for any reason, `"javascript:return false;"` is returned to produce a dead
    link.
@argument/Array[Array] start
    The Component whose root page is requesting this href.
@argument/Array[Array] type
    The Component to which the root page must link.
@returns/String
    Either a relative url to the requested Component's root page, or `"javascript:return false;"`.
*/
ComponentCache.prototype.getRelativeURLForType = function (start, type) {
    if (!type || !type.length) {
        return 'javascript:return false;';
    }

    var sameFromRoot = 0;
    try {
        for (var i=0,j=start.length; i<j; i++)
            if (
                type[i]
             && start[i][1] == type[i][1]
             && (
                    !start[i][0]
                 || !type[i][0]
                 || start[i][0] == type[i][0]
                )
            )
                sameFromRoot++;
            else
                break;
    } catch (err) {
        return 'javascript:return false;';
    }

    // advance a pointer to ensure existence of the ancestor
    var str = '';
    var pointer = this.root;
    var location, stepCType;
    for (var i=0; i<sameFromRoot; i++) {
        stepCType = Patterns.delimiters[type[i][0]||'.']
        if (pointer.inherited && Object.hasOwnProperty.call (pointer.inherited, stepCType))
            location = pointer.inherited[stepCType];
        else
            location = pointer[stepCType];
        if (isArr (location))
            location = pointer[stepCType+'ByName'];
        else if (type[i][2]) // Symbol
            location = pointer[stepCType+'Symbols'];
        pointer = location[type[i][1]];
        if (!pointer)
            return 'javascript:return false;';
    }

    // create a ../../ navback
    for (var i=0, j=start.length-sameFromRoot; i<j; i++)
        str += '../../';
    if (type.length == sameFromRoot) {
        if (pointer.remotePath)
            return pointer.remotePath;
        return str += 'index.html';
    }

    // add steps from the common ancestor
    // stop before the last step
    for (var i=sameFromRoot, j=type.length-1; i<j; i++) {
        var frag = type[i];
        stepCType = Patterns.delimiters[frag[0]||'.']
        if (pointer.inherited && Object.hasOwnProperty.call (pointer.inherited, stepCType))
            location = pointer.inherited[stepCType];
        else
            location = pointer[stepCType];
        var childClass = Patterns.delimiters[frag[0]||'.'];
        if (isArr (location))
            location = pointer[stepCType+'ByName'];
        else if (frag[2]) { // Symbol
            location = pointer[stepCType+'Symbols'];
            childClass += 'Symbols';
        }
        try {
            pointer = location[frag[1]];
        } catch (err) {
            self.logger.error (err);
            return 'javascript:return false;';
        }
        if (!pointer)
            return 'javascript:return false;';
        str += childClass + '/';
        if (frag[1])
            str += pointer.sanitaryName + '/';
    }

    // prepare to take the last step
    var finalI = type.length - 1;
    var finalName = type[finalI];
    var childClass = Patterns.delimiters[finalName[0]||'.'];
    stepCType = Patterns.delimiters[type[finalI][0]||'.'];
    if (pointer.inherited && Object.hasOwnProperty.call (pointer.inherited, stepCType))
        location = pointer.inherited[stepCType];
    else
        location = pointer[stepCType];
    if (isArr (location))
        location = pointer[stepCType+'ByName'];
    else if (type[finalI][2]) { // Symbol
        location = pointer[stepCType+'Symbols'];
        childClass += 'Symbols';
    }
    pointer = location[finalName[1]];
    if (!pointer)
        return 'javascript:return false;';

    // @remote
    if (pointer.remotePath)
        return pointer.remotePath;

    // if the Component has no children it has no root page
    if (!pointer.hasChildren && pointer.ctype != 'spare')
        // link to its parent and hashlink the last step
        str += 'index.html#' + pointer.final.elemID;
    else {
        str += childClass + '/';
        if (finalName[1])
            str += pointer.sanitaryName + '/index.html';
        else
            return 'javascript:return false;'
    }
    return str;
};


/**     @member/Function writeFiles
    Create the requested base directory if it does not already exist. Configure and render the base
    `index.html` file for the root. Copy in global content from `./indexFiles`. Recursively work
    through the root and call [writeFiles](doczar.Component#writeFiles) on all immediate child
    Components. Hit the callback when all Components have recursively written their output files, or
    if an Error interrupts the process.
@argument/String basedir
    The full path of the root directory where Components should output their files.
*/
ComponentCache.prototype.writeFiles = function (basedir, options, callback) {
    var self = this;

    function writeChildren (err) {
        if (err)
            return callback (err);
        async.parallel ([
            function (callback) {
                var rootdir = path.join (basedir, 'property');
                async.each (Object.keys (self.root.property), function (propname, callback) {
                    var prop = self.root.property[propname];
                    if (
                        ( options.showAPI && prop.isApi)
                     || ( !options.showAPI && ( !prop.isDevelopment || options.showDev ) )
                    )
                        self.root.property[propname].writeFiles (
                            path.join (rootdir, propname),
                            '../../',
                            options,
                            callback
                        );
                    else return callback();
                }, callback);
            },
            function (callback) {
                var rootdir = path.join (basedir, 'module');
                async.each (Object.keys (self.root.module), function (modname, callback) {
                    var module = self.root.module[modname];
                    if (
                        ( options.showAPI && module.isApi)
                     || ( !options.showAPI && ( !module.isDevelopment || options.showDev ) )
                    )
                        self.root.module[modname].writeFiles (
                            path.join (rootdir, modname),
                            '../../',
                            options,
                            callback
                        );
                    else return callback();
                }, callback);
            }
        ], callback);
    }

    async.parallel ([
        function (callback) { mkdirp (path.join (basedir, 'property'), callback); },
        function (callback) { mkdirp (path.join (basedir, 'module'), callback); },
    ], function (err) {
        if (err) return callback (err);
        if (options.json) {
            var modules = [];
            var globals = [];
            for (var key in self.root.property)
                globals.push (self.root.property[key].final);
            for (var key in self.root.module)
                modules.push (self.root.module[key].final);
            var timestring =
                (options.date.getHours()%12||12)
              + ':'
              + (options.date.getMinutes())
              + (options.date.getHours()<12?'am':'pm')
              ;
            return fs.writeFile (
                path.join (basedir, 'index.json'),
                JSON.stringify ({
                    modules:        modules,
                    globals:        globals,
                    date:           options.date.toLocaleDateString(),
                    time:           timestring
                }),
                writeChildren
            );
        }

        async.parallel ([
            function (callback) {
                var indexSourcePath = path.join (
                    path.resolve (path.dirname (module.filename), '../'),
                    'indexFiles'
                );
                if (options.json) // skip this step for json output
                    return callback();
                async.each ([ // copy anything we need to the root
                    'index.css',
                    'index.js',
                    'symbolLink.png'
                ], function (fnameToCopy, callback) {
                    fs.copy (
                        path.join (indexSourcePath, fnameToCopy),
                        path.join (basedir, fnameToCopy),
                        callback
                    );
                }, callback);
            },
            function (callback) {
                fs.copy (
                    path.join (
                        path.resolve (path.dirname (module.filename), '../'),
                        'node_modules',
                        'highlight.js',
                        'styles',
                        options.codeStyle + '.css'
                    ),
                    path.join (basedir, 'highlight.css'),
                    callback
                );
            }
        ], function (err) {
            if (err)
                return callback (err);
            var rootPage = Templates.renderRoot (self.root, self);
            fs.writeFile (path.join (basedir, 'index.html'), rootPage, writeChildren);
        });
    });
};


module.exports = ComponentCache;
