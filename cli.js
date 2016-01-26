#!/usr/bin/env node

/**     @module doczar
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
/**     @spare `GitHub.com Repository`
    @remote `https://github.com/shenanigans/node-doczar`
*/
/**     @submodule/class Options
    Options for generating the documentation.
@member/Boolean json
@member/Boolean showAPI
@member/Boolean showDev
@member/Date date
*/
var path = require ('path');
var fs = require ('graceful-fs');
var async = require ('async');
var required = require ('required');
var resolve = require ('resolve');
var glob = require ('glob');
var bunyan = require ('bunyan');
var Parser = require ('./lib/Parser');
var ComponentCache = require ('./lib/ComponentCache');
require ('colors');

var HIGHLIGHT_STYLES = {
    arta:                       true,
    ascetic:                    true,
    'atelier-dune.dark':        true,
    'atelier-dune.light':       true,
    'atelier-forest.dark':      true,
    'atelier-forest.light':     true,
    'atelier-heath.dark':       true,
    'atelier-heath.light':      true,
    'atelier-lakeside.dark':    true,
    'atelier-lakeside.light':   true,
    'atelier-seaside.dark':     true,
    'atelier-seaside.light':    true,
    'brown_paper':              true,
    'codepen-embed':            true,
    'color-brewer':             true,
    dark:                       true,
    default:                    true,
    docco:                      true,
    far:                        true,
    foundation:                 true,
    github:                     true,
    googlecode:                 true,
    hybrid:                     true,
    idea:                       true,
    ir_black:                   true,
    'kimbie.dark':              true,
    'kimbie.light':             true,
    magula:                     true,
    'mono-blue':                true,
    monokai:                    true,
    monokai_sublime:            true,
    obsidian:                   true,
    'paraiso.dark':             true,
    'paraiso.light':            true,
    pojoaque:                   true,
    railscasts:                 true,
    rainbow:                    true,
    school_book:                true,
    solarized_dark:             true,
    solarized_light:            true,
    sunburst:                   true,
    'tomorrow-night-blue':      true,
    'tomorrow-night-bright':    true,
    'tomorrow-night-eighties':  true,
    'tomorrow-night':           true,
    tomorrow:                   true,
    vs:                         true,
    xcode:                      true,
    zenburn:                    true
};
var DEFAULT_HIGHLIGHT_STYLE = 'github';

var STDLIBS = {
    es5:        true,
    es6:        true,
    nodejs:     true,
    browser:    true
};

var argv = require ('minimist') (process.argv, {
    default:        { out:'docs', verbose:'info' },
    boolean:        [ 'dev', 'api', 'json', 'raw' ],
    string:         [ 'verbose', 'jsmod', 'in', 'with', 'code', 'date' ],
    alias:          { o:'out', i:'in', js:'jsmod', j:'jsmod', v:'verbose', c:'code' }
});
function isArray (a) { return a.__proto__ === Array.prototype; }
function appendArr (a, b) { a.push.apply (a, b); }

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

var sourcefiles = [];
var options = {
    codeStyle:  argv.code || DEFAULT_HIGHLIGHT_STYLE,
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

if (argv.code && !Object.hasOwnProperty (HIGHLIGHT_STYLES, argv.code)) {
    logger.error ('unknown code highlighting style "'+argv.code+'"');
    delete argv.code;
}

var context = new ComponentCache (logger);
function processSource (filenames) {
    var nextFiles = [];
    async.eachSeries (filenames, function (fname, callback) {
        Parser.parseFile (
            fname,
            context,
            logger,
            function (newName) { nextFiles.push (newName); },
            callback
        );
    }, function (err) {
        if (err) {
            logger.fatal ({ err:err }, 'unexpected error');
            return process.exit (1);
        }

        if (nextFiles.length)
            return processSource (nextFiles);

        logger.info ('compiling documentation');
        context.finalize (options, function(){
            logger.info ({ directory:path.join (process.cwd(), argv.out) }, 'writing to filesystem');
            if (argv.json)
                options.json = true;
            context.writeFiles (argv.out, options, function (err) {
                if (err) {
                    logger.error (err, 'unexpected filesystem output error');
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
    for (var i=0, j=files.length; i<j; i++)
        sourcefiles.push (path.join (stdDir, libname, files[i]));
}

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
                appendArr (sourcefiles, files);
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
                appendArr (sourcefiles, files);
            } else
                logger.warn ({ option:'--in', selector:argv.in }, 'selected zero documents');
        } catch (err) {
            logger.warn ({ option:'--in', filename:argv.in }, 'cannot process selector');
        }
    }

if (!argv.jsmod)
    return processSource (sourcefiles);

var modules = isArray (argv.jsmod) ? argv.jsmod : [ argv.jsmod ];
var dfnames = [];
async.eachSeries (modules, function (mod, callback) {
    try {
        mod = resolve.sync (mod, { basedir:process.cwd() });
    } catch (err) {
        logger.error ({ env:'javascript', path:mod }, 'cannot process path');
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
            for (var i in toProcess) {
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

        appendArr (sourcefiles, dfnames);
        callback();
    });
}, function (err) {
    if (err)
        return process.nextTick (1);

    processSource (sourcefiles);
});
