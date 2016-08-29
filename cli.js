#!/usr/bin/env node

/*      @module doczar
    Select, load and parse source files for `doczar` format documentation comments. Render html
    output to a configured disk location.

    | option         | description
    | --------------:|---------------------------------
    | o, out         | Selects a directory to fill with documentation output. The directory need not exist or be empty.
    | i, in          | Selects files to document. Parses nix-like wildcards using [glob](https://github.com/isaacs/node-glob). `doczar` does not parse directories - you must select files.
    | j, js, jsmod   | Loads the filename with [required](https://github.com/defunctzombie/node-required) and documents every required source file.
    | with           | Include a prebuilt standard library in the documentation.
    | dev            | Display Components marked with the `@development` modifier.
    | api            | Display **only** Components marked with the `@api` modifier.
    | raw            | Log events as json strings instead of pretty printing them.
    | json           | Create an `index.json` file in each directory instead of a rendered `index.html`.
    | date           | Explicitly set the datestamp on each page with any Date-compatible string.
@spare `README.md`
    This is the rendered output of the `doczar` source documentation.
    *View the [source](https://github.com/shenanigans/node-doczar) on GitHub!*
    @load
        ./README.md
*/
/*      @spare `GitHub.com Repository`
    @remote `https://github.com/shenanigans/node-doczar`
*/
/*      @submodule/class Options
    Options for generating the documentation.
@member/Boolean json
@member/Boolean showAPI
@member/Boolean showDev
@member/Date date
*/
var path = require ('path');
var fs = require ('fs-extra');
var async = require ('async');
var required = require ('required');
var resolve = require ('resolve');
var glob = require ('glob');
var bunyan = require ('bunyan');
var filth = require ('filth');
var Parser = require ('./lib/Parser');
var ComponentCache = require ('./lib/ComponentCache');
var getNodeModulePath = require ('./lib/getNodeModulePath');
require ('colors');

function concatPaths(){
    var out = [];
    for (var i=0,j=arguments.length; i<j; i++)
        if (arguments[i])
            out.push.apply (out, Array.prototype.filter.call (arguments[i], function (item) {
                return Boolean (item && item.length && item[0].length);
            }));
    return out;
}

function isArray (a) { return a.__proto__ === Array.prototype; }

var STDLIBS = {
    es5:        true,
    es6:        true,
    nodejs:     true,
    browser:    true
};

var OPTIONS = {
    verbose:    [ 'trace', 'debug', 'info', 'warning', 'error', 'fatal' ],
    parse:      [ 'js', 'node' ],
    locals:     [ 'none', 'comments', 'all' ],
    optArgs:    [ 'none', 'leading', 'trailing' ],
    code:       [
        'arta',                     'ascetic',                  'atelier-dune.dark',
        'atelier-dune.light',       'atelier-forest.dark',      'atelier-forest.light',
        'atelier-heath.dark',       'atelier-heath.light',      'atelier-lakeside.dark',
        'atelier-lakeside.light',   'atelier-seaside.dark',     'atelier-seaside.light',
        'brown_paper',              'codepen-embed',            'color-brewer',
        'dark',                     'default',                  'docco',
        'far',                      'foundation',               'github',
        'googlecode',               'hybrid',                   'idea',
        'ir_black',                 'kimbie.dark',              'kimbie.light',
        'magula',                   'mono-blue',                'monokai',
        'monokai_sublime',          'obsidian',                 'paraiso.dark',
        'paraiso.light',            'pojoaque',                 'railscasts',
        'rainbow',                  'school_book',              'solarized_dark',
        'solarized_light',          'sunburst',                 'tomorrow-night-blue',
        'tomorrow-night-bright',    'tomorrow-night-eighties',  'tomorrow-night',
        'tomorrow',                 'vs',                       'xcode',
        'zenburn'
    ]
};
var unknownOptions = [];
var ARGV_OPTIONS = {
    default:        { out:'docs', verbose:'info', locals:'none', code:'github', optArgs:'none' },
    boolean:        [ 'dev', 'api', 'json', 'raw' ],
    string:         [
        'verbose',      'jsmod',        'in',           'with',         'code',         'date',
        'parse',        'locals',       'root',         'fileRoot',     'optArgs'
    ],
    alias:          { o:'out', i:'in', js:'jsmod', j:'jsmod', v:'verbose', c:'code' },
    unknown:        function (optionName) { unknownOptions.push (optionName); }
};
var argv = require ('minimist') (process.argv.slice (2), ARGV_OPTIONS);

