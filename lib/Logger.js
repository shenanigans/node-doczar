
/**     @module doczar.Logger
    Dead-simple log buffer for verbose mode. Helps `cli.js` avoid mentioning files that don't
    contain doczar comments.
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
    flush:      function(){
        Logger.hasContent = false;
        console.log (content);
        content = '';
    }
};
