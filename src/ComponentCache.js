
/*      @module:class
    Roots a document tree and builds all the [Components](doczar/src/Component) that live inside it.
    [Looks up](#resolve) and [creates](#getComponent) Components. Centralizes [finalization]
    (#finalize) and [filesystem output](#writeFiles) for all child Components.
@argument:bunyan.Logger logger
    Any interesting events produced by any [Component](doczar/src/Component) generated on this cache
    will be logged on this [Logger](bunyan.Logger).
*/

var path            = require ('path');
var async           = require ('async');
var fs              = require ('fs-extra');
var filth           = require ('filth');
var Component       = require ('./Component');
var Patterns        = require ('./Parser/Patterns');
var Templates       = require ('./Templates');
var sanitizeName    = require ('./sanitizeName');

function pathStr (type) {
    var finalStr = type.map (function (step) {
        if (step.length === 2)
            return step.join ('');
        return step[0] + '[' + step[1] + ']';
    }).join ('')
    return type[0] && type[0][0] ? finalStr.slice (1) : finalStr;
}

var ComponentCache = function (logger) {
    this.logger = logger;
    this.latency = new filth.LatencyLogger();
    this.root = Object.create (null);
    this.resolvedDependencies = Object.create (null);
    this.sources = Object.create (null);
};


ComponentCache.prototype.walkStep = function (scope, step, doCreate) {
    if (!scope) {
        if (Object.hasOwnProperty.call (this.root, step[1]))
            return this.root[step[1]];
        if (!doCreate)
            return;
        return this.root[step[1]] = new Component (
            this,
            [ step ],
            undefined,
            '',
            this.logger
        );
    }
    var fragCType = Patterns.delimiters[step[0]||'.'];
    var locationName = fragCType;
    var stepIsString = typeof step[1] === 'string';
    var copyToArr;
    if (step[2])
        locationName += 'Symbols';
    else if (scope[locationName] instanceof Array && stepIsString) {
        copyToArr = locationName;
        locationName += 'ByName';
    }
    if (stepIsString) {
        if (Object.hasOwnProperty.call (scope[locationName], step[1]))
            return scope[locationName][step[1]];
        if (doCreate) {
            var nextPath = scope.path.concat();
            nextPath.push (step);
            var newComponent = scope[locationName][step[1]] = new Component (
                this,
                nextPath,
                scope,
                locationName,
                this.logger
            );
            if (copyToArr)
                scope[copyToArr].push (newComponent);
            return newComponent;
        }
        if (
            !scope.inherited
         || !Object.hasOwnProperty.call (scope.inherited, locationName)
         || !Object.hasOwnProperty.call (scope.inherited[locationName], step[1])
        )
            return;
        return scope.inherited[locationName][step[1]];
    }

    // integer index
    var index = step[1] !== undefined ? step[1] : (step[1] = scope[locationName].length);
    if (scope[locationName].length > index)
        return scope[locationName][index];
    if (doCreate) {
        var nextPath = scope.path.concat();
        nextPath.push (step);
        for (var i=scope[locationName].length,j=index+1; i<j; i++) {
            scope[locationName][i] = new Component (
                this,
                nextPath,
                scope,
                locationName,
                this.logger
            );
        }
        return scope[locationName][index];
    }
    if (
        !scope.inherited
     || !Object.hasOwnProperty.call (scope.inherited, locationName)
     || scope.inherited[locationName].length <= index
    )
        return;
    return scope.inherited[locationName][index];
}


/*
    Find or create a [Component](doczar/src/Component) for a given path. This is the only supported
    way to create a Component.
@argument:doczar/src/Parser/Path tpath
    The path to retrieve or create.
@returns:doczar/src/Component
    The retrieved or newly created component.
*/
ComponentCache.prototype.getComponent = function (tpath) {
    if (!tpath || !tpath.length || !tpath[0][1])
        throw new Error ('invalid path');

    var pointer;
    for (var i=0,j=tpath.length; i<j; i++)
        pointer = this.walkStep (pointer, tpath[i], true);
    return pointer;
};