// set up the logger
var COLORS = { 10:'blue', 20:'cyan', 30:'green', 40:'yellow', 50:'red', 60:'magenta' };
var BG_COLORS = { 10:'blueBG', 20:'cyanBG', 30:'greenBG', 40:'yellowBG', 50:'redBG', 60:'magentaBG' };
var LVL_NAME = { 10:'  trace ', 20:'  debug ', 30:'   info ', 40:'warning ', 50:'  error ', 60:'  fatal ' };
var RESERVED = { v:true, level:true, name:true, hostname:true, pid:true, time:true, msg:true, src:true };
var logger;
if (argv.raw)
    logger = bunyan.createLogger ({ name:"doczar", level:argv.verbose });
else
    logger = bunyan.createLogger ({
    name:       "doczar",
    streams:    [ { level:argv.verbose, type:'raw', stream:{ write:function (doc) {
        var color = COLORS[doc.level];
        var bgColor = BG_COLORS[doc.level];
        var msg = (' '+LVL_NAME[doc.level])[bgColor].black+' '+doc.msg[color];
        var finalStr;
        for (var key in doc)
            if (!Object.hasOwnProperty.call (RESERVED, key)) {
                var item = doc[key];
                if (key == 'err' && item.stack)
                    finalStr = '  ' + item.stack;
                else {
                    var itemStr = typeof doc[key] == 'string' ? item : JSON.stringify (doc[key]);
                    msg += ( '  ' + key + '=' + itemStr ).grey;
                }
            }
        if (finalStr)
            msg += finalStr;
        console.log (msg);
    } } } ]
});

// log any unknown options
for (var i=0,j=unknownOptions.length; i<j; i++)
    logger.error ({ option:unknownOptions[i] }, 'unknown option');

// some options only accept certain strings
for (var key in OPTIONS)
    if (Object.hasOwnProperty.call (argv, key) && OPTIONS[key].indexOf (argv[key]) < 0) {
        logger.error (
            { option:'--'+key, value:argv[key] },
            'invalid option value'
        );
        argv[key] = ARGV_OPTIONS.default[key];
    }

// if --fileRoot is provided, it should be a real path to a directory
if (!argv.fileRoot)
    argv.fileRoot = process.cwd();
else {
    try {
        argv.fileRoot = path.resolve (process.cwd(), argv.fileRoot);
        var rootStats = fs.statSync (argv.fileRoot);
    } catch (err) {
        return logger.fatal (
            { path:argv.fileRoot, err:err },
            'could not stat --fileRoot path'
        );
    }
    if (!rootStats.isDirectory())
        return logger.fatal ({ path:argv.fileRoot }, '--fileRoot path is not a directory');
}

// when using the --date option, check in advance that it's a valid date string
if (argv.date) try { new Date (argv.date); } catch (err) {
    return logger.fatal ({ date:argv.date }, 'invalid date/time string');
}

// begin building the documentation context
var context = new ComponentCache (logger);
context.argv = argv;

var defaultScope;
if (argv.root)
    defaultScope = argv.root = Parser.parsePath (argv.root);
else
    defaultScope = argv.root = [];
if (defaultScope.length)
    defaultScope[0][0] = '/';

var sourceFiles = [];

// tools for javascript syntax parsing
function workJSDerefs (level, target, chain) {
    var didFinishDeref = false;
    if (!target)
        target = level;
    if (!chain)
        chain = [ target ];

    function recurse (level, target) {
        if (chain.indexOf (level) >= 0)
            return false;
        var newChain = chain.concat();
        newChain.push (level);
        return workJSDerefs (level, target, newChain);
    }

    if (level['.deref']) for (var i=0,j=level['.deref'].length; i<j; i++) {
        var ref = level['.deref'][i];
        recurse (ref, target);
        var possibilities = ref['.types'];
        for (var k=0,l=possibilities.length; k<l; k++)
            if (target['.types'].indexOf (possibilities[k]) < 0) {
                target['.types'].push (possibilities[k]);
                didFinishDeref = true;
            }
    }

    // process arguments and returns
    if (level['.arguments'])
        for (var i=0,j=level['.arguments'].length; i<j; i++)
            didFinishDeref += recurse (level['.arguments'][i]);
    if (level['.returns'])
        didFinishDeref += recurse (level['.returns']);

    // recurse
    if (typeof level == 'string') throw new Error();
    for (var key in level)
        if (key[0] == '.')
            continue;
        else
            didFinishDeref += workJSDerefs (level[key], undefined, chain);
    if (level['.members'])
        for (var key in level['.members']) {
            if (key[0] == '.')
                continue;
            var nextTarget = level['.members'][key];
            didFinishDeref += recurse (nextTarget, nextTarget);
        }

    if (level['.props'])
        for (var key in level['.props']) {
            if (key[0] == '.')
                continue;
            var nextTarget = level['.props'][key];
            didFinishDeref += recurse (nextTarget, nextTarget);
        }

    return didFinishDeref;
}

