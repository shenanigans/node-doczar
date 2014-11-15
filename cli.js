#!/usr/bin/env node

var path = require ('path');
var fs = require ('fs');
var async = require ('async');
var required = require ('required');
var resolve = require ('resolve');
var glob = require ('glob');
require ('colors');
var Parser = require ('./lib/parser');
var ComponentCache = require ('./lib/ComponentCache');

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
    javascript: true,
    nodejs:     true,
    browser:    true
};

var argv = require ('minimist') (process.argv, {
    default:        { out:'docs' },
    boolean:        [ 'verbose', 'dev', 'api' ],
    // string:         [ 'jsmod', 'in', 'with', 'code' ],
    string:         [ 'jsmod', 'in', 'code' ],
    alias:          { o:'out', i:'in', js:'jsmod', j:'jsmod', v:'verbose', c:'code' }
});
function isArray (a) { return a.__proto__ === Array.prototype; }
function appendArr (a, b) { a.push.apply (a, b); }

if (argv.code && !Object.hasOwnProperty (HIGHLIGHT_STYLES, argv.code)) {
    console.log (('unknown code highlighting style "'+argv.code+'"').red);
    console.log ('failed'.red);
    return process.exit (1);
}

var sourcefiles = [];
var options = {
    codeStyle:  argv.code || DEFAULT_HIGHLIGHT_STYLE,
    showDev:    argv.dev,
    showAPI:    argv.api,
    verbose:    argv.verbose
};
function processSource(){
    var context = new ComponentCache();
    async.eachSeries (sourcefiles, function (fname, callback) {
        Parser.parseFile (fname, context, options, callback);
    }, function (err) {
        if (err) {
            console.log ((''+err).red);
            return process.exit (1);
        }
        context.finalize (options, function (errors, warnings) {
            if (errors.length) {
                // cannot proceed
                console.log ('fatal error\n'.red);
                for (var i in errors)
                    console.log (JSON.stringify (errors[i]).red+'\n');
                console.log ('no filesystem changes occured'.yellow);
                console.log ('failed'.red);
                return process.exit (1);
            }

            console.log ('parsing complete\n'.green);

            context.writeFiles (argv.out, options, function (err) {
                if (err) {
                    console.log ('unexpected error during output'.red);
                    console.log ((''+err).red);
                    console.log ('some filesystem changes may have occured'.red);
                    console.log ('failed');
                    return process.exit (1);
                }

                console.log ('finished writing to filesystem\n'.green);

                for (var i in warnings)
                    console.log (('warning - ' + JSON.stringify (warnings[i]) + '\n').yellow);

                console.log ('done'.green);
            });
        });
    });
}

var libsIncluded = {};
var DEPENDENCIES = {
    nodejs:     [ 'javascript' ],
    browser:    [ 'javascript' ]
};
var stdDir = path.join (__dirname, 'standardLibs');
function includeLib (libname) {
    if (Object.hasOwnProperty.call (libsIncluded, libname))
        return; // already included

    if (Object.hasOwnProperty.call (DEPENDENCIES, libname)) {
        var deps = DEPENDENCIES[libname];
        for (var i in deps)
            if (!Object.hasOwnProperty.call (libsIncluded, deps[i]))
                includeLib (deps[i]);
    }

    try {
        var files = fs.readdirSync (path.join (stdDir, libname))
    } catch (err) {
        throw new Error ('unknown library "' + libname + '"');
    }
    for (var i in files)
        sourcefiles.push (path.join (stdDir, libname, files[i]));
}

// if (argv.with) {
//     if (isArray (argv.with))
//         for (var i in argv.with) includeLib (argv.with[i]);
//     else {
//         var files = fs.readdirSync (path.join (stdDir, argv.with))
//         for (var i in files)
//             sourcefiles.push (path.join (stdDir, argv.with, files[i]));
//     }
// }

if (argv.in)
    if (isArray (argv.in))
        for (var i in argv.in)
            appendArr (sourcefiles, glob.sync (argv.in[i]));
    else
        appendArr (sourcefiles, glob.sync (argv.in));

if (!argv.jsmod)
    return processSource();

// includeLib ('nodejs');

var modules = isArray (argv.jsmod) ? argv.jsmod : [ argv.jsmod ];
var dfnames = [];
async.eachSeries (modules, function (mod, callback) {
    mod = resolve.sync (mod, { basedir:process.cwd() });
    dfnames.push (mod);
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
    if (err) {
        console.log ('could not parse dependency tree\n'.red);
        console.log ((''+err).red+'\n');
        console.log ('failed'.red);
        return process.nextTick (1);
    }

    processSource();
});