/*
    Return an existing [Component](doczar/src/Component) for a [path](doczar/src/Parser/Path] or
    throw an [Error]() if it is not found.
@argument:doczar/src/Parser/Path tpath
    The path to retrieve.
@returns:doczar/src/Component
    The retrieved Component.
@throws:Error `not found`
    An existing Component was not found on the specified path.
@throws:Error `invalid path`
    The path specified was not a valid [Path](doczar.Parser/Path), or was empty.
*/
ComponentCache.prototype.resolve = function (tpath) {
    if (!tpath || !tpath.length || !tpath[0][1])
        throw new Error ('invalid path');

    var pointer;
    for (var i=0,j=tpath.length; i<j; i++)
        if (!(pointer = this.walkStep (pointer, tpath[i], false)))
            throw new Error ('not found');
    return pointer;
};


/*
    Attempt to produce a relative url to link from one [Component](doczar/src/Component) root page
    to another. If this cannot be done for any reason, `"javascript:return false;"` is returned to
    produce a dead link.
@argument:doczar/src/Parser/Path start
    The [Component](doczar/src/Component) whose root page is requesting this href.
@argument:doczar/src/Parser/Path type
    The [Component](doczar/src/Component) to which the root page must link.
@returns:String
    Either a relative url to the requested [Component](doczar/src/Component) root page, or
    `"javascript:return false;"`.
*/
ComponentCache.prototype.getRelativeURLForType = function (start, type, chain) {
    if (!type || !type.length) {
        this.logger.error ({ from:pathStr (start) }, 'cannot generate link to empty path');
        return 'javascript:return false;';
    }

    // determine how close we are to sharing a direct parent
    var sameFromRoot = 0;
    try {
        for (var i=0,j=start.length; i<j; i++)
            if (
                type[i]
             && start[i][1] === type[i][1]
             && (
                    !i
                 || !start[i][0]
                 || !type[i][0]
                 || start[i][0] === type[i][0]
                )
            )
                sameFromRoot++;
            else
                break;
    } catch (err) {
        this.logger.warn ({ from:pathStr (start), to:pathStr (type) }, 'failed to resolve type');
        return 'javascript:return false;';
    }

    // advance a pointer to ensure existence of the ancestor
    if (!Object.hasOwnProperty.call (this.root, type[0][1])) {
        this.logger.warn ({ from:pathStr (start), to:pathStr (type) }, 'failed to resolve type');
        return 'javascript:return false;';
    }
    var pointer  = this.root[type[0][1]];
    if (pointer.aliasTo) {
        if (!chain)
            chain = [ pointer ];
        if (chain.indexOf (pointer.aliasTo) < 0) {
            chain.push (pointer.aliasTo);
            return this.getRelativeURLForType (
                start,
                pointer.aliasTo.path.concat (type.slice (1)),
                chain
            );
        }
    }
    for (var i=1; i<sameFromRoot; i++) {
        pointer = this.walkStep (pointer, type[i], false);
        if (!pointer) {
            this.logger.warn (
                { from:pathStr (start), to:pathStr (type), nearest:pathStr(type.slice (0, i+1)) },
                'failed to resolve type'
            );
            return 'javascript:return false;';
        }
        if (pointer.aliasTo) {
            if (!chain)
                chain = [ pointer ];
            if (chain.indexOf (pointer.aliasTo) < 0) {
                chain.push (pointer.aliasTo);
                return this.getRelativeURLForType (
                    start,
                    pointer.aliasTo.path.concat (type.slice (i+1)),
                    chain
                );
            }
        }
    }

    // start with ../ as many times as necessary
    var resultPath = '';
    for (var i=0, j=start.length-sameFromRoot; i<j; i++)
        resultPath += '../../';
    if (type.length === sameFromRoot)
        if (pointer.remotePath)
            return pointer.remotePath;
        else
            return resultPath += 'index.html';

    // if not starting from root but sameFromRoot === 0, we must manually add the first name
    if (type.length > 1 && !sameFromRoot)
        resultPath +=
            (pointer.ctype === 'module' ? 'module/' : 'property/')
          + pointer.sanitaryName
          + '/'
          ;

    // add steps from the common ancestor
    // stop before the last step
    for (var i=Math.max (1, sameFromRoot), j=type.length-1; i<j; i++) {
        var frag = type[i];
        var childClass = Patterns.delimiters[frag[0]||'.'];
        if (frag[2]) // Symbol
            childClass += 'Symbols';
        pointer = this.walkStep (pointer, frag, false);
        if (!pointer) {
            this.logger.warn ({ from:pathStr (start), to:pathStr (type) }, 'failed to resolve type');
            return 'javascript:return false;';
        }
        if (pointer.aliasTo) {
            if (!chain)
                chain = [ pointer ];
            if (chain.indexOf (pointer.aliasTo) < 0) {
                chain.push (pointer.aliasTo);
                return this.getRelativeURLForType (
                    start,
                    pointer.aliasTo.path.concat (type.slice (i+1)),
                    chain
                );
            }
        }
        resultPath += childClass + '/';
        resultPath += pointer.sanitaryName + '/';
    }

    // walk the last step but do not add to resultPath
    var last = pointer;
    if (type.length > 1 && !(pointer = this.walkStep (pointer, type[type.length-1], false))) {
        this.logger.warn ({ from:pathStr (start), to:pathStr (type) }, 'failed to resolve type');
        return 'javascript:return false;';
    }

    if (pointer.aliasTo) {
        if (!chain)
            chain = [ pointer ];
        if (chain.indexOf (pointer.aliasTo) < 0) {
            chain.push (pointer.aliasTo);
            return this.getRelativeURLForType (
                start,
                pointer.aliasTo.path,
                chain
            );
        }
    }

    // prepare to take the last step
    // if the Component has no children it has no root page
    if (pointer.isTotallyEmpty)
        // link to its parent and hashlink the last step
        resultPath += 'index.html#' + pointer.final.elemID;
    else {
        var lastFrag = type[type.length-1];
        var childClass = lastFrag[0] ?
            Patterns.delimiters[lastFrag[0]]
          : pointer.ctype === 'module' ? 'module' : 'property'
          ;
        if (lastFrag[2])
            childClass += 'Symbols';
        resultPath += childClass + '/';
        resultPath += pointer.sanitaryName + '/index.html';
    }

    // @remote
    if (pointer.remotePath && !pointer.hasChildren)
        return pointer.remotePath;
    return resultPath;
};