// recursively submit all the information built into the namespace
function submitJSLevel (level, scope, localDefault, chain, force) {
    if (!chain)
        chain = [ level ];
    else if (chain.indexOf (level) >= 0)
        return false;
    else {
        chain = chain.concat();
        chain.push (level);
    }

    // dig to the bottom of any derefs
    // if (level['.deref'] && level['.deref'].length === 1 && !level['.path'] && !level['.mount'])
    //     return submitJSLevel (level['.deref'][0], scope, localDefault, chain, force);

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
        if (level['.docstr'])
            return true;
        for (var key in level)
            if (key[0] == '.')
                continue;
            else if (hasComments (level[key], chain.concat()))
                return true;
        if (level['.members']) for (var key in level['.members'])
            if (key[0] == '.')
                continue;
            else if (hasComments (level['.members'][key], chain.concat()))
                return true;
        if (level['.props']) for (var key in level['.props'])
            if (key[0] == '.')
                continue;
            else if (hasComments (level['.props'][key], chain.concat()))
                return true;
        if (level['.arguments']) for (var key in level['.arguments'])
            if (key[0] == '.')
                continue;
            else if (hasComments (level['.arguments'][key], chain.concat()))
                return true;
        if (level['.throws']) for (var key in level['.throws'])
            if (key[0] == '.')
                continue;
            else if (hasComments (level['.throws'][key], chain.concat()))
                return true;
        if (level['.returns'] && hasComments (level['.returns'], chain.concat()))
            return true;
        if (level['.deref']) for (var i=0,j=level['.deref'].length; i<j; i++)
            if (hasComments (level['.deref'], chain.concat()))
                return true;
        return false;
    }

    if (!localDefault)
        localDefault = defaultScope;
    var didSubmit = false;

    // ---------------------------------------------
    // primary submission point
    if (!level['.path']) {
        didSubmit = true;
        var path, ctype, docstr, types = [];
        if (level['.mount']) {
            ctype = level['.mount'].ctype;
            path = level['.mount'].path;
            scope = path;
            types.push.apply (types, level['.mount'].valtype);
            docstr = level['.mount'].docstr;
            localDefault = [];
        } else {
            path = scope;
            types.push.apply (types, level['.types']);
            types = Parser.parseType (types.join ('|'));
            if (level['.members'])
                ctype = 'class';
            else
                ctype = 'property';
            docstr = level['.docstr'] || '';
        }
        level['.localPath'] = path;
        var fullpath = level['.path'] = concatPaths (localDefault, path);
        if (ctype == 'class') for (var i=types.length-1; i>=0; i--) {
            var type = types[i];
            if (type.name == 'function' || type.name == 'Function')
                types.splice (i, 1);
        }
        if (fullpath.length && (
            fullpath[fullpath.length-1][0] == '/' || fullpath[fullpath.length-1][0] == ':'
        )) {
            if (ctype == 'class') {
                var foundClass = false;
                for (var i=types.length-1; i>=0; i--) {
                    if (types[i].name == 'class') {
                        foundClass = true;
                        break;
                    }
                }
                if (!foundClass)
                    types.push (Parser.parseType ('class')[0]);
            }
            ctype = 'module';
            var i = level['.types'].indexOf ('Object');
            if (i >= 0)
                types.splice (i, 1);
            i = level['.types'].indexOf ('json');
            if (i >= 0)
                types.splice (i, 1);
        }

        level['.ctype'] = ctype;
        level['.finalTypes'] = types;

        // submit, if we should
        if (
            !level['.silent']
         && (
                force
             || (
                    ( path.length || localDefault.length )
                 && (
                        level['.mount']
                     || !isLocalPath (path)
                     || argv.locals == 'all'
                     || ( argv.locals == 'comments' && hasComments (level) )
                 )
             )
         )
        ) {
            force = true;
            level['.force'] = -1; // marks already written
            Parser.parseTag (
                context,
                logger,
                function (fname) { nextFiles.push (fname); },
                level['.fname'],
                // localDefault,
                path.length ? localDefault : [],
                [],
                // path,
                path.length ? path : localDefault,
                ctype,
                types,
                docstr
            );
        }
    } else if (
        ( level['.force'] && level['.force'] > 0 )
     || ( force && ( !level['.force'] || level['.force'] > 0 ) )
    ) {
        level['.force'] = -1;
        force = true;
        Parser.parseTag (
            context,
            logger,
            function (fname) { nextFiles.push (fname); },
            level['.fname'],
            // localDefault,
            level['.localPath'].length ? localDefault : [],
            [],
            // path,
            level['.localPath'].length ? level['.localPath'] : localDefault,
            level['.ctype'],
            level['.finalTypes'],
            ( level['.mount'] ? level['.mount']['.docstr'] : level['.docstr'] ) || ''
        );
    } else {
        scope = level['.path'];
        localDefault = [];
    }

    if (level['.alias']) {
        var pointer = level['.alias'];
        while (pointer['.deref'] && pointer['.deref'].length === 1)
            pointer = pointer['.deref'][0];
        if (pointer['.path']) {
            didSubmit = true;
            delete level['.alias'];
            context.submit (level['.path'], { modifiers:[ {
                mod:    'alias',
                path:   pointer['.path']
            } ] });
        }
    }

    // are we waiting to add complex paths to the types list?
    if (level['.instance']) {
        for (var i=level['.instance'].length-1; i>=0; i--) {
            var constructor = level['.instance'][i];
            while (constructor['.deref'].length == 1 && !constructor['.path'])
                constructor = constructor['.deref'][0];
            if (!constructor['.path'])
                continue;
            didSubmit = true;
            if (!constructor['.force'])
                constructor['.force'] = 1;
            level['.instance'].splice (i, 1);
            var typePath = constructor['.path'].map (function (frag) {
                return frag[0] + frag[1];
            }).join ('');
            if (level['.types'].indexOf (typePath) < 0) {
                level['.types'].push (typePath);
                Parser.parseTag (
                    context,
                    logger,
                    function (fname) { nextFiles.push (fname); },
                    level['.fname'],
                    localDefault,
                    [],
                    scope,
                    level['.ctype'],
                    Parser.parseType (typePath),
                    ''
                );
            }
        }
    }

    if (level['.super']) for (var i=level['.super'].length-1; i>=0; i--) {
        var pointer = level['.super'][i];
        while (pointer['.deref'] && pointer['.deref'].length == 1)
            pointer = pointer['.deref'][0];
        if (!pointer['.path'])
            continue;

        context.submit (level['.path'], { modifiers:[ { mod:'super', path:pointer['.path'] } ] });
        didSubmit = true;
        level['.super'].splice (i, 1);
    }

    // recurse to various children
    if (level['.members']) {
        delete level['.members']['.isCol'];
        for (var key in level['.members'])
            didSubmit += submitJSLevel (
                level['.members'][key],
                concatPaths (scope, [ [ '#', key ] ]),
                localDefault,
                chain,
                force
            );
    }

    if (level['.props']) {
        delete level['.props']['.isCol'];
        for (var key in level['.props']) {
            var pointer = level['.props'][key];
            while (pointer['.deref'] && pointer['.deref'].length === 1)
                pointer = pointer['.deref'][0];
            didSubmit += submitJSLevel (
                pointer,
                concatPaths (scope, [ [ '.', key ] ]),
                localDefault,
                chain,
                force
            );
        }
    }
    if (level['.arguments'])
        for (var i=0,j=level['.arguments'].length; i<j; i++) {
            var arg = level['.arguments'][i];
            didSubmit += submitJSLevel (
                arg,
                concatPaths (scope, [ [ '(', arg['.name'] ] ]),
                localDefault,
                chain,
                force
            );
        }
    if (level['.returns'] && level['.returns']['.types'].length)
        didSubmit += submitJSLevel (
            level['.returns'],
            concatPaths (scope, [ [ ')', '' ] ]),
            localDefault,
            chain,
            force
        );

    for (var key in level)
        if (key[0] == '.')
            continue;
        else
            didSubmit += submitJSLevel (
                level[key],
                concatPaths (scope, [ [ '.', key ] ]),
                localDefault,
                chain
            );

    if (level['.scope'])
        for (var key in level['.scope'])
            if (key[0] == '.')
                continue;
            else
                didSubmit += submitJSLevel (
                    level['.scope'][key],
                    concatPaths (scope, [ [ '%', key ] ]),
                    localDefault,
                    chain
                );

    delete level['.scope'];
    return didSubmit;
}

