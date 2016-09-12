
(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
    typeof define === 'function' && define.amd ? define(['exports'], factory) :
    (factory((global.async = global.async || {})));
}(this, function (exports) { 'use strict';

    function eachOf (coll, iteratee, callback) {
        var eachOfImplementation = isArrayLike(coll) ? eachOfArrayLike : eachOfGeneric;
        eachOfImplementation(coll, iteratee, callback);
    }

    function _createTester(eachfn, check, getResult) {
        return function (arr, limit, iteratee, cb) {
            function done(err) {
                if (cb) {
                    if (err) {
                        cb(err);
                    } else {
                        cb(null, getResult(false));
                    }
                }
            }
            function wrappedIteratee(x, _, callback) {
                if (!cb) return callback();
                iteratee(x, function (err, v) {
                    if (cb) {
                        if (err) {
                            cb(err);
                            cb = iteratee = false;
                        } else if (check(v)) {
                            cb(null, getResult(true, x));
                            cb = iteratee = false;
                        }
                    }
                    callback();
                });
            }
            if (arguments.length > 3) {
                cb = cb || noop;
                eachfn(arr, limit, wrappedIteratee, done);
            } else {
                cb = iteratee;
                cb = cb || noop;
                iteratee = limit;
                eachfn(arr, wrappedIteratee, done);
            }
        };
    }

    var detect = _createTester(eachOf, identity, _findGetResult);


    // function auto (tasks, concurrency, callback) {
    //     if (typeof concurrency === 'function') {
    //         // concurrency is optional, shift the args.
    //         callback = concurrency;
    //         concurrency = null;
    //     }
    //     callback = once(callback || noop);
    //     var keys$$ = keys(tasks);
    //     var numTasks = keys$$.length;
    //     if (!numTasks) {
    //         return callback(null);
    //     }
    //     if (!concurrency) {
    //         concurrency = numTasks;
    //     }

    //     var results = {};
    //     var runningTasks = 0;
    //     var hasError = false;

    //     var listeners = {};

    //     var readyTasks = [];

    //     // for cycle detection:
    //     var readyToCheck = []; // tasks that have been identified as reachable
    //     // without the possibility of returning to an ancestor task
    //     var uncheckedDependencies = {};

    //     baseForOwn(tasks, function (task, key) {
    //         if (!isArray(task)) {
    //             // no dependencies
    //             enqueueTask(key, [task]);
    //             readyToCheck.push(key);
    //             return;
    //         }

    //         var dependencies = task.slice(0, task.length - 1);
    //         var remainingDependencies = dependencies.length;
    //         if (remainingDependencies === 0) {
    //             enqueueTask(key, task);
    //             readyToCheck.push(key);
    //             return;
    //         }
    //         uncheckedDependencies[key] = remainingDependencies;

    //         arrayEach(dependencies, function (dependencyName) {
    //             if (!tasks[dependencyName]) {
    //                 throw new Error('async.auto task `' + key + '` has a non-existent dependency in ' + dependencies.join(', '));
    //             }
    //             addListener(dependencyName, function () {
    //                 remainingDependencies--;
    //                 if (remainingDependencies === 0) {
    //                     enqueueTask(key, task);
    //                 }
    //             });
    //         });
    //     });

    //     checkForDeadlocks();
    //     processQueue();

    //     function enqueueTask(key, task) {
    //         readyTasks.push(function () {
    //             runTask(key, task);
    //         });
    //     }

    //     function processQueue() {
    //         if (readyTasks.length === 0 && runningTasks === 0) {
    //             return callback(null, results);
    //         }
    //         while (readyTasks.length && runningTasks < concurrency) {
    //             var run = readyTasks.shift();
    //             run();
    //         }
    //     }

    //     function addListener(taskName, fn) {
    //         var taskListeners = listeners[taskName];
    //         if (!taskListeners) {
    //             taskListeners = listeners[taskName] = [];
    //         }

    //         taskListeners.push(fn);
    //     }

    //     function taskComplete(taskName) {
    //         var taskListeners = listeners[taskName] || [];
    //         arrayEach(taskListeners, function (fn) {
    //             fn();
    //         });
    //         processQueue();
    //     }

    //     function runTask(key, task) {
    //         if (hasError) return;

    //         var taskCallback = onlyOnce(rest(function (err, args) {
    //             runningTasks--;
    //             if (args.length <= 1) {
    //                 args = args[0];
    //             }
    //             if (err) {
    //                 var safeResults = {};
    //                 baseForOwn(results, function (val, rkey) {
    //                     safeResults[rkey] = val;
    //                 });
    //                 safeResults[key] = args;
    //                 hasError = true;
    //                 listeners = [];

    //                 callback(err, safeResults);
    //             } else {
    //                 results[key] = args;
    //                 taskComplete(key);
    //             }
    //         }));

    //         runningTasks++;
    //         var taskFn = task[task.length - 1];
    //         if (task.length > 1) {
    //             taskFn(results, taskCallback);
    //         } else {
    //             taskFn(taskCallback);
    //         }
    //     }

    //     function checkForDeadlocks() {
    //         // Kahn's algorithm
    //         // https://en.wikipedia.org/wiki/Topological_sorting#Kahn.27s_algorithm
    //         // http://connalle.blogspot.com/2013/10/topological-sortingkahn-algorithm.html
    //         var currentTask;
    //         var counter = 0;
    //         while (readyToCheck.length) {
    //             currentTask = readyToCheck.pop();
    //             counter++;
    //             arrayEach(getDependents(currentTask), function (dependent) {
    //                 if (--uncheckedDependencies[dependent] === 0) {
    //                     readyToCheck.push(dependent);
    //                 }
    //             });
    //         }

    //         if (counter !== numTasks) {
    //             throw new Error('async.auto cannot execute tasks due to a recursive dependency');
    //         }
    //     }

    //     function getDependents(taskName) {
    //         var result = [];
    //         baseForOwn(tasks, function (task, key) {
    //             if (isArray(task) && baseIndexOf(task, taskName, 0) >= 0) {
    //                 result.push(key);
    //             }
    //         });
    //         return result;
    //     }
    // }


    exports.detect  = detect;
    // exports.auto    = auto;

}));
