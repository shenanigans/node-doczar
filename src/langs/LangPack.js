
function LangPack (pack) {
    pack.trip = function (eventName) {
        var tripName = 'on'+eventName;
        if (!pack[tripName])
            return true;
        var args = [];
        for (var i=1,r=0,j=arguments.length; i<j; i++, r++)
            args[r] = arguments[i];
        return pack[tripName].apply (pack, args);
    };
    return pack;
}
module.exports = LangPack;