// =================================================================================================
// this is the main processing function
var globalNode = new filth.SafeMap ({ '.types':[], '.deref':[] });
var nodeSourceFiles = {};
var DELIMIT = process.platform == 'win32' ? '\\' : '/';
var allFilenames = {};
function processSource (filenames) {
    var nextFiles = [];
    async.eachSeries (filenames, function (fileInfo, callback) {
        if (Object.hasOwnProperty.call (allFilenames, fileInfo.file))
            return callback();
        allFilenames[fileInfo.file] = fileInfo.referer;

        try {
            var fname = path.resolve (process.cwd(), fileInfo.file);
            var referer;
            if (fileInfo.referer)
                referer = path.resolve (process.cwd(), fileInfo.referer);
            else
                referer = path.parse (fname).dir;
        } catch (err) {
            logger.error (
                { path:fileInfo.file, error:err },
                'unable to resolve source file path'
            );
            return callback();
        }

        fs.readFile (fname, function (err, buf) {
            if (err)
                return callback (err);

            logger.debug ({ filename:fname }, 'read file');
            var fileStr = buf.toString();
            var localDefaultScope = currentDefaultScope;

            function addToNextFiles (newName, newReferer) {
                var useReferer = newReferer || referer;
                nextFiles.push ({
                    file:       newName,
                    referer:    useReferer
                });
                return path.resolve (process.cwd(), fileInfo.referer || referer || useReferer);
            }

            if (fileInfo.referer && fileInfo.referer != fileInfo.file)
                // localDefaultScope = getNodeModulePath (logger, localDefaultScope, referer, fname);
                localDefaultScope = getNodeModulePath (logger, argv.root, referer, fname);

            try {
                switch (argv.parse) {
                    case 'js':
                        logger.debug (
                            { filename:fname, referer:referer, mode:argv.parse },
                            'parsing file'
                        );
                        globalNode.window = globalNode;

                        // work as a global script?
                        if (
                            !argv.root.length
                         && (
                                !fileInfo.referer
                             || fileInfo.referer == fileInfo.file
                         )
                        ) try {
                            Parser.parseJSTypes (
                                fname,
                                fileStr,
                                localDefaultScope,
                                globalNode,
                                context,
                                logger,
                                addToNextFiles,
                                nodeSourceFiles
                            );
                            break;
                        } catch (err) {
                            var scopePath = localDefaultScope
                             .map (function (item) { return item.join (''); }).join ('')
                             ;
                            logger.error (
                                { err:err, path:fname, scope:scopePath, parse:argv.parse },
                                'parsing failed'
                            );
                            break;
                        }

                        var modPathStr = path.resolve (process.cwd(), fname);
                        var moduleNode;
                        if (Object.hasOwnProperty.call (nodeSourceFiles, modPathStr)) {
                            moduleNode = nodeSourceFiles[modPathStr];
                            if (
                                !moduleNode['.root']
                             || ( fileInfo.referer && fileInfo.referer != fileInfo.file )
                            )
                                moduleNode['.root'] = localDefaultScope;
                        } else
                            moduleNode = nodeSourceFiles[modPathStr] = new filth.SafeMap ({
                                '.root':    localDefaultScope,
                                window:     globalNode,
                                '.exports': filth.clone ({
                                    '.types':   [],
                                    '.deref':   [],
                                    '.props':   { '.isCol':true }
                                })
                            });
                        try {
                            Parser.parseJSTypes (
                                fname,
                                fileStr,
                                localDefaultScope,
                                moduleNode,
                                context,
                                logger,
                                addToNextFiles,
                                nodeSourceFiles
                            );
                            break;
                        } catch (err) {
                            var scopePath = localDefaultScope
                             .map (function (item) { return item.join (''); }).join ('')
                             ;
                            logger.error (
                                { err:err, path:fname, scope:scopePath, parse:argv.parse },
                                'parsing failed'
                            );
                            break;
                        }
                    case 'node':
                        logger.debug (
                            { filename:fname, referer:referer, mode:argv.parse },
                            'parsing file'
                        );
                        if (!fileInfo.referer) try {
                            Parser.parseJSTypes (
                                fname,
                                fileStr,
                                localDefaultScope,
                                globalNode,
                                context,
                                logger,
                                addToNextFiles,
                                nodeSourceFiles
                            );
                            break;
                        } catch (err) {
                            var scopePath = localDefaultScope
                             .map (function (item) { return item.join (''); }).join ('')
                             ;
                            logger.error (
                                { err:err, path:fname, scope:scopePath, parse:argv.parse },
                                'parsing failed'
                            );
                            break;
                        }

                        var modPathStr = path.resolve (process.cwd(), fname);
                        var moduleNode;
                        if (Object.hasOwnProperty.call (nodeSourceFiles, modPathStr)) {
                            moduleNode = nodeSourceFiles[modPathStr];
                            if (!moduleNode['.root'])
                                moduleNode['.root'] = localDefaultScope;
                        } else {
                            var exports = new filth.SafeMap ({ '.types':[], '.deref':[] });
                            moduleNode = nodeSourceFiles[modPathStr] = new filth.SafeMap ({
                                '.root':    localDefaultScope,
                                globals:    globalNode,
                                exports:    exports,
                                module:     new filth.SafeMap ({
                                    '.types':   [],
                                    '.deref':   [],
                                    '.props':   {
                                        exports:    exports
                                    }
                                })
                            });
                        }
                        try {
                            Parser.parseJSTypes (
                                fname,
                                fileStr,
                                localDefaultScope,
                                moduleNode,
                                context,
                                logger,
                                addToNextFiles,
                                nodeSourceFiles
                            );
                            break;
                        } catch (err) {
                            var scopePath = localDefaultScope
                             .map (function (item) { return item.join (''); }).join ('')
                             ;
                            logger.error (
                                { err:err, path:fname, scope:scopePath, parse:argv.parse },
                                'parsing failed'
                            );
                            break;
                        }
                    default:
                        if (argv.parse)
                            return logger.fatal ({ mode:argv.parse }, 'unknown parsing mode');
                        try {
                            Parser.parseFile (
                                fname,
                                fileStr,
                                localDefaultScope,
                                context,
                                logger,
                                addToNextFiles
                            );
                        } catch (err) {
                            var scopePath = localDefaultScope
                             .map (function (item) { return item.join (''); }).join ('')
                             ;
                            logger.error (
                                { err:err, path:fname, scope:scopePath },
                                'parsing failed'
                            );
                            break;
                        }
                }
            } catch (err) {
                return logger.fatal ({ err:err, parse:argv.parse }, 'failed to parse file');
            }

            callback();
        });
    }, function (err) {
        if (err) {
            logger.fatal ({ err:err }, 'unexpected error');
            return process.exit (1);
        }

        currentDefaultScope = defaultScope;
        if (sourceFiles.length) {
            nextFiles.push.apply (nextFiles, sourceFiles);
            sourceFiles = [];
        }
        if (nextFiles.length)
            return processSource (nextFiles);

        switch (argv.parse) {
            case 'js':
                // remove the window self-ref
                delete globalNode.window;

                // process deferred dereferences
                var finishedARef;
                do {
                    finishedARef = false;
                    for (var fname in nodeSourceFiles) {
                        var node = nodeSourceFiles[fname];
                        delete node.globals;
                        for (var key in node)
                            if (key[0] == '.')
                                continue;
                            else try {
                                finishedARef += workJSDerefs (node[key]);
                            } catch (err) {
                                logger.error (
                                    { err:err, path:fname, parse:argv.parse },
                                    'failed to process deferred types'
                                );
                            }
                    }
                    for (var key in globalNode)
                        if (key[0] == '.')
                            continue;
                        else try {
                            finishedARef += workJSDerefs (globalNode[key]);
                        } catch (err) {
                            logger.error (
                                { err:err, path:fname, parse:argv.parse },
                                'failed to process deferred types'
                            );
                        }
                } while (finishedARef);

                // process source
                var didSubmit;
                do {
                    didSubmit = false;
                    for (var fname in nodeSourceFiles) {
                        var nodeSource = nodeSourceFiles[fname];
                        if (
                            !nodeSource['.exports']
                         || !Object.keys (nodeSource['.exports']).length
                        ) {
                            // treat as a normal source file
                            for (var key in nodeSource)
                                if (key[0] == '.' || key == 'window')
                                    continue;
                                else try {
                                    didSubmit += submitJSLevel (
                                        nodeSource[key],
                                        [ [ '.', key ] ],
                                        undefined
                                    );
                                } catch (err) {
                                    logger.error (
                                        { err:err, path:fname, identifier:key, parse:argv.parse },
                                        'failed to generate Declarations from source file'
                                    );
                                }
                        } else {
                            // treat as a module file
                            try {
                                didSubmit += submitJSLevel (
                                    nodeSource['.exports'],
                                    [],
                                    nodeSource['.root']
                                );
                            } catch (err) {
                                logger.error (
                                    { err:err, path:fname, parse:argv.parse },
                                    'failed to generate Declarations from module source file'
                                );
                            }

                            // work locals
                            for (var key in nodeSource)
                                if (key[0] == '.' || key == 'module' || key == 'globals')
                                    continue;
                                else try {
                                    didSubmit += submitJSLevel (
                                        nodeSource[key],
                                        [ [ '%', key ] ],
                                        nodeSource['.root']
                                    );
                                } catch (err) {
                                    logger.error (
                                        { err:err, path:fname, identifier:key, parse:argv.parse },
                                        'failed to generate Declarations from module source file'
                                    );
                                }
                        }
                    }

                    for (var key in globalNode)
                        if (key[0] == '.' || key == 'window')
                            continue;
                        else try {
                            didSubmit += submitJSLevel (
                                globalNode[key],
                                [ [ '.', key ] ],
                                undefined
                            );
                        } catch (err) {
                            logger.error (
                                { err:err, identifier:key, parse:argv.parse },
                                'failed to generate Declarations for global identifier'
                            );
                        }
                } while (didSubmit);
                break;
            case 'node':
                // process deferred dereferences
                var finishedARef;
                do {
                    finishedARef = false;
                    for (var fname in nodeSourceFiles) {
                        var node = nodeSourceFiles[fname];
                        delete node.globals;
                        for (var key in node)
                            if (key[0] == '.')
                                continue;
                            else try {
                                finishedARef += workJSDerefs (node[key]);
                            } catch (err) {
                                logger.error (
                                    { err:err, path:fname, parse:argv.parse },
                                    'failed to process deferred types'
                                );
                            }
                    }
                    for (var key in globalNode)
                        if (key[0] == '.')
                            continue;
                        else try {
                            finishedARef += workJSDerefs (globalNode[key]);
                        } catch (err) {
                            logger.error (
                                { err:err, path:fname, parse:argv.parse },
                                'failed to process deferred types'
                            );
                        }
                } while (finishedARef);

                // process source
                var didSubmit;
                do {
                    didSubmit = false;
                    for (var key in globalNode)
                        if (key[0] == '.')
                            continue;
                        else try {
                            didSubmit += submitJSLevel (
                                globalNode[key],
                                [ [ '.', key ] ],
                                undefined
                            );
                        } catch (err) {
                            logger.error (
                                { err:err, identifier:key, parse:argv.parse },
                                'failed to generate Declarations for global identifier'
                            );
                        }
                    for (var fname in nodeSourceFiles) {
                        var nodeSource = nodeSourceFiles[fname];
                        // work module.exports
                        try {
                            var exports = nodeSource.module['.props'].exports;
                        } catch (err) {
                            // ES6 import?
                            try {
                                didSubmit += submitJSLevel (
                                    nodeSource['.exports'],
                                    [],
                                    nodeSource['.root']
                                );
                            } catch (err) {
                                return logger.fatal (err, 'internal parsing error');
                            }
                        }
                        while (exports['.deref'].length == 1)
                            exports = exports['.deref'][0];
                        try {
                            didSubmit += submitJSLevel (
                                exports,
                                [],
                                nodeSource['.root']
                            );
                        } catch (err) {
                            logger.error (
                                { err:err, path:fname, parse:argv.parse },
                                'failed to generate Declarations from module source file'
                            );
                        }

                        // work locals
                        for (var key in nodeSource)
                            if (key[0] == '.' || key == 'module' || key == 'exports' || key == 'global')
                                continue;
                            else try {
                                didSubmit += submitJSLevel (
                                    nodeSource[key],
                                    [ [ '%', key ] ],
                                    nodeSource['.root']
                                );
                            } catch (err) {
                                logger.error (
                                    { err:err, path:fname, identifier:key, parse:argv.parse },
                                    'failed to generate Declarations from module source file'
                                );
                            }
                    }
                } while (didSubmit);
                break;
            default:
                // nothing to do when not parsing syntax
        }

        var options = {
            codeStyle:  argv.code,
            showDev:    argv.dev,
            showAPI:    argv.api,
            verbose:    argv.verbose
        };
        if (argv.date)
            try {
                options.date = new Date (argv.date);
            } catch (err) {
                logger.error ('invalid datestamp');
                return process.exit (1);
            }
        else
            options.date = new Date();
        logger.info ('compiling documentation');
        context.finalize (options, function(){
            logger.info ({ directory:path.join (process.cwd(), argv.out) }, 'writing to filesystem');
            if (argv.json)
                options.json = true;
            context.writeFiles (argv.out, options, function (err) {
                if (err) {
                    logger.error (err, 'unexpected error while writing to filesystem');
                    return process.exit (1);
                }
                logger.info ('filesystem output complete');
                logger.info ('done');
                return process.exit (0);
            });
        });
    });
}