/*
    Retrieve an existing or new [Component](doczar/src/Component) from this cache by the specified
    [path](doczar/src/Parser/Path) and call [submit](doczar/src/Component#submit) on it with the
    provided `info` Object.
@argument:doczar/src/Parser/Path tpath
    A path to the Component that should contain the submitted information.
@argument:doczar/src/Component/Submission info
    An Object containing fresly-parsed data that will be overwritten into the requested [Component]
    (doczar/src/Component).
*/
ComponentCache.prototype.submit = function (tpath, info) {
    var pointer = this.getComponent (tpath);
    pointer.submit (info);
    return pointer;
};


/*
    [Prepare](doczar/src/Component#finalize) every [Component](doczar/src/Component) in the cache
    for rendering and execute a callback.
@argument:Object options
@callback
    Called when ready to [output files](#writeFiles). No arguments.
*/
ComponentCache.prototype.finalize = function (options, callback) {
    var self = this;
    var namespace = {};
    var keys = Object.keys (this.root);
    async.each (keys, function (propname, callback) {
        self.root[propname].finalize (options, callback);
    }, function (err) {
        if (err) return callback (err);

        var keys = Object.keys (self.root);
        for (var i=0,j=keys.length; i<j; i++) {
            var child = self.root[keys[i]];
            child.sanitaryName = child.final.sanitaryName = sanitizeName (
                child.final.name || child.path[child.path.length-1][1],
                namespace
            );
        }
        callback();
    });
};


