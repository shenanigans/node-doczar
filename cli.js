
var path = require ('path');
var async = require ('async');
var required = require ('required');
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

var argv = require ('minimist') (process.argv, {
    default:        { out:'docs' },
    boolean:        [ 'verbose', 'dev', 'api' ],
    string:         [ 'jsmod', 'in', 'with', 'code' ],
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
    showAPI:    argv.api
};
function processSource () {
    var context = ComponentCache();
    async.eachSeries (sourcefiles, function (fname, callback) {
        Parser.parseFile (fname, context, callback);
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
            for (var i in warnings)
                console.log (('warning - ' + JSON.stringify (warnings[i]) + '\n').yellow);

            context.writeFiles (argv.out, options, function (err) {
                if (err) {
                    console.log ('unexpected error during output'.red);
                    console.log ((''+err).red);
                    console.log ('some filesystem changes may have occured'.red);
                    console.log ('failed');
                    return process.exit (1);
                }

                console.log ('finished writing to filesystem'.green);
                console.log ('done'.green);
            });
        });
    });
}

if (argv.in)
    if (isArray (argv.in))
        for (var i in argv.in)
            appendArr (sourcefiles, glob.sync (argv.in[i]));
    else
        appendArr (sourcefiles, glob.sync (argv.in));

if (!argv.jsmod)
    return processSource();

var modules = isArray (argv.jsmod) ? argv.jsmod : [ argv.jsmod ];
async.eachSeries (modules, function (mod, callback) {
    required (mod, { ignoreMissing:true }, function (err, deps) {
        if (err) return callback (err);
        var dfnames = [];
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
