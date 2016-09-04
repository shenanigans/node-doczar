
require ('./localDir/local');

module.exports = {
    otherThing:     function (able, baker, charlie, dog) {
        return [ 'zero', 'one', 'two' ];
    },
    modEx:          function (foreignExports) {
        if (!foreignExports)
            // no exports argument found
            throw new Error ('fail whale');
        if (false)
            throw 'poo';
        foreignExports.tarif = function (able) { return 9; };
    }
};

module.exports.oneLastThing = 9001;
