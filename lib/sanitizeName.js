
var RE_SANITIZE = /[<>:"\/\\|?*]/g;
function sanitizeName (pathstr, known) {
    pathstr = pathstr.replace (RE_SANITIZE, '_');
    var canonicalPath = pathstr.toLowerCase();
    if (!Object.hasOwnProperty.call (known, canonicalPath)) {
        known[canonicalPath] = true;
        return pathstr;
    }

    var addNum = 1;
    var tryCannonicalPath = canonicalPath + '_' + addNum;
    while (Object.hasOwnProperty.call (known, tryCannonicalPath)) {
        addNum++;
        tryCannonicalPath = canonicalPath + '_' + addNum;
    }
    known[tryCannonicalPath] = true;
    return pathstr + '_' + addNum;
}
module.exports = sanitizeName;
