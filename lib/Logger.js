
/**     @module doczar.Logger
    Dead-simple monad log buffer for verbose mode. Helps `cli.js` avoid mentioning files that don't
    contain doczar comments. Also prevents having to disperse the verbosity switch all over the
    source.
@Function log
    Add a string to the buffer.
@Function flush
    Output the buffer to the console using `console.log`.
*/

var content = '';

var Logger = module.exports = {
    log:        function (str) {
        Logger.hasContent = true;
        content += str + '\n';
    },
    flush:      function (msg) {
        if (msg) content = msg + '\n' + content;
        console.log (content);
        content = '';
        Logger.hasContent = false;
    }
};
