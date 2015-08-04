
var path = require ('path');
var assert = require ('assert');
var child_process = require ('child_process');
var async = require ('async');
var fs = require ('graceful-fs');

function runTest (name) {
    describe (name, function(){
        var logs;
        it ("compiles completely", function (done) {
            this.timeout (10000);
            this.slow (3000);
            var command =
                'doczar --verbose trace --json --raw --with es6 --date "june 5 2020" '
              + '--in test/tests/'
              + name.replace (' ', '')
              + ' --out test/out/'
              + name.replace (' ', '')
              ;
            child_process.exec (
                command,
                function (err, stdout, stderr) {
                    try {
                        logs = stdout ?
                            stdout.toString().split('\n').filter (Boolean).map (JSON.parse)
                          : []
                          ;
                    } catch (err) {
                        return done (err);
                    }
                    if (stderr && stderr.length)
                        return done (new Error (stderr.toString()));
                    done ();
                }
            );
        });

        it ("does not log any issues", function(){
            if (logs.filter (function (item) { return item.level > 30; }).length)
                throw new Error ('compilation issues detected');
        });

        it ("selects all necessary files", function (done) {
            fs.readdir (
                path.join ('test', 'tests', name.replace (' ', '')),
                function (err, filenames) {
                    var loadedNames = [];
                    for (var i=0,j=logs.length; i<j; i++)
                        if (logs[i].msg == 'read file')
                            loadedNames.push (logs[i].filename);
                    for (var i=0, j=filenames.length; i<j; i++)
                        if (
                            filenames[i] != 'index.js'
                         && loadedNames.indexOf (filenames[i]) < 0
                        )
                            return done (new Error ('failed to load file '+filenames[i]));
                    done();
                }
            );
        });

        it ("correctly reproduces the sample", function (done) {
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
                    if (outputDoc && !compareDoc)
                        return callback (new Error ('unmatched json file in output'));
                    if (!outputDoc && compareDoc)
                        return callback (new Error ('unmatched json file in sample'));
                    if (outputDoc && compareDoc) try {
                        assert.deepEqual (outputDoc, compareDoc, 'documents do not match');
                    } catch (err) {
                        return callback (new Error ('output documents do not match: '+level));
                    }

                    if (outputDirs.length > compareDirs.length)
                        return callback (new Error ('generated extra directory at: '+level));
                    if (outputDirs.length < compareDirs.length)
                        return callback (new Error ('failed to generate directory at: '+level));
                    for (var i=0,j=outputDirs.length; i<j; i++)
                        if (compareDirs.indexOf (outputDirs[i]) < 0)
                            return callback (new Error (
                                'unmatched directory ('+outputDirs[i]+') generated at: '+level
                            ));
                    async.each (outputDirs, function (dir, callback) {
                        checkLevel (level+'/'+dir, callback);
                    }, callback);
                });
            }

            checkLevel (name.replace (' ', ''), done);
        });

    });
}

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

runTest ('Structure');
runTest ('Name Sanitization');
runTest ('Document Parsing');
runTest ('Inheritence');
runTest ('Symbols');
