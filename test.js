
var path = require ('path');
var assert = require ('assert');
var child_process = require ('child_process');
var async = require ('async');
var fs = require ('fs-extra');
var filth = require ('filth');

function killDir (dir, callback) {
    var tries = 0;
    fs.readdir (dir, function (err, list) {
        if (err) {
            if (err.code == 'ENOENT')
                return callback();
            return callback (err);
        }
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

function compareLevel (path, able, baker) {
    // match keys
    for (var bKey in baker)
        if (!Object.hasOwnProperty.call (able, bKey)) {
            path.push (bKey);
            throw new Error ('missing key ' + path.join ('/'));
        }

    for (var aKey in able) {
        if (aKey === 'elemID')
            continue;
        var aItem = able[aKey];
        var subpath = path.concat();
        subpath.push (aKey);
        if (!Object.hasOwnProperty.call (baker, aKey))
            throw new Error ('novel key ' + subpath.join ('/'));
        var bItem = baker[aKey];
        var aType = filth.typeof (aItem);
        var bType = filth.typeof (bItem);
        if (aType !== bType)
            throw new Error ('type mismatch ' + subpath.join ('/'));
        switch (aType) {
            case 'object':
                compareLevel (subpath, aItem, bItem);
                continue;
            case 'array':
                compareArray (subpath, aItem, bItem);
                continue;
            default:
                if (aItem !== bItem)
                    throw new Error ('value mismatch ' + subpath.join ('/'));
        }
    }
}

function compareArray (path, able, baker) {
    if (able.length !== baker.length)
        throw new Error ('array length mismatch ' + path.join ('/'));
    for (var i=0,j=able.length; i<j; i++) {
        var subpath = path.concat();
        var aItem = able[i];
        var bItem = baker[i];
        if (aItem && aItem.sanitaryName)
            subpath.push (aItem.sanitaryName);
        var aType = filth.typeof (aItem);
        var bType = filth.typeof (bItem);
        if (aType !== bType)
            throw new Error ('type mismatch ' + subpath.join ('/'));
        switch (aType) {
            case 'object':
                compareLevel (subpath, aItem, bItem);
                continue;
            case 'array':
                compareArray (path, aItem, bItem);
                continue;
            default:
                if (aItem !== bItem)
                    throw new Error ('value mismatch ' + subpath.join ('/'));
        }
    }
}

function runTest (name, args) {
    var testname = name.replace (/[^a-zA-Z0-9]/g, '');
    describe (name, function(){
        var logs;
        it ("compiles completely", function (done) {
            this.timeout (30000);
            this.slow (15000);
            killDir (path.resolve ('test/out/' + name.replace (' ', '')), function (err) {
                if (err)
                    return done (err);
                async.parallel ([
                    function (callback) {
                        var command =
                            'node ./cli.js --verbose debug --json --raw --with browser-strict --date "june 5 2020" '
                          + '--in test/tests/'
                          + testname
                          + '.js --out test/out/'
                          + testname
                          + ' '
                          + ( args || '' )
                          ;
                        child_process.exec (
                            command,
                            { maxBuffer: 5 * 1024 * 1024 },
                            function (err, stdout, stderr) {
                                try {
                                    logs = stdout ?
                                        stdout.toString().split('\n').filter (Boolean).map (JSON.parse)
                                      : []
                                      ;
                                } catch (err) {
                                    return callback (err);
                                }
                                if (stderr && stderr.length)
                                    return callback (new Error (stderr.toString()));
                                callback ();
                            }
                        );
                    },
                    function (callback) {
                        var command =
                            'node ./cli.js --verbose debug --raw --with browser-strict --date "june 5 2020" '
                          + '--in test/tests/'
                          + testname
                          + '.js --out test/out/'
                          + testname
                          + ' '
                          + ( args || '' )
                          ;
                        child_process.exec (
                            command,
                            { maxBuffer: 5 * 1024 * 1024 },
                            function (err, stdout, stderr) {
                                try {
                                    logs = stdout ?
                                        stdout.toString().split('\n').filter (Boolean).map (JSON.parse)
                                      : []
                                      ;
                                } catch (err) {
                                    return callback (err);
                                }
                                if (stderr && stderr.length)
                                    return callback (new Error (stderr.toString()));
                                callback ();
                            }
                        );
                    }
                ], done);
            });
        });

        it ("does not log any issues", function(){
            if (!logs)
                return;
            var issues = logs.filter (function (item) { return item.level > 30; });
            if (issues.length) {
                console.log (issues);
                throw new Error ('compilation issues detected');
            }
        });

        it ("correctly reproduces the sample", function (done) {
            this.timeout (10000);
            this.slow (3000);
            function checkLevel (level, callback) {
                var outputDoc, compareDoc;
                var outputDirs = [];
                var compareDirs = [];
                async.parallel ([
                    function (callback) {
                        fs.readdir (
                            path.resolve ('test/out/'+level),
                            function (err, list) {
                                if (err) return callback (err);
                                async.each (list, function (pathname, callback) {
                                    fs.stat (
                                        path.resolve ('test/out/'+level+'/'+pathname),
                                        function (err, stats) {
                                            if (err) return callback (err);
                                            if (stats.isDirectory()) {
                                                outputDirs.push (pathname);
                                                return callback();
                                            }
                                            if (pathname != 'index.json')
                                                return callback();
                                            fs.readFile (
                                                path.resolve ('test/out/'+level+'/'+pathname),
                                                function (err, doc) {
                                                    if (err) return callback (err);
                                                    outputDoc = doc.toString();
                                                    callback();
                                                }
                                            );
                                        }
                                    );
                                }, callback);
                            }
                        );
                    },
                    function (callback) {
                        fs.readdir (
                            path.resolve ('test/compare/'+level),
                            function (err, list) {
                                if (err) return callback (err);
                                async.each (list, function (pathname, callback) {
                                    fs.stat (
                                        path.resolve ('test/compare/'+level+'/'+pathname),
                                        function (err, stats) {
                                            if (err) return callback (err);
                                            if (stats.isDirectory()) {
                                                compareDirs.push (pathname);
                                                return callback();
                                            }
                                            if (pathname != 'index.json')
                                                return callback();
                                            fs.readFile (
                                                path.resolve ('test/compare/'+level+'/'+pathname),
                                                function (err, doc) {
                                                    if (err) return callback (err);
                                                    compareDoc = doc.toString();
                                                    callback();
                                                }
                                            );
                                        }
                                    );
                                }, callback);
                            }
                        );
                    }
                ], function (err) {
                    if (err) return callback (err);
                    if (!outputDoc && !compareDoc)
                        return callback();
                    if (outputDoc && !compareDoc)
                        return callback (new Error ('unmatched json file in output'));
                    if (!outputDoc && compareDoc)
                        return callback (new Error ('unmatched json file in sample'));

                    async.each (outputDirs, function (dir, callback) {
                        checkLevel (level+'/'+dir, callback);
                    }, function (err) {
                        if (err)
                            return callback (err);
                        if (outputDirs.length > compareDirs.length)
                            return callback (new Error ('generated extra directory at: '+level));
                        if (outputDirs.length < compareDirs.length)
                            return callback (new Error ('failed to generate directory at: '+level));
                        for (var i=0,j=outputDirs.length; i<j; i++)
                            if (compareDirs.indexOf (outputDirs[i]) < 0)
                                return callback (new Error (
                                    'unmatched directory ('+outputDirs[i]+') generated at: '+level
                                ));

                        try {
                            compareLevel (
                                [ level + '::' ],
                                JSON.parse (outputDoc),
                                JSON.parse (compareDoc)
                            );
                        } catch (err) {
                            return callback (err);
                        }

                        callback();
                    });
                });
            }

            checkLevel (testname, done);
        });

    });
}

runTest ('Structure');
runTest ('Alias');
runTest ('Name Sanitization');
runTest ('Inheritence');
runTest ('Symbols');
runTest ('Signatures');
runTest ('Parser Challenges');
runTest ('JS Parsing', '--parse js');
runTest ('JS Parsing With Root', '--parse js --root test');
runTest ('Node Parsing', '--parse node --root test');
runTest ('Node Parsing Without Root', '--parse node');
runTest ('ES6 Parsing', '--parse js');
runTest ('Locals --All', '--parse node --root test --locals all');
runTest ('Locals --Comments', '--parse node --root test --locals comments');
runTest ('Locals --None', '--parse node --root test');