var libsIncluded = {};
var LIB_SYNONYMS = {
    javascript:     'es5',
    ES5:            'es5',
    ES6:            'es6',
    Node:           'nodejs',
    node:           'nodejs',
    'Node.js':      'nodejs',
    'node.js':      'nodejs',
    'IO.js':        'iojs',
    'Browser':      'browser',
    'ie':           'browser',
    'IE':           'browser',
    'firefox':      'browser',
    'Firefox':      'browser',
    'chrome':       'browser',
    'Chrome':       'browser',
    'opera':        'browser',
    'Opera':        'browser',
    strict:         'browser-strict',
    'use-strict':   'browser-strict'
};
var LIB_DEPENDENCIES = {
    nodejs:             [ 'es5' ],
    iojs:               [ 'nodejs', 'es6' ],
    browser:            [ 'es5' ],
    'browser-strict':   [ 'browser', 'es6' ],
    es6:                [ 'es5' ]
};
var LIB_BLANK = {
    'browser-strict':   'browser'
};
var stdDir = path.join (__dirname, 'standardLibs');
var libFiles = [];
function includeLib (libname) {
    if (Object.hasOwnProperty.call (LIB_SYNONYMS, libname))
        libname = LIB_SYNONYMS[libname];

    if (Object.hasOwnProperty.call (libsIncluded, libname))
        return; // already included
    libsIncluded[libname] = true;

    if (Object.hasOwnProperty.call (LIB_DEPENDENCIES, libname)) {
        var deps = LIB_DEPENDENCIES[libname];
        for (var i=0, j=deps.length; i<j; i++)
            if (!Object.hasOwnProperty.call (libsIncluded, deps[i]))
                includeLib (deps[i]);
    }

    // some libnames are just containers for their dependencies and should not be loaded
    if (Object.hasOwnProperty.call (LIB_BLANK, libname))
        return;

    try {
        var files = fs.readdirSync (path.join (stdDir, libname))
    } catch (err) {
        logger.error ({ lib:libname }, 'unknown standard library');
        return process.exit (1);
    }
    logger.info ({ lib:libname }, 'loaded standard library');
    for (var i=0, j=files.length; i<j; i++) {
        var fullpath = path.join (stdDir, libname, files[i]);
        libFiles.push ({
            file:       fullpath
        });
    }
}