/*
    Create the requested base directory if it does not already exist. Configure and render the base
    `index.html` file for the root. Copy in global content from `./indexFiles`. Recursively work
    through the root and call [writeFiles](doczar/src/Component#writeFiles) on all immediate child
    Components. Hit the callback when all Components have recursively written their output files, or
    if an Error interrupts the process.
@argument:String basedir
    The full path of the root directory where Components should output their files.
@argument:doczar/Options options
@callback
*/
ComponentCache.prototype.writeFiles = function (basedir, options, callback) {
    var self = this;

    function writeChildren (err) {
        self.latency.log ('file system');
        if (err)
            return callback (err);

        async.each (Object.keys (self.root), function (propname, callback) {
            var prop = self.root[propname];
            if (
                ( options.showAPI && prop.isApi)
             || ( !options.showAPI && ( !prop.isDevelopment || options.showDev ) )
            )
                prop.writeFiles (
                    path.join (basedir, prop.ctype == 'module' ? 'module' : 'property', prop.sanitaryName),
                    '../../',
                    options,
                    callback
                );
            else return callback();
        }, function (err) {
            if (err)
                return callback (err);
            callback();
        });
    }

    this.latency.log();

    var modules = [];
    var globals = [];
    for (var key in self.root)
        if (self.root[key].ctype == 'module')
            modules.push (self.root[key].final);
        else
            globals.push (self.root[key].final);

    function sortItems (a, b) {
        var an = a.pathstr.toLowerCase();
        var bn = b.pathstr.toLowerCase();
        if (an == bn) return 0;
        if (an > bn) return 1;
        return -1;
    }
    modules.sort (sortItems);
    globals.sort (sortItems);

    var timestring =
        (options.date.getHours()%12||12)
      + ':'
      + (options.date.getMinutes())
      + (options.date.getHours()<12?'am':'pm')
      ;


    async.parallel ([
        function (callback) {
            if (!globals.length)
                return callback();
            fs.mkdirs (path.join (basedir, 'property'), callback);
        },
        function (callback) {
            if (!modules.length)
                return callback();
            fs.mkdirs (path.join (basedir, 'module'), callback);
        }
    ], function (err) {
        if (err) return callback (err);
        self.latency.log ('file system');
        if (options.json) try {
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
        } catch (err) {
            // something went wrong while attempting to serialize and initiate the file writing op.
            // first let's run through the export doc to see if there are any circular references
            var refs = new Map();
            function findCircular (lvl, path, refs) {
                for (var key in lvl) {
                    var item = lvl[key];
                    var type = filth.typeof (item);
                    if (type === 'object') {
                        var subpath = path.concat();
                        subpath.push (key);
                        if (refs.has(item))
                            throw new Error (subpath.join ('/'));
                        var subrefs = new Map (refs);
                        subrefs.set (item, true);
                        findCircular (item, subpath, subrefs);
                        continue;
                    }
                    if (type === 'array') {
                        var subpath = path.concat();
                        subpath.push (key);
                        if (refs.has(item))
                            throw new Error (subpath.join ('/'));
                        var subrefs = new Map (refs);
                        subrefs.set (item, true);
                        findArrayCircular (item, subpath, subrefs);
                        continue;
                    }
                }
            }
            function findArrayCircular (lvl, path, refs) {
                for (var i=0,j=lvl.length; i<j; i++) {
                    var item = lvl[i];
                    var type = filth.typeof (item);
                    if (type === 'object') {
                        var subpath = path.concat();
                        subpath.push (i);
                        if (refs.has(item))
                            throw new Error (subpath.join ('/'));
                        var subrefs = new Map (refs);
                        subrefs.set (item, true);
                        findCircular (item, subpath, subrefs);
                        continue;
                    }
                    if (type === 'array') {
                        var subpath = path.concat();
                        subpath.push (i);
                        if (refs.has(item))
                            throw new Error (subpath.join ('/'));
                        var subrefs = new Map (refs);
                        subrefs.set (item, true);
                        findArrayCircular (item, subpath, subrefs);
                        continue;
                    }
                }
            }
            try {
                findCircular ({
                    modules:        modules,
                    globals:        globals,
                    date:           options.date.toLocaleDateString(),
                    time:           timestring
                }, [], refs);
            } catch (loopErr) {
                // circular reference detected
                // this is an unexpected engine error
                self.logger.fatal (
                    { path:loopErr.message },
                    'engine error - produced a non-exportable circular document'
                );
                return process.exit (1);
            }
            // some sort of configuration error has occured
            // pass it upstream
            return callback (err);
        }

        self.latency.log();
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
            self.latency.log ('file system');
            var rootPage = Templates.renderRoot (self.root, self, self.logger);
            self.latency.log ('rendering');
            fs.writeFile (path.join (basedir, 'index.html'), rootPage, writeChildren);
        });
    });
};


module.exports = ComponentCache;
