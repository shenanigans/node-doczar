
var RE_SANITIZE = /[<>:"\/\\|?*#]/g;
function sanitizeName (pathstr, known) {
    // if (pathstr[0] = '[')
    //     pathstr = pathstr.slice (1, -1);
    pathstr = pathstr.replace (RE_SANITIZE, '_').replace (/\.\./g, '_');
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