var currentDefaultScope = [];
if (argv.with) {
    if (isArray (argv.with))
        for (var i=0, j=argv.with.length; i<j; i++)
            includeLib (argv.with[i]);
    else
        includeLib (argv.with);
}
if (argv.jsmod)
    includeLib ('es5');

if (argv.in)
    if (isArray (argv.in))
        for (var i=0, j=argv.in.length; i<j; i++) {
            logger.trace ({ filename:argv.in[i] }, 'checking selector');
            if (argv.in[i].match (/^".*"$/))
                    argv.in[i] = argv.in[i].slice (1, -1);
            try {
                var files = glob.sync (argv.in[i]);
            } catch (err) {
                logger.warn ({ option:'--in', filename:argv.in[i] }, 'cannot process selector');
                continue;
            }
            if (files.length) {
                logger.debug ({ selector:argv.in[i], files:files }, 'globbed selector');
                sourceFiles.push.apply (sourceFiles, files.map (function (fname) {
                    return {
                        file:       fname,
                        referer:    fname
                    };
                }));
            } else
                logger.warn ({ option:'--in', selector:argv.in[i] }, 'selected zero documents');
        }
    else {
        if (argv.in.match (/^".*"$/))
            argv.in = argv.in.slice (1, -1);
        try {
            var files = glob.sync (argv.in);
            if (files.length) {
                logger.debug ({ selector:argv.in, files:files }, 'globbed selector');
                sourceFiles.push.apply (sourceFiles, files.map (function (fname) {
                    return {
                        file:       fname,
                        referer:    fname
                    };
                }));
            } else
                logger.warn ({ option:'--in', selector:argv.in }, 'selected zero documents');
        } catch (err) {
            logger.warn ({ option:'--in', filename:argv.in }, 'cannot process selector');
        }
    }

