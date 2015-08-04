
var path = require ('path');
var async = require ('async');
var fs = require ('graceful-fs');
var child_process = require ('child_process');

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
        async.each (list, function (testName, callback) {
            async.parallel ([
                function (callback) {
                    child_process.exec (
                        'doczar --with es6 --date "june 5 2020" --in test/tests/'
                      + testName
                      + ' --out test/compare/'
                      + testName.slice (0, -3),
                        callback
                    );
                },
                function (callback) {
                    child_process.exec (
                        'doczar --json --with es6 --date "june 5 2020" --in test/tests/'
                      + testName+' --out test/compare/'
                      + testName.slice (0, -3),
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

