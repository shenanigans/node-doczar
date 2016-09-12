
var path = require ('path');
var async = require ('async');
var fs = require ('graceful-fs');
var child_process = require ('child_process');
var argv = require ('minimist')(process.argv, {
    default:    { html:false },
    boolean:    [ 'html' ]
});

function killDir (dir, callback) {
    var tries = 0;
    fs.readdir (dir, function (err, list) {
        if (err) return callback (err);
        async.each (list, function (filename, callback) {
            var fullpath = path.join (dir, filename);
            fs.stat (fullpath, function (err, stats) {
                if (err) return callback (err);
                if (stats.isFile())
                    return fs.unlink (fullpath, callback);
                killDir (fullpath, callback);
            });
        }, function tryToRemove (err) {
            if (err) return callback (err);
            if (++tries > 5)
                return callback (new Error ('failed to clear directory'));
            fs.rmdir (dir, function (err) {
                if (err) {
                    if (err.code == 'ENOTEMPTY')
                        return setTimeout (tryToRemove, 100);
                    callback (err);
                }
                callback();
            });
        });
    });
}

var ARGUMENTS = {
    "NodeParsing.js":               "--parse node --root test",
    "NodeParsingWithoutRoot.js":    "--parse node",
    "JSParsing.js":                 "--parse js",
    "JSParsingWithRoot.js":         "--parse js --root test",
    "ES6Parsing.js":                "--parse js",
    "LocalsAll.js":                 "--parse node --root test --locals all",
    "LocalsComments.js":            "--parse node --root test --locals comments",
    "LocalsNone.js":                "--parse node --root test"
};
var SKIP = [
    "NodeParseModule.js",
    "NodeParseModules",
    "ES6Modules",
    "Fauxsync.js"
];
async.parallel ([
    function (callback) {
        killDir (path.resolve ('test/out'), callback);
    },
    function (callback) {
        killDir (path.resolve ('test/compare'), callback);
    }
], function (err) {
    if (err && err.code != 'ENOENT') {
        console.log (err.stack);
        return process.exit (1);
    }
    fs.readdir ('test/tests', function (err, list) {
        if (err) {
            console.log (err.stack);
            return process.exit (1);
        }
        async.eachSeries (list, function (testName, callback) {
            if (SKIP.indexOf (testName) >= 0)
                return callback();

            var targetStr =
               testName
             + ' --out test/compare/'
             + testName.slice (0, -3)
             ;
            var htmlCommand =
               'node ./cli.js --with browser-strict --date "june 5 2020" --in test/tests/'
             + targetStr
             ;
            var jsonCommand =
               'node ./cli.js --json --with browser-strict --date "june 5 2020" --in test/tests/'
             + targetStr
             ;
            if (ARGUMENTS[testName]) {
                htmlCommand += ' ' + ARGUMENTS[testName];
                jsonCommand += ' ' + ARGUMENTS[testName];
            }

            async.parallel ([
                function (callback) {
                    if (!argv.html)
                        return callback();
                    child_process.exec (
                        htmlCommand,
                        { maxBuffer: 5 * 1024 * 1024 },
                        callback
                    );
                },
                function (callback) {
                    child_process.exec (
                        jsonCommand,
                        { maxBuffer: 5 * 1024 * 1024 },
                        callback
                    );
                }
            ], function (err) {
                if (err) return callback (err);
                console.log ('finished with '+testName);
                callback();
            });
        }, function (err) {
            if (err) {
                console.log (err.stack);
                return process.exit (1);
            }
            console.log ('done');
        });
    });
});

