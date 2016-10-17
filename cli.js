#!/usr/bin/env node

/*      @module doczar
    Select, load and parse source files for `doczar` format documentation comments. Render html
    output to a configured disk location.
@spare `README.md`
    This is the rendered output of the `doczar` source documentation.
    *View the [source](https://github.com/shenanigans/node-doczar) on GitHub!*
    @load
        ./README.md
*/
/*      @spare `GitHub.com Repository`
    @remote `https://github.com/shenanigans/node-doczar`
*/
var path              = require ('path');
var fs                = require ('fs-extra');
var async             = require ('async');
var required          = require ('required');
var resolve           = require ('resolve');
var glob              = require ('glob');
var bunyan            = require ('bunyan');
var filth             = require ('filth');
var Parser            = require ('./src/Parser');
var ComponentCache    = require ('./src/ComponentCache');
var getNodeModulePath = require ('./src/node_modules/getNodeModulePath');
var Patterns          = require ('./src/Parser/Patterns');
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

var LIB_SYNONYMS = {
    javascript:     'es5',
    ES5:            'es5',
    ES6:            'es6',
    Node:           'nodejs',
    node:           'nodejs',
    'Node.js':      'nodejs',
    'node.js':      'nodejs',
    'IO.js':        'nodejs',
    'io.js':        'nodejs',
    'io':           'nodejs',
    'iojs':         'nodejs',
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

var PARSE_SYNONYMS_DEP = {
    'node.js':          'node',
    'Node.js':          'node',
    'nodejs':           'node',
    'io':               'node',
    'iojs':             'node',
    'io.js':            'node',
    'browser':          'browser',
    'browser-modern':   'browser-strict',
    'modern':           'browser-strict',  // subject to future change
    'strict':           'browser-strict'  // subject to future change
};
var PARSE_LIB_DEPS = {
    node:               [ 'es6' ],
    js:                 [ 'es5' ],
    browser:            [ 'browser' ],
    'browser-strict':   [ 'browser', 'es6' ]
};
var PARSE_SYNONYMS = {
    browser:            'js',
    'browser-strict':   'js',
    node:               'node',
    js:                 'js'
};
for (var name in PARSE_SYNONYMS_DEP)
    if (!Object.hasOwnProperty.call (PARSE_SYNONYMS, name))
        PARSE_SYNONYMS[name] = PARSE_SYNONYMS_DEP[name];

var DELIMIT = process.platform == 'win32' ? '\\' : '/';
var allFilenames = {};

var OPTIONS = {
    parse:      Object.keys (PARSE_SYNONYMS),
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
var OPTIONS_VERBOSE = [ 'trace', 'debug', 'info', 'warning', 'error', 'fatal' ];
var unknownOptions = [];
var ARGV_OPTIONS = {
    default:        {
        out:        'docs',
        verbose:    'info',
        locals:     'none',
        code:       'github',
        optArgs:    'none',
        maxDepth:   '4'
    },
    boolean:        [ 'dev', 'api', 'json', 'raw', 'noImply', 'noDeps' ],
    string:         [
        'verbose',      'jsmod',        'in',           'with',         'code',         'date',
        'parse',        'locals',       'root',         'fileRoot',     'optArgs',      'maxDepth'
    ],
    alias:          { o:'out', i:'in', js:'jsmod', j:'jsmod', v:'verbose', c:'code', XD:'maxDepth' },
    unknown:        function (optionName) { unknownOptions.push (optionName); }
};
var argv = require ('minimist') (process.argv.slice (2), ARGV_OPTIONS);

// set up the logger
var COLORS = { 10:'blue', 20:'cyan', 30:'green', 40:'yellow', 50:'red', 60:'magenta' };
var BG_COLORS = { 10:'blueBG', 20:'cyanBG', 30:'greenBG', 40:'yellowBG', 50:'redBG', 60:'magentaBG' };
var LVL_NAME = { 10:'  trace ', 20:'  debug ', 30:'   info ', 40:'warning ', 50:'  error ', 60:'  fatal ' };
var RESERVED = { v:true, level:true, name:true, hostname:true, pid:true, time:true, msg:true, src:true };
var logger;

var spinning = false;
function outputLogLine (doc) {
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
    if (spinning) {
        process.stdout.clearLine();
        process.stdout.cursorTo (0);
    }
    console.log (msg);
    if (spinning)
        process.stdout.write (spinning.green);
}
if (OPTIONS_VERBOSE.indexOf (argv.verbose) < 0) {
    outputLogLine ({ level:60, verbose:argv.verbose, msg:'unknown verbosity level' });
    return process.exit (1);
}
if (argv.raw) {
    logger = bunyan.createLogger ({ name:"doczar", level:argv.verbose });
    logger.setTask = function(){ };
} else {
    logger = bunyan.createLogger ({
        name:       "doczar",
        streams:    [ { level:argv.verbose, type:'raw', stream:{ write:outputLogLine } } ]
    });
    logger.setTask = function (task) {
        if (spinning) {
            process.stdout.clearLine();
            process.stdout.cursorTo (0);
        }
        if (task)
            process.stdout.write (task.green);
        spinning = task;
    };
}
function createChildFactory (childFactory) {
    return function(){
        var child = childFactory.apply (this, arguments);
        child.setTask = logger.setTask;
        child.child = createChildFactory (child.child);
        return child;
    }
}
logger.child = createChildFactory (logger.child);

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

// maxDepth a valid number?
try {
    argv.maxDepth = Number (argv.maxDepth);
} catch (err) {
    return process.fatal ({ input:argv.maxDepth }, 'invalid maxDepth argument');
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

var stdDir = path.join (__dirname, 'standardLibs');
var libFiles = [];
var libsIncluded = {};
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
if (!argv.noImply) {
    if (argv.with) {
        if (isArray (argv.with))
            for (var i=0, j=argv.with.length; i<j; i++)
                includeLib (argv.with[i]);
        else
            includeLib (argv.with);
    }
    if (argv.jsmod)
        includeLib ('es5');
}
if (!argv.noImply && argv.parse) {
    var canonical = Object.hasOwnProperty.call (PARSE_SYNONYMS_DEP, argv.parse) ?
        PARSE_SYNONYMS_DEP
      : argv.parse
      ;
    if (Object.hasOwnProperty.call (PARSE_LIB_DEPS, canonical))
        for (var i=0,j=PARSE_LIB_DEPS[canonical].length; i<j; i++)
            includeLib (PARSE_LIB_DEPS[canonical][i]);
}

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

// start submitting things
if (!argv.jsmod) {
    context.latency.log ('setup');
    return processSource (libFiles);
}

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
    context.latency.log ('setup');
    processSource (libFiles);
});

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

        context.latency.log();
        fs.readFile (fname, function (err, buf) {
            context.latency.log ('file system');

            if (err)
                return callback (err);

            logger.debug ({ filename:fname }, 'read file');
            var fileStr = buf.toString();
            var shebangMatch = fileStr.match (/^#!.*(\r?\n[^]*)$/);
            if (shebangMatch)
                fileStr = shebangMatch[1];
            var localDefaultScope = currentDefaultScope;

            function addToNextFiles (newName, newReferer) {
                var useReferer = newReferer || referer;
                nextFiles.push ({
                    file:       newName,
                    referer:    useReferer
                });
                return path.resolve (process.cwd(), fileInfo.referer || referer || useReferer);
            }

            // if (fileInfo.referer && fileInfo.referer != fileInfo.file)
            //     localDefaultScope = getNodeModulePath (
            //         context,
            //         argv.root,
            //         localDefaultScope,
            //         referer,
            //         fname
            //     );

            logger.setTask ('parsing ' + fname);
            try {
                if (argv.parse)
                    Parser.parseSyntaxFile (
                        context,
                        fname,
                        fileStr,
                        PARSE_SYNONYMS[argv.parse],
                        localDefaultScope,
                        addToNextFiles
                    );
                else
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
            }

            context.latency.log ('parsing');
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

        if (argv.parse) {
            logger.info ({ parse:argv.parse }, 'finished parsing');
            logger.setTask ('cleaning up roots');
            // clean up the source documents
            for (var rootPath in context.source) {
                var source = context.source[rootPath];
                for (var key in source)
                    if (source[key] === globalNode[key])
                        delete source[key];
            }
        }

        if (argv.parse) {
            logger.setTask ('generating Components');
            Parser.generateComponents (context, PARSE_SYNONYMS[argv.parse], defaultScope);
        }

        var renderOptions = {
            codeStyle:  argv.code,
            showDev:    argv.dev,
            showAPI:    argv.api,
            verbose:    argv.verbose
        };
        if (argv.date)
            try {
                renderOptions.date = new Date (argv.date);
            } catch (err) {
                logger.error ('invalid datestamp');
                return process.exit (1);
            }
        else
            renderOptions.date = new Date();
        context.latency.log();
        // logger.info ('finalizing documentation');
        logger.setTask ('finalizing documentation');
        context.finalize (renderOptions, function(){
            context.latency.log ('finalization');
            logger.info ({ directory:path.join (process.cwd(), argv.out) }, 'writing to filesystem');
            if (argv.json)
                renderOptions.json = true;
            logger.setTask ('writing to filesystem');
            context.writeFiles (argv.out, renderOptions, function (err) {
                if (err) {
                    logger.error (err, 'unexpected error while writing to filesystem');
                    return process.exit (1);
                }
                logger.setTask();
                logger.info ('filesystem output complete');
                var finalLatencies = context.latency.getFinalLatency();
                finalLatencies.etc = finalLatencies[''];
                delete finalLatencies[''];
                logger.info (finalLatencies, 'latencies');
                logger.info ('done');
                return process.exit (0);
            });
        });
    });
}