if (!argv.jsmod)
    return processSource (libFiles);

var modules = isArray (argv.jsmod) ? argv.jsmod : [ argv.jsmod ];
var dfnames = [];
async.eachSeries (modules, function (mod, callback) {
    try {
        mod = resolve.sync (mod, { basedir:process.cwd() });
    } catch (err) {
        logger.error ({ path:mod }, 'cannot process path');
        return callback();
    }
    dfnames.push (mod);
    logger.trace ({ filename:mod }, 'resolve javascript dependencies');
    required (mod, { ignoreMissing:true, silent:true }, function (err, deps) {
        if (err) return callback (err);
        var toProcess = deps;
        var next = [];
        var done = {};
        do {
            for (var i=0,j=toProcess.length; i<j; i++) {
                var dep = toProcess[i];
                if (dep.core)
                    continue;
                if (Object.hasOwnProperty.call (done, dep.filename))
                    continue;
                done[dep.filename] = true;
                logger.debug ({ source:mod, filename:dep.filename }, 'add resolved javascript module');
                dfnames.push (dep.filename);
                next.push.apply (next, dep.deps)
            }
            toProcess = next;
            next = [];
        } while (toProcess.length);

        sourceFiles.push.apply (sourceFiles, dfnames.map (function (fname) {
            return {
                file:       fname,
                referer:    fname
            };
        }));
        callback();
    });
}, function (err) {
    if (err)
        return process.nextTick (1);

    processSource (libFiles);
});
