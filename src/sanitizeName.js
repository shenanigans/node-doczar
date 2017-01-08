
var RE_SANITIZE = /[<>:"\/\\|?*#]/g;
function sanitizeName (pathstr, known) {
    pathstr = String (pathstr).replace (RE_SANITIZE, '_').replace (/\.\./g, '_');
    var canonicalPath = pathstr.toLowerCase();
    if (canonicalPath[canonicalPath.length-1] == '.')
        canonicalPath += '_';
    if (!Object.hasOwnProperty.call (known, canonicalPath)) {
        known[canonicalPath] = true;
        return canonicalPath;
    }

    var addNum = 1;
    var tryCannonicalPath = canonicalPath + '_' + addNum;
    while (Object.hasOwnProperty.call (known, tryCannonicalPath)) {
        addNum++;
        tryCannonicalPath = canonicalPath + '_' + addNum;
    }
    known[tryCannonicalPath] = true;
    return tryCannonicalPath;
}
module.exports = sanitizeName;
